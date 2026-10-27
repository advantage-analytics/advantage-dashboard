"use client";

import { Info, PencilLine, TriangleAlert, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  errorStripCls,
  noteIconCls,
  noteStripCls,
  noticeEnterCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import { cn } from "@/lib/utils";
import { useSelfReview } from "./self-review-provider";

/**
 * The Video tab's one line about self review, above the player and the list:
 *
 * - **Fixing** — the mode stated once, with its keys (the reorder mode's
 *   banner, `tables.md`: never a hint per row), and how much is unsaved.
 * - **Saved** — what the fixes moved ("Winners 12 → 13"), that the original
 *   reading is kept, and, when a fix changed who won a game's last point,
 *   that the score may no longer add up — Edit match is where it changes.
 * - **A save that failed** — the red strip, in the mode, so nothing is lost.
 *
 * Grey strips (a fact), red for the refusal (`primitives.md` › Notice strips).
 */
export function FixModeNotice() {
  const review = useSelfReview();

  if (review.fixing) {
    const count = review.pendingCount;
    return (
      <div className="flex flex-col gap-2">
        <div className={cn(noteStripCls, "items-center")}>
          <PencilLine
            className={cn(noteIconCls, "mt-0 text-[var(--ink-900)]")}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="m-0 flex flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="font-medium text-[var(--ink-900)]">
              Fixing points.
            </span>
            <span>
              Watch a point, then fix anything Advantage Intelligence read
              differently. Move with
            </span>
            <Kbd size="sm">↑</Kbd>
            <Kbd size="sm">↓</Kbd>
            <span>· fix</span>
            <Kbd size="sm">Enter</Kbd>
          </p>
          <span
            className="shrink-0 text-[11px] text-[var(--ink-500)]"
            aria-live="polite"
          >
            {count === 0
              ? "Nothing changed yet"
              : `${count === 1 ? "1 point" : `${count} points`} fixed · not saved yet`}
          </span>
        </div>
        {review.error ? (
          <div role="alert" className={errorStripCls}>
            <TriangleAlert
              className={noteIconCls}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="m-0">{review.error}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const saved = review.saved;
  if (!saved) return null;
  const lead = `Saved ${saved.count === 1 ? "1 fix" : `${saved.count} fixes`}.`;
  const moved = saved.moved.length
    ? `Your stats now use what you saw: ${saved.moved.join(" · ")}.`
    : "No stat moved; the fixes changed how points ended, not what they count toward.";
  return (
    <div role="status" className={cn(noteStripCls, noticeEnterCls)}>
      <Info
        className={cn(noteIconCls, "text-[var(--ink-400)]")}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="m-0 flex-1">
        <span className="font-medium text-[var(--ink-900)]">{lead}</span>{" "}
        {moved} The original reading is kept, and an Advantage Review would
        start from your fixes.
        {saved.scoreMayNotAddUp
          ? " A fix changed who won a game, so the score may no longer add up: check it in Edit match."
          : ""}
      </p>
      <ChromeTooltip label="Dismiss">
        <button
          type="button"
          onClick={review.dismissSaved}
          aria-label="Dismiss"
          className="-my-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-cell)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--ink-900)]"
        >
          <X className="size-3" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </ChromeTooltip>
    </div>
  );
}
