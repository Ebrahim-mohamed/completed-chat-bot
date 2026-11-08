import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import {
  ADMIN_API_KEY,
  ANALYTICS_USER_HISTORY_ENDPOINT,
} from "@/lib/backendConfig";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 30000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

// GET /api/reports/user-history?user_id=&limit=&session_id=&date_from=&date_to=&before=
// IT only. The admin API key is added here, on the server.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session || session.role !== "it") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const incoming = req.nextUrl.searchParams;
  const params = new URLSearchParams();

  const userId = incoming.get("user_id")?.trim() ?? "";
  if (!userId || userId.length > 128) {
    return NextResponse.json(
      { error: "'user_id' is required (max 128 characters)." },
      { status: 400 }
    );
  }
  params.set("user_id", userId);

  const limitRaw = incoming.get("limit");
  if (limitRaw) {
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return NextResponse.json(
        { error: "'limit' must be a number from 1 to 500." },
        { status: 400 }
      );
    }
    params.set("limit", String(limit));
  }

  const sessionId = incoming.get("session_id");
  if (sessionId) {
    if (!UUID_PATTERN.test(sessionId)) {
      return NextResponse.json(
        { error: "'session_id' must be a UUID." },
        { status: 400 }
      );
    }
    params.set("session_id", sessionId);
  }

  for (const key of ["date_from", "date_to", "before"]) {
    const value = incoming.get(key);
    if (!value) continue;

    if (!isValidDate(value)) {
      return NextResponse.json(
        { error: `'${key}' must be a valid ISO 8601 date.` },
        { status: 400 }
      );
    }
    params.set(key, value);
  }

  const url = `${ANALYTICS_USER_HISTORY_ENDPOINT}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Admin-Api-Key": ADMIN_API_KEY,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, { status: 200 });
    }

    const text = await res.text().catch(() => "");
    console.error(
      `[/api/reports/user-history] backend returned ${res.status}: ${text}`
    );

    if (res.status === 404) {
      return NextResponse.json(
        { error: "No chat history for this user." },
        { status: 404 }
      );
    }

    if (res.status === 422) {
      return NextResponse.json({ error: "Invalid request." }, { status: 422 });
    }

    return NextResponse.json(
      { error: "Failed to load the user history." },
      { status: 502 }
    );
  } catch (err) {
    console.error("[/api/reports/user-history] backend call failed:", err);
    return NextResponse.json(
      { error: "Failed to reach the analytics backend." },
      { status: 502 }
    );
  }
}