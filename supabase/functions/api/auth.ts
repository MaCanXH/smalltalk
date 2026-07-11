import { createClient } from "npm:@supabase/supabase-js@2";

interface AuthenticatedUser {
  id: string;
}

/**
 * Resolve the caller to a real signed-in user; the bare anon key yields null.
 * Every route requires this — sign-in is mandatory in the app, and the anon
 * key is extractable from the bundle, so an anon-accessible route (especially
 * one that spends Groq tokens) would be an open quota drain.
 */
export async function requireUser(req: Request): Promise<AuthenticatedUser | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authHeader) return null;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}
