"use client";

import { useEffect, useState } from "react";
import { saveStatusView, type SaveStatus } from "./save-status";

/**
 * The header's autosave line — board 08's green dot and "Saved · just now".
 * Words and transitions live in save-status.ts; this draws them, and ticks
 * every 30 s so "just now" ages into "2 min ago" instead of going stale. A
 * save newer than the last tick reads "just now" (the age floors at zero).
 *
 * A failure is `role="alert"`, so it is announced the moment it happens; the
 * routine saving/saved chatter is a polite status.
 */
export function LabelSaveStatus({
  status,
  now: fixedNow,
}: {
  status: SaveStatus;
  /** For a spec: render at this clock instead of the live one. */
  now?: number;
}) {
  const [clock, setClock] = useState(() => fixedNow ?? Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [fixedNow]);

  const view = saveStatusView(status, fixedNow ?? clock);
  if (view.tone === "idle") {
    return <span data-save-status="idle" role="status" aria-live="polite" />;
  }

  const dot =
    view.tone === "error"
      ? "var(--danger)"
      : view.tone === "saved"
        ? "var(--success)"
        : "var(--ink-300)";

  return (
    <span
      data-save-status={view.tone}
      role={view.tone === "error" ? "alert" : "status"}
      aria-live={view.tone === "error" ? "assertive" : "polite"}
      className="inline-flex max-w-[420px] items-center gap-1.5 text-[12px] whitespace-nowrap"
      style={{
        color: view.tone === "error" ? "var(--danger-hover)" : "var(--ink-500)",
      }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: dot }}
        aria-hidden="true"
      />
      <span className="truncate">{view.text}</span>
    </span>
  );
}
