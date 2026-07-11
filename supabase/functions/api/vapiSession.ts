import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

/**
 * POST /api/vapi/session — issues the per-call Vapi token + config to the app.
 *
 * The small-talk persona and prompt composition live here (not in the client)
 * so they never ship in the JS bundle and can be tuned with a
 * `supabase functions deploy api` instead of an app release.
 *
 * Phase 3a hardening: the route requires a signed-in Supabase user (the anon
 * key alone is rejected), enforces a per-user daily session limit via the
 * `vapi_call_grants` table (service role only), and returns a short-lived
 * public-scope Vapi JWT minted with `VAPI_PRIVATE_KEY` + `VAPI_ORG_ID`
 * instead of the long-lived public key — Vapi accepts it only on `/call/web`,
 * and it expires minutes later. Until those two secrets are set, it falls
 * back to returning `VAPI_PUBLIC_KEY` so sessions keep working.
 *
 * The WebRTC call itself still runs on the device — the client receives
 * `{ token, assistantId, overrides }` and calls `vapi.start()` with them.
 */

/** How long a minted call token stays valid — enough to join, not to hoard. */
const TOKEN_TTL_SECONDS = 10 * 60;

const DEFAULT_DAILY_SESSION_LIMIT = 20;

interface AuthenticatedUser {
  id: string;
}

/** Resolve the caller to a real signed-in user; the bare anon key yields null. */
async function requireUser(req: Request): Promise<AuthenticatedUser | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authHeader) return null;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}

/**
 * Per-user rolling 24h session limit, tracked in `vapi_call_grants`.
 * Fails open when the table is missing or errors (a broken quota store
 * shouldn't take down all voice sessions) — the grant insert doubles as the
 * usage record.
 */
async function checkAndRecordQuota(userId: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return true;

  const limit = Number(Deno.env.get("VAPI_DAILY_SESSION_LIMIT")) || DEFAULT_DAILY_SESSION_LIMIT;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error: countError } = await admin
    .from("vapi_call_grants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (countError) {
    console.error("Quota check failed (allowing call):", countError.message);
    return true;
  }

  if ((count ?? 0) >= limit) return false;

  const { error: insertError } = await admin
    .from("vapi_call_grants")
    .insert({ user_id: userId });
  if (insertError) {
    console.error("Grant insert failed (allowing call):", insertError.message);
  }

  return true;
}

/**
 * Mint a short-lived public-scope Vapi JWT (see
 * https://docs.vapi.ai/customization/jwt-authentication). Public scope means
 * Vapi accepts it only on the `/call/web` endpoint. Falls back to the raw
 * public key until `VAPI_PRIVATE_KEY` + `VAPI_ORG_ID` are configured.
 */
async function mintCallToken(): Promise<string | null> {
  const privateKey = Deno.env.get("VAPI_PRIVATE_KEY")?.trim();
  const orgId = Deno.env.get("VAPI_ORG_ID")?.trim();

  if (privateKey && orgId) {
    return await new SignJWT({ orgId, token: { tag: "public" } })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
      .sign(new TextEncoder().encode(privateKey));
  }

  return Deno.env.get("VAPI_PUBLIC_KEY")?.trim() || null;
}

interface KeyQuote {
  quote?: string;
  speaker?: string;
  context?: string;
}

interface VocabularyItem {
  term?: string;
  meaning?: string;
  example?: string;
}

interface NewsContext {
  short?: string;
  full?: string;
  brief?: string;
  details?: string[];
  keyQuotes?: KeyQuote[];
  timeline?: string[];
  controversy?: string;
  whyItMatters?: string;
  keyTerms?: string[];
  vocabulary?: VocabularyItem[];
  culturalClues?: string[];
  safeFraming?: string;
  talkingPoints?: string[];
  conversationAngles?: string[];
}

const SMALL_TALK_PERSONA = `You are a friendly "random stranger" for casual small talk with new people.

Goal:
- Have light, natural conversations (small talk) with callers who are trying this for fun.

Style:
- Keep responses short (1–3 sentences) and easy to speak.
- Be upbeat, curious, and non-judgmental.
- Ask one simple follow-up question at a time.
- Use everyday topics: weekend plans, hobbies, movies, music, food, travel, pets, weather, funny observations.

Safety & boundaries:
- Do not ask for sensitive personal data (full name, address, passwords, financial info).
- If the caller shares personal or emotional topics, respond with empathy and gently steer back to safe, light conversation.
- Avoid explicit sexual content, hate, harassment, or illegal advice.

Conversation behavior:
- If the caller is quiet or unsure, offer 2–3 topic options and ask which they prefer.
- If a topic stalls, smoothly pivot with an icebreaker question.
- Don't claim real-world identity; you're a fictional conversational partner.`;

function buildSystemPrompt(topicLabel?: string, newsContext?: NewsContext): string {
  if (!topicLabel) return SMALL_TALK_PERSONA;

  const contextBlock = newsContext
    ? `News context for this session:
- Display topic: ${newsContext.short}
- Topic description: ${newsContext.full}
- Beginner background: ${newsContext.brief}
${
  newsContext.details && newsContext.details.length > 0
    ? `- Concrete details to remember:\n${newsContext.details.map((detail) => `  - ${detail}`).join("\n")}`
    : ""
}
${
  newsContext.keyQuotes && newsContext.keyQuotes.length > 0
    ? `- Memorable quotes or posts you may mention naturally:\n${newsContext.keyQuotes
        .map((item) => {
          const speaker = item.speaker ? ` — ${item.speaker}` : "";
          const context = item.context ? ` (${item.context})` : "";
          return `  - "${item.quote}"${speaker}${context}`;
        })
        .join("\n")}`
    : ""
}
${
  newsContext.timeline && newsContext.timeline.length > 0
    ? `- Simple timeline:\n${newsContext.timeline.map((item) => `  - ${item}`).join("\n")}`
    : ""
}
${newsContext.controversy ? `- Main drama / debate: ${newsContext.controversy}` : ""}
${newsContext.whyItMatters ? `- Why people may talk about it: ${newsContext.whyItMatters}` : ""}
${
  newsContext.keyTerms && newsContext.keyTerms.length > 0
    ? `- Key terms to explain naturally if useful: ${newsContext.keyTerms.join(", ")}`
    : ""
}
${
  newsContext.vocabulary && newsContext.vocabulary.length > 0
    ? `- Useful vocabulary:\n${newsContext.vocabulary
        .map((item) => `  - ${item.term}: ${item.meaning}${item.example ? ` Example: ${item.example}` : ""}`)
        .join("\n")}`
    : ""
}
${
  newsContext.culturalClues && newsContext.culturalClues.length > 0
    ? `- Cultural clues a learner may miss:\n${newsContext.culturalClues.map((item) => `  - ${item}`).join("\n")}`
    : ""
}
${newsContext.safeFraming ? `- Safe framing: ${newsContext.safeFraming}` : ""}
- Talking points:
${(newsContext.talkingPoints ?? []).map((point) => `  - ${point}`).join("\n")}
${
  newsContext.conversationAngles && newsContext.conversationAngles.length > 0
    ? `- Human conversation angles:\n${newsContext.conversationAngles.map((point) => `  - ${point}`).join("\n")}`
    : ""
}`
    : `Topic focus:
- The caller picked this trending news headline to chat about: "${topicLabel}".`;

  return `${SMALL_TALK_PERSONA}

${contextBlock}

Conversation instructions:
- Open like a normal person who read the story and remembers the most interesting part.
- Keep the conversation centered on this topic, but stay casual.
- Use the provided context only. Do not invent extra breaking-news facts, quotes, scores, names, or statistics.
- Use the details, quotes, drama/debate, vocabulary, and cultural clues to sound informed.
- If quotes are available, mention at most one short quote naturally; do not overquote.
- If the caller seems confused, briefly explain the topic in simple words.
- Ask one natural follow-up question at a time.
- Stay light and casual — react like a curious stranger, not a news anchor.`;
}

/**
 * Overriding `model.messages` is how the persona stays out of the Vapi
 * dashboard, but Vapi validates the `model` override as a full model config —
 * it must carry a `provider` and model name matching the assistant's
 * configured LLM (a partial `model` 400s).
 */
const ASSISTANT_MODEL_PROVIDER = "anthropic";
const ASSISTANT_MODEL = "claude-haiku-4-5-20251001";

function buildAssistantOverrides(
  topicLabel?: string,
  newsContext?: NewsContext,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {
    maxDurationSeconds: 180,
    clientMessages: [
      "status-update",
      "speech-update",
      "transcript",
      "conversation-update",
    ],
    model: {
      provider: ASSISTANT_MODEL_PROVIDER,
      model: ASSISTANT_MODEL,
      messages: [{ role: "system", content: buildSystemPrompt(topicLabel, newsContext) }],
    },
  };

  if (topicLabel) {
    const opener = newsContext?.short ?? topicLabel;
    overrides.firstMessage = `Hey! I saw a topic about ${opener}. What do you think about it?`;
  }

  return overrides;
}

export async function handleVapiSession(req: Request): Promise<Response> {
  try {
    console.log("POST /api/vapi/session received");

    const assistantId = Deno.env.get("VAPI_ASSISTANT_ID")?.trim();
    if (!assistantId) {
      return Response.json(
        { error: "Vapi is not configured on the server" },
        { status: 500 },
      );
    }

    const user = await requireUser(req);
    if (!user) {
      return Response.json(
        { error: "Sign in to start a voice session." },
        { status: 401 },
      );
    }

    const withinQuota = await checkAndRecordQuota(user.id);
    if (!withinQuota) {
      return Response.json(
        { error: "Daily voice-session limit reached. Try again tomorrow." },
        { status: 429 },
      );
    }

    const token = await mintCallToken();
    if (!token) {
      return Response.json(
        { error: "Vapi is not configured on the server" },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const topicLabel =
      typeof body?.topicLabel === "string" && body.topicLabel.trim()
        ? body.topicLabel.trim()
        : undefined;
    const newsContext =
      body?.newsContext && typeof body.newsContext === "object"
        ? (body.newsContext as NewsContext)
        : undefined;

    return Response.json({
      token,
      assistantId,
      overrides: buildAssistantOverrides(topicLabel, newsContext),
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Vapi session config generation failed" },
      { status: 500 },
    );
  }
}
