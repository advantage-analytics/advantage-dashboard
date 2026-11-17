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
 * fact, nothing wrong), lead sentence in ink-900, and a blue Got it that
 * closes it for good. Remembered in localStorage beside the film room's own
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
    <div role="note" className={`${noteStripCls} mb-4`}>
      <Info
        aria-hidden
        className={`${noteIconCls} text-[var(--ink-400)]`}
        strokeWidth={1.5}
      />
      {/* Text takes the width; Got it rides the trailing edge on the first
          line's baseline, so the note is two lines of reading, not three
          stacked rows with a dangling action under them. */}
      <p className="m-0 min-w-0 flex-1">
        <span className="font-medium text-[var(--ink-900)]">
          Pick a row to watch only its points.
        </span>{" "}
        Then press{" "}
        {/* The footer button's own name, set apart so it reads as a label. */}
        <span className="font-medium text-[var(--ink-900)]">
          Watch these points
        </span>{" "}
        below.
      </p>
      <button
        type="button"
        onClick={() => {
          writeHintSeen();
          setSeen(true);
        }}
        // 11px × 1.6 first line: the 12px label sits on it with no nudge.
        // The negative margin grows the hit area without moving the word.
        className={`${TEXT_ACTION_CLASS} -my-1 ml-1 shrink-0 self-start py-1 leading-[17.6px] whitespace-nowrap`}
      >
        Got it
      </button>
    </div>
  );
}
