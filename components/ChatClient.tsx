"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import AppNav from "@/components/AppNav";
import UpdateDataButton from "@/components/UpdateDataButton";
import ChatSidebar from "@/components/ChatSidebar";
import MessageBubble from "@/components/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import Composer, {
  type BrandFilter,
  type BrandFilterOption,
  type AudienceOption,
} from "@/components/Composer";
import type {
  Audience,
  ChatMessage,
  ChatResponseBody,
  PendingMenu,
  ThreadDetailResponse,
  ThreadMessage,
  ThreadSummary,
  VoiceResponseBody,
} from "@/lib/types";
import type { UserRole } from "@/lib/auth/types";
import { ApiError, readApiError } from "@/lib/apiError";

const SESSION_STORAGE_KEY = "chat_session_id";

// Messages per page when opening a chat / scrolling up.
const PAGE_LIMIT = 50;

// The voice pipeline (conversion + ASR + LLM) is synchronous and slow.
const VOICE_TIMEOUT_MS = 180000;

const BRAND_FILTER_OPTIONS: BrandFilterOption[] = [
  { label: "Cairo Scan", value: "cairoscan" },
  { label: "Techno Scan", value: "technoscan" },
  { label: "Both", value: "all" },
];

const AUDIENCE_OPTIONS: AudienceOption[] = [
  { label: "Agent", value: "agent" },
  { label: "Patient", value: "patient" },
];

// useLayoutEffect on the browser (no scroll flicker), useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface ChatUser {
  name: string;
  username: string;
  role: UserRole;
  client_id: string;
  user_id: number;
}

// The backend needs a filename with an extension.
function getAudioExtension(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) {
    return "mp4";
  }
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "webm";
}

// History message (from the backend) -> message shown in the UI.
function toChatMessage(m: ThreadMessage): ChatMessage {
  const createdAt = Date.parse(m.created_at);

  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
  };
}

export default function ChatClient({ user }: { user: ChatUser }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [audience, setAudience] = useState<Audience>("agent");

  // Chat history state
  const [threadTitle, setThreadTitle] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMenu | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef("");
  const openRequestRef = useRef(0);
  const metaRequestRef = useRef(0);
  const scrollRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const jumpToBottomRef = useRef(false);

  sessionIdRef.current = sessionId;

  // Restore the current chat session (and its messages) on page load.
  useEffect(() => {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (existing) {
      void loadThread(existing, true);
    } else {
      startFreshChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset everything to a completely new chat with a new session ID.
  function startFreshChat() {
    const newId = uuidv4();

    window.localStorage.setItem(SESSION_STORAGE_KEY, newId);

    // Cancel any open / sync request that is still in flight.
    openRequestRef.current++;
    metaRequestRef.current++;

    setSessionId(newId);
    setMessages([]);
    setInput("");
    setError(null);
    setNotice(null);
    setPending(null);
    setHasMore(false);
    setThreadTitle(null);
    setIsOpening(false);
  }

  // Opens a chat from history: loads the newest messages and any open menu.
  async function loadThread(threadId: string, restoring: boolean) {
    const requestId = ++openRequestRef.current;
    metaRequestRef.current++;

    setIsOpening(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(
        `/api/chats/${encodeURIComponent(threadId)}?limit=${PAGE_LIMIT}`,
        { cache: "no-store" }
      );

      if (requestId !== openRequestRef.current) return;

      if (res.status === 404) {
        // Doesn't exist, was deleted, or belongs to someone else.
        startFreshChat();
        if (!restoring) {
          setNotice("This chat is no longer available.");
          setRefreshKey((k) => k + 1);
        }
        return;
      }

      if (!res.ok) throw await readApiError(res);

      const data: ThreadDetailResponse = await res.json();

      if (requestId !== openRequestRef.current) return;

      window.localStorage.setItem(SESSION_STORAGE_KEY, threadId);

      jumpToBottomRef.current = true;
      setSessionId(threadId);
      setMessages(data.messages.map(toChatMessage));
      setHasMore(data.has_more);
      setPending(data.pending ?? null);
      setThreadTitle(data.thread.title);
      if (data.thread.audience) setAudience(data.thread.audience);
      setInput("");
    } catch (err) {
      if (requestId !== openRequestRef.current) return;

      console.error(err);

      // Keep the saved session usable even if history could not be loaded.
      if (restoring) setSessionId(threadId);

      setError(
        err instanceof Error ? err.message : "Couldn't open this chat."
      );
    } finally {
      if (requestId === openRequestRef.current) setIsOpening(false);
    }
  }

  // Scroll up: load the messages older than the first one on screen.
  async function loadOlder() {
    if (!sessionId || !hasMore || isLoadingOlder || isOpening || isSending) {
      return;
    }

    const oldest = messages[0];
    if (!oldest) return;

    const threadId = sessionId;
    setIsLoadingOlder(true);

    try {
      const res = await fetch(
        `/api/chats/${encodeURIComponent(threadId)}?limit=${PAGE_LIMIT}&before=${encodeURIComponent(oldest.id)}`,
        { cache: "no-store" }
      );

      if (sessionIdRef.current !== threadId) return;

      if (res.status === 404) {
        startFreshChat();
        setNotice("This chat is no longer available.");
        setRefreshKey((k) => k + 1);
        return;
      }

      if (!res.ok) throw await readApiError(res);

      const data: ThreadDetailResponse = await res.json();

      if (sessionIdRef.current !== threadId) return;

      const older = data.messages.map(toChatMessage);

      // Remember the scroll position so the view doesn't jump.
      const el = scrollRef.current;
      if (el) {
        scrollRestoreRef.current = {
          height: el.scrollHeight,
          top: el.scrollTop,
        };
      }

      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length > 0 ? data.has_more : false);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Couldn't load older messages."
      );
    } finally {
      setIsLoadingOlder(false);
    }
  }

  // After a reply, read the chat's title and any open numbered menu.
  async function syncThreadMeta(threadId: string) {
    const requestId = ++metaRequestRef.current;

    try {
      const res = await fetch(
        `/api/chats/${encodeURIComponent(threadId)}?limit=1`,
        { cache: "no-store" }
      );

      if (!res.ok) return;

      const data: ThreadDetailResponse = await res.json();

      if (
        requestId !== metaRequestRef.current ||
        sessionIdRef.current !== threadId
      ) {
        return;
      }

      setPending(data.pending ?? null);
      setThreadTitle(data.thread.title);
    } catch {
      // History info is optional; the chat itself still works.
    }
  }

  // The current chat can't be used any more (another user's / deleted).
  function handleChatUnavailable(restoreText?: string) {
    startFreshChat();
    setNotice(
      "This chat is no longer available, so a new chat was started. Please send your message again."
    );
    if (restoreText) setInput(restoreText);
    setRefreshKey((k) => k + 1);
  }

  // Header "New Chat" button and sidebar "New chat" button.
  function handleNewChat() {
    if (isSending) return;

    startFreshChat();
    setIsSidebarOpen(false);
  }

  // Switching the audience (agent / patient) opens a new chat.
  function handleAudienceChange(value: Audience) {
    if (isSending || isOpening || value === audience) return;

    setAudience(value);
    startFreshChat();
  }

  // Click on a chat in the sidebar.
  function handleSelectThread(thread: ThreadSummary) {
    setIsSidebarOpen(false);

    if (isSending) return;
    if (thread.thread_id === sessionId) return;

    void loadThread(thread.thread_id, false);
  }

  // A chat was deleted from the sidebar.
  function handleThreadDeleted(threadId: string) {
    if (threadId === sessionIdRef.current) {
      startFreshChat();
    }
  }

  // A chat was renamed from the sidebar.
  function handleThreadRenamed(threadId: string, title: string) {
    if (threadId === sessionIdRef.current) {
      setThreadTitle(title);
    }
  }

  // Keep the newest message in view; keep the position when older messages
  // are added at the top.
  useIsomorphicLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const restore = scrollRestoreRef.current;
    if (restore) {
      scrollRestoreRef.current = null;
      el.scrollTop = el.scrollHeight - restore.height + restore.top;
      return;
    }

    el.scrollTo({
      top: el.scrollHeight,
      behavior: jumpToBottomRef.current ? "auto" : "smooth",
    });
    jumpToBottomRef.current = false;
  }, [messages, isSending, pending]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;

    if (el.scrollTop < 80) {
      void loadOlder();
    }
  }

  // textOverride is used by the menu buttons: a tap on option n sends "n".
  async function sendMessage(textOverride?: string) {
    const fromMenu = typeof textOverride === "string";
    const question = (typeof textOverride === "string" ? textOverride : input).trim();

    if (!question || !sessionId || isSending || isOpening) return;

    const threadId = sessionId;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: question,
      createdAt: Date.now(),
    };

    metaRequestRef.current++;

    setMessages((prev) => [...prev, userMessage]);
    if (!fromMenu) setInput("");
    setPending(null);
    setIsSending(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          session_id: threadId,
          user_id: user.user_id,
          brand_filter: brandFilter,
          audience,
        }),
      });

      if (!res.ok) throw await readApiError(res);

      const data: ChatResponseBody = await res.json();

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: data.answer ?? "",
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // The chat now exists in history: refresh the sidebar and read the
      // title and any open menu.
      setRefreshKey((k) => k + 1);
      void syncThreadMeta(threadId);
    } catch (err) {
      console.error(err);

      // 403 (another user's chat) / 409 (deleted chat): start a new chat.
      if (err instanceof ApiError && (err.status === 403 || err.status === 409)) {
        handleChatUnavailable(fromMenu ? undefined : question);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while sending your message."
        );
      }
    } finally {
      setIsSending(false);
    }
  }

  // Send a recorded voice note. Uses the same session_id as text chat so voice
  // and text share the same conversation state.
  async function sendVoice(audioBlob: Blob) {
    if (!sessionId || isSending || isOpening) return;

    const threadId = sessionId;
    const userMessageId = uuidv4();

    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: "",
      createdAt: Date.now(),
      audioUrl: URL.createObjectURL(audioBlob),
    };

    metaRequestRef.current++;

    setMessages((prev) => [...prev, userMessage]);
    setPending(null);
    setIsSending(true);
    setError(null);
    setNotice(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.append("session_id", threadId);
      form.append("user_id", String(user.user_id));
      form.append("brand_filter", brandFilter);
      form.append("audience", audience);
      form.append(
        "audio",
        audioBlob,
        `voice.${getAudioExtension(audioBlob.type || "audio/webm")}`
      );

      // Do NOT set Content-Type manually — the browser adds the multipart
      // boundary itself.
      const res = await fetch("/api/voice", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) throw await readApiError(res);

      const data: VoiceResponseBody = await res.json();

      // Show the transcript under the user's audio bubble.
      if (data.transcript) {
        const transcript = data.transcript;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMessageId ? { ...m, transcript } : m
          )
        );
      }

      // Each item in `messages` is its own chat bubble, in order. When
      // voice_status is "failed", `messages` holds the user-friendly fallback
      // text, which is displayed the same way.
      const replyTexts =
        Array.isArray(data.messages) && data.messages.length > 0
          ? data.messages
          : data.reply
          ? [data.reply]
          : [];

      const assistantMessages: ChatMessage[] = replyTexts.map((text, i) => ({
        id: uuidv4(),
        role: "assistant",
        content: text,
        createdAt: Date.now() + i,
      }));

      setMessages((prev) => [...prev, ...assistantMessages]);

      setRefreshKey((k) => k + 1);
      void syncThreadMeta(threadId);
    } catch (err) {
      console.error(err);

      if (err instanceof ApiError && (err.status === 403 || err.status === 409)) {
        handleChatUnavailable();
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setError("The voice request timed out. Please try again.");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while sending your voice message."
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
    }
  }

  const headerTitle =
    threadTitle ?? (messages.length > 0 ? "Current conversation" : "New conversation");

  return (
    <main className="flex h-screen flex-col bg-surface">
      <AppNav
        userName={user.name}
        role={user.role}
        extra={user.role === "admin" ? <UpdateDataButton /> : undefined}
      />

      <div className="flex min-h-0 flex-1">
        <ChatSidebar
          activeThreadId={sessionId}
          refreshKey={refreshKey}
          disabled={isSending}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onSelect={handleSelectThread}
          onNewChat={handleNewChat}
          onDeleted={handleThreadDeleted}
          onRenamed={handleThreadRenamed}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          {/* Header: chat title + New Chat Button */}
          <div className="border-b border-border px-4 py-3">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Open chat history"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-panel text-textPrimary transition-colors hover:bg-panelAlt md:hidden"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 6h16M4 12h16M4 18h16"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <p
                  dir="auto"
                  className="truncate text-sm text-textMuted"
                  title={headerTitle}
                >
                  {headerTitle}
                </p>
              </div>

              <button
                type="button"
                onClick={handleNewChat}
                disabled={!sessionId || isSending}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-panel px-4 py-2 text-sm font-medium text-textPrimary transition-colors hover:bg-panelAlt disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
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

                New Chat
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
              {hasMore && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    disabled={isLoadingOlder}
                    className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs text-textMuted transition-colors hover:bg-panelAlt disabled:opacity-50"
                  >
                    {isLoadingOlder ? "Loading..." : "Load older messages"}
                  </button>
                </div>
              )}

              {isOpening && (
                <p className="mt-16 text-center text-sm text-textMuted">
                  Loading conversation...
                </p>
              )}

              {messages.length === 0 && !isOpening && sessionId && (
                <div className="mt-16 text-center text-textMuted">
                  <p className="text-lg font-medium text-textPrimary">
                    Start a conversation
                  </p>

                  <p className="mt-1 text-sm">
                    Ask anything — your message is sent to the chat endpoint.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {pending &&
                pending.options.length > 0 &&
                !isSending &&
                !isOpening && (
                  <div className="flex flex-col items-start gap-2">
                    {pending.options.map((option, index) => (
                      <button
                        key={`${index}-${option}`}
                        type="button"
                        onClick={() => void sendMessage(String(index + 1))}
                        style={{ textAlign: "start" }}
                        className="flex max-w-[75%] items-start gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-textPrimary transition-colors hover:bg-panelAlt"
                      >
                        <span className="shrink-0 font-semibold text-accent">
                          {index + 1}.
                        </span>
                        <span dir="auto" className="whitespace-pre-wrap">
                          {option}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

              {isSending && <TypingIndicator />}

              {notice && (
                <div className="rounded-lg border border-border bg-panelAlt px-4 py-3 text-sm text-textMuted">
                  {notice}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSend={() => void sendMessage()}
            onVoiceSend={sendVoice}
            disabled={isSending || isOpening || !sessionId}
            brandFilter={brandFilter}
            brandFilterOptions={BRAND_FILTER_OPTIONS}
            onBrandFilterChange={setBrandFilter}
            audience={audience}
            audienceOptions={AUDIENCE_OPTIONS}
            onAudienceChange={handleAudienceChange}
          />
        </section>
      </div>
    </main>
  );
}