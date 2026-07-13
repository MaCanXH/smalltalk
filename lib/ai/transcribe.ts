import { getBackendBaseUrl } from "../backend";
import { getFunctionsAuthHeaders } from "../supabase";

/**
 * Uploads a short local recording (from `expo-audio`) to the backend, which
 * transcribes it via Groq's hosted Whisper model. Used by the Scene tab's
 * "tap and just say it" flow — no on-device speech recognition, no extra
 * native dependency.
 */
export async function transcribeAudio(uri: string): Promise<string> {
  const baseUrl = getBackendBaseUrl();

  if (!baseUrl) {
    throw new Error(
      "Missing backend configuration. Set EXPO_PUBLIC_SUPABASE_URL, then restart Expo."
    );
  }

  const formData = new FormData();
  formData.append("audio", {
    uri,
    name: "scene.m4a",
    type: "audio/m4a",
  } as unknown as Blob);

  const response = await fetch(`${baseUrl}/api/scene/transcribe`, {
    method: "POST",
    headers: await getFunctionsAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const message = await response
      .json()
      .then((body: { error?: unknown }) =>
        typeof body?.error === "string" && body.error.trim() ? body.error : null
      )
      .catch(() => null);
    throw new Error(message ?? `Transcription failed (status ${response.status}).`);
  }

  const json = await response.json();
  if (typeof json.text !== "string") {
    throw new Error("Transcription endpoint returned invalid data.");
  }

  return json.text;
}
