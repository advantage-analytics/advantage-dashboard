"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import { TEXT_ACTION_CLASS } from "@/lib/ui/text-action";

import {
  noteIconCls,
  noteStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";

/**
 * Making "Watch these N points" findable (UGA coaches call, 2026-11-16):
 * coaches picked a Statistics row, the court narrowed, and nobody noticed the
 * footer's Watch button had become the way to see those points. The design
 * owner picked a one-time note over the rows (option B) over an action on the
 * picked row (option A).
 *
 * Shown once per browser, over the Statistics rows of a court whose points
 * can be played — the grey note strip (`primitives.md` › Notice strips: a
 * fact, nothing wrong), one line with the footer button's name in ink-900,
 * and a blue Got it pushed right that closes it for good — the shape of
 * primitives.md's settled one-line strip with its action at the end. Remembered in localStorage beside the film room's own
 * preferences, as `film-skip-dead-hint.tsx` remembers its card: a viewer
 * preference, not an account flag, so no `users` column and no write path.
 */

const HINT_SEEN_KEY = "viz:watch-hint-seen";

function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_SEEN_KEY) === "1";
  } catch {
    // Blocked storage: treat as seen rather than show it on every opening.
    return true;
  }
}

function writeHintSeen(): void {
  try {
    localStorage.setItem(HINT_SEEN_KEY, "1");
  } catch {
    /* private window — it may show again next visit */
  }
}

export function WatchHintNotice() {
  // The lightbox is client-only (`ssr: false`), so storage is readable on the
  // first render and there is no server markup to disagree with.
  const [seen, setSeen] = useState(readHintSeen);
  // Dismissed for good: nothing to say, and nothing of the rows depends on it.
  if (seen) return null;
  return (
    <div role="note" className={`${noteStripCls} mb-5`}>
      <Info
        aria-hidden
        className={`${noteIconCls} text-[var(--ink-400)]`}
        strokeWidth={1.5}
      />
      {/* One line in the 340px column, so the glyph, the text and Got it
          share the first line's axis — the glyph's `mt-0.5` nudge and Got
          it's matching line height line them up without centring either. */}
      <p className="m-0 min-w-0 flex-1">
        Pick a row, then{" "}
        {/* The footer button's own name, set apart so it reads as a label. */}
        <span className="font-medium text-[var(--ink-900)]">
          Watch these points
        </span>
        .
      </p>
      <button
        type="button"
        onClick={() => {
          writeHintSeen();
          setSeen(true);
        }}
        // 17.6px = the strip's 11px × 1.6 line, so the 12px word sits on it.
        // The negative margin grows the hit area without moving the word.
        className={`${TEXT_ACTION_CLASS} -my-1 ml-2 shrink-0 py-1 leading-[17.6px] whitespace-nowrap`}
      >
        Got it
      </button>
    </div>
  );
}
