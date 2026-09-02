import bcrypt from "bcryptjs";
import type { AppUser } from "./types";

//   admin  / Admin@12345
//   it     / It@12345
//   agent1 / Agent@12345
function seedUsers(): AppUser[] {
  return [
    {
      id: "u-admin-1",
      username: "admin",
      passwordHash:
        "$2a$10$DTLqqjbsPsfIbaQZ7qYjduxEmAOk8jTCsJ9mmFk/HJcZJZGF0nlJa",
      role: "admin",
      client_id: "raylab",
      displayName: "Admin",
    },
    {
      id: "u-it-1",
      username: "it",
      passwordHash:
        "$2a$10$YTzBNTGV/ti1mjMJLkXmHOheHvkMI4xn79NnRxsasAYUcfqvQNiDC",
      role: "it",
      client_id: "raylab",
      displayName: "IT",
    },
    {
      id: "u-agent-1",
      username: "agent1",
      passwordHash:
        "$2a$10$AQKM68r/gNCJSKAk4b0nZeatQ8zTy4/vu36C5jyLwtODuLmfAYeJS",
      role: "agent",
      client_id: "raylab",
      displayName: "Agent 1",
    },
  ];
}

// Module-level in-memory store: persists for the life of the running server
// process (fine for "no DB, hardcoded for now" — it resets on server restart
// or redeploy since nothing is written to disk).
const users: AppUser[] = seedUsers();

export function findUserByUsername(username: string): AppUser | undefined {
  return users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
}

export function findUserById(id: string): AppUser | undefined {
  return users.find((u) => u.id === id);
}

export function listAgents(): AppUser[] {
  return users.filter((u) => u.role === "agent");
}

export function createAgent(
  username: string,
  password: string,
  displayName: string,
  client_id: string
): AppUser {
  if (findUserByUsername(username)) {
    throw new Error("That username is already taken.");
  }
  const newAgent: AppUser = {
    id: `u-agent-${Date.now()}`,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "agent",
    client_id,
    displayName,
  };
  users.push(newAgent);
  return newAgent;
}

export function updateAgent(
  id: string,
  updates: Partial<Pick<AppUser, "displayName" | "client_id">> & {
    password?: string;
  }
): AppUser {
  const user = users.find((u) => u.id === id && u.role === "agent");
  if (!user) throw new Error("Agent not found.");
  if (updates.displayName) user.displayName = updates.displayName;
  if (updates.client_id) user.client_id = updates.client_id;
  if (updates.password) user.passwordHash = bcrypt.hashSync(updates.password, 10);
  return user;
}

export function deleteAgent(id: string): void {
  const idx = users.findIndex((u) => u.id === id && u.role === "agent");
  if (idx === -1) throw new Error("Agent not found.");
  users.splice(idx, 1);
}
