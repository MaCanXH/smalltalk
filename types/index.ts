// Shared domain types for the Small Talk app.

export type Speaker = "user" | "ai";

export interface DialogTurn {
  speaker: Speaker;
  text: string;
  /** Seconds elapsed in the session when this turn happened. */
  t: number;
}

export type TopicId =
  | "weekend"
  | "work"
  | "travel"
  | "food"
  | "hobbies"
  | "movies";

export interface ScoreIndex {
  key: string;
  label: string;
  /** 0 - 100 */
  value: number;
  blurb: string;
}

export interface Suggestions {
  /** Richer word choices to reach for. */
  words: string[];
  /** "Stalling" phrases to buy thinking time naturally. */
  stalls: string[];
  /** General coaching tips for this session. */
  tips: string[];
}

export interface SessionResult {
  id: string;
  /** ISO timestamp. */
  date: string;
  topic: TopicId;
  topicLabel: string;
  durationSec: number;
  indices: ScoreIndex[];
  finalScore: number;
  grade: string;
  vibeEmoji: string;
  suggestions: Suggestions;
  dialog: DialogTurn[];
}

export interface UserProfile {
  name: string;
  handle: string;
  goal: string;
  nativeLanguage: string;
  targetLanguage: string;
  joinedDate: string;
}

export interface SavedPhrase {
  id: string;
  text: string;
  kind: "stall" | "word" | "opener";
  createdDate: string;
}

export interface AppSettings {
  accent: string;
  ttsRate: number;
  ttsPitch: number;
  hapticsEnabled: boolean;
}
