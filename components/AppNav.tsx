"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { UserRole } from "@/lib/auth/types";

interface AppNavProps {
  userName: string;
  role: UserRole;
  extra?: ReactNode;
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  it: "IT",
  agent: "Agent",
};

export default function AppNav({ userName, role, extra }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/", label: "Chat", show: true },
    { href: "/reports", label: "Reports", show: role === "admin" || role === "it" },
    { href: "/agents", label: "Agents", show: role === "it" },
  ];

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-textPrimary">Chat</span>
        <nav className="flex items-center gap-1">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  pathname === l.href
                    ? "bg-panelAlt text-textPrimary"
                    : "text-textMuted hover:bg-panelAlt hover:text-textPrimary"
                }`}
              >
                {l.label}
              </Link>
            ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {extra}
        <span className="text-xs text-textMuted">
          {userName} · {ROLE_LABEL[role]}
        </span>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm font-medium text-textPrimary transition-colors hover:bg-panelAlt"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
