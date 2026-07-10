// deno-lint-ignore-file no-explicit-any
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

const GOOGLE_NEWS_FEEDS = [
  {
    sourceGroup: "Google News Top Stories",
    url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
  },
  {
    sourceGroup: "Google News U.S.",
    url: "https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en",
  },
  {
    sourceGroup: "Google News World",
    url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
  },
  {
    sourceGroup: "Google News Sports",
    url: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en",
  },
  {
    sourceGroup: "Google News Technology",
    url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
  },
  {
    sourceGroup: "Google News Entertainment",
    url: "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en",
  },
  {
    sourceGroup: "Google News Business",
    url: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
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

async function fetchAllNewsItems(): Promise<NewsItem[]> {
  const responses = await Promise.allSettled(
    GOOGLE_NEWS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url);
      if (!response.ok) {
        throw new Error(`${feed.sourceGroup} failed with status ${response.status}`);
      }
      const xml = await response.text();
      return extractNewsItems(xml, feed.sourceGroup);
    })
  );

  const items = responses.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  return uniqueBy(items, (item) => item.title.toLowerCase()).slice(0, 36);
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
    const response = await fetch(buildGoogleNewsSearchUrl(query));
    if (!response.ok) return [];
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

async function enrichTopicWithoutChangingIdentity(topic: any): Promise<any> {
  const baseSourceItems: NewsItem[] = Array.isArray(topic.sourceItems)
    ? topic.sourceItems
    : [];
  const query = buildRelatedNewsQuery(topic, baseSourceItems);
  const relatedItems = await fetchRelatedNewsItems(query);
  const allItems = uniqueBy(
    [...baseSourceItems, ...relatedItems],
    (item) => item.title.toLowerCase()
  ).slice(0, 10);

  const articleSnapshots = (
    await Promise.all(allItems.slice(0, 3).map((item) => fetchArticleSnapshot(item.link)))
  ).filter((snapshot): snapshot is ArticleSnapshot => Boolean(snapshot));

  if (allItems.length === 0 && articleSnapshots.length === 0) return topic;

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.2,
    response_format: { type: "json_object" },
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
      }${item.description ? `\n   Snippet: ${item.description.slice(0, 360)}` : ""}`
  )
  .join("\n")}

Article snapshots, if any:
${articleSnapshots
  .map(
    (article, i) =>
      `ARTICLE ${i + 1}: ${article.title}\nURL: ${article.url}\n${article.text.slice(0, 2200)}`
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
    .slice(0, 5)
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

export async function handleHotTopics(req: Request): Promise<Response> {
  try {
    console.log("GET /api/hot-topics received");

    const url = new URL(req.url);
    const requestedCount = Number(url.searchParams.get("count") ?? 3);
    const count = Number.isFinite(requestedCount)
      ? Math.max(1, Math.min(5, requestedCount))
      : 3;
    const refreshToken = compactString(url.searchParams.get("refresh"), "");

    const newsItems = await fetchAllNewsItems();

    if (newsItems.length === 0) {
      throw new Error("No Google News items found.");
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: refreshToken ? 0.35 : 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You turn current news RSS items into safe, beginner-friendly small-talk topic packs.

Return only valid JSON.

Rules:
- Choose topics that are easy to discuss casually in English practice.
- Prefer lifestyle, culture, tech, entertainment, business, sports, weather, and everyday-impact angles.
- Avoid graphic, violent, or highly polarizing framing.
- Use only the supplied headlines/descriptions. Do not invent extra facts.
- Each topic must include enough context for a voice AI to discuss it without sounding like it only saw a headline.
- The details should be factual, compact, and based on the supplied items.
- The safeFraming should tell the AI how to keep the conversation socially appropriate.
- Keep everything compact for a mobile app and a short voice prompt.`,
        },
        {
          role: "user",
          content: `Here are current news items from several Google News RSS sections. Use the item numbers as sourceIndexes.

${newsItems
  .map(
    (item, i) =>
      `${i + 1}. ${item.title}${item.source ? ` (${item.source})` : ""}${
        item.sourceGroup ? ` [${item.sourceGroup}]` : ""
      }${item.description ? `\n   Snippet: ${item.description.slice(0, 220)}` : ""}`
  )
  .join("\n")}

Choose ${count} good small-talk topics.

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
}`,
        },
      ],
    });

    const text = completion.choices[0].message.content;
    const parsed = JSON.parse(text ?? "{}");
    const baseTopics = normalizeHotTopics(parsed.topics, newsItems).slice(0, count);
    const enrichedResults = await Promise.allSettled(
      baseTopics.map((topic) => enrichTopicWithoutChangingIdentity(topic))
    );
    const topics = enrichedResults.map((result, index) => {
      const topic = result.status === "fulfilled" ? result.value : baseTopics[index];
      const { sourceItems: _sourceItems, ...publicTopic } = topic;
      return publicTopic;
    });

    return Response.json({
      topics: topics.length > 0 ? topics : NEWS_FALLBACK_TOPICS.slice(0, count),
      source: "multi-google-news-rss-groq-topic-preserving-detail-pack",
    });
  } catch (err) {
    console.error(err);
    return Response.json({
      topics: NEWS_FALLBACK_TOPICS,
      source: "fallback",
    });
  }
}
