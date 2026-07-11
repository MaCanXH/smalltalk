import type { Session, User } from "@supabase/supabase-js";
import * as AuthSession from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

/**
 * Authentication state for the app.
 *
 * Wraps Supabase auth with Expo's redirect flow:
 * - Google OAuth opens an in-app browser (`expo-web-browser`) and returns to
 *   the app via the `smalltalk://` deep link, from which we extract the tokens.
 * - Magic link sends an email whose link deep-links back into the app; a
 *   `Linking` listener turns that URL into a session.
 *
 * The Supabase session itself is persisted by the client (AsyncStorage), so on
 * relaunch the user stays signed in without any UI. Sign-in is required — the
 * backend attributes sessions (and enforces per-user limits) by identity.
 * When Supabase isn't configured, everything degrades to a signed-out,
 * on-device-only app.
 */

WebBrowser.maybeCompleteAuthSession();

const redirectTo = AuthSession.makeRedirectUri();

interface AuthValue {
  /** Current Supabase user, or null when signed out. */
  user: User | null;
  session: Session | null;
  /** False until the initial session lookup has resolved. */
  ready: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

/** Turn a deep-link URL carrying auth tokens into an active Supabase session. */
async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (error) throw error;
  return data.session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  // Hydrate the persisted session and subscribe to changes.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSessionReady(true);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setSessionReady(true));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Handle magic-link deep links that arrive while the app is open or cold-started.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const handleUrl = (url: string | null) => {
      if (url) createSessionFromUrl(url).catch(() => {});
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success") {
      await createSessionFromUrl(result.url);
    }
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      session,
      ready: sessionReady,
      configured: isSupabaseConfigured,
      signInWithGoogle,
      signInWithMagicLink,
      signOut,
    }),
    [session, sessionReady, signInWithGoogle, signInWithMagicLink, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
