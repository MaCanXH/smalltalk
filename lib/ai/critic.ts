import type {
  DialogTurn,
  FeedbackHighlight,
  FeedbackMoment,
  SessionResult,
  Suggestions,
  TopicId,
} from "../../types";
import { getTopic } from "./banks";
import { buildResult } from "./scoring";

type AiFeedback = {
  suggestions?: Partial<Suggestions>;
  keywords?: string[];
  highlights?: FeedbackHighlight[];
  moments?: FeedbackMoment[];
};

function buildTranscript(dialog: DialogTurn[]): string {
  return dialog
    .map((turn, index) => {
      const speaker = turn.speaker === "user" ? "USER" : "AI PARTNER";
      return `[${index + 1}] ${speaker}: ${turn.text}`;
    })
    .join("\n");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function validateHighlights(value: unknown): FeedbackHighlight[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is FeedbackHighlight => {
      if (!item || typeof item !== "object") return false;
      const highlight = item as FeedbackHighlight;
      return typeof highlight.quote === "string" && typeof highlight.note === "string";
    })
    .slice(0, 2);
}

function validateMoments(value: unknown): FeedbackMoment[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is FeedbackMoment => {
      if (!item || typeof item !== "object") return false;

      const moment = item as FeedbackMoment;

      return (
        ["ai_phrase", "user_upgrade", "topic_opener"].includes(moment.type) &&
        typeof moment.title === "string" &&
        typeof moment.quote === "string" &&
        typeof moment.explanation === "string" &&
        typeof moment.suggestion === "string"
      );
    })
    .slice(0, 6);
}

function validateAiFeedback(data: unknown): AiFeedback | null {
  if (!data || typeof data !== "object") return null;

  const raw = data as {
    suggestions?: {
      words?: unknown;
      stalls?: unknown;
      tips?: unknown;
    };
    keywords?: unknown;
    highlights?: unknown;
    moments?: unknown;
  };

  return {
    suggestions: {
      words: asStringArray(raw.suggestions?.words).slice(0, 5),
      stalls: asStringArray(raw.suggestions?.stalls).slice(0, 5),
      tips: asStringArray(raw.suggestions?.tips).slice(0, 5),
    },
    keywords: asStringArray(raw.keywords).slice(0, 4),
    highlights: validateHighlights(raw.highlights),
    moments: validateMoments(raw.moments),
  };
}

function mergeSuggestions(local: Suggestions, ai?: Partial<Suggestions>): Suggestions {
  return {
    words: ai?.words && ai.words.length > 0 ? ai.words : local.words,
    stalls: ai?.stalls && ai.stalls.length > 0 ? ai.stalls : local.stalls,
    tips: ai?.tips && ai.tips.length > 0 ? ai.tips : local.tips,
  };
}

export async function buildAiResult(
  topicId: TopicId,
  dialog: DialogTurn[],
  durationSec: number,
  labelOverride?: string
): Promise<SessionResult> {
  const localResult = buildResult(topicId, dialog, durationSec, labelOverride);
  const feedbackApiUrl = process.env.EXPO_PUBLIC_FEEDBACK_API_URL;

  if (!feedbackApiUrl) {
    return localResult;
  }

  try {
    const topic = getTopic(topicId);
    const transcript = buildTranscript(dialog);

    const response = await fetch(feedbackApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicId,
        topicLabel: labelOverride ?? topic.label,
        durationSec,
        transcript,
        dialog,
        localResult,
      }),
    });

    if (!response.ok) {
      throw new Error(`Feedback API failed with status ${response.status}`);
    }

    const json = await response.json();
    const aiFeedback = validateAiFeedback(json);

    if (!aiFeedback) {
      throw new Error("Feedback API returned invalid data.");
    }

    return {
      ...localResult,
      suggestions: mergeSuggestions(localResult.suggestions, aiFeedback.suggestions),
      keywords:
        aiFeedback.keywords && aiFeedback.keywords.length > 0
          ? aiFeedback.keywords
          : localResult.keywords,
      highlights:
        aiFeedback.highlights && aiFeedback.highlights.length > 0
          ? aiFeedback.highlights
          : localResult.highlights,
      moments:
        aiFeedback.moments && aiFeedback.moments.length > 0
          ? aiFeedback.moments
          : localResult.moments,
    };
  } catch (error) {
    console.warn("AI feedback failed. Falling back to local scoring.", error);
    return localResult;
  }
}
