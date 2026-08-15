import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SavedItem, SessionResult, UserProfile } from "../types";
import {
  deleteSavedItemRemote,
  deleteSessionRemote,
  pushProfile,
  pushSavedItem,
  pushSession,
  syncOnLogin,
} from "../lib/cloud";
import {
  DEFAULT_PROFILE,
  deleteSavedItem as deleteSavedItemStore,
  deleteSession as deleteSessionStore,
  getProfile,
  listSavedItems,
  listSessions,
  replaceSavedItems,
  replaceSessions,
  saveSavedItem as saveSavedItemStore,
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
  savedItems: SavedItem[];
  ready: boolean;
  addSession: (session: SessionResult) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  addSavedItem: (item: SavedItem) => Promise<void>;
  removeSavedItem: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | undefined>(undefined);

const sortByDate = (items: SessionResult[]) =>
  [...items].sort((a, b) => b.date.localeCompare(a.date));

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [ready, setReady] = useState(false);

  // Latest user id available to write-through callbacks without re-creating them.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const refresh = useCallback(async () => {
    const [s, p, items] = await Promise.all([
      listSessions(),
      getProfile(),
      listSavedItems(),
    ]);
    setSessions(s);
    setProfile(p);
    setSavedItems(items);
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
        const [localSessions, localProfile, localSavedItems] = await Promise.all([
          listSessions(),
          getProfile(),
          listSavedItems(),
        ]);
        const merged = await syncOnLogin(userId, {
          sessions: localSessions,
          profile: localProfile,
          savedItems: localSavedItems,
        });
        if (cancelled) return;

        const nextSessions = sortByDate(merged.sessions);
        await Promise.all([
          replaceSessions(nextSessions),
          replaceSavedItems(merged.savedItems),
          merged.profile ? saveProfile(merged.profile) : Promise.resolve(),
        ]);
        setSessions(nextSessions);
        setSavedItems(merged.savedItems);
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

  const addSavedItem = useCallback(async (item: SavedItem) => {
    await saveSavedItemStore(item);
    setSavedItems(await listSavedItems());
    const uid = userIdRef.current;
    if (uid) pushSavedItem(uid, item).catch(() => {});
  }, []);

  const removeSavedItem = useCallback(async (id: string) => {
    await deleteSavedItemStore(id);
    setSavedItems((prev) => prev.filter((i) => i.id !== id));
    const uid = userIdRef.current;
    if (uid) deleteSavedItemRemote(uid, id).catch(() => {});
  }, []);

  const value = useMemo<AppDataValue>(
    () => ({
      sessions,
      profile,
      savedItems,
      ready,
      addSession,
      removeSession,
      updateProfile,
      addSavedItem,
      removeSavedItem,
      refresh,
    }),
    [
      sessions,
      profile,
      savedItems,
      ready,
      addSession,
      removeSession,
      updateProfile,
      addSavedItem,
      removeSavedItem,
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
