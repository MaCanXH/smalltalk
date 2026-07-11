import Vapi from "@vapi-ai/react-native";
import type { NewsTopic } from "../../types";

import { getBackendBaseUrl } from "../backend";
import { getFunctionsAuthHeaders } from "../supabase";

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
  /** Underlying Daily call object (used for the local mic-level meter). */
  getDailyCallObject(): unknown;
}

/**
 * Per-call session config issued by the backend Edge Function. The persona,
 * prompt composition, and Vapi credentials live server-side
 * (`supabase/functions/api/vapiSession.ts`). `token` is a short-lived
 * public-scope Vapi JWT minted per call for the signed-in user — the app
 * never holds a long-lived Vapi credential.
 */
export interface VapiSession {
  token: string;
  assistantId: string;
  overrides: Record<string, unknown>;
}

export function createVapiClient(token: string): VapiClient {
  return new Vapi(token) as unknown as VapiClient;
}

/**
 * Ask the backend for this call's Vapi config. With a `topicLabel` the server
 * steers the AI toward that headline (system prompt + an opening line);
 * without one it composes a generic open small-talk partner.
 */
export async function fetchVapiSession(
  topicLabel?: string,
  newsContext?: NewsTopic
): Promise<VapiSession> {
  const baseUrl = getBackendBaseUrl();

  if (!baseUrl) {
    throw new Error(
      "Missing backend configuration. Set EXPO_PUBLIC_SUPABASE_URL, then restart Expo."
    );
  }

  const response = await fetch(`${baseUrl}/api/vapi/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getFunctionsAuthHeaders()),
    },
    body: JSON.stringify({ topicLabel, newsContext }),
  });

  if (!response.ok) {
    // Surface the server's own message (e.g. the daily-limit or sign-in
    // errors) when it sent one; fall back to a generic status line.
    const message = await response
      .json()
      .then((body: { error?: unknown }) =>
        typeof body?.error === "string" && body.error.trim() ? body.error : null
      )
      .catch(() => null);
    throw new Error(
      message ?? `The voice session could not be prepared (status ${response.status}).`
    );
  }

  const json = (await response.json()) as Partial<VapiSession>;

  if (
    typeof json.token !== "string" ||
    !json.token ||
    typeof json.assistantId !== "string" ||
    !json.assistantId ||
    typeof json.overrides !== "object" ||
    json.overrides === null
  ) {
    throw new Error("The voice session endpoint returned invalid data.");
  }

  return {
    token: json.token,
    assistantId: json.assistantId,
    overrides: json.overrides,
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
