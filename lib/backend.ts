/**
 * Base URL of the backend Edge Function, derived from the one backend env var
 * the app ships (`EXPO_PUBLIC_FEEDBACK_API_URL`, which points at the
 * `/api/feedback` route). All backend routes live under the same function, so
 * stripping the route suffix yields the base for `/api/hot-topics` and
 * `/api/vapi/session` too.
 *
 * Kept free of React Native imports so modules using it stay loadable by the
 * node test runner.
 */
export function getBackendBaseUrl(): string | null {
  const feedbackUrl = process.env.EXPO_PUBLIC_FEEDBACK_API_URL?.trim();
  if (!feedbackUrl) return null;

  return feedbackUrl.replace(/\/api\/feedback\/?$/, "").replace(/\/$/, "");
}
