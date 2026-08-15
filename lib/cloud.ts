import type { SavedItem, SessionResult, UserProfile } from "../types";
import { supabase } from "./supabase";

/**
 * Cloud (Supabase) data layer.
 *
 * This module only talks to Supabase — it maps between the app's domain types
 * and the Postgres rows, and exposes push/pull/delete helpers plus a
 * login-time sync. It never touches AsyncStorage; the local cache is owned by
 * `lib/storage.ts` and orchestrated by `AppDataContext`.
 *
 * Tables (see the SQL schema): `profiles`, `sessions`, `saved_items`, all
 * guarded by Row Level Security so `auth.uid()` only ever sees its own rows.
 * Both `sessions` and `saved_items` keep their rich nested fields in a single
 * `data` jsonb column, so each row is a superset of its queryable columns and
 * the full domain object.
 */

// ----- Row <-> domain mapping ----------------------------------------------

interface SessionRow {
  id: string;
  user_id: string;
  date: string;
  topic: string;
  topic_label: string;
  duration_sec: number;
  final_score: number;
  grade: string;
  vibe_emoji: string;
  data: SessionResult;
}

interface ProfileRow {
  id: string;
  name: string;
  handle: string;
  goal: string;
  native_language: string;
  target_language: string;
  joined_date: string;
  updated_at: string;
}

interface SavedItemRow {
  id: string;
  user_id: string;
  type: SavedItem["type"];
  created_date: string;
  data: SavedItem;
}

function sessionToRow(userId: string, s: SessionResult): SessionRow {
  return {
    id: s.id,
    user_id: userId,
    date: s.date,
    topic: s.topic,
    topic_label: s.topicLabel,
    duration_sec: s.durationSec,
    final_score: s.finalScore,
    grade: s.grade,
    vibe_emoji: s.vibeEmoji,
    data: s,
  };
}

function profileToRow(userId: string, p: UserProfile): ProfileRow {
  return {
    id: userId,
    name: p.name,
    handle: p.handle,
    goal: p.goal,
    native_language: p.nativeLanguage,
    target_language: p.targetLanguage,
    joined_date: p.joinedDate,
    updated_at: new Date().toISOString(),
  };
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    name: row.name,
    handle: row.handle,
    goal: row.goal,
    nativeLanguage: row.native_language,
    targetLanguage: row.target_language,
    joinedDate: row.joined_date,
  };
}

function savedItemToRow(userId: string, item: SavedItem): SavedItemRow {
  return {
    id: item.id,
    user_id: userId,
    type: item.type,
    created_date: item.createdDate,
    data: item,
  };
}

// ----- Single-record writes (fire-and-forget write-through) -----------------

export async function pushSession(userId: string, s: SessionResult): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .upsert(sessionToRow(userId, s));
  if (error) throw error;
}

export async function pushProfile(userId: string, p: UserProfile): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert(profileToRow(userId, p));
  if (error) throw error;
}

export async function pushSavedItem(userId: string, item: SavedItem): Promise<void> {
  const { error } = await supabase
    .from("saved_items")
    .upsert(savedItemToRow(userId, item));
  if (error) throw error;
}

export async function deleteSessionRemote(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSavedItemRemote(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("saved_items")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

// ----- Login-time sync ------------------------------------------------------

export interface MergedData {
  sessions: SessionResult[];
  profile: UserProfile | null;
  savedItems: SavedItem[];
}

/** Union two id-keyed lists, preferring `a`'s copy on collisions. */
function unionById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of b) seen.set(item.id, item);
  for (const item of a) seen.set(item.id, item);
  return [...seen.values()];
}

/**
 * Reconcile local state with Supabase on login.
 *
 * - Sessions & saved items are unioned by id in both directions: anything the
 *   device has that the cloud doesn't gets pushed up, and vice-versa.
 * - Profile: the cloud copy wins if one exists (kept fresh by write-through on
 *   every edit); otherwise the local profile is pushed up as the first copy.
 *
 * Returns the merged data for the caller to write into the local cache. Remote
 * writes for local-only records happen here.
 */
export async function syncOnLogin(
  userId: string,
  local: { sessions: SessionResult[]; profile: UserProfile; savedItems: SavedItem[] }
): Promise<MergedData> {
  const [sessionsRes, profileRes, savedRes] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", userId),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("saved_items").select("*").eq("user_id", userId),
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (profileRes.error) throw profileRes.error;
  if (savedRes.error) throw savedRes.error;

  const remoteSessions = (sessionsRes.data as SessionRow[]).map((r) => r.data);
  const remoteSavedItems = (savedRes.data as SavedItemRow[]).map((r) => r.data);
  const remoteProfile = profileRes.data
    ? rowToProfile(profileRes.data as ProfileRow)
    : null;

  // Merge (local wins on id collisions — device is the fresher editor of a row).
  const mergedSessions = unionById(local.sessions, remoteSessions);
  const mergedSavedItems = unionById(local.savedItems, remoteSavedItems);

  // Push records the cloud is missing.
  const remoteSessionIds = new Set(remoteSessions.map((s) => s.id));
  const remoteSavedIds = new Set(remoteSavedItems.map((i) => i.id));
  const sessionsToPush = local.sessions.filter((s) => !remoteSessionIds.has(s.id));
  const savedToPush = local.savedItems.filter((i) => !remoteSavedIds.has(i.id));

  const writes: PromiseLike<unknown>[] = [];
  if (sessionsToPush.length > 0) {
    writes.push(
      supabase
        .from("sessions")
        .upsert(sessionsToPush.map((s) => sessionToRow(userId, s)))
    );
  }
  if (savedToPush.length > 0) {
    writes.push(
      supabase
        .from("saved_items")
        .upsert(savedToPush.map((i) => savedItemToRow(userId, i)))
    );
  }

  const profile = remoteProfile ?? local.profile;
  if (!remoteProfile) {
    writes.push(supabase.from("profiles").upsert(profileToRow(userId, local.profile)));
  }

  await Promise.all(writes);

  return { sessions: mergedSessions, profile, savedItems: mergedSavedItems };
}
