import type { NewsTopic } from "../../types";

/**
 * Trending topics now come from our backend, not directly from the app.
 *
 * Backend flow:
 * /api/hot-topics -> Google News RSS -> Groq cleanup/summarization -> app.
 *
 * This keeps the home screen clean: users see beginner-friendly small-talk
 * topics instead of raw news headlines with publisher clutter.
 */

export type HotTopic = NewsTopic;

const MAX_WORDS = 8;

export const FALLBACK_TOPICS: HotTopic[] = [
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

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-zA-Z#0-9]+;/g, (m) => ENTITIES[m] ?? m);
}

function stripCData(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

/** Kept for unit tests and fallback parsing experiments. */
export function extractItemTitles(xml: string): string[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  const titles: string[] = [];
  for (const item of items) {
    const match = item.match(/<title>([\s\S]*?)<\/title>/);
    if (!match) continue;
    const title = decodeEntities(stripCData(match[1]).trim()).trim();
    if (title) titles.push(title);
  }
  return titles;
}

export function cleanHeadline(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const dashIndex = trimmed.lastIndexOf(" - ");
  return dashIndex > 0 ? trimmed.slice(0, dashIndex).trim() : trimmed;
}

export function shortenHeadline(full: string): string {
  const clauseSplit = full.search(/\s[—–]\s|:\s/);
  const base = (clauseSplit > 0 ? full.slice(0, clauseSplit) : full).trim();

  const words = base.split(/\s+/);
  if (words.length > MAX_WORDS) {
    return `${words.slice(0, MAX_WORDS).join(" ")}…`;
  }
  return base;
}

function getBackendBaseUrl(): string | null {
  const feedbackUrl = process.env.EXPO_PUBLIC_FEEDBACK_API_URL?.trim();
  if (!feedbackUrl) return null;

  return feedbackUrl.replace(/\/api\/feedback\/?$/, "").replace(/\/$/, "");
}

function normalizeTopic(topic: Partial<HotTopic>, index: number): HotTopic {
  const short = String(topic.short ?? "Current event").trim() || "Current event";
  const full = String(topic.full ?? short).trim() || short;

  return {
    id: String(topic.id ?? `hot_${index}`),
    short,
    full,
    brief: String(topic.brief ?? "A casual current-events topic for small talk.").trim(),
    talkingPoints: Array.isArray(topic.talkingPoints)
      ? topic.talkingPoints.map(String).filter(Boolean).slice(0, 3)
      : [],
    source: topic.source,
    url: topic.url,
  };
}

export async function fetchHotTopics(count = 3): Promise<HotTopic[]> {
  const baseUrl = getBackendBaseUrl();

  if (!baseUrl) {
    return FALLBACK_TOPICS.slice(0, count);
  }

  const response = await fetch(`${baseUrl}/api/hot-topics`);
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
