"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ThreadListResponse, ThreadSummary } from "@/lib/types";
import { ApiError, readApiError } from "@/lib/apiError";

const PAGE_LIMIT = 30;
const MAX_TITLE_LENGTH = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

type GroupLabel = "Today" | "Yesterday" | "Previous 7 days" | "Older";

interface ThreadGroup {
  label: GroupLabel;
  items: ThreadSummary[];
}

interface ChatSidebarProps {
  activeThreadId: string;
  // Increase this number to reload page 1 (e.g. after a message is sent).
  refreshKey: number;
  disabled?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (thread: ThreadSummary) => void;
  onNewChat: () => void;
  onDeleted: (threadId: string) => void;
  onRenamed: (threadId: string, title: string) => void;
}

// Groups by the user's local time: Today / Yesterday / Previous 7 days / Older.
function getGroupLabel(iso: string, now: Date): GroupLabel {
  const updated = new Date(iso);
  if (Number.isNaN(updated.getTime())) return "Older";

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfUpdated = new Date(
    updated.getFullYear(),
    updated.getMonth(),
    updated.getDate()
  ).getTime();

  const diffDays = Math.round((startOfToday - startOfUpdated) / DAY_MS);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 days";
  return "Older";
}

function groupThreads(items: ThreadSummary[]): ThreadGroup[] {
  const now = new Date();
  const groups: ThreadGroup[] = [];

  for (const item of items) {
    const label = getGroupLabel(item.updated_at, now);
    let group = groups.find((g) => g.label === label);
    if (!group) {
      group = { label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

// Loads one page of chats. A 5xx is retried once.
async function fetchPage(cursor: string | null): Promise<ThreadListResponse> {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  if (cursor) params.set("cursor", cursor);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`/api/chats?${params.toString()}`, {
      cache: "no-store",
    });

    if (res.ok) {
      return (await res.json()) as ThreadListResponse;
    }

    const err = await readApiError(res);
    if (err.status >= 500 && attempt === 0) continue;
    throw err;
  }

  throw new ApiError("Request failed.", 500);
}

export default function ChatSidebar({
  activeThreadId,
  refreshKey,
  disabled,
  isOpen,
  onClose,
  onSelect,
  onNewChat,
  onDeleted,
  onRenamed,
}: ChatSidebarProps) {
  const [items, setItems] = useState<ThreadSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ThreadSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  // Page 1 (first load, and every time refreshKey changes).
  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestRef.current;

    try {
      const data = await fetchPage(null);
      if (requestId !== requestRef.current) return;

      setItems(data.items);
      setNextCursor(data.next_cursor);
      setMoreError(false);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error(err);
      setError("Something went wrong, try again.");
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
  }, [refreshKey, loadFirstPage]);

  // Next page (infinite scroll).
  async function loadMore() {
    if (!nextCursor || isLoadingMore) return;

    const cursor = nextCursor;
    const requestId = requestRef.current;

    setIsLoadingMore(true);
    setMoreError(false);

    try {
      const data = await fetchPage(cursor);
      if (requestId !== requestRef.current) return;

      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.thread_id));
        return [...prev, ...data.items.filter((t) => !seen.has(t.thread_id))];
      });
      setNextCursor(data.next_cursor);
    } catch (err) {
      if (requestId !== requestRef.current) return;

      // Invalid cursor: drop it and reload page 1.
      if (err instanceof ApiError && err.status === 400) {
        void loadFirstPage();
        return;
      }

      console.error(err);
      setMoreError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Load the next page when the bottom of the list becomes visible.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;

    if (!sentinel || !root || !nextCursor) return;
    if (isLoading || isLoadingMore || moreError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: "0px 0px 120px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, isLoading, isLoadingMore, moreError]);

  // Close the ⋯ menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpenId) return;

    function handleMouseDown(e: MouseEvent) {
      if (!(e.target instanceof Element) || !e.target.closest("[data-chat-menu]")) {
        setMenuOpenId(null);
      }
    }

    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setMenuOpenId(null);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpenId]);

  function removeLocally(threadId: string) {
    setItems((prev) => prev.filter((t) => t.thread_id !== threadId));
  }

  // ----- Rename -----

  function startRename(thread: ThreadSummary) {
    setMenuOpenId(null);
    setRenamingId(thread.thread_id);
    setRenameValue(thread.title);
    setRenameError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
    setRenameError(null);
  }

  async function submitRename(thread: ThreadSummary) {
    if (isRenaming) return;

    const trimmed = renameValue.trim();
    const length = Array.from(trimmed).length;

    if (length < 1) {
      setRenameError("Title can't be empty.");
      return;
    }
    if (length > MAX_TITLE_LENGTH) {
      setRenameError(`Title must be at most ${MAX_TITLE_LENGTH} characters.`);
      return;
    }
    if (trimmed === thread.title) {
      cancelRename();
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      const res = await fetch(
        `/api/chats/${encodeURIComponent(thread.thread_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        }
      );

      if (!res.ok) throw await readApiError(res);

      // The server may have collapsed spaces, so use its title.
      const updated: ThreadSummary = await res.json();

      setItems((prev) =>
        prev.map((t) => (t.thread_id === updated.thread_id ? updated : t))
      );
      onRenamed(updated.thread_id, updated.title);
      cancelRename();
    } catch (err) {
      console.error(err);

      if (err instanceof ApiError && err.status === 404) {
        removeLocally(thread.thread_id);
        setNotice("This chat is no longer available.");
        onDeleted(thread.thread_id);
        cancelRename();
      } else if (err instanceof ApiError && err.status === 400) {
        // Blank title: keep the edit box open.
        setRenameError("Title can't be empty.");
      } else {
        // Restore the old title.
        cancelRename();
        setNotice("Couldn't rename this chat. Try again.");
      }
    } finally {
      setIsRenaming(false);
    }
  }

  function handleRenameKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    thread: ThreadSummary
  ) {
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter") {
      e.preventDefault();
      void submitRename(thread);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  // ----- Delete -----

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;

    const target = deleteTarget;
    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/chats/${encodeURIComponent(target.thread_id)}`,
        { method: "DELETE" }
      );

      // 204 = deleted. 404 = already gone: treat both as deleted.
      if (!res.ok && res.status !== 404) throw await readApiError(res);

      removeLocally(target.thread_id);
      setDeleteTarget(null);
      onDeleted(target.thread_id);
    } catch (err) {
      console.error(err);
      setDeleteTarget(null);
      setNotice("Couldn't delete this chat. Try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  const groups = groupThreads(items);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-border bg-surface transition-transform md:static md:z-auto md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
          <h2 className="px-1 text-sm font-semibold text-textPrimary">Chats</h2>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNewChat}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-textPrimary transition-colors hover:bg-panelAlt disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              New chat
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat history"
              className="flex h-8 w-8 items-center justify-center rounded-full text-textMuted transition-colors hover:bg-panelAlt hover:text-textPrimary md:hidden"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-2 pb-3">
          {notice && (
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="mt-3 w-full rounded-lg border border-border bg-panelAlt px-3 py-2 text-left text-xs text-textMuted"
            >
              {notice}
            </button>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadFirstPage()}
                className="mt-1 underline"
              >
                Retry
              </button>
            </div>
          )}

          {isLoading && items.length === 0 && !error && (
            <p className="mt-6 text-center text-sm text-textMuted">
              Loading chats...
            </p>
          )}

          {!isLoading && !error && items.length === 0 && (
            <p className="mt-6 text-center text-sm text-textMuted">
              No chats yet
            </p>
          )}

          {groups.map((group) => (
            <div key={group.label} className="mt-4">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-textMuted">
                {group.label}
              </p>

              <ul className="flex flex-col gap-0.5">
                {group.items.map((thread) => {
                  const isActive = thread.thread_id === activeThreadId;

                  if (renamingId === thread.thread_id) {
                    return (
                      <li key={thread.thread_id} className="px-1 py-1">
                        <input
                          autoFocus
                          dir="auto"
                          value={renameValue}
                          onChange={(e) => {
                            setRenameValue(e.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(e) => handleRenameKeyDown(e, thread)}
                          disabled={isRenaming}
                          aria-label="Chat title"
                          className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-textPrimary outline-none focus:border-accent disabled:opacity-60"
                        />

                        {renameError && (
                          <p className="mt-1 text-xs text-red-300">
                            {renameError}
                          </p>
                        )}

                        <div className="mt-1 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelRename}
                            disabled={isRenaming}
                            className="rounded-lg px-3 py-1 text-xs text-textMuted transition-colors hover:bg-panelAlt disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void submitRename(thread)}
                            disabled={isRenaming}
                            className="rounded-lg bg-accent px-3 py-1 text-xs text-white transition-colors hover:bg-accentHover disabled:opacity-50"
                          >
                            {isRenaming ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li key={thread.thread_id}>
                      <div
                        className={`flex items-center gap-1 rounded-lg px-2 transition-colors ${
                          isActive ? "bg-panelAlt" : "hover:bg-panelAlt/60"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(thread)}
                          disabled={disabled}
                          title={thread.title}
                          className="min-w-0 flex-1 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span
                            dir="auto"
                            style={{ textAlign: "start" }}
                            className="block truncate text-sm text-textPrimary"
                          >
                            {thread.title}
                          </span>

                          {thread.last_message_preview && (
                            <span
                              dir="auto"
                              style={{ textAlign: "start" }}
                              className="mt-0.5 block truncate text-xs text-textMuted"
                            >
                              {thread.last_message_preview}
                            </span>
                          )}
                        </button>

                        <div className="relative shrink-0" data-chat-menu>
                          <button
                            type="button"
                            onClick={() =>
                              setMenuOpenId((prev) =>
                                prev === thread.thread_id
                                  ? null
                                  : thread.thread_id
                              )
                            }
                            disabled={disabled}
                            aria-label="Chat options"
                            aria-haspopup="true"
                            aria-expanded={menuOpenId === thread.thread_id}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-textMuted transition-colors hover:bg-panel hover:text-textPrimary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle cx="5" cy="12" r="1.8" fill="currentColor" />
                              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                              <circle cx="19" cy="12" r="1.8" fill="currentColor" />
                            </svg>
                          </button>

                          {menuOpenId === thread.thread_id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-panel shadow-lg">
                              <button
                                type="button"
                                onClick={() => startRename(thread)}
                                className="flex w-full items-center px-3 py-2 text-left text-sm text-textPrimary transition-colors hover:bg-panelAlt"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  setDeleteTarget(thread);
                                }}
                                className="flex w-full items-center px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-panelAlt"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {nextCursor && !moreError && (
            <div ref={sentinelRef} className="h-4" aria-hidden="true" />
          )}

          {isLoadingMore && (
            <p className="mt-2 text-center text-xs text-textMuted">
              Loading more...
            </p>
          )}

          {moreError && (
            <div className="mt-2 text-center text-xs text-red-300">
              <p>Couldn&apos;t load more chats.</p>
              <button
                type="button"
                onClick={() => void loadMore()}
                className="mt-1 underline"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Delete confirmation. Outside the aside so "fixed" is relative to the screen. */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Delete chat"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5 shadow-xl">
            <h3 className="text-base font-semibold text-textPrimary">
              Delete this chat?
            </h3>

            <p
              dir="auto"
              style={{ textAlign: "start" }}
              className="mt-2 truncate text-sm text-textPrimary"
            >
              {deleteTarget.title}
            </p>

            <p className="mt-2 text-sm text-textMuted">
              It will be removed from your history and you won&apos;t be able
              to continue it.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-lg border border-border bg-panel px-4 py-2 text-sm text-textPrimary transition-colors hover:bg-panelAlt disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}