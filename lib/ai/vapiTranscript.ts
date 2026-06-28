import type { Speaker } from "../../types";

export interface NormalizedDialogTurn {
  speaker: Speaker;
  text: string;
  /** Seconds from the start of the call. */
  t: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : null;
}

function mapRole(value: unknown): Speaker | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "user":
      return "user";
    case "assistant":
    case "bot":
    case "ai":
      return "ai";
    default:
      return null;
  }
}

/**
 * Resolve a turn's offset in seconds-from-call-start. Vapi `messages` entries
 * carry `secondsFromStart`; when only an absolute `time` (epoch ms) is present
 * we measure it relative to the first timestamped entry (`baseTimeMs`) so the
 * offsets stay correct regardless of clock source. Anything else inherits the
 * previous offset to keep the timeline monotonic.
 */
function resolveTurnOffset(
  entry: UnknownRecord,
  baseTimeMs: number | null,
  previous: number
): number {
  const secondsFromStart = entry.secondsFromStart;
  if (typeof secondsFromStart === "number" && Number.isFinite(secondsFromStart)) {
    return Math.max(0, secondsFromStart);
  }

  const time = entry.time;
  if (
    typeof time === "number" &&
    Number.isFinite(time) &&
    baseTimeMs !== null
  ) {
    return Math.max(0, (time - baseTimeMs) / 1000);
  }

  return previous;
}

/**
 * Rebuild the full, de-duplicated dialog from a Vapi `conversation-update`
 * message. The message carries the entire conversation so far, so callers
 * should replace (not append to) their transcript with this result — that
 * mirrors what the Vapi dashboard shows and structurally cannot duplicate.
 *
 * Prefers the timestamped `messages` array (Vapi format, text in `message`)
 * and falls back to the OpenAI-formatted `conversation` array (text in
 * `content`) when the former is unavailable.
 */
export function normalizeVapiConversation(
  message: unknown
): NormalizedDialogTurn[] | null {
  if (!isRecord(message) || message.type !== "conversation-update") {
    return null;
  }

  const entries = Array.isArray(message.messages)
    ? message.messages
    : Array.isArray(message.conversation)
      ? message.conversation
      : null;

  if (!entries) {
    return null;
  }

  let baseTimeMs: number | null = null;
  for (const entry of entries) {
    if (isRecord(entry) && typeof entry.time === "number" && Number.isFinite(entry.time)) {
      baseTimeMs = entry.time;
      break;
    }
  }

  const turns: NormalizedDialogTurn[] = [];
  let lastOffset = 0;
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }
    const speaker = mapRole(entry.role);
    const text = cleanText(entry.message ?? entry.content ?? entry.transcript);
    if (!speaker || !text) {
      continue;
    }
    const t = resolveTurnOffset(entry, baseTimeMs, lastOffset);
    lastOffset = t;
    turns.push({ speaker, text, t });
  }

  return turns;
}

export function isVapiEndedMessage(message: unknown): boolean {
  return (
    isRecord(message) &&
    message.type === "status-update" &&
    message.status === "ended"
  );
}
