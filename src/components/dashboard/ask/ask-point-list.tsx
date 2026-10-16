"use client";

import type { Ref } from "react";
import Link from "next/link";
import { Play } from "lucide-react";

import type { AskShowPoint } from "@/lib/services/ask/show-response";

/**
 * The points behind an answer over ONE match (roadmap 6.1), as one line: a
 * play glyph and "Watch the 12 points", which opens the Video tab on them as
 * a playlist, and beside it in grey where they fall and how long they run.
 *
 * ── Why a link and not a list ───────────────────────────────────────────────
 * It used to be the Video tab's point list in a card — a 52px row per point
 * with its mark, its result and its score. In a chat answer that ran to a
 * screen or more for a long cut, and repeated what the Video tab, one click
 * away, already lays out with the film beside it. The answer's own words say
 * what the points are; this line only takes the player to them. Picked on
 * `/design/ask/polish` (variant I) over a quieter list, a strip and a
 * disclosure.
 *
 * ── What the line says ──────────────────────────────────────────────────────
 * The link's words keep the list's old honesty about whose points these are:
 * "Watch the 12 points" when they are the ones the headline figure counts,
 * "Watch all 54 points" for a whole match nothing cut, and "Watch 54 points
 * in this match" otherwise — a cut broader than the figure, or a capped
 * list — said on screen, not only to a screen reader, so a sighted player
 * never reads the match's points as the answer's. The grey part names the
 * stretch — "Set 1 · Games 2–4", or "Sets 1–2" across sets — and the
 * running time when the source timed them, then "First 54" when the match held more points than the server sent.
 *
 * Keep this file's imports clear of `next/navigation` and `next/image`: it
 * is rendered by an offline component harness (`tests/ask-point-list.spec.ts`).
 */

export interface AskPointListProps {
  /** In match order, as `/api/ask/show` answered them. */
  points: readonly AskShowPoint[];
  /**
   * The measure's cut, serialized for `?f=`. Null when the answer named no
   * cut: the points are then the whole match, and the line says so instead
   * of passing them off as the answer's.
   */
  filters?: string | null;
  /** The match held more points than the server sent. */
  truncated?: boolean;
  /**
   * The points are the ones the answer's headline figure counts, so the line
   * may call them the answer's.
   */
  counted?: boolean;
  /** The film on the first point with the rest queued: what the line opens. */
  href: string;
  /**
   * The line, made focusable (`tabIndex={-1}`), for "Show me" to move focus
   * onto once its button has unmounted.
   */
  headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * "Watch the 12 points" / "Watch all 54 points" / "Watch 54 points in this
 * match".
 */
export function askPointListLabel({
  count,
  filters,
  truncated,
  counted,
}: {
  count: number;
  filters: string | null;
  truncated: boolean;
  counted: boolean;
}): string {
  const noun = count === 1 ? "point" : "points";
  if (counted && filters !== null) return `Watch the ${count} ${noun}`;
  if (filters === null && !truncated) {
    return count === 1 ? "Watch the 1 point" : `Watch all ${count} ${noun}`;
  }
  return `Watch ${count} ${noun} in this match`;
}

/** "Set 1 · Games 2–4", "Set 2 · Game 7", "Sets 1–2"; null when unrecorded. */
export function askPointSpan(points: readonly AskShowPoint[]): string | null {
  const placed = points.filter(
    (point) => point.setNumber !== null && point.gameNumber !== null,
  );
  if (placed.length === 0) return null;
  const first = placed[0];
  const last = placed[placed.length - 1];
  if (first.setNumber !== last.setNumber) {
    return `Sets ${first.setNumber}–${last.setNumber}`;
  }
  return first.gameNumber === last.gameNumber
    ? `Set ${first.setNumber} · Game ${first.gameNumber}`
    : `Set ${first.setNumber} · Games ${first.gameNumber}–${last.gameNumber}`;
}

/** "About 3 min" / "Under a minute"; null when no point was timed. */
export function askPointRunningTime(
  points: readonly AskShowPoint[],
): string | null {
  const seconds = points.reduce(
    (sum, point) =>
      sum + (point.videoTime !== null ? (point.duration ?? 0) : 0),
    0,
  );
  if (seconds <= 0) return null;
  if (seconds < 60) return "Under a minute";
  return `About ${Math.round(seconds / 60)} min`;
}

export function AskPointList({
  points,
  filters = null,
  truncated = false,
  counted = false,
  href,
  headingRef,
}: AskPointListProps) {
  const count = points.length;
  if (count === 0) return null;

  const label = askPointListLabel({ count, filters, truncated, counted });
  const whose =
    counted && filters !== null ? "behind this answer" : "in this match";
  // The spoken name carries the whose-points words too, once: a label that
  // already says them on screen is read as it is.
  const spoken = label.endsWith(whose) ? label : `${label} ${whose}`;
  const meta = [
    askPointSpan(points),
    askPointRunningTime(points),
    truncated ? `First ${count}` : null,
  ].filter(Boolean);

  return (
    <section
      data-ask-point-list=""
      aria-label={
        counted && filters !== null
          ? "Points behind this answer"
          : "Points in this match"
      }
    >
      <h3
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="text-body-sm flex flex-wrap items-center gap-x-2 gap-y-0.5 outline-none"
      >
        <Link
          href={href}
          data-ask-point-list-watch=""
          aria-label={spoken}
          className="inline-flex items-center gap-1.5 rounded-sm font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
        >
          <Play className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {label}
        </Link>
        {meta.length > 0 && (
          <span data-ask-point-list-meta="" className="text-micro font-normal">
            {meta.join(" · ")}
          </span>
        )}
      </h3>
    </section>
  );
}
