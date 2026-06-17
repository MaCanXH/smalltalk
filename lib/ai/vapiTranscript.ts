import type { Speaker } from "../../types";

export interface NormalizedTranscriptTurn {
  speaker: Speaker;
  text: string;
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

function cleanKeyPart(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).trim();
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

function normalizeTranscriptMessage(
  message: UnknownRecord
): NormalizedTranscriptTurn | null {
  const isTranscript =
    message.type === "transcript" ||
    message.type === "transcript[transcriptType='final']";

  if (!isTranscript) {
    return null;
  }

  if (
    "transcriptType" in message &&
    message.transcriptType !== undefined &&
    message.transcriptType !== "final"
  ) {
    return null;
  }

  const speaker = mapRole(message.role);
  const text = cleanText(message.transcript);

  if (!speaker || !text) {
    return null;
  }

  return { speaker, text };
}

function normalizeConversationUpdate(
  message: UnknownRecord
): NormalizedTranscriptTurn | null {
  if (
    message.type !== "conversation-update" ||
    !Array.isArray(message.conversation)
  ) {
    return null;
  }

  const entry = message.conversation[message.conversation.length - 1];
  if (!isRecord(entry)) {
    return null;
  }

  const speaker = mapRole(entry.role);
  const text = cleanText(entry.content ?? entry.message ?? entry.transcript);

  if (!speaker || !text) {
    return null;
  }

  return { speaker, text };
}

export function normalizeVapiTranscriptMessage(
  message: unknown
): NormalizedTranscriptTurn | null {
  if (!isRecord(message)) {
    return null;
  }

  return (
    normalizeTranscriptMessage(message) ?? normalizeConversationUpdate(message)
  );
}

export function isVapiEndedMessage(message: unknown): boolean {
  return (
    isRecord(message) &&
    message.type === "status-update" &&
    message.status === "ended"
  );
}

export function getTranscriptKey(turn: NormalizedTranscriptTurn): string {
  return `${turn.speaker}:${turn.text.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export function getVapiTranscriptIdentityKey(
  message: unknown,
  turn: NormalizedTranscriptTurn
): string | null {
  if (!isRecord(message)) {
    return null;
  }

  const source =
    message.type === "conversation-update" &&
    Array.isArray(message.conversation) &&
    isRecord(message.conversation[message.conversation.length - 1])
      ? message.conversation[message.conversation.length - 1]
      : message;

  const identity =
    cleanKeyPart(source.id) ??
    cleanKeyPart(source.messageId) ??
    cleanKeyPart(source.transcriptId) ??
    cleanKeyPart(source.timestamp) ??
    cleanKeyPart(source.createdAt) ??
    cleanKeyPart(source.time);

  if (!identity) {
    return null;
  }

  return `${getTranscriptKey(turn)}:${identity}`;
}
