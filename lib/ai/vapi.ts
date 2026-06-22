import Vapi from "@vapi-ai/react-native";

import type { Topic } from "./banks";

export interface VapiConfig {
  publicKey: string;
  assistantId: string;
}

export interface VapiClient {
  on(event: "call-start", listener: () => void): VapiClient;
  on(event: "call-end", listener: () => void): VapiClient;
  on(event: "speech-start", listener: () => void): VapiClient;
  on(event: "speech-end", listener: () => void): VapiClient;
  on(event: "volume-level", listener: (volume: number) => void): VapiClient;
  on(event: "message", listener: (message: unknown) => void): VapiClient;
  on(event: "error", listener: (error: unknown) => void): VapiClient;
  removeAllListeners(): VapiClient;
  start(
    assistantId: string,
    overrides?: Record<string, unknown>,
  ): Promise<unknown>;
  stop(): void;
}

export function readVapiConfig(): VapiConfig | null {
  const publicKey = process.env.EXPO_PUBLIC_VAPI_PUBLIC_KEY?.trim();
  const assistantId = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID?.trim();

  if (!publicKey || !assistantId) return null;

  return { publicKey, assistantId };
}

export function createVapiClient(publicKey: string): VapiClient {
  return new Vapi(publicKey) as unknown as VapiClient;
}

export function buildAssistantOverrides(topic: Topic): Record<string, unknown> {
  return {
    maxDurationSeconds: 180,
    clientMessages: [
      "status-update",
      "speech-update",
      "transcript",
      "conversation-update",
    ],
    variableValues: {
      topicId: topic.id,
      topicLabel: topic.label,
    },
  };
}

export function summarizeVapiError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const message = error.message.trim();
    if (message) return message;
  }

  return "The Vapi call could not be started. Check your network, microphone permissions, and Vapi configuration.";
}
