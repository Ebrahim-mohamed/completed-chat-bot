"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import type { Audience } from "@/lib/types";

export type BrandFilter = "cairoscan" | "technoscan" | "all";

export interface BrandFilterOption {
  label: string;
  value: BrandFilter;
}

export interface AudienceOption {
  label: string;
  value: Audience;
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onVoiceSend: (audio: Blob) => void;
  disabled?: boolean;
  brandFilter: BrandFilter;
  brandFilterOptions: BrandFilterOption[];
  onBrandFilterChange: (value: BrandFilter) => void;
  audience: Audience;
  audienceOptions: AudienceOption[];
  onAudienceChange: (value: Audience) => void;
}

// Backend limit is 300s; stop a bit earlier so we never go over.
const MAX_RECORDING_SECONDS = 290;

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Composer({
  value,
  onChange,
  onSend,
  onVoiceSend,
  disabled,
  brandFilter,
  brandFilterOptions,
  onBrandFilterChange,
  audience,
  audienceOptions,
  onAudienceChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const audienceMenuRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAudienceMenuOpen, setIsAudienceMenuOpen] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Always call the latest onVoiceSend (brand filter / session may change
  // while a recording is in progress).
  const onVoiceSendRef = useRef(onVoiceSend);
  onVoiceSendRef.current = onVoiceSend;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
      if (
        audienceMenuRef.current &&
        !audienceMenuRef.current.contains(e.target as Node)
      ) {
        setIsAudienceMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-stop (and send) when the maximum duration is reached.
  useEffect(() => {
    if (isRecording && seconds >= MAX_RECORDING_SECONDS) {
      stopRecording(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, isRecording]);

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    if (disabled || isRecording) return;

    setMicError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMicError("Voice recording is not supported in this browser.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("Microphone access was denied or is unavailable.");
      return;
    }

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setMicError("Could not start the recorder in this browser.");
      return;
    }

    chunksRef.current = [];
    cancelledRef.current = false;
    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
      setSeconds(0);

      const chunks = chunksRef.current;
      chunksRef.current = [];

      if (!cancelledRef.current && chunks.length > 0) {
        const type = recorder.mimeType || mimeType || "audio/webm";
        onVoiceSendRef.current(new Blob(chunks, { type }));
      }
    };

    recorder.start();
    setSeconds(0);
    setIsRecording(true);

    timerRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  }

  function stopRecording(send: boolean) {
    cancelledRef.current = !send;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend();
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }

  const activeLabel =
    brandFilterOptions.find((o) => o.value === brandFilter)?.label ?? "";

  const activeAudienceLabel =
    audienceOptions.find((o) => o.value === audience)?.label ?? "";

  // Switching audience starts a new chat, so don't allow it mid-request or
  // mid-recording.
  const audienceMenuDisabled = disabled || isRecording;

  return (
    <div className="border-t border-border bg-surface p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-panel px-3 py-2">
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label="More options"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-textMuted transition-colors hover:bg-panelAlt hover:text-textPrimary"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="19" cy="12" r="1.8" fill="currentColor" />
            </svg>
          </button>

          {isMenuOpen && (
            <div className="absolute bottom-12 left-0 z-10 w-44 overflow-hidden rounded-xl border border-border bg-panel shadow-lg">
              {brandFilterOptions.map((option) => {
                const isActive = option.value === brandFilter;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onBrandFilterChange(option.value);
                      setIsMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-textPrimary hover:bg-panelAlt"
                    }`}
                  >
                    {option.label}
                    {isActive && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative shrink-0" ref={audienceMenuRef}>
          <button
            type="button"
            onClick={() => setIsAudienceMenuOpen((prev) => !prev)}
            disabled={audienceMenuDisabled}
            aria-label="Audience"
            aria-haspopup="true"
            aria-expanded={isAudienceMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-textMuted transition-colors hover:bg-panelAlt hover:text-textPrimary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="5" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="19" r="1.8" fill="currentColor" />
            </svg>
          </button>

          {isAudienceMenuOpen && !audienceMenuDisabled && (
            <div className="absolute bottom-12 left-0 z-10 w-44 overflow-hidden rounded-xl border border-border bg-panel shadow-lg">
              {audienceOptions.map((option) => {
                const isActive = option.value === audience;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onAudienceChange(option.value);
                      setIsAudienceMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-textPrimary hover:bg-panelAlt"
                    }`}
                  >
                    {option.label}
                    {isActive && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {isRecording ? (
          <div className="flex flex-1 items-center gap-3 py-2 text-[15px] text-textPrimary">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="tabular-nums">{formatTime(seconds)}</span>
            <span className="text-sm text-textMuted">Recording...</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            disabled={disabled}
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2 text-[15px] text-textPrimary placeholder:text-textMuted outline-none disabled:opacity-50"
          />
        )}

        {isRecording ? (
          <>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              aria-label="Cancel recording"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-textMuted transition-colors hover:bg-panelAlt hover:text-textPrimary"
            >
              <svg
                width="18"
                height="18"
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

            <button
              type="button"
              onClick={() => stopRecording(true)}
              aria-label="Send voice message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accentHover"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 19V5M12 5L5 12M12 5L19 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              aria-label="Record voice message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-textMuted transition-colors hover:bg-panelAlt hover:text-textPrimary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="9"
                  y="3"
                  width="6"
                  height="12"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M5 11a7 7 0 0 0 14 0M12 18v3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              onClick={onSend}
              disabled={disabled || !value.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accentHover disabled:cursor-not-allowed disabled:bg-border disabled:text-textMuted"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 19V5M12 5L5 12M12 5L19 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}
      </div>
      {micError && (
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-red-300">
          {micError}
        </p>
      )}
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-textMuted">
        {activeLabel} · {activeAudienceLabel} · Press Enter to send, Shift+Enter
        for a new line.
      </p>
    </div>
  );
}