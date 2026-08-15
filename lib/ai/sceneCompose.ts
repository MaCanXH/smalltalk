import type { SceneContext } from "../../types";
import { getBackendBaseUrl } from "../backend";
import { composeSceneFromText } from "../scenarios";
import { getFunctionsAuthHeaders } from "../supabase";

/**
 * Turns a freeform scene description (typed, or transcribed from voice) into
 * a structured `{ goal, role, scene }` via the backend's Groq-powered
 * composer. Falls back to the local template (`composeSceneFromText`) if the
 * backend is unavailable or the call fails — the Scene tab should never get
 * stuck because of a flaky network call.
 */
export async function composeSceneFromDescription(text: string): Promise<SceneContext> {
  const trimmed = text.trim();
  const baseUrl = getBackendBaseUrl();

  if (!baseUrl) return composeSceneFromText(trimmed);

  try {
    const response = await fetch(`${baseUrl}/api/scene/compose`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getFunctionsAuthHeaders()),
      },
      body: JSON.stringify({ description: trimmed }),
    });

    if (!response.ok) {
      throw new Error(`Scene composition failed (status ${response.status}).`);
    }

    const json = await response.json();
    if (
      typeof json.goal !== "string" ||
      typeof json.role !== "string" ||
      typeof json.scene !== "string"
    ) {
      throw new Error("Scene composition endpoint returned invalid data.");
    }

    return {
      goal: json.goal,
      role: json.role,
      scene: json.scene,
      personality:
        typeof json.personality === "string" && json.personality.trim()
          ? json.personality.trim()
          : "Friendly and supportive.",
    };
  } catch (error) {
    console.warn("Scene composition failed. Falling back to local template.", error);
    return composeSceneFromText(trimmed);
  }
}
