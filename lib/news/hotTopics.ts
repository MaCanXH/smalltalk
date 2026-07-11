import type { NewsTopic } from "../../types";

import { getBackendBaseUrl } from "../backend";

/**
 * Trending topics now come from our backend, not directly from the app.
 *
 * Backend flow:
 * /api/hot-topics -> multi-source RSS (Google/BBC/NPR/ESPN/CBS) -> Groq
 * detail pack -> ~20-min server cache -> app.
 *
 * This keeps the home screen clean: users see beginner-friendly small-talk
 * topics instead of raw news headlines with publisher clutter.
 */

export type HotTopic = NewsTopic;

export const FALLBACK_TOPICS: HotTopic[] = [
  {
    id: "fallback_ai_tools",
    short: "AI in daily life",
    full: "People are talking about how AI tools are changing work, school, and everyday routines.",
    brief:
      "A beginner-friendly topic about whether AI tools feel helpful, stressful, or fun.",
    details: [
      "AI tools are appearing in everyday tasks like writing, studying, planning, and customer support.",
      "A safe small-talk angle is how useful or overwhelming these tools feel.",
    ],
    whyItMatters:
      "It connects technology news to daily routines, so beginners can join the conversation easily.",
    keyTerms: ["AI tools", "productivity", "everyday routines"],
    safeFraming:
      "Keep it personal and low-stakes: talk about usefulness, convenience, or confusion.",
    sourceUrls: [],
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
    details: [
      "Travel costs can affect where people go, how long they stay, and whether they plan shorter trips.",
      "This is easy small talk because people can share preferences without needing expert knowledge.",
    ],
    whyItMatters:
      "Travel is a common social topic, especially when prices or busy seasons affect plans.",
    keyTerms: ["travel costs", "flight prices", "weekend getaway"],
    safeFraming:
      "Avoid asking about someone's exact budget; ask about dream trips or planning habits instead.",
    sourceUrls: [],
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
    details: [
      "Weather is one of the safest small-talk topics because it affects everyone.",
      "You can connect it to plans, commuting, outfits, food, or mood.",
    ],
    whyItMatters:
      "It gives beginners a simple way to start a conversation without sounding too personal.",
    keyTerms: ["weather", "plans", "outdoor activities"],
    safeFraming:
      "Keep it light and observational; do not turn it into a debate unless the other person does.",
    sourceUrls: [],
    talkingPoints: [
      "Ask how the weather has been where the user is.",
      "Talk about how weather changes weekend plans.",
    ],
    source: "Fallback",
    url: "",
  },
];

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit);
}

function normalizeKeyQuotes(value: unknown, limit: number): HotTopic["keyQuotes"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const quote = String((item as { quote?: unknown }).quote ?? "").trim();
      if (!quote) return null;

      return {
        quote,
        speaker: String((item as { speaker?: unknown }).speaker ?? "").trim() || undefined,
        context: String((item as { context?: unknown }).context ?? "").trim() || undefined,
        source: String((item as { source?: unknown }).source ?? "").trim() || undefined,
      };
    })
    .filter(Boolean)
    .slice(0, limit) as HotTopic["keyQuotes"];
}

function normalizeVocabulary(value: unknown, limit: number): HotTopic["vocabulary"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const term = String((item as { term?: unknown }).term ?? "").trim();
      const meaning = String((item as { meaning?: unknown }).meaning ?? "").trim();
      if (!term || !meaning) return null;

      return {
        term,
        meaning,
        example: String((item as { example?: unknown }).example ?? "").trim() || undefined,
      };
    })
    .filter(Boolean)
    .slice(0, limit) as HotTopic["vocabulary"];
}

function normalizeTopic(topic: Partial<HotTopic>, index: number): HotTopic {
  const short = String(topic.short ?? "Current event").trim() || "Current event";
  const full = String(topic.full ?? short).trim() || short;

  return {
    id: String(topic.id ?? `hot_${index}`),
    short,
    full,
    brief: String(topic.brief ?? "A casual current-events topic for small talk.").trim(),
    details: normalizeStringArray(topic.details, 8),
    keyQuotes: normalizeKeyQuotes(topic.keyQuotes, 5),
    timeline: normalizeStringArray(topic.timeline, 5),
    controversy: topic.controversy ? String(topic.controversy).trim() : undefined,
    vocabulary: normalizeVocabulary(topic.vocabulary, 5),
    culturalClues: normalizeStringArray(topic.culturalClues, 5),
    conversationAngles: normalizeStringArray(topic.conversationAngles, 5),
    whyItMatters: topic.whyItMatters
      ? String(topic.whyItMatters).trim()
      : undefined,
    keyTerms: normalizeStringArray(topic.keyTerms, 6),
    safeFraming: topic.safeFraming ? String(topic.safeFraming).trim() : undefined,
    talkingPoints: Array.isArray(topic.talkingPoints)
      ? topic.talkingPoints.map(String).filter(Boolean).slice(0, 6)
      : [],
    source: topic.source,
    url: topic.url,
    sourceUrls: normalizeStringArray(topic.sourceUrls, 8),
    publishedAt: topic.publishedAt,
  };
}

interface FetchHotTopicsOptions {
  refresh?: boolean;
}

export async function fetchHotTopics(
  count = 3,
  options: FetchHotTopicsOptions = {}
): Promise<HotTopic[]> {
  const baseUrl = getBackendBaseUrl();

  if (!baseUrl) {
    return FALLBACK_TOPICS.slice(0, count);
  }

  const params = new URLSearchParams({ count: String(count) });
  if (options.refresh) params.set("refresh", String(Date.now()));

  // Imported lazily so the node test runner can load this module's pure
  // helpers without dragging in the React Native supabase client.
  const { getFunctionsAuthHeaders } = await import("../supabase");

  const response = await fetch(`${baseUrl}/api/hot-topics?${params.toString()}`, {
    headers: await getFunctionsAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Hot topics API failed with status ${response.status}`);
  }

  const json = await response.json();
  const topics = Array.isArray(json.topics) ? json.topics : [];

  if (topics.length === 0) {
    return FALLBACK_TOPICS.slice(0, count);
  }

  return topics.slice(0, count).map(normalizeTopic);
}
