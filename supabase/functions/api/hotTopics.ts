// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

import { requireUser } from "./auth.ts";
import { groq } from "./groq.ts";

/**
 * GET /api/hot-topics — Google News RSS -> Groq topic packs, ported verbatim
 * from server.mjs. The response JSON shape is the contract with the app's
 * `normalizeTopic` (lib/news/hotTopics.ts); keep it identical.
 */

interface NewsItem {
  id: string;
  title: string;
  description: string;
  source: string;
  sourceGroup: string;
  pubDate: string;
  link: string;
}

interface ArticleSnapshot {
  url: string;
  title: string;
  text: string;
}

/**
 * Mixed-source feed list on purpose: Google's datacenter-IP throttling took
 * all topics down when it was the only source (every feed 503'd from the
 * Edge Function egress on 2026-07-11). BBC/NPR/ESPN/CBS serve RSS to cloud
 * IPs without blocking; Google Top Stories stays because its headlines are
 * the best when it answers, and a failed feed degrades gracefully.
 * All must be RSS 2.0 with `<item>` tags — the parser doesn't speak Atom.
 */
const NEWS_FEEDS = [
  {
    sourceGroup: "Google News Top Stories",
    url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
  },
  {
    sourceGroup: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  {
    sourceGroup: "BBC Technology",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
  },
  {
    sourceGroup: "BBC Entertainment",
    url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
  },
  {
    sourceGroup: "BBC Business",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
  },
  {
    sourceGroup: "NPR News",
    url: "https://feeds.npr.org/1001/rss.xml",
  },
  {
    sourceGroup: "ESPN Sports",
    url: "https://www.espn.com/espn/rss/news",
  },
  {
    sourceGroup: "CBS News",
    url: "https://www.cbsnews.com/latest/rss/main",
  },
];

const NEWS_FALLBACK_TOPICS = [
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
    talkingPoints: [
      "Ask if the user has tried any new AI tools recently.",
      "Talk about whether AI saves time or makes things more confusing.",
    ],
    source: "Fallback",
    sourceUrls: [],
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
    talkingPoints: [
      "Ask whether the user has any travel plans coming up.",
      "Talk about a place they would visit if prices were lower.",
    ],
    source: "Fallback",
    sourceUrls: [],
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
    talkingPoints: [
      "Ask how the weather has been where the user is.",
      "Talk about how weather changes weekend plans.",
    ],
    source: "Fallback",
    sourceUrls: [],
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

function decodeEntities(value: unknown): string {
  return String(value ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-zA-Z#0-9]+;/g, (m) => ENTITIES[m] ?? m);
}

function stripCData(value: unknown): string {
  return String(value ?? "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripHtml(value: unknown): string {
  return decodeEntities(String(value ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeEntities(stripCData(match[1]).trim()).trim() : "";
}

function cleanHeadline(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const dashIndex = trimmed.lastIndexOf(" - ");
  return dashIndex > 0 ? trimmed.slice(0, dashIndex).trim() : trimmed;
}

function compactString(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim().replace(/\s+/g, " ");
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractNewsItems(xml: string, sourceGroup: string): NewsItem[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];

  return items
    .map((item, index) => {
      const rawTitle = getTag(item, "title");
      const title = cleanHeadline(rawTitle);
      const description = stripHtml(getTag(item, "description"));

      return {
        id: `${sourceGroup.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index}`,
        title,
        description,
        source: getTag(item, "source") || sourceGroup,
        sourceGroup,
        pubDate: getTag(item, "pubDate"),
        link: getTag(item, "link"),
      };
    })
    .filter((item) => item.title.length > 0);
}

/**
 * Google throttles UA-less requests from datacenter IPs (the Edge Function's
 * egress) far more aggressively than browser-looking ones, and sometimes
 * serves a consent interstitial instead of the feed. Browser-like headers +
 * the consent cookie keep the RSS endpoints answering with real XML.
 */
const FEED_REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
  Cookie: "CONSENT=YES+",
};

const FEED_FETCH_ATTEMPTS = 2;

/**
 * Fetch one RSS feed with a single retry and per-attempt diagnostics — the
 * function logs are the only place to see *how* Google is failing us
 * (429/403 vs a 200 consent page with zero <item> tags).
 */
async function fetchFeedItems(url: string, sourceGroup: string): Promise<NewsItem[]> {
  let lastFailure = "unknown";

  for (let attempt = 1; attempt <= FEED_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: FEED_REQUEST_HEADERS });
      const xml = await response.text();

      if (!response.ok) {
        lastFailure = `status ${response.status} (body ${xml.length} bytes)`;
        console.warn(`[hot-topics] ${sourceGroup} attempt ${attempt}: ${lastFailure}`);
      } else {
        const items = extractNewsItems(xml, sourceGroup);
        if (items.length > 0) return items;

        const consentHint = /consent\.google\.com|Before you continue/i.test(xml)
          ? ", looks like a consent page"
          : "";
        lastFailure = `status 200 but 0 items (body ${xml.length} bytes${consentHint})`;
        console.warn(`[hot-topics] ${sourceGroup} attempt ${attempt}: ${lastFailure}`);
      }
    } catch (err) {
      lastFailure = (err as Error)?.message ?? String(err);
      console.warn(`[hot-topics] ${sourceGroup} attempt ${attempt} threw: ${lastFailure}`);
    }

    if (attempt < FEED_FETCH_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 400));
    }
  }

  throw new Error(lastFailure);
}

async function fetchAllNewsItems(): Promise<{ items: NewsItem[]; failures: string[] }> {
  const responses = await Promise.allSettled(
    NEWS_FEEDS.map((feed) => fetchFeedItems(feed.url, feed.sourceGroup))
  );

  const failures: string[] = [];
  const items = responses.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    failures.push(
      `${NEWS_FEEDS[index].sourceGroup}: ${
        (result.reason as Error)?.message ?? result.reason
      }`
    );
    return [];
  });

  if (failures.length > 0) {
    console.warn(
      `[hot-topics] ${failures.length}/${NEWS_FEEDS.length} feeds failed — ${failures.join(" | ")}`
    );
  }

  return {
    items: uniqueBy(
      interleaveBySourceGroup(items),
      (item) => item.title.toLowerCase(),
    ).slice(0, MAX_NEWS_ITEMS),
    failures,
  };
}

/**
 * Round-robin the pool by feed so the token-budget trim in generateTopicPack
 * cuts evenly across sources instead of always dropping whichever feeds are
 * declared last in NEWS_FEEDS.
 */
function interleaveBySourceGroup(items: NewsItem[]): NewsItem[] {
  const buckets = new Map<string, NewsItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.sourceGroup);
    if (bucket) bucket.push(item);
    else buckets.set(item.sourceGroup, [item]);
  }

  const result: NewsItem[] = [];
  for (let rank = 0; result.length < items.length; rank++) {
    for (const bucket of buckets.values()) {
      if (rank < bucket.length) result.push(bucket[rank]);
    }
  }
  return result;
}

// ----- topic-pack cache ------------------------------------------------------

/**
 * One cached pack of GENERATED_TOPIC_COUNT topics serves every request for
 * CACHE_FRESH_MS — scraping + Groq run at most ~1×/hour instead of on every
 * Talk-tab load (the hammering is what got the egress IP blocked by Google).
 * A user "refresh" re-rolls the selection from the cached pack rather than
 * regenerating. When regeneration fails, the stale pack is served instead of
 * the canned fallbacks. Cache errors fail open (generate as before).
 */
const TOPIC_CACHE_KEY = "hot-topics-v1";
const CACHE_FRESH_MS = 60 * 60 * 1000;
const GENERATED_TOPIC_COUNT = 20;

/**
 * Groq's free tier caps llama-3.1-8b-instant at 6,000 tokens/minute, and the
 * TPM check counts prompt + max_tokens up front (a 413, not retried by the
 * SDK — one verbose news day of headlines was enough to trip it). The budget
 * is therefore enforced, not assumed: generateTopicPack measures its prompt
 * with estimateTokens and stops adding news items once estimated prompt +
 * max_tokens would cross GROQ_TPM_TOKEN_BUDGET, which sits below the real
 * limit to absorb estimation error. MAX_NEWS_ITEMS only bounds scraping; the
 * token budget decides how many items reach the prompt. Only the first
 * ENRICHED_TOPIC_COUNT topics get the (token-hungry) enrichment pass at
 * rebuild time — the rest ship with their base details and are enriched
 * progressively by request-driven batches (scheduleTailEnrichment) over the
 * cache's lifetime.
 */
const MAX_NEWS_ITEMS = 36;
const ENRICHED_TOPIC_COUNT = 5;
const GROQ_TPM_TOKEN_BUDGET = 5300;
const GENERATION_MAX_TOKENS = 3400;
const ENRICHMENT_MAX_TOKENS = 1400;

/** English averages ~4 characters per token; the budget slack covers the error. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface CachedTopicPack {
  topics: any[];
  source: string;
  createdAt: number;
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readTopicCache(): Promise<CachedTopicPack | null> {
  const admin = getAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("hot_topics_cache")
    .select("topics, source, created_at")
    .eq("cache_key", TOPIC_CACHE_KEY)
    .maybeSingle();

  if (error) {
    console.warn("[hot-topics] cache read failed:", error.message);
    return null;
  }
  if (!data || !Array.isArray(data.topics) || data.topics.length === 0) return null;

  return {
    topics: data.topics,
    source: typeof data.source === "string" && data.source ? data.source : "cache",
    createdAt: new Date(data.created_at).getTime(),
  };
}

async function writeTopicCache(
  topics: any[],
  source: string,
  // Batch-enrichment merges pass the original timestamp — a patch write must
  // not reset the freshness clock, or the pack would never expire.
  createdAtIso?: string,
): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;

  const { error } = await admin.from("hot_topics_cache").upsert(
    {
      cache_key: TOPIC_CACHE_KEY,
      topics,
      source,
      created_at: createdAtIso ?? new Date().toISOString(),
    },
    { onConflict: "cache_key" },
  );
  if (error) console.warn("[hot-topics] cache write failed:", error.message);
}

/**
 * The stored pack carries enrichment bookkeeping (`enriched` flags and the
 * raw `sourceItems` the batch enricher consumes); the response contract with
 * the app's normalizeTopic does not include either.
 */
function toPublicTopics(topics: any[]): any[] {
  return topics.map(
    ({ sourceItems: _sourceItems, enriched: _enriched, ...publicTopic }) => publicTopic,
  );
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Guards against concurrent stale hits piling up duplicate rebuilds (per isolate). */
let revalidationInFlight = false;

/**
 * Stale-while-revalidate: rebuild the pack *behind* the response via
 * `EdgeRuntime.waitUntil`, so a stale cache costs the user ~1s instead of the
 * ~50s regeneration. Returns false only when the runtime doesn't expose
 * waitUntil (the caller then falls back to blocking regeneration); an
 * already-running rebuild counts as handled.
 */
function scheduleRevalidation(refreshToken: string): boolean {
  const runtime = (globalThis as any).EdgeRuntime;
  if (typeof runtime?.waitUntil !== "function") return false;

  if (revalidationInFlight) return true;
  revalidationInFlight = true;

  runtime.waitUntil(
    (async () => {
      try {
        console.log("[hot-topics] background revalidation started");
        const pack = await generateTopicPack(refreshToken);
        await writeTopicCache(pack.topics, pack.source);
        console.log("[hot-topics] background revalidation completed");
      } catch (err) {
        console.error(
          "[hot-topics] background revalidation failed:",
          (err as Error)?.message ?? err,
        );
      } finally {
        revalidationInFlight = false;
      }
    })(),
  );

  return true;
}

/**
 * Progressive tail enrichment: each fresh-cache request donates one background
 * batch until every topic in the pack is enriched. Batches are small and
 * paced (one per TPM minute per isolate) so they never crowd /api/feedback
 * off the shared 6k-TPM Groq budget.
 */
const ENRICH_BATCH_SIZE = 2;
const ENRICH_BATCH_MIN_INTERVAL_MS = 60_000;

let enrichmentInFlight = false;
let lastEnrichmentBatchStartedAt = 0;

function scheduleTailEnrichment(topics: any[]): void {
  if (!topics.some((topic) => topic?.enriched === false)) return;
  const runtime = (globalThis as any).EdgeRuntime;
  if (typeof runtime?.waitUntil !== "function") return;
  if (enrichmentInFlight) return;
  if (Date.now() - lastEnrichmentBatchStartedAt < ENRICH_BATCH_MIN_INTERVAL_MS) return;

  enrichmentInFlight = true;
  lastEnrichmentBatchStartedAt = Date.now();
  runtime.waitUntil(
    (async () => {
      try {
        await enrichNextBatch();
      } catch (err) {
        console.error(
          "[hot-topics] batch enrichment task failed:",
          (err as Error)?.message ?? err,
        );
      } finally {
        enrichmentInFlight = false;
      }
    })(),
  );
}

async function enrichNextBatch(): Promise<void> {
  // Re-read at task start: another isolate may have advanced the frontier
  // since the request that scheduled this batch was served.
  const pack = await readTopicCache();
  if (!pack || Date.now() - pack.createdAt >= CACHE_FRESH_MS) return;

  const candidates = pack.topics
    .filter((topic) => topic?.enriched === false)
    .slice(0, ENRICH_BATCH_SIZE);
  if (candidates.length === 0) return;

  console.log(
    `[hot-topics] enriching batch: ${candidates.map((topic) => topic.id).join(", ")}`,
  );

  // Sequential on purpose — two concurrent calls could momentarily reserve
  // most of the TPM window the feedback critic shares.
  const enrichedById = new Map<string, any>();
  for (const candidate of candidates) {
    try {
      const enriched = await enrichTopicWithoutChangingIdentity(candidate, {
        skipRelatedSearch: true,
      });
      const { sourceItems: _sourceItems, ...storedShape } = enriched;
      // A fulfilled call counts as enriched even if no source material was
      // usable — otherwise a materially empty topic would block the frontier
      // and be retried by every future batch.
      enrichedById.set(candidate.id, { ...storedShape, enriched: true });
    } catch (err) {
      console.warn(
        `[hot-topics] batch enrichment failed for ${candidate.id}:`,
        (err as Error)?.message ?? err,
      );
    }
  }
  if (enrichedById.size === 0) return;

  // Read-merge-write: patch only the topics enriched here onto the *current*
  // row, so a concurrent batch on another isolate isn't overwritten. The
  // residual read→write race loses at most one batch, and the surviving
  // enriched=false flags make that self-healing.
  const current = await readTopicCache();
  if (!current || current.createdAt !== pack.createdAt) return;
  const merged = current.topics.map((topic) => enrichedById.get(topic?.id) ?? topic);
  await writeTopicCache(merged, current.source, new Date(current.createdAt).toISOString());
  console.log(`[hot-topics] batch stored (${enrichedById.size} topics enriched)`);
}

function buildGoogleNewsSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

function buildRelatedNewsQuery(topic: any, sourceItems: NewsItem[]): string {
  const pieces = [topic?.short, topic?.full]
    .concat(sourceItems.map((item) => item.title))
    .filter(Boolean)
    .join(" ");

  return pieces
    .replace(/[“”"'’]/g, "")
    .replace(/\b(live updates?|breaking news|watch|video|photos?)\b/gi, "")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 14)
    .join(" ");
}

async function fetchRelatedNewsItems(query: string): Promise<NewsItem[]> {
  if (!query) return [];
  try {
    const response = await fetch(buildGoogleNewsSearchUrl(query), {
      headers: FEED_REQUEST_HEADERS,
    });
    if (!response.ok) {
      console.warn(`[hot-topics] related search: status ${response.status}`);
      return [];
    }
    const xml = await response.text();
    return extractNewsItems(xml, "Google News Related Search").slice(0, 8);
  } catch (err) {
    console.warn("Related news search failed:", (err as Error)?.message ?? err);
    return [];
  }
}

function extractParagraphText(html: string): string {
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripHtml(match[1]))
    .filter((text) => text.length > 80 && !/subscribe|sign up|cookie|advertisement/i.test(text));

  return paragraphs.join("\n").replace(/\s+\n/g, "\n").slice(0, 5000);
}

async function fetchArticleSnapshot(url: string): Promise<ArticleSnapshot | null> {
  if (!url || /news\.google\.com\//i.test(url)) return null;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SmallTalkNewsBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const text = extractParagraphText(html);
    if (text.length < 300) return null;

    return {
      url,
      title: titleMatch ? stripHtml(titleMatch[1]) : "",
      text,
    };
  } catch (err) {
    console.warn("Article fetch failed:", (err as Error)?.message ?? err);
    return null;
  }
}

function normalizeKeyQuotes(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      quote: compactString(item?.quote).slice(0, 180),
      speaker: compactString(item?.speaker).slice(0, 80),
      context: compactString(item?.context).slice(0, 220),
      source: compactString(item?.source).slice(0, 120),
    }))
    .filter((item) => item.quote)
    .slice(0, limit);
}

function normalizeVocabulary(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      term: compactString(item?.term).slice(0, 80),
      meaning: compactString(item?.meaning).slice(0, 220),
      example: compactString(item?.example).slice(0, 180),
    }))
    .filter((item) => item.term && item.meaning)
    .slice(0, limit);
}

function mergeUniqueStrings(...groups: unknown[][]): string[] {
  return uniqueBy(
    groups.flat().map((item) => compactString(item)).filter(Boolean),
    (item) => item.toLowerCase()
  );
}

async function enrichTopicWithoutChangingIdentity(
  topic: any,
  options: { skipRelatedSearch?: boolean } = {},
): Promise<any> {
  const baseSourceItems: NewsItem[] = Array.isArray(topic.sourceItems)
    ? topic.sourceItems
    : [];
  // Tail-topic batches skip the Google related-search: ~15 extra searches per
  // cycle against the endpoint that already 503-blocked this egress IP isn't
  // worth it — the stored sourceItems + their publisher articles suffice.
  const relatedItems = options.skipRelatedSearch
    ? []
    : await fetchRelatedNewsItems(buildRelatedNewsQuery(topic, baseSourceItems));
  const allItems = uniqueBy(
    [...baseSourceItems, ...relatedItems],
    (item) => item.title.toLowerCase()
  ).slice(0, 8);

  const articleSnapshots = (
    await Promise.all(allItems.slice(0, 2).map((item) => fetchArticleSnapshot(item.link)))
  ).filter((snapshot): snapshot is ArticleSnapshot => Boolean(snapshot));

  if (allItems.length === 0 && articleSnapshots.length === 0) return topic;

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.2,
    response_format: { type: "json_object" },
    // Without an explicit cap Groq reserves the model's default completion
    // size against the TPM check — and ENRICHED_TOPIC_COUNT of these run
    // concurrently alongside the generation call.
    max_tokens: ENRICHMENT_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: `You enrich an existing small-talk news topic without changing its identity.

Return only valid JSON.

Your job:
- Do NOT create a new topic.
- Do NOT make the topic more general.
- Keep the same story, people, teams, companies, event, and angle.
- Extract what a normal person would remember after reading the news: specific facts, the most dramatic point, short memorable quotes/posts if available, reactions, timeline, and cultural clues.
- Use only the supplied snippets/articles. Do not invent quotes, scores, numbers, names, or claims.
- If exact quotes are not present, return an empty keyQuotes array.
- Prefer concrete details over generic lines.
- Keep the result compact enough for a voice AI prompt.`,
      },
      {
        role: "user",
        content: `Existing topic to preserve:
short: ${topic.short}
full: ${topic.full}
brief: ${topic.brief}
existing details: ${(topic.details ?? []).join(" | ")}
existing talkingPoints: ${(topic.talkingPoints ?? []).join(" | ")}

Related RSS items and snippets:
${allItems
  .map(
    (item, i) =>
      `${i + 1}. ${item.title}${item.source ? ` (${item.source})` : ""}${
        item.pubDate ? ` [${item.pubDate}]` : ""
      }${item.description ? `\n   Snippet: ${item.description.slice(0, 240)}` : ""}`
  )
  .join("\n")}

Article snapshots, if any:
${articleSnapshots
  .map(
    (article, i) =>
      `ARTICLE ${i + 1}: ${article.title}\nURL: ${article.url}\n${article.text.slice(0, 1400)}`
  )
  .join("\n\n")}

Return ONLY this JSON shape:
{
  "details": [
    "specific fact, reaction, number, decision, score, or named action",
    "specific dramatic or memorable point"
  ],
  "keyQuotes": [
    {
      "quote": "short exact quote or social post text from the provided text",
      "speaker": "who said or posted it, if known",
      "context": "why this quote matters in the story",
      "source": "source name or URL if known"
    }
  ],
  "timeline": ["what happened first", "what happened next"],
  "controversy": "main drama, backlash, joke, or debate in one sentence",
  "whyItMatters": "why people might casually talk about this",
  "keyTerms": ["term or phrase from the story"],
  "vocabulary": [
    { "term": "word or phrase", "meaning": "simple meaning", "example": "short natural example" }
  ],
  "culturalClues": [
    "background, joke, social-media tone, sports/news norm, or cultural context a learner may miss"
  ],
  "safeFraming": "how Vapi should discuss this lightly and safely",
  "talkingPoints": ["natural small-talk angle", "another follow-up angle"],
  "conversationAngles": ["what a person might ask a friend about this"]
}`,
      },
    ],
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
  const existingUrls: string[] = Array.isArray(topic.sourceUrls) ? topic.sourceUrls : [];
  const newUrls = allItems.map((item) => item.link).filter(Boolean);
  const sourceNames = uniqueBy(
    allItems.map((item) => item.source).filter(Boolean),
    (name) => name.toLowerCase()
  );

  const enriched = {
    ...topic,
    details: mergeUniqueStrings(topic.details ?? [], normalizeStringArray(parsed.details, 8)).slice(0, 8),
    keyQuotes: normalizeKeyQuotes(parsed.keyQuotes, 5),
    timeline: normalizeStringArray(parsed.timeline, 5),
    controversy: compactString(parsed.controversy, topic.controversy ?? "").slice(0, 360),
    whyItMatters: compactString(parsed.whyItMatters, topic.whyItMatters ?? ""),
    keyTerms: mergeUniqueStrings(topic.keyTerms ?? [], normalizeStringArray(parsed.keyTerms, 8)).slice(0, 8),
    vocabulary: normalizeVocabulary(parsed.vocabulary, 5),
    culturalClues: normalizeStringArray(parsed.culturalClues, 5),
    safeFraming: compactString(parsed.safeFraming, topic.safeFraming ?? ""),
    talkingPoints: mergeUniqueStrings(topic.talkingPoints ?? [], normalizeStringArray(parsed.talkingPoints, 6)).slice(0, 6),
    conversationAngles: normalizeStringArray(parsed.conversationAngles, 5),
    source: sourceNames.length > 0 ? sourceNames.slice(0, 4).join(", ") : topic.source,
    sourceUrls: mergeUniqueStrings(existingUrls, newUrls).slice(0, 8),
    url: topic.url || existingUrls[0] || newUrls[0] || "",
    sourceItems: undefined,
  };

  return enriched;
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => compactString(item)).filter(Boolean).slice(0, limit);
}

function normalizeHotTopics(topics: unknown, newsItems: NewsItem[]) {
  if (!Array.isArray(topics)) return [];

  return topics
    .slice(0, GENERATED_TOPIC_COUNT)
    .map((topic: any, index) => {
      const rawIndexes = Array.isArray(topic?.sourceIndexes)
        ? topic.sourceIndexes
        : [topic?.sourceIndex ?? index + 1];
      const sourceIndexes = rawIndexes
        .map((n: unknown) => Math.max(0, Number(n) - 1))
        .filter((n: number) => Number.isFinite(n));
      const sourceItems = uniqueBy(
        sourceIndexes.map((i: number) => newsItems[i]).filter(Boolean),
        (item: NewsItem) => item.title.toLowerCase()
      ).slice(0, 5);
      const primary = sourceItems[0] ?? newsItems[index] ?? null;

      const short = compactString(topic?.short, primary?.title ?? "Current event").slice(0, 64);
      const full = compactString(topic?.full, primary?.title ?? short);
      const brief = compactString(topic?.brief, "A casual current-events topic for small talk.");
      const details = normalizeStringArray(topic?.details, 6);
      const talkingPoints = normalizeStringArray(topic?.talkingPoints, 5);
      const keyTerms = normalizeStringArray(topic?.keyTerms, 6);
      const sourceUrls = sourceItems.map((item) => item.link).filter(Boolean);
      const sourceNames = uniqueBy(
        sourceItems.map((item) => item.source).filter(Boolean),
        (name) => name.toLowerCase()
      );

      return {
        id: `news_${index}_${short.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 22)}`,
        short,
        full,
        brief,
        details:
          details.length > 0
            ? details
            : [primary?.description || primary?.title || full].filter(Boolean),
        whyItMatters: compactString(topic?.whyItMatters, "It is a current topic people may casually mention."),
        keyTerms,
        safeFraming: compactString(topic?.safeFraming, "Keep it casual, curious, and avoid making unsupported claims."),
        talkingPoints:
          talkingPoints.length > 0
            ? talkingPoints
            : ["Ask what the user has heard about it.", "Share a simple reaction and ask a follow-up question."],
        source: sourceNames.length > 0 ? sourceNames.join(", ") : primary?.source ?? "Google News",
        sourceUrls,
        url: sourceUrls[0] ?? primary?.link ?? "",
        publishedAt: primary?.pubDate ?? "",
        sourceItems,
      };
    })
    .filter((topic) => topic.short && topic.full);
}

/** Scrape the feeds and build a full pack of GENERATED_TOPIC_COUNT topics. */
async function generateTopicPack(
  refreshToken: string,
): Promise<{ topics: any[]; source: string }> {
  const { items: newsItems, failures } = await fetchAllNewsItems();

  if (newsItems.length === 0) {
    throw new Error(
      `No news items found. Feed failures: ${failures.join(" | ") || "none reported"}`
    );
  }

  const systemPrompt = `You turn current news RSS items into safe, beginner-friendly small-talk topic packs.

Return only valid JSON.

Rules:
- Choose topics that are easy to discuss casually in English practice.
- Prefer lifestyle, culture, tech, entertainment, business, sports, weather, and everyday-impact angles.
- Avoid graphic, violent, or highly polarizing framing.
- Use only the supplied headlines/descriptions. Do not invent extra facts.
- Each topic must include enough context for a voice AI to discuss it without sounding like it only saw a headline.
- The details should be factual, compact, and based on the supplied items.
- The safeFraming should tell the AI how to keep the conversation socially appropriate.
- Keep everything compact for a mobile app and a short voice prompt.`;

  const userIntro = `Here are current news items from several news RSS feeds. Use the item numbers as sourceIndexes.

`;

  const userOutro = `

Choose ${GENERATED_TOPIC_COUNT} good small-talk topics.

Return ONLY this JSON shape:

{
  "topics": [
    {
      "short": "Clean display title under 7 words",
      "full": "One-sentence topic description based only on the supplied items",
      "brief": "Beginner-friendly background in 1 sentence",
      "details": [
        "Concrete detail from the supplied item(s)",
        "Another useful detail or context point"
      ],
      "whyItMatters": "Why people may care in everyday conversation",
      "keyTerms": ["topic word", "news term", "casual phrase"],
      "safeFraming": "How to discuss it lightly and safely",
      "talkingPoints": [
        "A natural small-talk angle",
        "Another natural small-talk angle",
        "A simple follow-up question angle"
      ],
      "sourceIndexes": [1, 2]
    }
  ]
}`;

  // Admit items one at a time until the estimated prompt plus the reserved
  // completion would cross the TPM budget — a verbose news day just means
  // fewer items in the prompt, never a 413. promptItems (not newsItems) must
  // feed normalizeHotTopics below so the model's sourceIndexes line up.
  const promptItems: NewsItem[] = [];
  const itemLines: string[] = [];
  let usedTokens =
    estimateTokens(systemPrompt) +
    estimateTokens(userIntro) +
    estimateTokens(userOutro) +
    GENERATION_MAX_TOKENS;
  for (const item of newsItems) {
    const line = `${promptItems.length + 1}. ${item.title}${
      item.source ? ` (${item.source})` : ""
    }${item.sourceGroup ? ` [${item.sourceGroup}]` : ""}${
      item.description ? `\n   Snippet: ${item.description.slice(0, 160)}` : ""
    }`;
    const lineTokens = estimateTokens(`${line}\n`);
    if (usedTokens + lineTokens > GROQ_TPM_TOKEN_BUDGET) break;
    usedTokens += lineTokens;
    promptItems.push(item);
    itemLines.push(line);
  }

  if (promptItems.length < newsItems.length) {
    console.log(
      `[hot-topics] token budget admitted ${promptItems.length}/${newsItems.length} items (~${usedTokens} tokens incl. max_tokens)`,
    );
  }

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: refreshToken ? 0.35 : 0.2,
    response_format: { type: "json_object" },
    max_tokens: GENERATION_MAX_TOKENS,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${userIntro}${itemLines.join("\n")}${userOutro}` },
    ],
  });

  const text = completion.choices[0].message.content;
  const parsed = JSON.parse(text ?? "{}");
  const baseTopics = normalizeHotTopics(parsed.topics, promptItems).slice(
    0,
    GENERATED_TOPIC_COUNT,
  );
  // Enrich only the head of the pack inline (the topics non-refresh users
  // see) — enriching all 20 here would burn ~10 minutes of Groq TPM budget in
  // one task. The tail is enriched progressively by scheduleTailEnrichment
  // batches as fresh-cache requests come in.
  const enrichedResults = await Promise.allSettled(
    baseTopics
      .slice(0, ENRICHED_TOPIC_COUNT)
      .map((topic) => enrichTopicWithoutChangingIdentity(topic))
  );
  const topics = baseTopics.map((topic, index) => {
    if (index < enrichedResults.length && enrichedResults[index].status === "fulfilled") {
      const { sourceItems: _sourceItems, ...enrichedTopic } =
        (enrichedResults[index] as PromiseFulfilledResult<any>).value;
      return { ...enrichedTopic, enriched: true };
    }
    // Unenriched topics keep their sourceItems in the cache — the progressive
    // enrichment batches need them as raw material.
    return { ...topic, enriched: false };
  });

  if (topics.length === 0) {
    throw new Error("Topic generation produced no topics.");
  }

  return { topics, source: "multi-source-rss-groq-topic-preserving-detail-pack" };
}

export async function handleHotTopics(req: Request): Promise<Response> {
  // Signed-in users only — a cache miss on this route triggers scraping +
  // multiple Groq calls, so the bare anon key must not be able to invoke it.
  const user = await requireUser(req);
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(req.url);
  const requestedCount = Number(url.searchParams.get("count") ?? 3);
  const count = Number.isFinite(requestedCount)
    ? Math.max(1, Math.min(5, requestedCount))
    : 3;
  const refreshToken = compactString(url.searchParams.get("refresh"), "");
  const debugRequested = url.searchParams.get("debug") === "1";

  const cached = await readTopicCache();
  const cacheAge = cached ? Date.now() - cached.createdAt : Number.POSITIVE_INFINITY;

  if (cached && cacheAge < CACHE_FRESH_MS) {
    console.log(`GET /api/hot-topics served from cache (age ${Math.round(cacheAge / 1000)}s)`);
    const pool = refreshToken ? shuffled(cached.topics) : cached.topics;
    // Fresh pack, possibly still ripening: donate a background enrichment
    // batch behind this response (no-op once all topics are enriched).
    scheduleTailEnrichment(cached.topics);
    return Response.json({
      topics: toPublicTopics(pool.slice(0, count)),
      source: cached.source,
      cached: true,
    });
  }

  // Stale cache: answer with it immediately and rebuild behind the response —
  // nobody waits out the regeneration interactively.
  if (cached && scheduleRevalidation(refreshToken)) {
    console.log(
      `GET /api/hot-topics served stale cache (age ${Math.round(cacheAge / 1000)}s), revalidating in background`,
    );
    const pool = refreshToken ? shuffled(cached.topics) : cached.topics;
    return Response.json({
      topics: toPublicTopics(pool.slice(0, count)),
      source: cached.source,
      cached: true,
      stale: true,
    });
  }

  try {
    console.log("GET /api/hot-topics regenerating topic pack");
    const pack = await generateTopicPack(refreshToken);
    await writeTopicCache(pack.topics, pack.source);
    return Response.json({
      topics: toPublicTopics(pack.topics.slice(0, count)),
      source: pack.source,
    });
  } catch (err) {
    console.error(err);

    // Prefer yesterday's real topics over the canned fallbacks.
    if (cached) {
      const pool = refreshToken ? shuffled(cached.topics) : cached.topics;
      return Response.json({
        topics: toPublicTopics(pool.slice(0, count)),
        source: "stale-cache",
        cached: true,
        ...(debugRequested ? { debug: (err as Error)?.message ?? String(err) } : {}),
      });
    }

    return Response.json({
      topics: NEWS_FALLBACK_TOPICS.slice(0, count),
      source: "fallback",
      // Diagnostics on demand (`?debug=1`): only feed statuses, no secrets —
      // and the caller already passed the platform JWT check to get here.
      ...(debugRequested ? { debug: (err as Error)?.message ?? String(err) } : {}),
    });
  }
}
