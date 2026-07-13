import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  AppSettings,
  SavedPhrase,
  SessionResult,
  UserProfile,
} from "../types";
import { DEFAULT_ACCENT } from "../styles/global";

/**
 * Reusable local-storage wrapper.
 *
 * Everything the app persists goes through this file. The generic JSON helpers
 * (`readJSON` / `writeJSON`) sit at the bottom; the typed domain helpers above
 * are what screens and contexts actually call. No backend, no network — purely
 * AsyncStorage on the device.
 */

const KEYS = {
  sessions: "@smalltalk/sessions",
  profile: "@smalltalk/profile",
  settings: "@smalltalk/settings",
  phrases: "@smalltalk/phrases",
} as const;

// ----- Generic JSON layer ---------------------------------------------------

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ----- Defaults -------------------------------------------------------------

export const DEFAULT_PROFILE: UserProfile = {
  name: "New Speaker",
  handle: "@smalltalker",
  goal: "Sound natural in everyday conversations",
  nativeLanguage: "Cantonese",
  targetLanguage: "English",
  joinedDate: new Date().toISOString(),
};

export const DEFAULT_SETTINGS: AppSettings = {
  accent: DEFAULT_ACCENT,
  theme: "light",
  hapticsEnabled: true,
};

// ----- Sessions (training results) -----------------------------------------

export async function listSessions(): Promise<SessionResult[]> {
  const items = await readJSON<SessionResult[]>(KEYS.sessions, []);
  // Newest first.
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getSession(id: string): Promise<SessionResult | null> {
  const items = await readJSON<SessionResult[]>(KEYS.sessions, []);
  return items.find((s) => s.id === id) ?? null;
}

export async function saveSession(session: SessionResult): Promise<void> {
  const items = await readJSON<SessionResult[]>(KEYS.sessions, []);
  const next = items.filter((s) => s.id !== session.id);
  next.push(session);
  await writeJSON(KEYS.sessions, next);
}

export async function deleteSession(id: string): Promise<void> {
  const items = await readJSON<SessionResult[]>(KEYS.sessions, []);
  await writeJSON(
    KEYS.sessions,
    items.filter((s) => s.id !== id)
  );
}

/** Overwrite the whole session list — used when reconciling with the cloud. */
export async function replaceSessions(sessions: SessionResult[]): Promise<void> {
  await writeJSON(KEYS.sessions, sessions);
}

// ----- Profile --------------------------------------------------------------

export async function getProfile(): Promise<UserProfile> {
  return readJSON<UserProfile>(KEYS.profile, DEFAULT_PROFILE);
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await writeJSON(KEYS.profile, profile);
}

// ----- Settings -------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const stored = await readJSON<Partial<AppSettings>>(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeJSON(KEYS.settings, settings);
}

// ----- Saved phrases --------------------------------------------------------

export async function listPhrases(): Promise<SavedPhrase[]> {
  const items = await readJSON<SavedPhrase[]>(KEYS.phrases, []);
  return [...items].sort((a, b) => b.createdDate.localeCompare(a.createdDate));
}

export async function savePhrase(phrase: SavedPhrase): Promise<void> {
  const items = await readJSON<SavedPhrase[]>(KEYS.phrases, []);
  if (items.some((p) => p.text === phrase.text && p.kind === phrase.kind)) {
    return; // de-dupe identical phrases
  }
  items.push(phrase);
  await writeJSON(KEYS.phrases, items);
}

export async function deletePhrase(id: string): Promise<void> {
  const items = await readJSON<SavedPhrase[]>(KEYS.phrases, []);
  await writeJSON(
    KEYS.phrases,
    items.filter((p) => p.id !== id)
  );
}

/** Overwrite the whole phrase list — used when reconciling with the cloud. */
export async function replacePhrases(phrases: SavedPhrase[]): Promise<void> {
  await writeJSON(KEYS.phrases, phrases);
}
