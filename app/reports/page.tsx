import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { BACKEND_BASE_URL, ADMIN_API_KEY } from "@/lib/backendConfig";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";

interface AnalyticsTopic {
  topic: string;
  count: number;
}

interface DashboardAnalytics {
  period: {
    period_from: string;
    period_to: string;
  };
  kpis: {
    total_searches: number;
    answered_rate: number;
    not_found_rate: number;
    escalated_verification_rate: number;
    technical_error_rate: number;
    clarification_requested_rate: number;
    escalated_human_rate: number;
    pending_rate: number;
    human_handoff_offered_rate: number;
    avg_latency_ms: number;
  };
  top_searches: AnalyticsTopic[];
  knowledge_gaps: AnalyticsTopic[];
}

async function getDashboardAnalytics(
  clientId?: string
): Promise<DashboardAnalytics> {
  const url = new URL(
    `${BACKEND_BASE_URL}/api/analytics/dashboard`
  );

  if (clientId) {
    url.searchParams.set("client_id", clientId);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Admin-Api-Key": ADMIN_API_KEY,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    console.error(
      `[Reports] Analytics API returned ${response.status}: ${errorText}`
    );

    throw new Error("Failed to load analytics reports.");
  }

  return response.json();
}

function formatRate(value: number): string {
  return `${Number(value ?? 0)
    .toFixed(2)
    .replace(/\.?0+$/, "")}%`;
}

function formatLatency(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }

  return `${Math.round(value)} ms`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function ReportsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin" && session.role !== "it") {
    redirect("/");
  }

  let analytics: DashboardAnalytics | null = null;
  let errorMessage: string | null = null;

  try {
    analytics = await getDashboardAnalytics(
      session.client_id
        ? String(session.client_id)
        : undefined
    );
  } catch (error) {
    console.error(
      "[Reports] Failed to fetch dashboard analytics:",
      error
    );

    errorMessage =
      "Unable to load reports. Please check the analytics backend and try again.";
  }

  const kpis = analytics?.kpis;

  const metrics = [
    {
      label: "Total Searches",
      value: kpis
        ? kpis.total_searches.toLocaleString("en-US")
        : "—",
    },
    {
      label: "Answered Rate",
      value: kpis ? formatRate(kpis.answered_rate) : "—",
    },
    {
      label: "Not-Found Rate",
      value: kpis ? formatRate(kpis.not_found_rate) : "—",
    },
    {
      label: "Avg Latency",
      value: kpis
        ? formatLatency(kpis.avg_latency_ms)
        : "—",
    },
    {
      label: "Verification Escalations",
      value: kpis
        ? formatRate(kpis.escalated_verification_rate)
        : "—",
    },
    {
      label: "Technical Errors",
      value: kpis
        ? formatRate(kpis.technical_error_rate)
        : "—",
    },
    {
      label: "Clarification Requested",
      value: kpis
        ? formatRate(kpis.clarification_requested_rate)
        : "—",
    },
    {
      label: "Human Handoff Offered",
      value: kpis
        ? formatRate(kpis.human_handoff_offered_rate)
        : "—",
    },
  ];

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <AppNav
        userName={session.name}
        role={session.role}
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">
              Reports
            </h1>

            <p className="mt-1 text-sm text-textMuted">
              Analytics overview and search performance
            </p>
          </div>

          {analytics && (
            <p className="text-sm text-textMuted">
              Period:{" "}
              {formatDate(analytics.period.period_from)}
              {" – "}
              {formatDate(analytics.period.period_to)}
            </p>
          )}
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
            <h2 className="font-semibold text-textPrimary">
              Reports unavailable
            </h2>

            <p className="mt-2 text-sm text-textMuted">
              {errorMessage}
            </p>
          </div>
        ) : analytics && kpis ? (
          <>
            {/* KPI cards */}
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-border bg-panel p-4 sm:p-5"
                >
                  <p className="text-xs text-textMuted sm:text-sm">
                    {metric.label}
                  </p>

                  <p className="mt-2 break-words text-xl font-semibold text-textPrimary sm:text-2xl">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Conversation outcomes */}
            <section className="mb-8 rounded-2xl border border-border bg-panel p-5">
              <h2 className="mb-4 text-base font-semibold text-textPrimary">
                Conversation Outcomes
              </h2>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  {
                    label: "Human Escalated",
                    value: kpis.escalated_human_rate,
                  },
                  {
                    label: "Pending",
                    value: kpis.pending_rate,
                  },
                  {
                    label: "Verification Escalated",
                    value: kpis.escalated_verification_rate,
                  },
                  {
                    label: "Clarification Requested",
                    value: kpis.clarification_requested_rate,
                  },
                  {
                    label: "Technical Errors",
                    value: kpis.technical_error_rate,
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-textMuted">
                      {item.label}
                    </p>

                    <p className="mt-2 text-lg font-semibold text-textPrimary">
                      {formatRate(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Search tables */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top searches */}
              <section className="overflow-hidden rounded-2xl border border-border">
                <div className="border-b border-border bg-panelAlt px-4 py-3">
                  <h2 className="text-sm font-semibold text-textPrimary">
                    Top Searches
                  </h2>

                  <p className="mt-1 text-xs text-textMuted">
                    Most frequently searched topics
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-panelAlt/50 text-textMuted">
                      <tr>
                        <th className="px-4 py-3 font-medium">
                          Topic
                        </th>

                        <th className="px-4 py-3 text-right font-medium">
                          Count
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {analytics.top_searches.length > 0 ? (
                        analytics.top_searches.map((item, index) => (
                          <tr
                            key={`${item.topic}-${index}`}
                            className="border-t border-border"
                          >
                            <td className="px-4 py-3 text-textPrimary">
                              {item.topic}
                            </td>

                            <td className="px-4 py-3 text-right text-textMuted">
                              {item.count.toLocaleString("en-US")}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={2}
                            className="px-4 py-6 text-center text-textMuted"
                          >
                            No search data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Knowledge gaps */}
              <section className="overflow-hidden rounded-2xl border border-border">
                <div className="border-b border-border bg-panelAlt px-4 py-3">
                  <h2 className="text-sm font-semibold text-textPrimary">
                    Knowledge Gaps (Not Found)
                  </h2>

                  <p className="mt-1 text-xs text-textMuted">
                    Topics the system could not answer
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-panelAlt/50 text-textMuted">
                      <tr>
                        <th className="px-4 py-3 font-medium">
                          Topic
                        </th>

                        <th className="px-4 py-3 text-right font-medium">
                          Count
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {analytics.knowledge_gaps.length > 0 ? (
                        analytics.knowledge_gaps.map((item, index) => (
                          <tr
                            key={`${item.topic}-${index}`}
                            className="border-t border-border"
                          >
                            <td className="px-4 py-3 text-textPrimary">
                              {item.topic}
                            </td>

                            <td className="px-4 py-3 text-right text-textMuted">
                              {item.count.toLocaleString("en-US")}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={2}
                            className="px-4 py-6 text-center text-textMuted"
                          >
                            No knowledge gaps found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-panel p-6 text-sm text-textMuted">
            No analytics data is available.
          </div>
        )}
      </div>
    </main>
  );
}
