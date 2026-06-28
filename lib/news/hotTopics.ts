/**
 * Trending "hot topics" for the Talk tab, pulled from the Google News RSS feed.
 *
 * Google News has no official API, but its RSS feed is fetchable from a native
 * app and returns the current top stories. We grab the feed, pick a few at
 * random, and shorten each headline for display (heuristic clean + trim):
 * strip the trailing "- Publisher", drop any sub-clause after a colon/em dash,
 * then cap at 8 words with an ellipsis. The unshortened (publisher-stripped)
 * headline is kept too, so the AI can be steered with the full context.
 */

const FEED_URL = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
const MAX_WORDS = 8;

export interface HotTopic {
  id: string;
  /** Short headline for display (≤ 8 words). */
  short: string;
  /** Cleaned full headline (publisher removed) used to steer the AI. */
  full: string;
}

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

/** Pull the `<title>` text from each `<item>` block of an RSS document. */
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

/** Remove the trailing " - Publisher" that Google News appends to titles. */
export function cleanHeadline(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const dashIndex = trimmed.lastIndexOf(" - ");
  return dashIndex > 0 ? trimmed.slice(0, dashIndex).trim() : trimmed;
}

/** Shorten a cleaned headline to ≤ 8 words (heuristic clean + trim). */
export function shortenHeadline(full: string): string {
  // Drop a trailing sub-clause introduced by a colon or em dash.
  const clauseSplit = full.search(/\s[—–]\s|:\s/);
  const base = (clauseSplit > 0 ? full.slice(0, clauseSplit) : full).trim();

  const words = base.split(/\s+/);
  if (words.length > MAX_WORDS) {
    return `${words.slice(0, MAX_WORDS).join(" ")}…`;
  }
  return base;
}

function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export async function fetchHotTopics(count = 3): Promise<HotTopic[]> {
  const response = await fetch(FEED_URL);
  if (!response.ok) {
    throw new Error(`Google News feed failed with status ${response.status}`);
  }

  const xml = await response.text();
  const titles = extractItemTitles(xml);
  if (titles.length === 0) {
    throw new Error("No headlines found in the Google News feed.");
  }

  return pickRandom(titles, count).map((raw, index) => {
    const full = cleanHeadline(raw);
    return {
      id: `hot_${index}_${full.slice(0, 16).replace(/\s+/g, "_")}`,
      short: shortenHeadline(full),
      full,
    };
  });
}
