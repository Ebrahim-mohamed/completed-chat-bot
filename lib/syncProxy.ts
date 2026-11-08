import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { ADMIN_API_KEY } from "@/lib/backendConfig";

const SYNC_TIMEOUT_MS = 30000;

// Statuses the sync API uses on purpose; they are passed to the browser as is.
const PASS_THROUGH_STATUSES = [200, 202, 404, 409];

function fail(message: string, status: number): NextResponse {
  // "detail" matches the backend's error shape, "error" matches our other routes.
  return NextResponse.json({ error: message, detail: message }, { status });
}

// Calls the Raylab sync API for an admin. The admin API key is added here, on
// the server only. Only the "admin" role may use it.
export async function callSyncBackend(
  req: NextRequest,
  url: string,
  method: "GET" | "POST"
): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    return fail("Not authenticated.", 401);
  }

  if (session.role !== "admin") {
    return fail("Forbidden.", 403);
  }

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "X-Admin-Api-Key": ADMIN_API_KEY,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    });

    const body = await res.json().catch(() => null);

    if (PASS_THROUGH_STATUSES.includes(res.status) && body !== null) {
      return NextResponse.json(body, { status: res.status });
    }

    console.error(
      `[sync] ${method} ${url} returned ${res.status}:`,
      JSON.stringify(body)
    );

    if (res.status === 401) {
      // Wrong admin API key: a configuration problem, not the user's fault.
      return fail("The sync service is not configured correctly.", 502);
    }

    return fail("The sync service returned an unexpected error.", 502);
  } catch (err) {
    console.error(`[sync] ${method} ${url} failed:`, err);
    return fail("Failed to reach the sync service.", 502);
  }
}