import { requireUser } from "./auth.ts";
import { groq } from "./groq.ts";

/** POST /api/feedback — Groq small-talk coach, ported verbatim from server.mjs. */
export async function handleFeedback(req: Request): Promise<Response> {
  try {
    console.log("POST /api/feedback received");

    // Signed-in users only — this route spends Groq tokens per request, so
    // the bare (bundle-extractable) anon key must not be able to invoke it.
    const user = await requireUser(req);
    if (!user) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }

    const { topicLabel, durationSec, transcript, newsContext, sceneContext } =
      await req.json();

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a small talk coach for English learners. Return only valid JSON. Be specific, practical, and friendly.

The transcript has two speakers, tagged on every line:
- "USER" is the human learner you are coaching. This is the ONLY person whose speaking you evaluate and improve.
- "AI PARTNER" is the practice bot the learner talked to. Never coach, correct, or rewrite the AI PARTNER's lines.

Strict role rules:
- A "highlight" MUST quote a strong or useful line tagged USER, never AI PARTNER.
- A "user_upgrade" moment MUST quote a line tagged USER, never AI PARTNER.
- An "ai_phrase" moment MUST quote a line tagged AI PARTNER, never USER.
- A "topic_opener" moment should usually quote a USER line where the learner could naturally ask a follow-up question.
- suggestions.words must reference words the USER actually said.
- Every "quote" you output for highlights and moments must be copied verbatim from a line with the matching speaker tag. If you cannot find a matching line, omit that item.
- Vocabulary and culturalClues can quote either an exact transcript line or an exact phrase from the topic/news context.
- conversationSummary summarizes what they talked about. It is not a score.
- Do not invent news facts beyond the transcript or provided news context. You may explain general meanings, social norms, or cultural background in simple terms.
- Use newsContext.details, keyQuotes, controversy, timeline, vocabulary, culturalClues, keyTerms, whyItMatters, and safeFraming when available.
- You do NOT have raw audio. Do not claim to evaluate pitch, accent, volume, or true intonation.
- You may discuss wording-level tone, confidence, engagement, response timing, and conversational flow.
- Keep all notes short. The UI is a mobile feedback screen.`,
        },
        {
          role: "user",
          content: `Evaluate this small talk conversation.

Topic: ${topicLabel}
Duration: ${durationSec} seconds

News context, if available:
${newsContext ? JSON.stringify(newsContext, null, 2) : "None"}

Practice scene, if available (the USER was rehearsing this scenario; the AI PARTNER was role-playing the given role):
${sceneContext ? JSON.stringify(sceneContext, null, 2) : "None"}

Transcript:
${transcript}

Return ONLY this JSON shape:

{
  "conversationSummary": "One short sentence summarizing what the user and AI talked about.",
  "keywords": [
    "Travel",
    "Hobbies",
    "Weekend plans"
  ],
  "highlights": [
    {
      "quote": "A strong USER line copied exactly",
      "note": "One short reason this worked."
    },
    {
      "quote": "Another strong USER line copied exactly",
      "note": "One short reason this worked."
    }
  ],
  "vocabulary": [
    {
      "term": "A topic-related word, phrase, idiom, slang, or news term",
      "quote": "The transcript line or topic context where it appeared",
      "meaning": "Simple beginner-friendly meaning",
      "example": "A short example sentence using the term naturally",
      "sayNextTime": "A natural sentence the user can reuse"
    }
  ],
  "culturalClues": [
    {
      "title": "A cultural, social, or news-background point",
      "quote": "The transcript line or topic context where this clue came from",
      "explanation": "Simple explanation of the cultural or social context",
      "trySaying": "A natural follow-up sentence the user can try"
    }
  ],
  "suggestions": {
    "words": [
      "You said ___. Try ___ because ___."
    ],
    "stalls": [
      "Let me think about that for a second."
    ],
    "tips": [
      "A practical coaching tip based on the user's actual conversation."
    ]
  },
  "moments": [
    {
      "type": "user_upgrade",
      "title": "Make your line more natural",
      "quote": "The user's original sentence copied exactly",
      "explanation": "Explain why this sentence can be improved.",
      "suggestion": "A more natural version the user could say."
    },
    {
      "type": "ai_phrase",
      "title": "Useful phrase from the AI",
      "quote": "A natural phrase the AI used copied exactly",
      "explanation": "Explain the slang, idiom, softener, filler, or casual phrase.",
      "suggestion": "A reusable sentence pattern."
    },
    {
      "type": "topic_opener",
      "title": "Topic opener to try next time",
      "quote": "A USER sentence where a follow-up could fit",
      "explanation": "Explain why this was a good chance to continue the conversation.",
      "suggestion": "A natural follow-up question or topic opener."
    }
  ]
}

Rules:
- conversationSummary should summarize what the conversation was about, not score the user.
- Do not score the user. The app already calculates Vibe, Fluency, Tone, Confidence, Stamina, and Cultural Fit locally.
- keywords should include 2 to 4 short topic chips.
- highlights should include exactly 2 items when possible, both from USER lines.
- vocabulary should include 2 to 5 items when the topic has useful words, idioms, slang, or news terms.
- culturalClues should include 1 to 3 items when the topic has cultural, social, or current-events context worth knowing.
- Include vocabulary and culturalClues even if the USER seems to understand; they are study notes for the topic.
- Put word meanings, idioms, slang, and news terms in vocabulary.
- Put social norms, cultural references, sensitive-topic framing, and background context in culturalClues.
- vocabulary.quote and culturalClues.quote should be copied from the transcript when possible; otherwise use the topic/news context.
- Use provided newsContext.details, keyTerms, whyItMatters, and safeFraming for topic-related vocabulary and cultural clues.
- suggestions.words should include 2 to 4 word upgrades.
- suggestions.stalls should include 3 to 5 natural stalling phrases.
- suggestions.tips should include 2 to 4 coaching tips.
- moments should include 3 to 6 items.
- Include slang or casual phrase explanations when possible.
- Include at least one topic opener suggestion.
- Keep every title under 7 words and every explanation under 18 words.
- Do not invent news facts beyond the transcript or news context.`,
        },
      ],
    });

    const text = completion.choices[0].message.content;
    const result = JSON.parse(text ?? "{}");

    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Groq feedback generation failed" },
      { status: 500 },
    );
  }
}
