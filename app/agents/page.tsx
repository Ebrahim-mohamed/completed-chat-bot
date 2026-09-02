import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import AppNav from "@/components/AppNav";
import AgentsClient from "@/components/AgentsClient";

export default async function AgentsPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "it") {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <AppNav userName={session.name} role={session.role} />
      <AgentsClient defaultClientId={session.client_id} />
    </main>
  );
}
