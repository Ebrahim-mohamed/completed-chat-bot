import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { listAgents, createAgent } from "@/lib/auth/users";
import type { SessionPayload } from "@/lib/auth/types";

// Letters (any language), digits, dot, underscore and hyphen.
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;
const MAX_USERNAME_LENGTH = 64;

async function requireIt(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || session.role !== "it") return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireIt(req);
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const agents = listAgents().map((a) => ({
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    client_id: a.client_id,
  }));

  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const session = await requireIt(req);
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: {
    username?: string;
    password?: string;
    displayName?: string;
    client_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { username, password, displayName, client_id } = body;

  if (!username || !password || !displayName || !client_id) {
    return NextResponse.json(
      { error: "username, password, displayName and client_id are required." },
      { status: 400 }
    );
  }

  const cleanUsername = username.trim();

  if (
    cleanUsername.length < 1 ||
    cleanUsername.length > MAX_USERNAME_LENGTH ||
    !USERNAME_PATTERN.test(cleanUsername)
  ) {
    return NextResponse.json(
      {
        error:
          "Username may only contain letters, numbers, dots (.), underscores (_) and hyphens (-), up to 64 characters.",
      },
      { status: 400 }
    );
  }

  try {
    const agent = createAgent(cleanUsername, password, displayName, client_id);
    return NextResponse.json({
      agent: {
        id: agent.id,
        username: agent.username,
        displayName: agent.displayName,
        client_id: agent.client_id,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create agent." },
      { status: 400 }
    );
  }
}