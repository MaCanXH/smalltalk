/**
 * Base URL of the backend Edge Function. The backend lives in the same
 * Supabase project as auth/sync, so it derives from
 * `EXPO_PUBLIC_SUPABASE_URL` (`<project>/functions/v1`); callers append
 * `/api/feedback`, `/api/hot-topics`, or `/api/vapi/session`.
 *
 * `EXPO_PUBLIC_FEEDBACK_API_URL` (the full feedback-route URL) is an optional
 * override for pointing at a non-default backend, e.g. a local
 * `supabase functions serve`.
 *
 * Kept free of React Native imports so modules using it stay loadable by the
 * node test runner.
 */
export function getBackendBaseUrl(): string | null {
  const override = process.env.EXPO_PUBLIC_FEEDBACK_API_URL?.trim();
  if (override) {
    return override.replace(/\/api\/feedback\/?$/, "").replace(/\/$/, "");
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;

  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
}
