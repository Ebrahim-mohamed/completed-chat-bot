import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import AppNav from "@/components/AppNav";

// Placeholder data — no real reports endpoint exists yet.
// Replace these with a fetch to your actual analytics/reports backend.
const METRICS = [
  { label: "Searches", value: "1,284" },
  { label: "Answered Rate", value: "87%" },
  { label: "Not-Found Rate", value: "13%" },
  { label: "Avg Latency", value: "620ms" },
];

const TOP_SEARCHES = [
  { query: "أشعة مقطعية", count: 142 },
  { query: "أسعار الرنين المغناطيسي", count: 98 },
  { query: "مواعيد فرع كايرو سكان", count: 76 },
  { query: "أشعة على العمود الفقري", count: 61 },
  { query: "تحليل دم شامل", count: 54 },
];

const KNOWLEDGE_GAPS = [
  { query: "أشعة رباعية الأبعاد للحامل", count: 23 },
  { query: "تقسيط تكلفة الرنين المغناطيسي", count: 19 },
  { query: "استلام النتيجة اونلاين", count: 14 },
  { query: "تغطية التأمين الطبي", count: 11 },
  { query: "فرع تكنو سكان الاسكندرية", count: 8 },
];

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

      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="mb-8 text-xl font-semibold text-textPrimary">
          Reports
        </h1>
        
        {/* 4 metric boxes */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {METRICS.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-border bg-panel p-4"
            >
              <p className="text-xs text-textMuted">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-textPrimary">
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        {/* 2 tables side by side */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="border-b border-border bg-panelAlt px-4 py-3">
              <h2 className="text-sm font-semibold text-textPrimary">
                Top Searches
              </h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-textMuted">
                <tr>
                  <th className="px-4 py-2 font-medium">Query</th>
                  <th className="px-4 py-2 font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {TOP_SEARCHES.map((row) => (
                  <tr key={row.query} className="border-t border-border">
                    <td className="px-4 py-2 text-textPrimary">
                      {row.query}
                    </td>
                    <td className="px-4 py-2 text-right text-textMuted">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="border-b border-border bg-panelAlt px-4 py-3">
              <h2 className="text-sm font-semibold text-textPrimary">
                Knowledge Gaps (Not Found)
              </h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-textMuted">
                <tr>
                  <th className="px-4 py-2 font-medium">Query</th>
                  <th className="px-4 py-2 font-medium text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {KNOWLEDGE_GAPS.map((row) => (
                  <tr key={row.query} className="border-t border-border">
                    <td className="px-4 py-2 text-textPrimary">
                      {row.query}
                    </td>
                    <td className="px-4 py-2 text-right text-textMuted">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}