"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";

export type BrandFilter = "cairo_scan" | "techno_scan" | "both";

export interface BrandFilterOption {
  label: string;
  value: BrandFilter;
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  brandFilter: BrandFilter;
  brandFilterOptions: BrandFilterOption[];
  onBrandFilterChange: (value: BrandFilter) => void;
}

export default function Composer({
  value,
  onChange,
  onSend,
  disabled,
  brandFilter,
  brandFilterOptions,
  onBrandFilterChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-textMuted">
        {activeLabel} · Press Enter to send, Shift+Enter for a new line.
      </p>
    </div>
  );
}
