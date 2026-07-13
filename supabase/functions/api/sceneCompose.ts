import { requireUser } from "./auth.ts";
import { groq } from "./groq.ts";

/**
 * POST /api/scene/compose — turns the learner's freeform scene description
 * (typed, or transcribed from voice) into a structured practice scene via
 * Groq: { goal, role, scene }. Used by the Scene tab so both the "tap and
 * just say it" and typed paths get a real, tailored scenario instead of a
 * fixed template.
 */
export async function handleSceneCompose(req: Request): Promise<Response> {
  try {
    const user = await requireUser(req);
    if (!user) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    if (!description) {
      return Response.json({ error: "Missing description." }, { status: 400 });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You turn a language learner's short, freeform description of a conversation scenario into a structured practice scene for a role-playing AI voice partner. Return only valid JSON.

Given the learner's description, infer:
- "goal": one short sentence — what the learner should practice or achieve in this conversation.
- "role": one short sentence describing who the AI should play (the other person in the scene), written so it can be dropped directly into an AI's system prompt (e.g. "A friendly regular waiting in the same line.").
- "scene": one short sentence setting the scene/context (where, when, what's happening), grounded in the learner's own words.

Rules:
- Keep every field under 25 words.
- Base goal/role/scene on what the learner actually said — do not invent unrelated details.
- If the description is vague, make a reasonable, low-stakes assumption.
- Write in plain, natural English.`,
        },
        {
          role: "user",
          content: `Learner's description: "${description}"

Return ONLY this JSON shape:
{
  "goal": "...",
  "role": "...",
  "scene": "..."
}`,
        },
      ],
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw ?? "{}");

    const goal = typeof parsed.goal === "string" ? parsed.goal.trim() : "";
    const role = typeof parsed.role === "string" ? parsed.role.trim() : "";
    const scene = typeof parsed.scene === "string" ? parsed.scene.trim() : "";

    if (!goal || !role || !scene) {
      throw new Error("Incomplete scene composition.");
    }

    return Response.json({ goal, role, scene });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Scene composition failed" }, { status: 500 });
  }
}
