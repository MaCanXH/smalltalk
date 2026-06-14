import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { SavedPhrase, SessionResult, UserProfile } from "../types";
import {
  DEFAULT_PROFILE,
  deletePhrase as deletePhraseStore,
  deleteSession as deleteSessionStore,
  getProfile,
  listPhrases,
  listSessions,
  savePhrase as savePhraseStore,
  saveProfile,
  saveSession,
} from "../lib/storage";

/**
 * Hydrates persisted app data (sessions, profile, saved phrases) once on mount
 * and exposes CRUD actions that keep both storage and in-memory state in sync.
 */

interface AppDataValue {
  sessions: SessionResult[];
  profile: UserProfile;
  phrases: SavedPhrase[];
  ready: boolean;
  addSession: (session: SessionResult) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  addPhrase: (phrase: SavedPhrase) => Promise<void>;
  removePhrase: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [phrases, setPhrases] = useState<SavedPhrase[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [s, p, ph] = await Promise.all([
      listSessions(),
      getProfile(),
      listPhrases(),
    ]);
    setSessions(s);
    setProfile(p);
    setPhrases(ph);
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const addSession = useCallback(async (session: SessionResult) => {
    await saveSession(session);
    setSessions((prev) =>
      [session, ...prev.filter((s) => s.id !== session.id)].sort((a, b) =>
        b.date.localeCompare(a.date)
      )
    );
  }, []);

  const removeSession = useCallback(async (id: string) => {
    await deleteSessionStore(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateProfile = useCallback(async (next: UserProfile) => {
    await saveProfile(next);
    setProfile(next);
  }, []);

  const addPhrase = useCallback(async (phrase: SavedPhrase) => {
    await savePhraseStore(phrase);
    setPhrases(await listPhrases());
  }, []);

  const removePhrase = useCallback(async (id: string) => {
    await deletePhraseStore(id);
    setPhrases((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const value = useMemo<AppDataValue>(
    () => ({
      sessions,
      profile,
      phrases,
      ready,
      addSession,
      removeSession,
      updateProfile,
      addPhrase,
      removePhrase,
      refresh,
    }),
    [
      sessions,
      profile,
      phrases,
      ready,
      addSession,
      removeSession,
      updateProfile,
      addPhrase,
      removePhrase,
      refresh,
    ]
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within an AppDataProvider");
  return ctx;
}
