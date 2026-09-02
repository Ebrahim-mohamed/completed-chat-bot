import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByUsername } from "@/lib/auth/users";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 }
    );
  }

  const user = findUserByUsername(username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 }
    );
  }

  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: user.role,
    client_id: user.client_id,
    name: user.displayName,
  });

  const res = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      client_id: user.client_id,
      name: user.displayName,
    },
  });

  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true once served over HTTPS
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return res;
}
