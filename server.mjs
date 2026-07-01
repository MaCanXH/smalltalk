import express from "express";
import cors from "cors";
import "dotenv/config";
import Groq from "groq-sdk";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const GOOGLE_NEWS_FEED_URL =
  "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";

const NEWS_FALLBACK_TOPICS = [
  {
    id: "fallback_ai_tools",
    short: "AI in daily life",
    full: "People are talking about how AI tools are changing work, school, and everyday routines.",
    brief:
      "A beginner-friendly topic about whether AI tools feel helpful, stressful, or fun.",
    talkingPoints: [
      "Ask if the user has tried any new AI tools recently.",
      "Talk about whether AI saves time or makes things more confusing.",
    ],
    source: "Fallback",
    url: "",
  },
  {
    id: "fallback_travel_costs",
    short: "Summer travel costs",
    full: "People are discussing travel plans, flight prices, and how expensive trips can feel.",
    brief:
      "A casual topic about trips, prices, dream destinations, and weekend getaways.",
    talkingPoints: [
      "Ask whether the user has any travel plans coming up.",
      "Talk about a place they would visit if prices were lower.",
    ],
    source: "Fallback",
    url: "",
  },
  {
    id: "fallback_weather_plans",
    short: "Weather and plans",
    full: "People are talking about changing weather and how it affects daily plans.",
    brief:
      "An easy small-talk topic about weather, routines, outfits, and outdoor plans.",
    talkingPoints: [
      "Ask how the weather has been where the user is.",
      "Talk about how weather changes weekend plans.",
    ],
    source: "Fallback",
    url: "",
  },
];

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-zA-Z#0-9]+;/g, (m) => ENTITIES[m] ?? m);
}

function stripCData(value) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function getTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeEntities(stripCData(match[1]).trim()).trim() : "";
}

function cleanHeadline(raw) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const dashIndex = trimmed.lastIndexOf(" - ");
  return dashIndex > 0 ? trimmed.slice(0, dashIndex).trim() : trimmed;
}

function extractNewsItems(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];

  return items
    .map((item, index) => {
      const rawTitle = getTag(item, "title");
      const title = cleanHeadline(rawTitle);

      return {
        id: `raw_${index}`,
        title,
        source: getTag(item, "source"),
        pubDate: getTag(item, "pubDate"),
        link: getTag(item, "link"),
      };
    })
    .filter((item) => item.title.length > 0)
    .slice(0, 12);
}

function compactString(value, fallback = "") {
  return String(value ?? fallback).trim().replace(/\s+/g, " ");
}

function normalizeHotTopics(topics, newsItems) {
  if (!Array.isArray(topics)) return [];

  return topics
    .slice(0, 3)
    .map((topic, index) => {
      const sourceIndex = Math.max(0, Number(topic?.sourceIndex ?? index + 1) - 1);
      const sourceItem = newsItems[sourceIndex] ?? newsItems[index] ?? null;
      const short = compactString(topic?.short, sourceItem?.title ?? "Current event").slice(0, 64);
      const full = compactString(topic?.full, sourceItem?.title ?? short);
      const brief = compactString(topic?.brief, "A casual current-events topic for small talk.");
      const talkingPoints = Array.isArray(topic?.talkingPoints)
        ? topic.talkingPoints.map((point) => compactString(point)).filter(Boolean).slice(0, 3)
        : [];

      return {
        id: `news_${index}_${short.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 22)}`,
        short,
        full,
        brief,
        talkingPoints:
          talkingPoints.length > 0
            ? talkingPoints
            : ["Ask what the user has heard about it.", "Share a simple reaction and ask a follow-up question."],
        source: sourceItem?.source ?? "Google News",
        url: sourceItem?.link ?? "",
      };
    })
    .filter((topic) => topic.short && topic.full);
}

app.get("/api/hot-topics", async (_req, res) => {
  try {
    console.log("GET /api/hot-topics received");

    const response = await fetch(GOOGLE_NEWS_FEED_URL);
    if (!response.ok) {
      throw new Error(`Google News failed with status ${response.status}`);
    }

    const xml = await response.text();
    const newsItems = extractNewsItems(xml);

    if (newsItems.length === 0) {
      throw new Error("No Google News items found.");
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You turn raw Google News headlines into safe, beginner-friendly small-talk topics.

Return only valid JSON.

Rules:
- Choose topics that are easy to discuss casually in English practice.
- Make each short title clean, conversational, and under 7 words.
- Do not invent facts beyond the provided headlines.
- Avoid graphic, violent, or highly polarizing framing.
- The brief should explain just enough background for a learner to start talking.
- Keep everything compact for a mobile app.`,
        },
        {
          role: "user",
          content: `Here are today's Google News headlines:

${newsItems
  .map(
    (item, i) =>
      `${i + 1}. ${item.title}${item.source ? ` (${item.source})` : ""}`
  )
  .join("\n")}

Choose 3 good small-talk topics.

Return ONLY this JSON shape:

{
  "topics": [
    {
      "short": "Clean display title under 7 words",
      "full": "One-sentence topic description based only on the headline",
      "brief": "Beginner-friendly background in 1 sentence",
      "talkingPoints": [
        "A natural small-talk angle",
        "Another natural small-talk angle"
      ],
      "sourceIndex": 1
    }
  ]
}`,
        },
      ],
    });

    const text = completion.choices[0].message.content;
    const parsed = JSON.parse(text);
    const topics = normalizeHotTopics(parsed.topics, newsItems);

    res.json({
      topics: topics.length > 0 ? topics : NEWS_FALLBACK_TOPICS,
      source: "google-news-rss-groq",
    });
  } catch (err) {
    console.error(err);
    res.json({
      topics: NEWS_FALLBACK_TOPICS,
      source: "fallback",
    });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    console.log("POST /api/feedback received");

    const { topicLabel, durationSec, transcript, newsContext } = req.body;

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
- Keep all notes short. The UI is a mobile feedback screen.`,
        },
        {
          role: "user",
          content: `Evaluate this small talk conversation.

Topic: ${topicLabel}
Duration: ${durationSec} seconds

News context, if available:
${newsContext ? JSON.stringify(newsContext, null, 2) : "None"}

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
- Do not score the user. The app already calculates Vibe, Fluency, Slang, and Stamina locally.
- keywords should include 2 to 4 short topic chips.
- highlights should include exactly 2 items when possible, both from USER lines.
- vocabulary should include 2 to 5 items when the topic has useful words, idioms, slang, or news terms.
- culturalClues should include 1 to 3 items when the topic has cultural, social, or current-events context worth knowing.
- Include vocabulary and culturalClues even if the USER seems to understand; they are study notes for the topic.
- Put word meanings, idioms, slang, and news terms in vocabulary.
- Put social norms, cultural references, sensitive-topic framing, and background context in culturalClues.
- vocabulary.quote and culturalClues.quote should be copied from the transcript when possible; otherwise use the topic/news context.
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
  console.log("Groq API running on http://localhost:3000");
});
