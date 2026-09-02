import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { CHAT_ENDPOINT, ADMIN_API_KEY } from "@/lib/backendConfig";
import type { ChatRequestBody, ChatResponseBody } from "@/lib/types";

interface BackendChatResponse {
  client_id?: string;
  session_id: string;
  reply: string;
  intent?: string;
  mode?: string;
  debug_json?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: Partial<ChatRequestBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { message, session_id, brand_filter } = body;

  if (!message || typeof message !== "string") {
    return NextResponse.json(
      { error: "'message' is required and must be a string." },
      { status: 400 }
    );
  }

  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json(
      { error: "'session_id' is required and must be a string." },
      { status: 400 }
    );
  }

  // "both" means no filter — omit the field entirely in that case.
  const forwardedBrandFilter =
    brand_filter && brand_filter !== "both" ? brand_filter : undefined;

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Api-Key": ADMIN_API_KEY,
      },
      body: JSON.stringify({
        session_id,
        message,
        // client_id comes from the verified session, never trusted from the
        // browser, so it can't be spoofed by editing the request body.
        client_id: session.client_id,
        ...(forwardedBrandFilter ? { brand_filter: forwardedBrandFilter } : {}),
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[/api/chat] backend returned ${res.status}: ${text}`);
      return NextResponse.json(
        { error: "Failed to reach the chat backend." },
        { status: 502 }
      );
    }

    const data: BackendChatResponse = await res.json();

    const responseBody: ChatResponseBody = {
      answer: data.reply,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (err) {
    console.error("[/api/chat] backend call failed:", err);
    return NextResponse.json(
      { error: "Failed to reach the chat backend." },
      { status: 502 }
    );
  }
}
