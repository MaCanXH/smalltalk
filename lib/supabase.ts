import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for the app.
 *
 * Reads the public project URL + anon key from `EXPO_PUBLIC_` env vars, so the
 * values reach the client bundle. The anon key is safe to ship — Row Level
 * Security on every table restricts each user to their own rows.
 *
 * Auth sessions persist through AsyncStorage (same store the rest of the app
 * uses) and auto-refresh in the background. `detectSessionInUrl` is off because
 * this is a native app, not a browser — the OAuth redirect is handled manually
 * in `AuthContext` via `expo-web-browser`.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both env vars are present — used to gate cloud features. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Auth headers for requests to this project's Edge Functions, which verify a
 * Supabase JWT before running. Signed-in users send their own access token;
 * skipped/offline users fall back to the anon key, which also passes the
 * platform check. Empty when Supabase isn't configured (e.g. the feedback URL
 * points at a local dev server instead).
 */
export async function getFunctionsAuthHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};

  let token = supabaseAnonKey ?? "";
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) token = data.session.access_token;
  } catch {
    // Session lookup failing shouldn't block the request; the anon key works.
  }

  if (!token) return {};

  return {
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey ?? "",
  };
}
