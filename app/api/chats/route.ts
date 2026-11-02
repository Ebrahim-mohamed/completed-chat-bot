import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { CHATS_ENDPOINT } from "@/lib/backendConfig";
import { callHistoryBackend } from "@/lib/historyProxy";

export const dynamic = "force-dynamic";

// GET /api/chats?limit=&cursor=&audience=  -> the user's chat list.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const incoming = req.nextUrl.searchParams;
  const params = new URLSearchParams();

  for (const key of ["limit", "cursor", "audience"]) {
    const value = incoming.get(key);
    if (value) params.set(key, value);
  }

  const query = params.toString();
  const url = query ? `${CHATS_ENDPOINT}?${query}` : CHATS_ENDPOINT;

  return callHistoryBackend(url, session, { method: "GET" });
}