"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SyncRunProgress,
  SyncStartResponse,
  SyncState,
  SyncTaskStatus,
} from "@/lib/syncTypes";

// Requests go through our own server, which checks the admin session and adds
// the admin API key.
const BFF = "/api/sync";
const POLL_MS = 2000;
const MAX_POLL_FAILURES = 5;

const STAGE_LABEL: Record<string, string> = {
  listed: "Waiting",
  downloaded: "Downloaded",
  parsed: "Parsed",
  chunked: "Embedding",
  embedded: "Ready to switch",
  committed: "Live",
  failed: "Failed",
};

const PHASE_LABEL: Record<string, string> = {
  queued: "Queued",
  listing: "Listing OneDrive files",
  downloading: "Downloading",
  parsing: "Reading sheets",
  chunking: "Building rows",
  embedding: "Embedding",
  committing: "Switching to the new data",
  finalizing: "Finalizing",
  done: "Done",
};

const BADGE_CLASS: Record<SyncState, string> = {
  PENDING: "border-border bg-panelAlt text-textMuted",
  PROCESSING: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  SUCCEEDED: "border-green-500/30 bg-green-500/10 text-green-300",
  SUCCEEDED_WITH_WARNINGS:
    "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-300",
};

const BAR_CLASS: Record<SyncState, string> = {
  PENDING: "bg-gray-400",
  PROCESSING: "bg-blue-500",
  SUCCEEDED: "bg-green-500",
  SUCCEEDED_WITH_WARNINGS: "bg-yellow-500",
  FAILED: "bg-red-500",
};

interface ApiResult {
  status: number;
  body: SyncStartResponse & { error?: string };
}

async function api(path: string, options?: RequestInit): Promise<ApiResult> {
  const res = await fetch(`${BFF}${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes} min ${total % 60} s` : `${total} s`;
}

function stateOf(p: SyncRunProgress | null): SyncState | null {
  return p ? p.state : null;
}

function SyncPanel({
  progress,
  message,
  isActive,
  onRetry,
}: {
  progress: SyncRunProgress | null;
  message: string | null;
  isActive: boolean;
  onRetry: () => void;
}) {
  if (!progress) {
    return (
      <div className="p-4">
        <p className="text-sm font-semibold text-textPrimary">Sync</p>
        <p className="mt-2 text-sm text-textMuted">
          {message ?? "No sync yet."}
        </p>
      </div>
    );
  }

  const percent = Math.min(100, Math.max(0, progress.progress?.percent ?? 0));
  const files = progress.progress?.files;
  const embeddings = progress.progress?.embeddings;
  const current = progress.progress?.current;
  const timing = progress.timing;
  const errors = progress.errors ?? [];
  const unmatched = progress.warnings?.unmatched_contracts ?? [];
  const canRetry = !isActive && errors.some((e) => e.retryable);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-textPrimary">
          Sync — {PHASE_LABEL[progress.phase] ?? progress.phase}
        </p>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs ${BADGE_CLASS[progress.state]}`}
        >
          {progress.state}
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-panelAlt">
        <div
          className={`h-full rounded-full transition-all ${BAR_CLASS[progress.state]}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-textMuted">
        <span>
          Progress{" "}
          <b className="text-textPrimary">{percent.toFixed(1)}%</b>
        </span>
        <span>
          Elapsed{" "}
          <b className="text-textPrimary">
            {duration(timing?.elapsed_seconds)}
          </b>
        </span>
        {timing?.eta_seconds !== null && timing?.eta_seconds !== undefined && (
          <span>
            ETA{" "}
            <b className="text-textPrimary">
              ~{duration(timing.eta_seconds)} left
            </b>
          </span>
        )}
        {files && (
          <span>
            Files{" "}
            <b className="text-textPrimary">
              {files.done}/{files.total}
              {files.failed ? ` · ${files.failed} failed` : ""} ·{" "}
              {files.skipped} unchanged
            </b>
          </span>
        )}
        {embeddings && embeddings.total > 0 && (
          <span>
            Rows embedded{" "}
            <b className="text-textPrimary">
              {embeddings.done}/{embeddings.total}
            </b>
          </span>
        )}
        {timing?.data_switched_at && (
          <span>
            New data live{" "}
            <b className="text-textPrimary">
              {new Date(timing.data_switched_at).toLocaleTimeString()}
            </b>
          </span>
        )}
      </div>

      {current && (
        <p className="mt-3 text-xs text-textMuted">
          {STAGE_LABEL[current.stage] ?? current.stage}:{" "}
          <b className="text-textPrimary">{current.source_file}</b>
          {current.detail ? ` — ${current.detail}` : ""}
        </p>
      )}

      {progress.files && progress.files.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-panelAlt text-textMuted">
              <tr>
                <th className="px-2 py-1.5 font-medium">File</th>
                <th className="px-2 py-1.5 font-medium">Stage</th>
                <th className="px-2 py-1.5 text-right font-medium">%</th>
                <th className="px-2 py-1.5 text-right font-medium">Rows</th>
              </tr>
            </thead>
            <tbody>
              {progress.files.map((file) => (
                <tr
                  key={file.source_file}
                  className={`border-t border-border ${
                    file.error ? "text-red-300" : "text-textPrimary"
                  }`}
                >
                  <td
                    dir="auto"
                    style={{ textAlign: "start" }}
                    className="px-2 py-1.5"
                  >
                    {file.source_file}
                  </td>
                  <td className="px-2 py-1.5">
                    {STAGE_LABEL[file.stage] ?? file.stage}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {Math.round(file.percent)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {file.rows ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(errors.length > 0 || unmatched.length > 0) && (
        <ul className="mt-3 flex flex-col gap-2">
          {errors.map((err, i) => (
            <li
              key={`${err.code}-${err.source_file ?? ""}-${i}`}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-red-300">{err.code}</span>
                <span className="rounded-full border border-red-500/30 px-2 py-0.5 text-red-300">
                  {err.retryable ? "retry may fix it" : "fix the sheet first"}
                </span>
                {err.source_file && (
                  <span dir="auto" className="text-textMuted">
                    · {err.source_file}
                  </span>
                )}
              </div>

              <p className="mt-1 text-textPrimary">{err.hint}</p>

              <details className="mt-1 text-textMuted">
                <summary className="cursor-pointer">details</summary>
                <p className="mt-1 break-words">{err.message}</p>
              </details>
            </li>
          ))}

          {unmatched.map((w, i) => (
            <li
              key={`${w.contract_id}-${i}`}
              className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs"
            >
              <span className="font-semibold text-yellow-300">
                UNMATCHED_CONTRACT
              </span>
              <p dir="auto" className="mt-1 text-textPrimary">
                Sheet contract &quot;{w.contract_id}&quot; matches no sheet
                (expected sheet &quot;{w.sheet_name}&quot;).
              </p>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <p className="mt-3 text-xs text-textMuted">
          A failed file keeps its previous version.
        </p>
      )}

      {message && <p className="mt-3 text-xs text-red-300">{message}</p>}

      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accentHover"
        >
          Retry sync
        </button>
      )}
    </div>
  );
}

export default function UpdateDataButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<SyncRunProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [finished, setFinished] = useState<SyncState | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  // Every start / resume gets a new id, so an older polling loop stops itself.
  const loopRef = useRef(0);
  // True once this page has watched a run, so "Data updated" is only shown for
  // a run that finished in front of the admin, not for an old one.
  const watchedRef = useRef(false);

  const state = stateOf(progress);
  const isActive =
    isStarting ||
    (progress !== null &&
      !progress.is_complete &&
      (state === "PENDING" || state === "PROCESSING"));

  function isCurrent(loopId: number): boolean {
    return mountedRef.current && loopRef.current === loopId;
  }

  // Poll one run every 2 s until it is complete.
  async function followRun(runId: string, loopId: number): Promise<void> {
    let failures = 0;

    for (;;) {
      if (!isCurrent(loopId)) return;

      try {
        const { status, body } = await api(
          `/runs/${encodeURIComponent(runId)}/progress`
        );
        if (!isCurrent(loopId)) return;

        if (status === 200) {
          failures = 0;
          const data = body as unknown as SyncRunProgress;
          setProgress(data);
          setMessage(null);

          if (data.is_complete) {
            if (watchedRef.current) setFinished(data.state);
            return;
          }
        } else if (status === 401 || status === 403 || status === 404) {
          setMessage(body.detail || body.error || `HTTP ${status}`);
          return;
        } else {
          failures++;
        }
      } catch {
        failures++;
      }

      if (failures >= MAX_POLL_FAILURES) {
        if (isCurrent(loopId)) {
          setMessage(
            "Lost contact with the sync service. Open this panel again to retry."
          );
        }
        return;
      }

      await sleep(POLL_MS);
    }
  }

  // Sync button: start, or attach to the run already in progress (409).
  async function startSync() {
    if (isActive) return;

    const loopId = ++loopRef.current;
    watchedRef.current = true;

    setIsStarting(true);
    setMessage(null);
    setFinished(null);
    setIsOpen(true);

    try {
      const { status, body } = await api("", { method: "POST" });
      if (!isCurrent(loopId)) return;

      // Already running: follow it, don't show an error.
      if (status === 409 && body.run_id) {
        await followRun(body.run_id, loopId);
        return;
      }

      if (status !== 202 || !body.task_id) {
        setMessage(body.detail || body.error || `HTTP ${status}`);
        return;
      }

      // The run row appears within a few seconds: wait for progress.run_id.
      let runId: string | null = null;
      let failures = 0;

      while (!runId) {
        if (!isCurrent(loopId)) return;

        try {
          const result = await api(
            `/${encodeURIComponent(body.task_id)}/status`
          );
          if (!isCurrent(loopId)) return;

          if (result.status === 200) {
            failures = 0;
            const taskStatus = result.body as unknown as SyncTaskStatus;
            const p = taskStatus.progress;

            if (p) {
              setProgress(p);

              // Failed before it started.
              if (p.is_complete) {
                setFinished(p.state);
                return;
              }

              runId = p.run_id;
            }
          } else if (result.status === 401 || result.status === 403) {
            setMessage(result.body.detail || result.body.error || "Forbidden.");
            return;
          } else {
            failures++;
          }
        } catch {
          failures++;
        }

        if (failures >= MAX_POLL_FAILURES) {
          setMessage("The sync did not report a run. Try again.");
          return;
        }

        if (!runId) await sleep(POLL_MS);
      }

      await followRun(runId, loopId);
    } catch (err) {
      console.error(err);
      if (isCurrent(loopId)) setMessage("Couldn't start the sync. Try again.");
    } finally {
      if (isCurrent(loopId)) setIsStarting(false);
    }
  }

  // On page load: pick up a run that is already in progress.
  useEffect(() => {
    mountedRef.current = true;

    async function resume() {
      const loopId = ++loopRef.current;

      try {
        const { status, body } = await api("/runs/latest/progress");
        if (!isCurrent(loopId) || status !== 200) return;

        const data = body as unknown as SyncRunProgress;
        setProgress(data);

        if (!data.is_complete) {
          watchedRef.current = true;
          await followRun(data.run_id ?? "latest", loopId);
        }
      } catch {
        // No earlier run or the service is down: the button still works.
      }
    }

    void resume();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the panel on outside click or Escape.
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  function handleMainClick() {
    if (isActive) {
      setIsOpen((prev) => !prev);
      return;
    }
    void startSync();
  }

  function togglePanel() {
    setIsOpen((prev) => !prev);
    setFinished(null);
  }

  const percent = Math.round(progress?.progress?.percent ?? 0);

  return (
    <div className="relative flex items-center gap-2" ref={containerRef}>
      {!isActive && finished === "SUCCEEDED" && (
        <span className="text-xs text-accent">Data updated</span>
      )}
      {!isActive && finished === "SUCCEEDED_WITH_WARNINGS" && (
        <span className="text-xs text-yellow-300">Updated with warnings</span>
      )}
      {!isActive && finished === "FAILED" && (
        <span className="text-xs text-red-400">Update failed</span>
      )}

      <button
        type="button"
        onClick={handleMainClick}
        className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm font-medium text-textPrimary transition-colors hover:bg-panelAlt"
      >
        {isActive
          ? state === "PROCESSING"
            ? `Updating... ${percent}%`
            : "Updating..."
          : "Update data"}
      </button>

      {progress && (
        <button
          type="button"
          onClick={togglePanel}
          aria-label="Show sync progress"
          aria-expanded={isOpen}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-panel text-textMuted transition-colors hover:bg-panelAlt hover:text-textPrimary"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-panel shadow-lg">
          <SyncPanel
            progress={progress}
            message={message}
            isActive={isActive}
            onRetry={() => void startSync()}
          />
        </div>
      )}
    </div>
  );
}