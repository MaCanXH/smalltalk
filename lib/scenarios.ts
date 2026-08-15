import type { SceneContext } from "../types";
import { getBackendBaseUrl } from "./backend";
import { getFunctionsAuthHeaders } from "./supabase";

/**
 * Preset practice scenarios for the Scene tab. Unlike the news-topic catalog
 * in `lib/ai/banks.ts`, these seed a full `SceneContext` (goal/role/scene),
 * not just a headline — they're picked client-side, no backend round trip.
 */

export interface ScenarioPreset extends SceneContext {
  id: string;
  emoji: string;
  label: string;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "party",
    emoji: "🎉",
    label: "Party",
    goal: "Make a great first impression and keep the energy light and fun.",
    role: "A friendly guest you've just met at the party.",
    scene:
      "A casual house party, music playing in the background. You've just walked up to introduce yourself.",
    personality: "Outgoing, playful, and high-energy.",
  },
  {
    id: "conference",
    emoji: "🏢",
    label: "Conference",
    goal: "Introduce yourself confidently and start a useful professional connection.",
    role: "A fellow attendee between sessions, open to chatting.",
    scene: "A busy conference hallway during a coffee break between talks.",
    personality: "Sharp, curious, and personable.",
  },
  {
    id: "date",
    emoji: "❤️",
    label: "Date",
    goal: "Keep the conversation natural and get to know the other person.",
    role: "Your date, meeting for coffee for the first time.",
    scene: "A quiet coffee shop, early evening. You've just sat down together.",
    personality: "Warm, a little shy, and genuinely interested.",
  },
  {
    id: "interview",
    emoji: "💼",
    label: "Interview",
    goal: "Answer clearly and show your experience with confidence.",
    role: "A hiring manager conducting a first-round interview.",
    scene: "A video call interview for a role you applied to recently.",
    personality: "Professional, measured, and fair.",
  },
  {
    id: "networking",
    emoji: "🤝",
    label: "Networking",
    goal: "Meet a few new people and exchange contact info naturally.",
    role: "Another guest at a professional networking mixer.",
    scene: "An evening networking event with drinks and standing tables.",
    personality: "Polished, friendly, and easy to talk to.",
  },
];

/** Shown as "Continue last scene" before the user has practiced a real one. */
export const DEFAULT_LAST_SCENE: SceneContext = {
  goal: "Keep the conversation natural and see where it goes.",
  role: "A friendly conversation partner catching up with you.",
  scene: "A casual chat about weekend plans.",
  personality: "Friendly and supportive.",
};

/**
 * A random default scene to start a session with. Either a backend preset
 * (referenced by `slug` — the session is built server-side from its
 * pre-authored prompt, which never ships to the client) or, as an offline
 * fallback, a full local `SceneContext` (which goes through the live Groq
 * prompt path instead). `title` is the header/Library label either way.
 */
export type DefaultScene =
  | { kind: "preset"; slug: string; title: string }
  | { kind: "scene"; scene: SceneContext; title: string };

/**
 * Router params for `/session/active` from a `DefaultScene` — a preset is
 * started by slug (prompt resolved server-side), a fallback by its full
 * `sceneContext`. Shared by Quick Talk, the Talk tab's no-topic start, and the
 * "Last scene" fallback.
 */
export function sceneStartParams(scene: DefaultScene): Record<string, string> {
  return scene.kind === "preset"
    ? { title: scene.title, presetSlug: scene.slug }
    : { title: scene.title, sceneContext: JSON.stringify(scene.scene) };
}

/** Offline fallback — a random local Quick-Scene preset as a full context. */
function randomLocalScene(): DefaultScene {
  const preset = SCENARIO_PRESETS[Math.floor(Math.random() * SCENARIO_PRESETS.length)];
  return {
    kind: "scene",
    scene: { goal: preset.goal, role: preset.role, scene: preset.scene },
    title: shortenSceneLabel(preset.scene),
  };
}

/**
 * Fetches a random default scene from the backend's `scene_presets` pool
 * (GET /api/scene/default). Used by Quick Talk, the Talk tab's no-topic start,
 * and the "Last scene" fallback. Falls back to a random local preset if the
 * backend is unconfigured or the call fails — starting a session must never
 * get stuck on a flaky network call.
 */
export async function fetchDefaultScene(): Promise<DefaultScene> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return randomLocalScene();

  try {
    const response = await fetch(`${baseUrl}/api/scene/default`, {
      headers: await getFunctionsAuthHeaders(),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);

    const json = await response.json();
    if (typeof json.slug !== "string" || typeof json.scene !== "string") {
      throw new Error("invalid default-scene payload");
    }

    return {
      kind: "preset",
      slug: json.slug,
      title: typeof json.label === "string" && json.label.trim()
        ? json.label.trim()
        : shortenSceneLabel(json.scene),
    };
  } catch (error) {
    console.warn("Default-scene fetch failed. Using a local preset.", error);
    return randomLocalScene();
  }
}

/** Local template for a freeform scene description — the offline fallback. */
export function composeSceneFromText(text: string): SceneContext {
  return {
    goal: "Feel confident and natural in this situation.",
    role: "A conversation partner suited to what you described.",
    scene: text.trim(),
    personality: "Friendly and supportive.",
  };
}

/** First ~6 words of the scene text, used as the short session label. */
export function shortenSceneLabel(scene: string): string {
  const trimmed = scene.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= 6) return trimmed;
  return `${words.slice(0, 6).join(" ")}…`;
}
