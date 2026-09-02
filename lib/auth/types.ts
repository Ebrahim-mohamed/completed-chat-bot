export type UserRole = "admin" | "it" | "agent";

export interface AppUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  client_id: string;
  displayName: string;
}

export interface SessionPayload {
  sub: string;
  username: string;
  role: UserRole;
  client_id: string;
  name: string;
}
