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

export interface NewsQuote {
  /** Short exact quote, phrase, or social post text from the sources. */
  quote: string;
  /** Person, organization, account, or outlet that said or posted it. */
  speaker?: string;
  /** Why this quote matters in the story. */
  context?: string;
  /** Source name or URL when available. */
  source?: string;
}

export interface NewsVocabularyItem {
  term: string;
  meaning: string;
  example?: string;
}

export interface NewsTopic {
  id: string;
  /** Clean AI-generated title shown on the home screen. */
  short: string;
  /** One-sentence description of the current-events topic. */
  full: string;
  /** Beginner-friendly context for the conversation. */
  brief: string;
  /** Concrete facts/context extracted from news snippets for Vapi to use. */
  details?: string[];
  /** Memorable short quotes/posts from supplied news text. */
  keyQuotes?: NewsQuote[];
  /** What happened first/next, useful for explaining the story simply. */
  timeline?: string[];
  /** Main drama, debate, backlash, or funny hook people may discuss. */
  controversy?: string;
  /** Vocabulary items generated from the news context. */
  vocabulary?: NewsVocabularyItem[];
  /** Cultural/social clues a language learner may miss. */
  culturalClues?: string[];
  /** Human follow-up angles for a casual conversation. */
  conversationAngles?: string[];
  /** Why this story is relevant to everyday conversation. */
  whyItMatters?: string;
  /** Topic vocabulary, news terms, or casual phrases worth explaining. */
  keyTerms?: string[];
  /** Guidance for keeping the topic safe, light, and socially natural. */
  safeFraming?: string;
  /** Small-talk angles Vapi can use during the voice session. */
  talkingPoints: string[];
  source?: string;
  /** Primary source URL. */
  url?: string;
  /** Up to a few source URLs used to create this topic pack. */
  sourceUrls?: string[];
  publishedAt?: string;
}

/** A user-defined practice scenario: what to work on, who the AI plays, and the setting. */
export interface SceneContext {
  goal: string;
  role: string;
  scene: string;
  /**
   * The AI partner's personality/tone. Optional — when the user doesn't
   * describe one, it defaults to friendly and supportive (applied by the
   * scene composer and, as a safety net, server-side).
   */
  personality?: string;
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

/**
 * The composed Vapi assistant content a session actually ran with —
 * captured from the per-call overrides so the exact same conversation can be
 * re-practiced later. Unlike `sceneContext`/`newsContext` (the *inputs*), this
 * is the resolved prompt, so replaying it needs no re-composition (no Groq).
 */
export interface AssistantSetup {
  /** The full system prompt the assistant was started with. */
  systemPrompt: string;
  /** The assistant's opening line, when the call specified one. */
  firstMessage?: string;
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
  /** User-defined scenario (goal/role/scene) used to steer Vapi for this session. */
  sceneContext?: SceneContext;
  /**
   * The composed assistant prompt this session ran with, captured from the
   * per-call overrides. Enables "re-practice" — relaunching the exact same
   * conversation without re-composing it. Absent on sessions recorded before
   * this was captured.
   */
  assistantSetup?: AssistantSetup;
  /**
   * Groups re-practice attempts of the same scenario under one Library card.
   * A fresh session leaves this unset (it is its own group, keyed by `id`); a
   * re-practice attempt carries the originating group's key.
   */
  groupId?: string;
  /**
   * Vapi's id for this call — joins the session to the server-side
   * `call_reports` row written by the end-of-call webhook.
   */
  vapiCallId?: string;
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

/**
 * A user-bookmarked item shown under Library → Saved. Two kinds share one
 * collection, discriminated by `type`:
 * - `phrase`: a vocabulary item bookmarked from a session's feedback.
 * - `suggestion`: an AI coaching moment bookmarked from a transcript; it keeps
 *   `sourceSessionId` so tapping it can deep-link back to that feedback.
 */
export type SavedItem =
  | {
      id: string;
      type: "phrase";
      createdDate: string;
      /** Session this vocab item was bookmarked from, when known. */
      sourceSessionId?: string;
      data: VocabularyItem;
    }
  | {
      id: string;
      type: "suggestion";
      createdDate: string;
      /** Session whose feedback this suggestion links back to. */
      sourceSessionId: string;
      data: FeedbackMoment;
    };

export interface AppSettings {
  accent: string;
  theme: "light" | "dark";
  hapticsEnabled: boolean;
}
