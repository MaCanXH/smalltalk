import { createClient } from "npm:@supabase/supabase-js@2";

import { requireUser } from "./auth.ts";

/**
 * GET /api/scene/default — returns one random active preset from
 * `scene_presets`, used by the Scene tab's Quick Talk, the Talk tab's
 * no-topic start, and the "Last scene" fallback. The table is service-role
 * only (clients never read it directly), so the pick happens here. It's a
 * small table, so we fetch active rows and choose one in JS rather than
 * leaning on a Postgres random-order function.
 *
 * Returns `{ slug, label, emoji, scene }` — the display fields only. The
 * client threads `slug` back to /api/vapi/session, which looks up the
 * pre-authored `prompt` + `first_message` by slug (the prompt never ships to
 * the client) and uses `scene`/`label` for the session header and Library. On
 * any failure
 * (table missing, no rows, misconfigured) it returns 503 so the client can
 * fall back to its bundled offline pool — a broken preset table must never
 * block starting a session.
 */
export async function handleSceneDefault(req: Request): Promise<Response> {
  try {
    const user = await requireUser(req);
    if (!user) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json({ error: "Scene presets unavailable." }, { status: 503 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin
      .from("scene_presets")
      .select("slug, label, emoji, scene")
      .eq("active", true);

    if (error || !data || data.length === 0) {
      if (error) console.error("scene_presets fetch failed:", error.message);
      return Response.json({ error: "Scene presets unavailable." }, { status: 503 });
    }

    const pick = data[Math.floor(Math.random() * data.length)];
    return Response.json(pick);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Scene presets unavailable." }, { status: 503 });
  }
}
