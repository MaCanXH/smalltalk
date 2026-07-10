import Groq from "npm:groq-sdk@1.3.0";

/**
 * GROQ_API_KEY is a Supabase secret (`supabase secrets set GROQ_API_KEY=...`)
 * — server-side only, never shipped to the client, same discipline as the old
 * server.mjs + dotenv setup.
 */
export const groq = new Groq({
  apiKey: Deno.env.get("GROQ_API_KEY"),
});
