import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SavedPhrase, SessionResult, UserProfile } from "../types";
import {
  deletePhraseRemote,
  deleteSessionRemote,
  pushPhrase,
  pushProfile,
  pushSession,
  syncOnLogin,
} from "../lib/cloud";
import {
  DEFAULT_PROFILE,
  deletePhrase as deletePhraseStore,
  deleteSession as deleteSessionStore,
  getProfile,
  listPhrases,
  listSessions,
  replacePhrases,
  replaceSessions,
  savePhrase as savePhraseStore,
  saveProfile,
  saveSession,
} from "../lib/storage";
import { useAuth } from "./AuthContext";

/**
 * Hydrates persisted app data (sessions, profile, saved phrases) once on mount
 * and exposes CRUD actions that keep both storage and in-memory state in sync.
 *
 * Local-first with cloud sync: AsyncStorage is the fast path the UI reads from.
 * When a user is signed in, mutations also write through to Supabase, and on
 * login the two stores are reconciled once. Signed out (or Supabase
 * unconfigured), everything works exactly as before — purely on-device.
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

const sortByDate = (items: SessionResult[]) =>
  [...items].sort((a, b) => b.date.localeCompare(a.date));

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [phrases, setPhrases] = useState<SavedPhrase[]>([]);
  const [ready, setReady] = useState(false);

  // Latest user id available to write-through callbacks without re-creating them.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

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

  // Reconcile local <-> cloud once per login.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;
    (async () => {
      try {
        const [localSessions, localProfile, localPhrases] = await Promise.all([
          listSessions(),
          getProfile(),
          listPhrases(),
        ]);
        const merged = await syncOnLogin(userId, {
          sessions: localSessions,
          profile: localProfile,
          phrases: localPhrases,
        });
        if (cancelled) return;

        const nextSessions = sortByDate(merged.sessions);
        await Promise.all([
          replaceSessions(nextSessions),
          replacePhrases(merged.phrases),
          merged.profile ? saveProfile(merged.profile) : Promise.resolve(),
        ]);
        setSessions(nextSessions);
        setPhrases(merged.phrases);
        if (merged.profile) setProfile(merged.profile);
      } catch {
        // Offline or transient error — keep the local cache; retry next login.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const addSession = useCallback(async (session: SessionResult) => {
    await saveSession(session);
    setSessions((prev) =>
      sortByDate([session, ...prev.filter((s) => s.id !== session.id)])
    );
    const uid = userIdRef.current;
    if (uid) pushSession(uid, session).catch(() => {});
  }, []);

  const removeSession = useCallback(async (id: string) => {
    await deleteSessionStore(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    const uid = userIdRef.current;
    if (uid) deleteSessionRemote(uid, id).catch(() => {});
  }, []);

  const updateProfile = useCallback(async (next: UserProfile) => {
    await saveProfile(next);
    setProfile(next);
    const uid = userIdRef.current;
    if (uid) pushProfile(uid, next).catch(() => {});
  }, []);

  const addPhrase = useCallback(async (phrase: SavedPhrase) => {
    await savePhraseStore(phrase);
    setPhrases(await listPhrases());
    const uid = userIdRef.current;
    if (uid) pushPhrase(uid, phrase).catch(() => {});
  }, []);

  const removePhrase = useCallback(async (id: string) => {
    await deletePhraseStore(id);
    setPhrases((prev) => prev.filter((p) => p.id !== id));
    const uid = userIdRef.current;
    if (uid) deletePhraseRemote(uid, id).catch(() => {});
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
