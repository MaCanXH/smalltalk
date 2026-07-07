import type {
  DialogTurn,
  ScoreIndex,
  FeedbackHighlight,
  VocabularyItem,
  CulturalClue,
  SessionResult,
  Suggestions,
  TopicId,
} from "../../types";
import { getTopic, SLANG_MARKERS, STALL_PHRASES, WORD_UPGRADES } from "./banks";

/**
 * Turns a finished conversation into a scored training result. There's no model
 * grading here — scores are derived deterministically from real signals in the
 * transcript (turn count, length, variety, slang usage, time used) so different
 * sessions genuinely produce different, explainable numbers.
 */

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

interface UserStats {
  turns: number;
  totalWords: number;
  avgWords: number;
  uniqueRatio: number;
  slangCount: number;
  questionCount: number;
  softenerCount: number;
  confidentPhraseCount: number;
  lowConfidenceCount: number;
  bluntCount: number;
  userText: string;
}

interface TimingStats {
  wordsPerMinute: number;
  avgResponseDelaySec: number;
  longPauseCount: number;
  shortAnswerCount: number;
}

const SOFTENERS = [
  "i think",
  "i feel like",
  "kind of",
  "kinda",
  "maybe",
  "honestly",
  "that makes sense",
  "i get that",
  "that's interesting",
  "that's fair",
  "i guess",
];

const CONFIDENT_PHRASES = [
  "i think",
  "i'd say",
  "i would say",
  "my take",
  "for me",
  "in my opinion",
  "what surprised me",
  "i noticed",
];

const LOW_CONFIDENCE_PHRASES = [
  "i don't know",
  "i dont know",
  "i have no idea",
  "sorry",
  "my english is bad",
  "i can't explain",
  "i cant explain",
  "i'm not sure",
  "im not sure",
];

const BLUNT_MARKERS = [
  "that's wrong",
  "that is wrong",
  "i don't care",
  "i dont care",
  "whatever",
  "no idea",
];

function countMatches(text: string, phrases: string[]): number {
  return phrases.reduce((sum, phrase) => (text.includes(phrase) ? sum + 1 : sum), 0);
}

function analyseUser(dialog: DialogTurn[]): UserStats {
  const userTurns = dialog.filter((d) => d.speaker === "user");
  const allWords: string[] = [];
  let slangCount = 0;
  let questionCount = 0;

  for (const turn of userTurns) {
    const w = words(turn.text);
    allWords.push(...w);
    if (turn.text.trim().endsWith("?")) questionCount += 1;
    for (const marker of SLANG_MARKERS) {
      if (turn.text.toLowerCase().includes(marker)) slangCount += 1;
    }
  }

  const userText = userTurns.map((turn) => turn.text.toLowerCase()).join(" ");
  const unique = new Set(allWords);

  return {
    turns: userTurns.length,
    totalWords: allWords.length,
    avgWords: userTurns.length ? allWords.length / userTurns.length : 0,
    uniqueRatio: allWords.length ? unique.size / allWords.length : 0,
    slangCount,
    questionCount,
    softenerCount: countMatches(userText, SOFTENERS),
    confidentPhraseCount: countMatches(userText, CONFIDENT_PHRASES),
    lowConfidenceCount: countMatches(userText, LOW_CONFIDENCE_PHRASES),
    bluntCount: countMatches(userText, BLUNT_MARKERS),
    userText,
  };
}

function analyseTiming(dialog: DialogTurn[]): TimingStats {
  const userTurns = dialog.filter((turn) => turn.speaker === "user");
  const wordsTotal = userTurns.reduce((sum, turn) => sum + words(turn.text).length, 0);
  const firstUser = userTurns[0]?.t ?? 0;
  const lastUser = userTurns[userTurns.length - 1]?.t ?? firstUser;
  const activeMinutes = Math.max((lastUser - firstUser) / 60, 0.25);
  const responseDelays: number[] = [];

  for (let i = 1; i < dialog.length; i += 1) {
    const current = dialog[i];
    const prev = dialog[i - 1];

    if (current.speaker === "user" && prev.speaker === "ai") {
      responseDelays.push(Math.max(0, current.t - prev.t));
    }
  }

  const avgResponseDelaySec = responseDelays.length
    ? responseDelays.reduce((sum, delay) => sum + delay, 0) / responseDelays.length
    : 0;

  return {
    wordsPerMinute: Math.round(wordsTotal / activeMinutes),
    avgResponseDelaySec,
    longPauseCount: responseDelays.filter((delay) => delay >= 5).length,
    shortAnswerCount: userTurns.filter((turn) => words(turn.text).length <= 4).length,
  };
}

function buildIndices(stats: UserStats, timing: TimingStats, durationSec: number): ScoreIndex[] {
  // Vibe — engagement & warmth: rewarded by turns taken and questions asked back.
  const vibe = clamp(
    52 + stats.turns * 5 + stats.questionCount * 6 + stats.softenerCount * 2 -
      (stats.turns < 2 ? 20 : 0) - timing.shortAnswerCount * 2
  );

  // Fluency — flow & range: average sentence length + vocabulary variety + rough timing.
  const fluency = clamp(
    44 +
      Math.min(stats.avgWords, 14) * 2 +
      stats.uniqueRatio * 35 +
      Math.min(timing.wordsPerMinute, 140) * 0.08 -
      timing.longPauseCount * 4 -
      timing.shortAnswerCount * 2
  );

  // Tone — wording-level tone only; this does not claim to analyze pitch or accent.
  const tone = clamp(
    58 +
      stats.softenerCount * 5 +
      stats.questionCount * 3 +
      stats.slangCount * 2 -
      stats.bluntCount * 10
  );

  // Confidence — ability to state an opinion without over-apologizing.
  const confidence = clamp(
    60 +
      stats.confidentPhraseCount * 5 +
      Math.min(stats.avgWords, 12) * 1.2 -
      stats.lowConfidenceCount * 8 -
      timing.longPauseCount * 3
  );

  // Stamina — how much of the 3 minutes was actually used conversing.
  const stamina = clamp(
    34 + (durationSec / 180) * 45 + stats.turns * 3 + Math.min(stats.totalWords, 120) * 0.08 - timing.shortAnswerCount * 2
  );

  // Cultural fit — safe, curious small-talk style for current events.
  const culturalFit = clamp(
    58 +
      stats.questionCount * 4 +
      stats.softenerCount * 3 +
      stats.slangCount * 2 -
      stats.bluntCount * 8
  );

  return [
    {
      key: "vibe",
      label: "Vibe",
      value: vibe,
      blurb:
        stats.questionCount > 0
          ? `You asked ${stats.questionCount} question${stats.questionCount > 1 ? "s" : ""}, which made the conversation feel more two-sided.`
          : "Your answers were understandable; ask one follow-up question to make the vibe warmer.",
    },
    {
      key: "fluency",
      label: "Fluency",
      value: fluency,
      blurb:
        timing.longPauseCount > 0
          ? `Your ideas came through, but ${timing.longPauseCount} longer pause${timing.longPauseCount > 1 ? "s" : ""} made the flow feel less smooth.`
          : stats.avgWords >= 7
            ? "Your replies had enough length to sound clear and conversational."
            : "Your replies were clear but short; add one reason or example to sound smoother.",
    },
    {
      key: "tone",
      label: "Tone",
      value: tone,
      blurb:
        stats.softenerCount > 0
          ? "Your wording included softeners, so the tone felt friendly and easy to respond to."
          : "Your tone was understandable; add softeners like “I think” or “honestly” to sound warmer.",
    },
    {
      key: "confidence",
      label: "Confidence",
      value: confidence,
      blurb:
        stats.lowConfidenceCount > 0
          ? "You sounded a bit cautious; try stating one opinion before explaining it."
          : stats.confidentPhraseCount > 0
            ? "You used opinion phrases, which helped you sound more confident."
            : "You stayed safe; try starting with “I’d say…” to make your point clearer.",
    },
    {
      key: "stamina",
      label: "Stamina",
      value: stamina,
      blurb:
        stats.turns >= 5
          ? `You stayed active for ${stats.turns} turns, which helped the conversation keep moving.`
          : "You completed the practice; next time, try extending the conversation for a few more turns.",
    },
    {
      key: "culturalFit",
      label: "Culture",
      value: culturalFit,
      blurb:
        stats.questionCount > 0 || stats.softenerCount > 0
          ? "You kept the topic conversational instead of sounding too intense or debate-like."
          : "For news small talk, keep it curious: ask what the other person thinks before taking a strong stance.",
    },
  ];
}

function grade(score: number): { grade: string; emoji: string } {
  if (score >= 90) return { grade: "A — Effortless", emoji: "🔥" };
  if (score >= 80) return { grade: "B — Natural", emoji: "😎" };
  if (score >= 70) return { grade: "C — Getting there", emoji: "🙂" };
  if (score >= 55) return { grade: "D — Warming up", emoji: "🌱" };
  return { grade: "E — Keep practising", emoji: "💪" };
}

function buildSuggestions(stats: UserStats): Suggestions {
  const wordPicks = WORD_UPGRADES.slice(0, 4).map(
    (w) => `Instead of "${w.plain}", try "${w.nicer}".`
  );

  const stalls = STALL_PHRASES.slice(0, 4);

  const tips: string[] = [];
  if (stats.questionCount < 2) {
    tips.push("Ask the other person more questions — it keeps the ball rolling.");
  }
  if (stats.slangCount < 2) {
    tips.push("Drop in casual fillers like \"honestly\" or \"kinda\" to soften your tone.");
  }
  if (stats.avgWords < 6) {
    tips.push("Stretch your answers a little — add a reason or an example.");
  }
  if (tips.length === 0) {
    tips.push("Great balance — now try a tougher topic to stay challenged.");
  }
  tips.push("When you need a moment, lean on a stalling phrase instead of going silent.");

  return { words: wordPicks, stalls, tips };
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildKeywords(topicLabel: string, dialog: DialogTurn[]): string[] {
  const picked = new Set<string>();

  for (const raw of topicLabel.split(/[,&/]+/)) {
    const cleaned = raw.trim();
    if (cleaned) picked.add(titleCase(cleaned));
  }

  const userText = dialog
    .filter((turn) => turn.speaker === "user")
    .map((turn) => turn.text.toLowerCase())
    .join(" ");

  const candidates = [
    "travel",
    "hobbies",
    "weekend plans",
    "work",
    "food",
    "movies",
    "music",
    "school",
    "weather",
    "coffee",
  ];

  for (const candidate of candidates) {
    if (userText.includes(candidate)) picked.add(titleCase(candidate));
  }

  return [...picked].slice(0, 4);
}


function buildFallbackVocabulary(topicLabel: string): VocabularyItem[] {
  const topic = topicLabel.trim();
  if (!topic) return [];

  return [
    {
      term: topic.length > 32 ? "current event" : topic,
      quote: topic,
      meaning: "A topic people are talking about now, often used to start casual conversation.",
      example: `I saw something about ${topic} today.`,
      sayNextTime: `I saw something about ${topic}, but I only know the basics.`,
    },
  ];
}

function buildFallbackCulturalClues(topicLabel: string): CulturalClue[] {
  const topic = topicLabel.trim();
  if (!topic) return [];

  return [
    {
      title: "Current events small talk",
      quote: topic,
      explanation:
        "With news topics, it is safe to keep your tone curious and avoid sounding too certain.",
      trySaying: "I only saw the headline, but it sounds interesting. What do you think?",
    },
  ];
}

function buildHighlights(dialog: DialogTurn[]): FeedbackHighlight[] {
  return dialog
    .filter((turn) => turn.speaker === "user" && turn.text.trim().length > 0)
    .slice(0, 2)
    .map((turn, index) => ({
      quote: turn.text,
      note:
        index === 0
          ? "Clear opener that starts the conversation smoothly."
          : "Nice follow-up that keeps the conversation moving.",
    }));
}

let counter = 0;
function makeId(): string {
  counter += 1;
  return `s_${Date.now().toString(36)}_${counter}`;
}

export function buildResult(
  topicId: TopicId,
  dialog: DialogTurn[],
  durationSec: number,
  labelOverride?: string
): SessionResult {
  const topic = getTopic(topicId);
  const stats = analyseUser(dialog);
  const timing = analyseTiming(dialog);
  const indices = buildIndices(stats, timing, durationSec);
  const finalScore = clamp(
    indices.reduce((sum, i) => sum + i.value, 0) / indices.length
  );
  const { grade: g, emoji } = grade(finalScore);
  const topicLabel = labelOverride?.trim() || topic.label;

  return {
    id: makeId(),
    date: new Date().toISOString(),
    topic: topicId,
    topicLabel,
    durationSec,
    indices,
    finalScore,
    grade: g,
    vibeEmoji: emoji,
    suggestions: buildSuggestions(stats),
    keywords: buildKeywords(topicLabel, dialog),
    highlights: buildHighlights(dialog),
    vocabulary: buildFallbackVocabulary(topicLabel),
    culturalClues: buildFallbackCulturalClues(topicLabel),
    conversationSummary: `You practiced a casual conversation about ${topicLabel}.`,
    dialog,
  };
}

