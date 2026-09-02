import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import ChatClient from "@/components/ChatClient";

export default async function Home() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    redirect("/login");
  }

  return (
    <ChatClient
      user={{
        name: session.name,
        username: session.username,
        role: session.role,
        client_id: session.client_id,
      }}
    />
  );
}
