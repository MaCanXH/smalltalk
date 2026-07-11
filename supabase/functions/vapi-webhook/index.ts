import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Vapi server-webhook receiver — a separate function from `api` because Vapi
 * cannot send a Supabase JWT, so this one runs with `verify_jwt = false`
 * (see supabase/config.toml) and authenticates with a shared secret instead:
 * `/api/vapi/session` puts `VAPI_WEBHOOK_SECRET` into the per-call
 * `server.headers` as `x-webhook-secret`, Vapi echoes it on every webhook
 * request, and anything without it is rejected.
 *
 * Only `end-of-call-report` messages are stored — Vapi's canonical record of
 * the call (full transcript, summary, cost, ended reason) — upserted by call
 * id into `call_reports` (service-role only) so retries are idempotent. The
 * report survives even if the app died mid-call and never saved a session.
 * The owning user comes from the `metadata.userId` the session route stamped
 * on the call's assistant overrides.
 */

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const secret = Deno.env.get("VAPI_WEBHOOK_SECRET")?.trim();
  if (!secret) {
    console.error("VAPI_WEBHOOK_SECRET is not set; rejecting webhook");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const provided = req.headers.get("x-webhook-secret");
  if (provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => null);
  const message = body?.message;

  if (!message || message.type !== "end-of-call-report") {
    // Acknowledge everything else so Vapi doesn't retry chatter.
    return Response.json({ received: true });
  }

  const call = message.call ?? {};
  const callId = firstString(call.id, message.callId);
  if (!callId) {
    console.warn("end-of-call-report without a call id; ignoring");
    return Response.json({ received: true, stored: false });
  }

  const metadata =
    call.assistantOverrides?.metadata ?? call.metadata ?? message.metadata ?? {};
  const userId = firstString(metadata.userId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase service credentials missing; cannot store report");
    return Response.json({ error: "Storage unavailable" }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from("call_reports").upsert(
    {
      call_id: callId,
      user_id: userId,
      ended_reason: firstString(message.endedReason),
      duration_sec: firstNumber(message.durationSeconds, message.durationMs != null ? message.durationMs / 1000 : null),
      cost: firstNumber(message.cost),
      summary: firstString(message.summary, message.analysis?.summary),
      transcript: firstString(message.transcript, message.artifact?.transcript),
      report: message,
    },
    { onConflict: "call_id" },
  );

  if (error) {
    // 500 makes Vapi retry later (e.g. before the table has been created).
    console.error("call_reports upsert failed:", error.message);
    return Response.json({ error: "Storage failed" }, { status: 500 });
  }

  console.log(`Stored end-of-call report for call ${callId}`);
  return Response.json({ received: true, stored: true });
});
