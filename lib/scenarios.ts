import type { SceneContext } from "../types";

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
  },
  {
    id: "conference",
    emoji: "🏢",
    label: "Conference",
    goal: "Introduce yourself confidently and start a useful professional connection.",
    role: "A fellow attendee between sessions, open to chatting.",
    scene: "A busy conference hallway during a coffee break between talks.",
  },
  {
    id: "date",
    emoji: "❤️",
    label: "Date",
    goal: "Keep the conversation natural and get to know the other person.",
    role: "Your date, meeting for coffee for the first time.",
    scene: "A quiet coffee shop, early evening. You've just sat down together.",
  },
  {
    id: "interview",
    emoji: "💼",
    label: "Interview",
    goal: "Answer clearly and show your experience with confidence.",
    role: "A hiring manager conducting a first-round interview.",
    scene: "A video call interview for a role you applied to recently.",
  },
  {
    id: "networking",
    emoji: "🤝",
    label: "Networking",
    goal: "Meet a few new people and exchange contact info naturally.",
    role: "Another guest at a professional networking mixer.",
    scene: "An evening networking event with drinks and standing tables.",
  },
];

/** Shown as "Continue last scene" before the user has practiced a real one. */
export const DEFAULT_LAST_SCENE: SceneContext = {
  goal: "Keep the conversation natural and see where it goes.",
  role: "A friendly conversation partner catching up with you.",
  scene: "A casual chat about weekend plans.",
};

/** Local template for a freeform scene description — no LLM call for v1. */
export function composeSceneFromText(text: string): SceneContext {
  return {
    goal: "Feel confident and natural in this situation.",
    role: "A conversation partner suited to what you described.",
    scene: text.trim(),
  };
}

/** First ~6 words of the scene text, used as the short session label. */
export function shortenSceneLabel(scene: string): string {
  const trimmed = scene.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= 6) return trimmed;
  return `${words.slice(0, 6).join(" ")}…`;
}
