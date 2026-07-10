/**
 * POST /api/vapi/session — issues the per-call Vapi config to the app.
 *
 * The small-talk persona and prompt composition moved here from the client
 * (lib/ai/vapi.ts) so they never ship in the JS bundle and can be tuned with a
 * `supabase functions deploy api` instead of an app release. The credentials
 * come from Supabase secrets (`VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`) and are
 * only issued to requests that passed the platform JWT check (signed-in user
 * token or the anon key for skipped/offline users).
 *
 * The WebRTC call itself still runs on the device — the client receives
 * `{ publicKey, assistantId, overrides }` and calls `vapi.start()` with them.
 */

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

    const publicKey = Deno.env.get("VAPI_PUBLIC_KEY")?.trim();
    const assistantId = Deno.env.get("VAPI_ASSISTANT_ID")?.trim();

    if (!publicKey || !assistantId) {
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
      publicKey,
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
