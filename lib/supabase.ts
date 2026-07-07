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
