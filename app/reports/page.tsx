import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import AppNav from "@/components/AppNav";

export default async function ReportsPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin" && session.role !== "it") {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <AppNav userName={session.name} role={session.role} />
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="mb-2 text-xl font-semibold text-textPrimary">
          Reports
        </h1>
        <p className="text-sm text-textMuted">
          This page is a placeholder — I don't have a real reports endpoint
          to pull data from yet. Tell me what data source and shape you want
          here and I'll wire it up.
        </p>
      </div>
    </main>
  );
}
