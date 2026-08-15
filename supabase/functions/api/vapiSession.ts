import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

import { requireUser } from "./auth.ts";
import { groq } from "./groq.ts";

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
 * public-scope Vapi JWT minted with `VAPI_PRIVATE_KEY` + `VAPI_ORG_ID` —
 * Vapi accepts it only on `/call/web`, and it expires minutes later. The
 * long-lived public key is retired entirely.
 *
 * The WebRTC call itself still runs on the device — the client receives
 * `{ token, assistantId, overrides }` and calls `vapi.start()` with them.
 */

/** How long a minted call token stays valid — enough to join, not to hoard. */
const TOKEN_TTL_SECONDS = 10 * 60;

const DEFAULT_DAILY_SESSION_LIMIT = 20;

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
 * Per-call webhook config: Vapi POSTs server messages (we only subscribe to
 * `end-of-call-report`) to the `vapi-webhook` function, authenticating with
 * the shared secret in a custom header — that function runs without the
 * platform JWT check, so the header is its only gate. Skipped entirely until
 * `VAPI_WEBHOOK_SECRET` is set.
 */
function buildWebhookServer(): Record<string, unknown> | null {
  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!secret || !supabaseUrl) return null;

  return {
    url: `${supabaseUrl}/functions/v1/vapi-webhook`,
    headers: { "x-webhook-secret": secret },
  };
}

/**
 * Mint a short-lived public-scope Vapi JWT (see
 * https://docs.vapi.ai/customization/jwt-authentication). Public scope means
 * Vapi accepts it only on the `/call/web` endpoint. `VAPI_PRIVATE_KEY` +
 * `VAPI_ORG_ID` are required — the raw-public-key fallback is retired, so no
 * long-lived Vapi credential exists anywhere in the system anymore.
 */
async function mintCallToken(): Promise<string | null> {
  const privateKey = Deno.env.get("VAPI_PRIVATE_KEY")?.trim();
  const orgId = Deno.env.get("VAPI_ORG_ID")?.trim();

  if (!privateKey || !orgId) return null;

  return await new SignJWT({ orgId, token: { tag: "public" } })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(privateKey));
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

interface SceneContext {
  goal?: string;
  role?: string;
  scene?: string;
  personality?: string;
}

interface AssistantContent {
  systemPrompt: string;
  firstMessage?: string;
}

const DEFAULT_PERSONALITY = "Friendly and supportive.";

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

/**
 * Static fallback prompt for a user-defined scene — used only when the Groq
 * scene builder is unavailable or errors, so a session always starts.
 */
function buildScenePrompt(sceneContext: SceneContext): string {
  return `You are role-playing for a language-learner's practice conversation.

Your role:
- ${sceneContext.role ?? "A conversation partner suited to the scene below."}

Scene / setting:
- ${sceneContext.scene ?? "A casual, everyday conversation."}

Your personality:
- ${sceneContext.personality?.trim() || DEFAULT_PERSONALITY}

The caller's practice goal (do not state this out loud, just support it):
- ${sceneContext.goal ?? "Have a natural, confident conversation."}

Style:
- Stay fully in character as the role above — do not break character or mention that this is a practice exercise.
- Keep responses short (1–3 sentences) and easy to speak.
- Ask one natural follow-up question at a time to keep the scene moving.
- Match the tone the scene implies (e.g. professional for an interview, warm and casual for a date).

Safety & boundaries:
- Do not ask for sensitive personal data (full name, address, passwords, financial info).
- Avoid explicit sexual content, hate, harassment, or illegal advice.
- If the caller seems stuck, gently prompt them with a simple in-character question rather than breaking the scene.`;
}

/**
 * Look up a pre-authored default-scene preset by slug. The prompt + opening
 * line were written by hand and stored in `scene_presets`, so the default
 * path needs no Groq at runtime. Returns null if the preset store is
 * unconfigured or the slug isn't found/active.
 */
async function fetchPresetAssistant(slug: string): Promise<AssistantContent | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("scene_presets")
    .select("prompt, first_message")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("Preset lookup failed:", error.message);
    return null;
  }
  if (!data?.prompt) return null;

  return {
    systemPrompt: data.prompt,
    firstMessage: typeof data.first_message === "string" ? data.first_message : undefined,
  };
}

const SCENE_BUILDER_SYSTEM = `You write the system prompt for a role-playing AI voice partner used in a language-learner's practice conversation. You are given a structured scene (goal, role, scene, personality). Return only valid JSON.

Produce:
- "systemPrompt": a complete, drop-in system prompt that puts the AI fully in character. It MUST:
  - Describe who the AI is and the setting, grounded in the given role and scene.
  - Fold in the given personality/tone.
  - Instruct: stay fully in character, never mention this is practice or that it's an AI; keep replies short (1-3 sentences) and easy to say out loud; react then ask one natural follow-up question; support the learner's goal without stating it aloud.
  - Include a short safety block: don't ask for sensitive personal data (full name, address, passwords, money); avoid explicit, hateful, or unsafe content; if the learner goes quiet, offer an easy in-character opener instead of breaking character.
- "firstMessage": the AI's opening line — one natural, in-character sentence that fits the scene and personality.

Write in plain, natural English. Do not use the learner's practice goal as a spoken line.`;

/**
 * Turn a user-defined scene into a full assistant prompt + opening line via
 * Groq. This is the "user inputs -> LLM -> assistant" step for typed/voice
 * scenes (default presets skip it — their prompts are pre-authored). Returns
 * null on any failure so the caller can fall back to the static template.
 */
async function buildSceneAssistant(sceneContext: SceneContext): Promise<AssistantContent | null> {
  const scene: SceneContext = {
    ...sceneContext,
    personality: sceneContext.personality?.trim() || DEFAULT_PERSONALITY,
  };

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SCENE_BUILDER_SYSTEM },
        {
          role: "user",
          content: `Scene:
- Role (who the AI plays): ${scene.role ?? "A conversation partner suited to the scene."}
- Scene / setting: ${scene.scene ?? "A casual, everyday conversation."}
- Personality: ${scene.personality}
- Learner's practice goal (do not say aloud): ${scene.goal ?? "Have a natural, confident conversation."}

Return ONLY this JSON shape:
{
  "systemPrompt": "...",
  "firstMessage": "..."
}`,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    const systemPrompt =
      typeof parsed.systemPrompt === "string" ? parsed.systemPrompt.trim() : "";
    const firstMessage =
      typeof parsed.firstMessage === "string" && parsed.firstMessage.trim()
        ? parsed.firstMessage.trim()
        : undefined;

    if (!systemPrompt) return null;
    return { systemPrompt, firstMessage };
  } catch (err) {
    console.error("Scene prompt build failed (using static fallback):", err);
    return null;
  }
}

function buildSystemPrompt(
  topicLabel?: string,
  newsContext?: NewsContext,
): string {
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

function buildOverrides(content: AssistantContent): Record<string, unknown> {
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
      messages: [{ role: "system", content: content.systemPrompt }],
    },
  };

  if (content.firstMessage) overrides.firstMessage = content.firstMessage;

  return overrides;
}

/**
 * Resolve the assistant's system prompt + opening line for this call:
 * - a default-scene preset (by slug) uses its pre-authored prompt — no Groq;
 * - a user-defined scene is turned into a prompt by Groq (static template on
 *   failure);
 * - a news topic / generic small talk uses the persona template.
 */
async function resolveAssistantContent(
  presetSlug?: string,
  topicLabel?: string,
  newsContext?: NewsContext,
  sceneContext?: SceneContext,
): Promise<AssistantContent> {
  if (presetSlug) {
    const preset = await fetchPresetAssistant(presetSlug);
    if (preset) return preset;
  }

  if (sceneContext) {
    const built = await buildSceneAssistant(sceneContext);
    if (built) return built;
    return { systemPrompt: buildScenePrompt(sceneContext), firstMessage: "Hi there!" };
  }

  const systemPrompt = buildSystemPrompt(topicLabel, newsContext);
  if (topicLabel) {
    const opener = newsContext?.short ?? topicLabel;
    return {
      systemPrompt,
      firstMessage: `Hey! I saw a topic about ${opener}. What do you think about it?`,
    };
  }
  return { systemPrompt };
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
    const sceneContext =
      body?.sceneContext && typeof body.sceneContext === "object"
        ? (body.sceneContext as SceneContext)
        : undefined;
    const presetSlug =
      typeof body?.presetSlug === "string" && body.presetSlug.trim()
        ? body.presetSlug.trim()
        : undefined;

    const content = await resolveAssistantContent(
      presetSlug,
      topicLabel,
      newsContext,
      sceneContext,
    );
    const overrides = buildOverrides(content);

    // Stamp the call with its owner so the end-of-call report can be
    // attributed, and point Vapi's server messages at the webhook receiver.
    overrides.metadata = { userId: user.id };
    const server = buildWebhookServer();
    if (server) {
      overrides.server = server;
      overrides.serverMessages = ["end-of-call-report"];
    }

    return Response.json({ token, assistantId, overrides });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Vapi session config generation failed" },
      { status: 500 },
    );
  }
}
