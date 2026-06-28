import type { TopicId } from "../../types";

/**
 * Topic catalog + scoring word-banks. The live AI conversation runs through
 * Vapi, so there's no scripted dialogue here: topics seed the Vapi assistant
 * overrides and label results, while the word-banks below feed the
 * deterministic scoring/coaching in `scoring.ts`.
 */

export interface Topic {
  id: TopicId;
  label: string;
  emoji: string;
}

export const TOPICS: Topic[] = [
  { id: "weekend", label: "Weekend Plans", emoji: "🌤️" },
  { id: "work", label: "Work & Studies", emoji: "💼" },
  { id: "travel", label: "Travel", emoji: "✈️" },
  { id: "food", label: "Food & Coffee", emoji: "🍜" },
  { id: "hobbies", label: "Hobbies", emoji: "🎧" },
  { id: "movies", label: "Shows & Movies", emoji: "🎬" },
];

export function getTopic(id: TopicId): Topic {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[0];
}

/** Natural "stalling" phrases — also surfaced as coaching suggestions. */
export const STALL_PHRASES: string[] = [
  "Hmm, let me think…",
  "You know what,",
  "Well, I guess…",
  "Honestly,",
  "I mean,",
  "Oh, that reminds me —",
  "Right, so,",
  "To be fair,",
  "How do I put this…",
  "Funny you should ask,",
];

/** Richer word choices the coach nudges the user toward. */
export const WORD_UPGRADES: { plain: string; nicer: string }[] = [
  { plain: "good", nicer: "solid / lovely / spot-on" },
  { plain: "bad", nicer: "rough / underwhelming / a bit off" },
  { plain: "nice", nicer: "delightful / refreshing / charming" },
  { plain: "very tired", nicer: "wiped out / running on empty" },
  { plain: "happy", nicer: "chuffed / over the moon / buzzing" },
  { plain: "boring", nicer: "a bit of a slog / not my thing" },
  { plain: "a lot", nicer: "heaps / loads / a fair bit" },
];

/** Casual slang the scorer rewards when the user reaches for it. */
export const SLANG_MARKERS: string[] = [
  "honestly",
  "literally",
  "kinda",
  "gonna",
  "wanna",
  "no cap",
  "lowkey",
  "vibe",
  "hooked",
  "chill",
  "ages",
  "heaps",
  "spot-on",
  "wing it",
];
