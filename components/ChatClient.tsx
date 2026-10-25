"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import AppNav from "@/components/AppNav";
import UpdateDataButton from "@/components/UpdateDataButton";
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
  VoiceResponseBody,
} from "@/lib/types";
import type { UserRole } from "@/lib/auth/types";

const SESSION_STORAGE_KEY = "chat_session_id";

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

export default function ChatClient({ user }: { user: ChatUser }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [audience, setAudience] = useState<Audience>("agent");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize or restore the current chat session.
  useEffect(() => {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (existing) {
      setSessionId(existing);
    } else {
      const newId = uuidv4();
      window.localStorage.setItem(SESSION_STORAGE_KEY, newId);
      setSessionId(newId);
    }
  }, []);

  // Reset everything to a completely new chat with a new session ID.
  function resetChat() {
    const newId = uuidv4();

    window.localStorage.setItem(SESSION_STORAGE_KEY, newId);

    setSessionId(newId);
    setMessages([]);
    setInput("");
    setError(null);
  }

  // Create a new chat with a completely new session ID.
  function handleNewChat() {
    if (isSending) return;

    resetChat();
  }

  // Switching the audience (agent / patient) opens a new chat.
  function handleAudienceChange(value: Audience) {
    if (isSending || value === audience) return;

    setAudience(value);
    resetChat();
  }

  // Automatically scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  async function sendMessage() {
    const question = input.trim();

    if (!question || !sessionId || isSending) return;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: question,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          session_id: sessionId,
          user_id: user.user_id,
          brand_filter: brandFilter,
          audience,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));

        throw new Error(
          errBody?.error ?? `Request failed (${res.status})`
        );
      }

      const data: ChatResponseBody = await res.json();

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: data.answer ?? "",
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while sending your message."
      );
    } finally {
      setIsSending(false);
    }
  }

  // Send a recorded voice note. Uses the same session_id as text chat so voice
  // and text share the same conversation state.
  async function sendVoice(audio: Blob) {
    if (!sessionId || isSending) return;

    const userMessageId = uuidv4();

    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: "",
      createdAt: Date.now(),
      audioUrl: URL.createObjectURL(audio),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.append("session_id", sessionId);
      form.append("user_id", String(user.user_id));
      form.append("brand_filter", brandFilter);
      form.append("audience", audience);
      form.append(
        "audio",
        audio,
        `voice.${getAudioExtension(audio.type || "audio/webm")}`
      );

      // Do NOT set Content-Type manually — the browser adds the multipart
      // boundary itself.
      const res = await fetch("/api/voice", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));

        throw new Error(
          errBody?.error ?? `Request failed (${res.status})`
        );
      }

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
    } catch (err) {
      console.error(err);

      if (err instanceof DOMException && err.name === "AbortError") {
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

  return (
    <main className="flex h-screen flex-col bg-surface">
      <AppNav
        userName={user.name}
        role={user.role}
        extra={user.role === "admin" ? <UpdateDataButton /> : undefined}
      />

      {/* New Chat Button */}
      <div className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="truncate text-sm text-textMuted">
            {messages.length > 0 ? "Current conversation" : "New conversation"}
          </p>

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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && (
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

          {isSending && <TypingIndicator />}

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
        onSend={sendMessage}
        onVoiceSend={sendVoice}
        disabled={isSending || !sessionId}
        brandFilter={brandFilter}
        brandFilterOptions={BRAND_FILTER_OPTIONS}
        onBrandFilterChange={setBrandFilter}
        audience={audience}
        audienceOptions={AUDIENCE_OPTIONS}
        onAudienceChange={handleAudienceChange}
      />
    </main>
  );
}