"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import type {
  UserHistoryResponse,
  UserHistorySession,
  UserHistorySummary,
  UserHistoryTurn,
} from "@/lib/analyticsTypes";
import { ApiError, readApiError } from "@/lib/apiError";
import { arabicFont } from "@/lib/fonts";
import "./markdown.css";

export interface HistoryAgentOption {
  user_id: number;
  username: string;
  displayName: string;
}

const MANUAL = "__manual__";
const PAGE_LIMIT = 100;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLatency(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function labelize(value: string): string {
  return value.replace(/_/g, " ");
}

function outcomeClass(status: string | null): string {
  switch (status) {
    case "answered":
      return "border-green-500/30 bg-green-500/10 text-green-300";
    case "technical_error":
    case "escalated_verification":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    case "not_found":
    case "complaint_escalated":
    case "handoff_requested":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
    default:
      return "border-border bg-panelAlt text-textMuted";
  }
}

function turnKey(t: UserHistoryTurn): string {
  return `${t.session_id}|${t.created_at}|${t.user_message ?? ""}`;
}

interface TurnGroup {
  sessionId: string;
  turns: UserHistoryTurn[];
}

function groupTurns(turns: UserHistoryTurn[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  const index = new Map<string, TurnGroup>();

  for (const turn of turns) {
    let group = index.get(turn.session_id);
    if (!group) {
      group = { sessionId: turn.session_id, turns: [] };
      index.set(turn.session_id, group);
      groups.push(group);
    }
    group.turns.push(turn);
  }

  return groups;
}

export default function UserHistory({
  agents,
}: {
  agents: HistoryAgentOption[];
}) {
  const [selected, setSelected] = useState<string>(
    agents[0] ? String(agents[0].user_id) : MANUAL
  );
  const [manualId, setManualId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserHistorySummary | null>(null);
  const [sessions, setSessions] = useState<UserHistorySession[]>([]);
  const [turns, setTurns] = useState<UserHistoryTurn[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState("all");

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestRef = useRef(0);

  function resolveUserId(): string {
    return selected === MANUAL ? manualId.trim() : selected;
  }

  async function fetchPage(
    userId: string,
    before: string | null
  ): Promise<UserHistoryResponse> {
    const params = new URLSearchParams({
      user_id: userId,
      limit: String(PAGE_LIMIT),
    });

    if (dateFrom) params.set("date_from", `${dateFrom}T00:00:00Z`);
    if (dateTo) params.set("date_to", `${dateTo}T23:59:59Z`);
    if (before) params.set("before", before);

    const res = await fetch(`/api/reports/user-history?${params.toString()}`, {
      cache: "no-store",
    });

    if (!res.ok) throw await readApiError(res);

    return (await res.json()) as UserHistoryResponse;
  }

  async function handleLoad() {
    const userId = resolveUserId();

    if (!userId) {
      setError("Choose an agent or type a user ID.");
      return;
    }

    const requestId = ++requestRef.current;

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const data = await fetchPage(userId, null);
      if (requestId !== requestRef.current) return;

      setLoadedUserId(userId);
      setSummary(data.summary);
      setSessions(data.sessions);
      setTurns(data.turns);
      setHasMore(data.has_more);
      setNextBefore(data.next_before);
      setSessionFilter("all");
    } catch (err) {
      if (requestId !== requestRef.current) return;

      setLoadedUserId(null);
      setSummary(null);
      setSessions([]);
      setTurns([]);
      setHasMore(false);
      setNextBefore(null);

      if (err instanceof ApiError && err.status === 404) {
        setNotice("This user has no chat history yet.");
      } else {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Failed to load the history."
        );
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  async function handleLoadOlder() {
    if (!loadedUserId || !hasMore || !nextBefore || loadingMore) return;

    const requestId = requestRef.current;

    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchPage(loadedUserId, nextBefore);
      if (requestId !== requestRef.current) return;

      // Older turns go above the ones already on screen.
      setTurns((prev) => {
        const seen = new Set(prev.map(turnKey));
        return [...data.turns.filter((t) => !seen.has(turnKey(t))), ...prev];
      });
      setSessions((prev) => {
        const known = new Set(prev.map((s) => s.session_id));
        return [
          ...data.sessions.filter((s) => !known.has(s.session_id)),
          ...prev,
        ];
      });
      setHasMore(data.has_more);
      setNextBefore(data.next_before);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to load older turns."
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const sessionInfo = new Map(sessions.map((s) => [s.session_id, s]));
  const visibleTurns =
    sessionFilter === "all"
      ? turns
      : turns.filter((t) => t.session_id === sessionFilter);
  const groups = groupTurns(visibleTurns);

  const selectedAgent = agents.find((a) => String(a.user_id) === loadedUserId);

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-textPrimary">
          Agent history
        </h2>
        <p className="mt-1 text-sm text-textMuted">
          Every conversation of one agent, turn by turn.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-panel p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-textMuted">Agent</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
          >
            {agents.map((agent) => (
              <option key={agent.user_id} value={String(agent.user_id)}>
                {agent.displayName} ({agent.username}) · ID {agent.user_id}
              </option>
            ))}
            <option value={MANUAL}>Other user ID...</option>
          </select>
        </div>

        {selected === MANUAL && (
          <div>
            <label className="mb-1 block text-xs text-textMuted">User ID</label>
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="e.g. 3"
              maxLength={128}
              className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-textMuted">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-textMuted">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void handleLoad()}
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading..." : "Show history"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-border bg-panel px-4 py-3 text-sm text-textMuted">
          {notice}
        </div>
      )}

      {summary && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-panel p-4">
              <p className="text-xs text-textMuted">Agent</p>
              <p className="mt-2 break-words text-base font-semibold text-textPrimary">
                {selectedAgent
                  ? selectedAgent.displayName
                  : `User ${loadedUserId}`}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-panel p-4">
              <p className="text-xs text-textMuted">Chats</p>
              <p className="mt-2 text-xl font-semibold text-textPrimary">
                {summary.sessions.toLocaleString("en-US")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-panel p-4">
              <p className="text-xs text-textMuted">Messages</p>
              <p className="mt-2 text-xl font-semibold text-textPrimary">
                {summary.messages.toLocaleString("en-US")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-panel p-4">
              <p className="text-xs text-textMuted">First / last message</p>
              <p className="mt-2 text-xs text-textPrimary">
                {formatDateTime(summary.first_message_at)}
              </p>
              <p className="mt-1 text-xs text-textPrimary">
                {formatDateTime(summary.last_message_at)}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-border bg-panel p-4">
            <p className="mb-3 text-xs text-textMuted">
              Outcomes (all time)
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.outcomes).map(([key, value]) => (
                <span
                  key={key}
                  className={`rounded-full border px-3 py-1 text-xs ${outcomeClass(
                    key
                  )}`}
                >
                  {labelize(key)}: {value.toLocaleString("en-US")}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-textMuted">Chat</label>
              <select
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
                className="max-w-xs rounded-lg border border-border bg-panelAlt px-3 py-1.5 text-sm text-textPrimary outline-none focus:border-accent"
              >
                <option value="all">All chats on screen</option>
                {sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.title || s.session_id.slice(0, 8)}
                    {s.deleted ? " (deleted)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-textMuted">
              Showing {visibleTurns.length.toLocaleString("en-US")} turns
            </p>
          </div>

          {hasMore && (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                onClick={() => void handleLoadOlder()}
                disabled={loadingMore}
                className="rounded-lg border border-border bg-panel px-4 py-2 text-sm text-textPrimary transition-colors hover:bg-panelAlt disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load older turns"}
              </button>
            </div>
          )}

          {groups.length === 0 && (
            <p className="rounded-2xl border border-border bg-panel p-6 text-center text-sm text-textMuted">
              No turns to show.
            </p>
          )}

          <div className={`${arabicFont.className} flex flex-col gap-6`}>
            {groups.map((group) => {
              const info = sessionInfo.get(group.sessionId);

              return (
                <div
                  key={group.sessionId}
                  className="overflow-hidden rounded-2xl border border-border"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-panelAlt px-4 py-3">
                    <p
                      dir="auto"
                      style={{ textAlign: "start" }}
                      className="min-w-0 truncate text-sm font-semibold text-textPrimary"
                    >
                      {info?.title || `Chat ${group.sessionId.slice(0, 8)}`}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-textMuted">
                      {info?.audience && (
                        <span className="rounded-full border border-border px-2 py-0.5">
                          {info.audience}
                        </span>
                      )}
                      {info?.deleted && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-300">
                          deleted by user
                        </span>
                      )}
                      <span>{group.turns.length} turns</span>
                    </div>
                  </div>

                  <div className="flex flex-col divide-y divide-border">
                    {group.turns.map((turn) => {
                      const latency = formatLatency(turn.latency_ms);

                      return (
                        <div key={turnKey(turn)} className="px-4 py-4">
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-textMuted">
                            <span>{formatDateTime(turn.created_at)}</span>

                            {turn.outcome_status && (
                              <span
                                className={`rounded-full border px-2 py-0.5 ${outcomeClass(
                                  turn.outcome_status
                                )}`}
                              >
                                {labelize(turn.outcome_status)}
                              </span>
                            )}

                            {turn.intent && (
                              <span className="rounded-full border border-border px-2 py-0.5">
                                {labelize(turn.intent)}
                              </span>
                            )}

                            {turn.modality && (
                              <span className="rounded-full border border-border px-2 py-0.5">
                                {turn.modality}
                              </span>
                            )}

                            {turn.routing_outcome && (
                              <span className="rounded-full border border-border px-2 py-0.5">
                                {labelize(turn.routing_outcome)}
                              </span>
                            )}

                            {latency && <span>{latency}</span>}
                          </div>

                          {turn.user_message && (
                            <div className="flex justify-end">
                              <div
                                dir="auto"
                                style={{ textAlign: "start" }}
                                className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-[15px] leading-relaxed text-white"
                              >
                                {turn.user_message}
                              </div>
                            </div>
                          )}

                          {turn.assistant_reply && (
                            <div className="mt-2 flex justify-start">
                              <div
                                dir="auto"
                                className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-panelAlt px-4 py-2 text-[15px] text-textPrimary"
                              >
                                <div className="md-content">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                  >
                                    {turn.assistant_reply}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          )}

                          {turn.subjects.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {turn.subjects.map((subject, i) => (
                                <span
                                  key={`${subject.kind}-${subject.name}-${i}`}
                                  dir="auto"
                                  className="rounded-full border border-border bg-panel px-2.5 py-0.5 text-xs text-textMuted"
                                  title={subject.group ?? undefined}
                                >
                                  {subject.kind}
                                  {subject.category
                                    ? ` · ${subject.category}`
                                    : ""}
                                  {" · "}
                                  {subject.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}