import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { VOICE_ENDPOINT, ADMIN_API_KEY } from "@/lib/backendConfig";
import type { VoiceResponseBody } from "@/lib/types";

export const runtime = "nodejs";
// ASR + LLM pipeline is synchronous and can take a while.
export const maxDuration = 180;

const MAX_AUDIO_BYTES = 16 * 1024 * 1024; // 16 MiB
const BACKEND_TIMEOUT_MS = 170000;
const VALID_BRAND_FILTERS = ["technoscan", "cairoscan", "all"];
const VALID_AUDIENCES = ["agent", "patient"];

interface BackendVoiceResponse {
  client_id?: string;
  session_id: string;
  reply: string;
  messages: string[];
  intent?: string;
  mode?: string;
  voice_note_id?: string;
  voice_status: "answered" | "failed";
  failure_reason: string | null;
  transcript: string | null;
  raw_transcript?: string | null;
  asr?: Record<string, unknown>;
  debug_json?: Record<string, unknown> | null;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid multipart/form-data." },
      { status: 400 }
    );
  }

  const sessionId = form.get("session_id");
  const userIdRaw = form.get("user_id");
  const audio = form.get("audio");
  const brandFilter = form.get("brand_filter");
  const audienceRaw = form.get("audience");

  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json(
      { error: "'session_id' is required and must be a string." },
      { status: 400 }
    );
  }

  if (
    !userIdRaw ||
    typeof userIdRaw !== "string" ||
    !Number.isInteger(Number(userIdRaw))
  ) {
    return NextResponse.json(
      { error: "'user_id' is required and must be a number." },
      { status: 400 }
    );
  }

  const userId = Number(userIdRaw);

  // The browser sends user_id, but it must match the logged-in session so one
  // user can't act as another.
  if (userId !== session.user_id) {
    return NextResponse.json(
      { error: "'user_id' does not match the logged-in user." },
      { status: 403 }
    );
  }

  // audience defaults to "agent" when it is not sent.
  if (
    audienceRaw !== null &&
    (typeof audienceRaw !== "string" || !VALID_AUDIENCES.includes(audienceRaw))
  ) {
    return NextResponse.json(
      { error: "'audience' must be agent or patient." },
      { status: 400 }
    );
  }
  const audience = audienceRaw ?? "agent";

  if (!audio || typeof audio === "string") {
    return NextResponse.json(
      { error: "'audio' is required and must be a file." },
      { status: 400 }
    );
  }

  if (audio.size === 0) {
    return NextResponse.json(
      { error: "The recorded audio is empty." },
      { status: 400 }
    );
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Voice note is too large (max 16 MB)." },
      { status: 413 }
    );
  }

  if (
    brandFilter !== null &&
    (typeof brandFilter !== "string" ||
      !VALID_BRAND_FILTERS.includes(brandFilter))
  ) {
    return NextResponse.json(
      { error: "'brand_filter' must be technoscan, cairoscan or all." },
      { status: 400 }
    );
  }

  // The backend requires a filename with an extension.
  const filename =
    audio.name && /\.[a-z0-9]+$/i.test(audio.name) ? audio.name : "voice.webm";

  const forwarded = new FormData();
  forwarded.append("session_id", sessionId);
  forwarded.append("user_id", String(userId));
  forwarded.append("audience", audience);
  // client_id comes from the verified session, never from the browser.
  forwarded.append("client_id", session.client_id);
  forwarded.append("audio", audio, filename);
  if (brandFilter) {
    forwarded.append("brand_filter", brandFilter);
  }

  try {
    // Do NOT set Content-Type here — fetch sets it with the multipart boundary.
    const res = await fetch(VOICE_ENDPOINT, {
      method: "POST",
      headers: {
        "x-admin-api-key": ADMIN_API_KEY,
      },
      body: forwarded,
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[/api/voice] backend returned ${res.status}: ${text}`);

      if (res.status === 403) {
        return NextResponse.json(
          { error: "This chat belongs to another user." },
          { status: 403 }
        );
      }
      if (res.status === 409) {
        return NextResponse.json(
          { error: "This chat was deleted; start a new one." },
          { status: 409 }
        );
      }
      if (res.status === 413) {
        return NextResponse.json(
          { error: "Voice note is too large (max 16 MB)." },
          { status: 413 }
        );
      }
      if (res.status === 422) {
        return NextResponse.json(
          { error: "The voice request was rejected as invalid." },
          { status: 422 }
        );
      }
      if (res.status === 503) {
        return NextResponse.json(
          { error: "The voice service is currently disabled." },
          { status: 503 }
        );
      }
      if (res.status === 400) {
        return NextResponse.json(
          { error: "The recorded audio is empty." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "Failed to reach the voice backend." },
        { status: 502 }
      );
    }

    const data: BackendVoiceResponse = await res.json();

    const responseBody: VoiceResponseBody = {
      session_id: data.session_id,
      reply: data.reply,
      messages: Array.isArray(data.messages) ? data.messages : [],
      transcript: data.transcript ?? null,
      voice_status: data.voice_status,
      failure_reason: data.failure_reason ?? null,
      intent: data.intent,
      mode: data.mode,
      voice_note_id: data.voice_note_id,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (err) {
    console.error("[/api/voice] backend call failed:", err);
    return NextResponse.json(
      { error: "Failed to reach the voice backend." },
      { status: 502 }
    );
  }
}