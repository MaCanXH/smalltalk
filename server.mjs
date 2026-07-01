import express from "express";
import cors from "cors";
import "dotenv/config";
import Groq from "groq-sdk";

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.post("/api/feedback", async (req, res) => {
  try {
    console.log("POST /api/feedback received");

    const { topicLabel, durationSec, transcript } = req.body;

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
- Every "quote" you output must be copied verbatim from a line with the matching speaker tag. If you cannot find a matching line, omit that item.
- Keep all notes short. The UI is a mobile feedback screen.`,
        },
        {
          role: "user",
          content: `
Evaluate this small talk conversation.

Topic: ${topicLabel}
Duration: ${durationSec} seconds

Transcript:
${transcript}

Return ONLY this JSON shape:

{
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
- Do not score the user. The app already calculates Vibe, Fluency, Slang, and Stamina locally.
- keywords should include 2 to 4 short topic chips.
- highlights should include exactly 2 items when possible, both from USER lines.
- suggestions.words should include 2 to 4 word upgrades.
- suggestions.stalls should include 3 to 5 natural stalling phrases.
- suggestions.tips should include 2 to 4 coaching tips.
- moments should include 3 to 6 items.
- Include slang or casual phrase explanations when possible.
- Include at least one topic opener suggestion.
- Keep every title under 7 words and every explanation under 18 words.
`,
        },
      ],
    });

    const text = completion.choices[0].message.content;
    const result = JSON.parse(text);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Groq feedback generation failed",
    });
  }
});

app.listen(3000, () => {
  console.log("Groq feedback API running on http://localhost:3000");
});
