import type {
  DialogTurn,
  ScoreIndex,
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

  const unique = new Set(allWords);
  return {
    turns: userTurns.length,
    totalWords: allWords.length,
    avgWords: userTurns.length ? allWords.length / userTurns.length : 0,
    uniqueRatio: allWords.length ? unique.size / allWords.length : 0,
    slangCount,
    questionCount,
  };
}

function buildIndices(stats: UserStats, durationSec: number): ScoreIndex[] {
  // Vibe — engagement & warmth: rewarded by turns taken and questions asked back.
  const vibe = clamp(
    52 + stats.turns * 5 + stats.questionCount * 6 - (stats.turns < 2 ? 20 : 0)
  );

  // Fluency — flow & range: average sentence length + vocabulary variety.
  const fluency = clamp(
    45 + Math.min(stats.avgWords, 14) * 2.2 + stats.uniqueRatio * 40
  );

  // Slang — casual, natural register: directly from slang markers used.
  const slang = clamp(40 + stats.slangCount * 9);

  // Stamina — how much of the 3 minutes was actually used conversing.
  const stamina = clamp(35 + (durationSec / 180) * 55 + stats.turns * 2);

  return [
    {
      key: "vibe",
      label: "Vibe",
      value: vibe,
      blurb:
        vibe >= 75
          ? "Warm and engaged — you kept the energy flowing."
          : "Decent rapport. Try bouncing more questions back.",
    },
    {
      key: "fluency",
      label: "Fluency",
      value: fluency,
      blurb:
        fluency >= 75
          ? "Smooth delivery with good range of words."
          : "Reasonable flow. Vary your phrasing to sound more natural.",
    },
    {
      key: "slang",
      label: "Slang",
      value: slang,
      blurb:
        slang >= 70
          ? "Nicely casual — you sound like a native in a café."
          : "A touch formal. Sprinkle in some everyday slang.",
    },
    {
      key: "stamina",
      label: "Stamina",
      value: stamina,
      blurb:
        stamina >= 75
          ? "You carried the conversation the whole way."
          : "Good start — push to keep talking a bit longer.",
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
  const indices = buildIndices(stats, durationSec);
  const finalScore = clamp(
    indices.reduce((sum, i) => sum + i.value, 0) / indices.length
  );
  const { grade: g, emoji } = grade(finalScore);

  return {
    id: makeId(),
    date: new Date().toISOString(),
    topic: topicId,
    topicLabel: labelOverride?.trim() || topic.label,
    durationSec,
    indices,
    finalScore,
    grade: g,
    vibeEmoji: emoji,
    suggestions: buildSuggestions(stats),
    dialog,
  };
}

