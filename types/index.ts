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

export interface NewsTopic {
  id: string;
  /** Clean AI-generated title shown on the home screen. */
  short: string;
  /** One-sentence description of the current-events topic. */
  full: string;
  /** Beginner-friendly context for the conversation. */
  brief: string;
  /** Small-talk angles Vapi can use during the voice session. */
  talkingPoints: string[];
  source?: string;
  url?: string;
}

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

export interface FeedbackMoment {
  type: "ai_phrase" | "user_upgrade" | "topic_opener";
  title: string;
  quote: string;
  explanation: string;
  suggestion: string;
}

export interface FeedbackHighlight {
  quote: string;
  note: string;
}

export interface VocabularyItem {
  /** Word, phrase, slang, idiom, or news term worth learning. */
  term: string;
  /** Transcript line or topic context where this item came from. */
  quote: string;
  /** Beginner-friendly meaning. */
  meaning: string;
  /** Short example sentence using the term naturally. */
  example: string;
  /** One sentence the learner can reuse in small talk. */
  sayNextTime: string;
}

export interface CulturalClue {
  /** Cultural, social, or news-background point. */
  title: string;
  /** Transcript line or topic context where this clue came from. */
  quote: string;
  /** Beginner-friendly explanation. */
  explanation: string;
  /** Natural follow-up sentence the learner can try. */
  trySaying: string;
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
  /** Short topic keywords shown as chips on the result screen. */
  keywords?: string[];
  /** Two strong user lines from this conversation. */
  highlights?: FeedbackHighlight[];
  /** Topic-related words, phrases, slang, idioms, or news terms to learn. */
  vocabulary?: VocabularyItem[];
  /** Topic-related cultural, social, or current-events context. */
  culturalClues?: CulturalClue[];
  moments?: FeedbackMoment[];
  /** AI-generated summary of what this conversation was about. */
  conversationSummary?: string;
  /** Current-events topic used to steer Vapi for this session. */
  newsContext?: NewsTopic;
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
