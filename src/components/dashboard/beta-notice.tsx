"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";

const DISMISSED_KEY = "adv:beta-notice-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Storage unavailable: show it.
    return false;
  }
}

/**
 * The one line that says Advantage is in beta, above every dashboard page
 * until the person dismisses it.
 *
 * The grey notice strip (a fact, nothing to fix) at the page gutter. The
 * allowance it quotes is the one `reserveQuota()` enforces for the active
 * workspace, so a program reads its hours and a player reads theirs.
 *
 * Hidden until storage has been read, so a dismissed notice never flashes
 * back in on load. Storage can throw (private windows, blocked site data); the
 * notice then simply shows, and dismissing it lasts the visit.
 */
export function BetaNotice() {
  const { active } = useWorkspace();
  // The server snapshot says "dismissed", so nothing renders until the
  // browser has read storage.
  const stored = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);

  if (stored || dismissedNow) return null;

  const hours = monthlyCapSecondsFor(active) / 3600;
  const allowance =
    active.kind === "team" && active.orgType === "college"
      ? `${active.name} has ${hours} free hours of video analysis a month through ${formatPilotEnd()}.`
      : `Every player gets ${hours} free hours of video analysis a month while we build, about one match.`;

  const dismiss = () => {
    setDismissedNow(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Lasts the visit only.
    }
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-14 pt-4">
      <div
        role="status"
        className="flex items-start gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--ink-700)]"
      >
        <FlaskConical
          aria-hidden="true"
          strokeWidth={1.5}
          className="mt-0.5 size-[13px] shrink-0"
        />
        <p className="min-w-0 flex-1">
          <span className="font-medium text-[var(--ink-900)]">
            Advantage is in beta.
          </span>{" "}
          {allowance} SwingVision imports are unlimited.{" "}
          <Link
            href="/dashboard/settings/usage"
            className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            See your usage
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 cursor-pointer font-medium text-[var(--ink-600)] hover:text-[var(--ink-900)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
