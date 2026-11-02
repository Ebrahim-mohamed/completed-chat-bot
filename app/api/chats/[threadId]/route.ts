import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { CHATS_ENDPOINT } from "@/lib/backendConfig";
import { callHistoryBackend } from "@/lib/historyProxy";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { threadId: string };
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? await verifySession(token) : null;
}

function threadUrl(threadId: string): string {
  return `${CHATS_ENDPOINT}/${encodeURIComponent(threadId)}`;
}

// GET /api/chats/{threadId}?limit=&before=  -> open a chat.
export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await getSession(req);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const incoming = req.nextUrl.searchParams;
  const query = new URLSearchParams();

  for (const key of ["limit", "before"]) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }

  const qs = query.toString();
  const url = qs ? `${threadUrl(params.threadId)}?${qs}` : threadUrl(params.threadId);

  return callHistoryBackend(url, session, { method: "GET" });
}

// PATCH /api/chats/{threadId}  { title }  -> rename a chat.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await getSession(req);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { title?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body.title !== "string") {
    return NextResponse.json(
      { error: "'title' is required and must be a string." },
      { status: 400 }
    );
  }

  return callHistoryBackend(threadUrl(params.threadId), session, {
    method: "PATCH",
    body: { title: body.title },
  });
}

// DELETE /api/chats/{threadId}  -> soft-delete a chat (204, empty body).
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await getSession(req);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return callHistoryBackend(threadUrl(params.threadId), session, {
    method: "DELETE",
  });
}