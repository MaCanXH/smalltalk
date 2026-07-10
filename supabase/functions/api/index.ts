import { handleFeedback } from "./feedback.ts";
import { handleHotTopics } from "./hotTopics.ts";
import { handleVapiSession } from "./vapiSession.ts";

/**
 * Small Talk backend, ported from server.mjs. Deployed as a single Edge
 * Function named `api` so both routes live under
 * `/functions/v1/api/...` — the app derives the hot-topics URL from
 * EXPO_PUBLIC_FEEDBACK_API_URL by stripping `/api/feedback`, and this layout
 * keeps that derivation working unchanged.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { pathname } = new URL(req.url);

  if (req.method === "GET" && pathname.endsWith("/hot-topics")) {
    return withCors(await handleHotTopics(req));
  }

  if (req.method === "POST" && pathname.endsWith("/feedback")) {
    return withCors(await handleFeedback(req));
  }

  if (req.method === "POST" && pathname.endsWith("/vapi/session")) {
    return withCors(await handleVapiSession(req));
  }

  return withCors(Response.json({ error: "Not found" }, { status: 404 }));
});
