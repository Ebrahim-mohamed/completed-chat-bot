import bcrypt from "bcryptjs";
import type { AppUser } from "./types";

//   admin  / Admin@12345
//   it     / It@12345
//   agent1 / Agent@12345
function seedUsers(): AppUser[] {
  return [
    {
      id: "u-admin-1",
      user_id: 1,
      username: "admin",
      passwordHash:
        "$2a$10$DTLqqjbsPsfIbaQZ7qYjduxEmAOk8jTCsJ9mmFk/HJcZJZGF0nlJa",
      role: "admin",
      client_id: "raylab",
      displayName: "Admin",
    },
    {
      id: "u-it-1",
      user_id: 2,
      username: "it",
      passwordHash:
        "$2a$10$YTzBNTGV/ti1mjMJLkXmHOheHvkMI4xn79NnRxsasAYUcfqvQNiDC",
      role: "it",
      client_id: "raylab",
      displayName: "IT",
    },
    {
      id: "u-agent-1",
      user_id: 3,
      username: "agent1",
      passwordHash:
        "$2a$10$AQKM68r/gNCJSKAk4b0nZeatQ8zTy4/vu36C5jyLwtODuLmfAYeJS",
      role: "agent",
      client_id: "raylab",
      displayName: "Agent 1",
    },
  ];
}

interface UserStore {
  users: AppUser[];
  // Only ever goes up, so a user_id is never reused while the server runs.
  nextUserId: number;
}

// The store lives on globalThis so every route (login, agents, ...) shares
// the same list, even if Next.js loads this file more than once.
// Still in memory: it resets when the server restarts.
const globalForUsers = globalThis as unknown as {
  __appUserStore?: UserStore;
};

function getStore(): UserStore {
  let store = globalForUsers.__appUserStore;

  if (!store) {
    const seeded = seedUsers();
    store = {
      users: seeded,
      nextUserId: seeded.reduce((max, u) => Math.max(max, u.user_id), 0) + 1,
    };
    globalForUsers.__appUserStore = store;
  }

  return store;
}

export function findUserByUsername(username: string): AppUser | undefined {
  const wanted = username.trim().toLowerCase();
  return getStore().users.find((u) => u.username.toLowerCase() === wanted);
}

export function findUserById(id: string): AppUser | undefined {
  return getStore().users.find((u) => u.id === id);
}

export function listAgents(): AppUser[] {
  return getStore().users.filter((u) => u.role === "agent");
}

export function createAgent(
  username: string,
  password: string,
  displayName: string,
  client_id: string
): AppUser {
  const store = getStore();
  const cleanUsername = username.trim();

  if (findUserByUsername(cleanUsername)) {
    throw new Error("That username is already taken.");
  }

  const userId = store.nextUserId++;

  const newAgent: AppUser = {
    id: `u-agent-${userId}-${Date.now()}`,
    user_id: userId,
    username: cleanUsername,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "agent",
    client_id: client_id.trim(),
    displayName: displayName.trim(),
  };

  store.users.push(newAgent);
  return newAgent;
}

export function updateAgent(
  id: string,
  updates: Partial<Pick<AppUser, "displayName" | "client_id">> & {
    password?: string;
  }
): AppUser {
  const user = getStore().users.find((u) => u.id === id && u.role === "agent");
  if (!user) throw new Error("Agent not found.");
  if (updates.displayName) user.displayName = updates.displayName;
  if (updates.client_id) user.client_id = updates.client_id;
  if (updates.password) user.passwordHash = bcrypt.hashSync(updates.password, 10);
  return user;
}

export function deleteAgent(id: string): void {
  const store = getStore();
  const idx = store.users.findIndex((u) => u.id === id && u.role === "agent");
  if (idx === -1) throw new Error("Agent not found.");
  store.users.splice(idx, 1);
}