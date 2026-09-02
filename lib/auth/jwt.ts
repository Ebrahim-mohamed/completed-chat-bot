import { SignJWT, jwtVerify } from "jose";
import type { SessionPayload } from "./types";

// Hardcoded on purpose — no env vars.
const JWT_SECRET = new TextEncoder().encode(
  "raylab-chat-app-super-secret-jwt-key-2026"
);
const JWT_ALG = "HS256";
const JWT_EXPIRES_IN = "8h";

export const SESSION_COOKIE_NAME = "session_token";

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
