"use client";

import { useEffect, useState } from "react";
import type { FloatMenuTone } from "@/components/ui/float-menu";
import { saveStatusView, type SaveStatus } from "./save-status";

/**
 * The header's autosave line. Words and transitions live in save-status.ts;
 * this draws them, and ticks every 30 s so "just now" ages into "2 min ago". A
 * failure is `role="alert"`; the routine saving/saved chatter is a polite
 * status. `tone` changes only the ink.
 */
export function LabelSaveStatus({
  status,
  now: fixedNow,
  tone = "light",
}: {
  status: SaveStatus;
  /** For a spec: render at this clock instead of the live one. */
  now?: number;
  /** The ground it sits on: the page header, or the black rail's. */
  tone?: FloatMenuTone;
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

  const dark = tone === "dark";
  const dot =
    view.tone === "error"
      ? "var(--danger)"
      : view.tone === "saved"
        ? "var(--success)"
        : dark
          ? "rgba(255,255,255,0.35)"
          : "var(--ink-300)";
  const ink =
    view.tone === "error"
      ? dark
        ? "var(--danger)"
        : "var(--danger-hover)"
      : dark
        ? "rgba(255,255,255,0.55)"
        : "var(--ink-500)";

  return (
    <span
      data-save-status={view.tone}
      data-save-tone={dark ? "dark" : undefined}
      role={view.tone === "error" ? "alert" : "status"}
      aria-live={view.tone === "error" ? "assertive" : "polite"}
      className={
        dark
          ? "inline-flex max-w-[280px] items-center gap-1.5 text-[11px] whitespace-nowrap"
          : "inline-flex max-w-[420px] items-center gap-1.5 text-[12px] whitespace-nowrap"
      }
      style={{ color: ink }}
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
