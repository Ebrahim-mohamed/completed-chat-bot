import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/jwt";
import { ADMIN_API_KEY, ANALYTICS_DASHBOARD_ENDPOINT } from "@/lib/backendConfig";
import { listAgents } from "@/lib/auth/users";
import AppNav from "@/components/AppNav";
import UserHistory from "@/components/UserHistory";
import type {
  AnalyticsItem,
  DashboardAnalytics,
  Traffic,
} from "@/lib/analyticsTypes";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;
type SearchParamsRecord = Record<string, SearchParamValue>;

interface ReportsPageProps {
  searchParams?: Promise<SearchParamsRecord> | SearchParamsRecord;
}

interface DashboardQuery {
  dateFrom: string;
  dateTo: string;
  traffic: Traffic;
  limit: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 10;

function firstValue(value: SearchParamValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseQuery(raw: SearchParamsRecord): DashboardQuery {
  const dateFrom = firstValue(raw.date_from);
  const dateTo = firstValue(raw.date_to);
  const traffic = firstValue(raw.traffic);
  const limit = Number(firstValue(raw.limit));

  return {
    dateFrom: DATE_PATTERN.test(dateFrom) ? dateFrom : "",
    dateTo: DATE_PATTERN.test(dateTo) ? dateTo : "",
    traffic: traffic === "users" ? "users" : "all",
    limit:
      Number.isInteger(limit) && limit >= 1 && limit <= 100
        ? limit
        : DEFAULT_LIMIT,
  };
}

async function getDashboardAnalytics(
  query: DashboardQuery
): Promise<DashboardAnalytics> {
  // The API key decides the client, so no client_id is sent.
  const url = new URL(ANALYTICS_DASHBOARD_ENDPOINT);

  if (query.dateFrom) {
    url.searchParams.set("date_from", `${query.dateFrom}T00:00:00Z`);
  }
  if (query.dateTo) {
    url.searchParams.set("date_to", `${query.dateTo}T23:59:59Z`);
  }
  url.searchParams.set("traffic", query.traffic);
  url.searchParams.set("limit", String(query.limit));

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

function formatLatency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
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

function ListTable({
  title,
  subtitle,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  items: AnalyticsItem[];
  emptyText: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border">
      <div className="border-b border-border bg-panelAlt px-4 py-3">
        <h2 className="text-sm font-semibold text-textPrimary">{title}</h2>

        <p className="mt-1 text-xs text-textMuted">{subtitle}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-panelAlt/50 text-textMuted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 text-right font-medium">Count</th>
              <th className="px-4 py-3 text-right font-medium">Chats</th>
              <th className="px-4 py-3 text-right font-medium">Share</th>
            </tr>
          </thead>

          <tbody>
            {items.length > 0 ? (
              items.map((item, index) => (
                <tr
                  key={`${item.name}-${item.kind}-${index}`}
                  className="border-t border-border"
                >
                  <td
                    dir="auto"
                    style={{ textAlign: "start" }}
                    className="px-4 py-3 text-textPrimary"
                  >
                    {item.name}
                  </td>

                  <td className="px-4 py-3 text-textMuted">
                    {item.category ?? "—"}
                  </td>

                  <td
                    dir="auto"
                    style={{ textAlign: "start" }}
                    className="px-4 py-3 text-textMuted"
                  >
                    {item.group ?? "—"}
                  </td>

                  <td className="px-4 py-3 text-right text-textPrimary">
                    {item.count.toLocaleString("en-US")}
                  </td>

                  <td className="px-4 py-3 text-right text-textMuted">
                    {item.conversations.toLocaleString("en-US")}
                  </td>

                  <td className="px-4 py-3 text-right text-textMuted">
                    {formatRate(item.percentage)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-textMuted"
                >
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    redirect("/login");
  }

  // Reports are only for the IT role.
  if (session.role !== "it") {
    redirect("/");
  }

  const query = parseQuery((await searchParams) ?? {});

  let analytics: DashboardAnalytics | null = null;
  let errorMessage: string | null = null;

  try {
    analytics = await getDashboardAnalytics(query);
  } catch (error) {
    console.error("[Reports] Failed to fetch dashboard analytics:", error);

    errorMessage =
      "Unable to load reports. Please check the analytics backend and try again.";
  }

  const summary = analytics?.performance_summary;

  const metrics = [
    {
      label: "Total Searches",
      hint: "Search turns in the period",
      value: summary ? summary.total_searches.toLocaleString("en-US") : "—",
    },
    {
      label: "Accuracy Rate",
      hint: "Answered + menu offered + unavailable reported",
      value: summary ? formatRate(summary.accuracy_rate) : "—",
    },
    {
      label: "Knowledge Gap Rate",
      hint: "Asked for something not in the catalogue",
      value: summary ? formatRate(summary.knowledge_gap_rate) : "—",
    },
    {
      label: "AI Error Rate",
      hint: "Unanswered + technical error + verification failed",
      value: summary ? formatRate(summary.ai_error_rate) : "—",
    },
    {
      label: "Entity Coverage",
      hint: "Searches with an identified item or term",
      value: summary ? formatRate(summary.entity_coverage_rate) : "—",
    },
    {
      label: "Avg Latency",
      hint: "Average reply time",
      value: summary ? formatLatency(summary.avg_latency_ms) : "—",
    },
    {
      label: "P95 Latency",
      hint: "95% of replies are faster than this",
      value: summary ? formatLatency(summary.p95_latency_ms) : "—",
    },
  ];

  const breakdown = summary
    ? [
        { label: "Answered", value: summary.breakdown.answered },
        { label: "Menu Offered", value: summary.breakdown.menu_offered },
        {
          label: "Unavailable Reported",
          value: summary.breakdown.unavailable_reported,
        },
        { label: "Knowledge Gap", value: summary.breakdown.knowledge_gap },
        {
          label: "Existing Item Unanswered",
          value: summary.breakdown.existing_item_unanswered,
        },
        { label: "Technical Error", value: summary.breakdown.technical_error },
        {
          label: "Verification Failed",
          value: summary.breakdown.verification_failed,
        },
      ]
    : [];

  const historyAgents = listAgents().map((a) => ({
    user_id: a.user_id,
    username: a.username,
    displayName: a.displayName,
  }));

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <AppNav userName={session.name} role={session.role} />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-textPrimary">
              Reports
            </h1>

            <p className="mt-1 text-sm text-textMuted">
              AI accuracy overview and search performance
            </p>
          </div>

          {analytics && (
            <p className="text-sm text-textMuted">
              Period: {formatDate(analytics.period.period_from)}
              {" – "}
              {formatDate(analytics.period.period_to)} (UTC)
            </p>
          )}
        </div>

        {/* Filters */}
        <form
          method="get"
          action="/reports"
          className="mb-8 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-panel p-4 sm:grid-cols-3 lg:grid-cols-6"
        >
          <div>
            <label className="mb-1 block text-xs text-textMuted">From</label>
            <input
              type="date"
              name="date_from"
              defaultValue={query.dateFrom}
              className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-textMuted">To</label>
            <input
              type="date"
              name="date_to"
              defaultValue={query.dateTo}
              className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-textMuted">
              Traffic
            </label>
            <select
              name="traffic"
              defaultValue={query.traffic}
              className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
            >
              <option value="all">All turns</option>
              <option value="users">Real users only</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-textMuted">
              List length
            </label>
            <input
              type="number"
              name="limit"
              min={1}
              max={100}
              defaultValue={query.limit}
              className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accentHover"
            >
              Apply
            </button>
          </div>

          <div className="flex items-end">
            <a
              href="/reports"
              className="w-full rounded-lg border border-border bg-panel px-4 py-2 text-center text-sm text-textPrimary transition-colors hover:bg-panelAlt"
            >
              Reset
            </a>
          </div>
        </form>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
            <h2 className="font-semibold text-textPrimary">
              Reports unavailable
            </h2>

            <p className="mt-2 text-sm text-textMuted">{errorMessage}</p>
          </div>
        ) : analytics && summary ? (
          <>
            {/* KPI cards */}
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
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

                  <p className="mt-1 text-xs text-textMuted">{metric.hint}</p>
                </div>
              ))}
            </div>

            {/* Breakdown */}
            <section className="mb-8 rounded-2xl border border-border bg-panel p-5">
              <h2 className="mb-4 text-base font-semibold text-textPrimary">
                Search Outcomes
              </h2>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                {breakdown.map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-textMuted">{item.label}</p>

                    <p className="mt-2 text-lg font-semibold text-textPrimary">
                      {item.value.toLocaleString("en-US")}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Lists */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <ListTable
                title="Top Searches"
                subtitle="Items users searched for most"
                items={analytics.top_searches}
                emptyText="No search data available."
              />

              <ListTable
                title="Knowledge Gaps"
                subtitle="Terms that are not in the catalogue"
                items={analytics.knowledge_gaps}
                emptyText="No knowledge gaps found."
              />

              <ListTable
                title="Unavailable Services"
                subtitle="In the catalogue but offered at no branch"
                items={analytics.unavailable_services}
                emptyText="No unavailable services found."
              />

              <ListTable
                title="AI Errors"
                subtitle="Catalogue items the bot failed to answer"
                items={analytics.ai_errors}
                emptyText="No AI errors found."
              />
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-panel p-6 text-sm text-textMuted">
            No analytics data is available.
          </div>
        )}

        <UserHistory agents={historyAgents} />
      </div>
    </main>
  );
}