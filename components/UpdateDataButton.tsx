"use client";

import { useState } from "react";

export default function UpdateDataButton() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function handleUpdate() {
    if (isUpdating) return;
    setIsUpdating(true);
    setStatus("idle");

    try {
      const res = await fetch("/api/update", { method: "POST" });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
    } finally {
      setIsUpdating(false);
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === "success" && (
        <span className="text-xs text-accent">Data updated</span>
      )}
      {status === "error" && (
        <span className="text-xs text-red-400">Update failed</span>
      )}
      <button
        onClick={handleUpdate}
        disabled={isUpdating}
        className="rounded-lg border border-border bg-panel px-3 py-1.5 text-sm font-medium text-textPrimary transition-colors hover:bg-panelAlt disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isUpdating ? "Updating..." : "Update data"}
      </button>
    </div>
  );
}
