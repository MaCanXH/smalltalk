import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  AppSettings,
  SavedItem,
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
  savedItems: "@smalltalk/saved_items",
  /** Legacy flat phrase list — read once to migrate into `savedItems`. */
  legacyPhrases: "@smalltalk/phrases",
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

// ----- Saved items (bookmarked vocab + suggestions) -------------------------

const sortSavedItems = (items: SavedItem[]): SavedItem[] =>
  [...items].sort((a, b) => b.createdDate.localeCompare(a.createdDate));

/** Fold a legacy flat phrase into the new saved-item shape. */
function legacyPhraseToSavedItem(p: SavedPhrase): SavedItem {
  return {
    id: p.id,
    type: "phrase",
    createdDate: p.createdDate,
    data: { term: p.text, quote: "", meaning: "", example: "", sayNextTime: "" },
  };
}

/**
 * Read the saved items, migrating the legacy `@smalltalk/phrases` list on first
 * access. The migration is one-shot: once `savedItems` exists, the legacy key
 * is never read again.
 */
export async function listSavedItems(): Promise<SavedItem[]> {
  const raw = await AsyncStorage.getItem(KEYS.savedItems);
  if (raw != null) {
    try {
      return sortSavedItems(JSON.parse(raw) as SavedItem[]);
    } catch {
      return [];
    }
  }

  const legacy = await readJSON<SavedPhrase[]>(KEYS.legacyPhrases, []);
  const migrated = legacy.map(legacyPhraseToSavedItem);
  await writeJSON(KEYS.savedItems, migrated);
  return sortSavedItems(migrated);
}

export async function saveSavedItem(item: SavedItem): Promise<void> {
  const items = await listSavedItems();
  const next = items.filter((i) => i.id !== item.id);
  next.push(item);
  await writeJSON(KEYS.savedItems, next);
}

export async function deleteSavedItem(id: string): Promise<void> {
  const items = await listSavedItems();
  await writeJSON(
    KEYS.savedItems,
    items.filter((i) => i.id !== id)
  );
}

/** Overwrite the whole saved-item list — used when reconciling with the cloud. */
export async function replaceSavedItems(items: SavedItem[]): Promise<void> {
  await writeJSON(KEYS.savedItems, items);
}
