import { requireUser } from "./auth.ts";
import { groq } from "./groq.ts";

/**
 * POST /api/scene/transcribe — multipart body with an "audio" file field.
 * Transcribes a short scene-description recording via Groq's hosted Whisper
 * model and returns plain text. Used by the Scene tab's "tap and just say it"
 * flow; the client never talks to Groq directly.
 */
export async function handleTranscribe(req: Request): Promise<Response> {
  try {
    const user = await requireUser(req);
    if (!user) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }

    const formData = await req.formData().catch(() => null);
    const file = formData?.get("audio");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing audio file." }, { status: 400 });
    }

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
    });

    return Response.json({ text: (transcription.text ?? "").trim() });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
