import { NextResponse } from "next/server";
import { ADMIN_API_KEY } from "@/lib/backendConfig";
import type { SessionPayload } from "@/lib/auth/types";

const HISTORY_TIMEOUT_MS = 30000;

interface HistoryCallOptions {
  method: "GET" | "PATCH" | "DELETE";
  body?: unknown;
}

function extractMessage(detail: unknown, fallback: string): string {
  return typeof detail === "string" && detail ? detail : fallback;
}

// Calls the chat-history backend on behalf of the logged-in user.
// X-Admin-Api-Key and X-User-Id are added here, on the server only. The
// user id always comes from the verified session, never from the browser.
export async function callHistoryBackend(
  url: string,
  session: SessionPayload,
  options: HistoryCallOptions
): Promise<NextResponse> {
  if (
    typeof session.user_id !== "number" ||
    !Number.isInteger(session.user_id)
  ) {
    return NextResponse.json(
      { error: "Your session has no user id. Please log out and log in again." },
      { status: 401 }
    );
  }

  const headers: Record<string, string> = {
    "X-Admin-Api-Key": ADMIN_API_KEY,
    "X-User-Id": String(session.user_id),
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
    });

    // DELETE success: empty body, do not parse it as JSON.
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, { status: 200 });
    }

    const errBody = await res.json().catch(() => null);
    console.error(
      `[history] ${options.method} ${url} returned ${res.status}:`,
      JSON.stringify(errBody)
    );

    if (res.status === 400 || res.status === 404) {
      return NextResponse.json(
        {
          error: extractMessage(
            errBody?.detail,
            res.status === 404 ? "Chat not found" : "Bad request"
          ),
        },
        { status: res.status }
      );
    }

    if (res.status === 422) {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 422 }
      );
    }

    if (res.status === 401) {
      // Wrong admin API key: a configuration problem, not the user's fault.
      return NextResponse.json(
        { error: "Chat history is not configured correctly." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Something went wrong, try again." },
      { status: 502 }
    );
  } catch (err) {
    console.error(`[history] ${options.method} ${url} failed:`, err);
    return NextResponse.json(
      { error: "Failed to reach the chat history backend." },
      { status: 502 }
    );
  }
}