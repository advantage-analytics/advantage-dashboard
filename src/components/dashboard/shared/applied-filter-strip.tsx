"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Filter } from "lucide-react";

import { usePrefersReducedMotion } from "@/components/dashboard/matches/match-detail/shots/use-reduced-motion";

/**
 * The applied-filter strip (v3's Data Table rule 6) for a list page: the cut
 * stated in words — never chips, never a badge — a middot, the count, and
 * one quiet action. The Matches page and the match report's Video tab draw
 * it; the Visualizations lightbox keeps its own copy
 * (`shots/lightbox-filter-strip.tsx`), which this mirrors.
 *
 * It unfolds into its column rather than popping in, and folds away rather
 * than vanishing (globals.css `.filter-strip-reveal`): whatever sits below
 * eases down by the strip's height instead of jumping the moment a filter
 * lands. The host's flex gap is folded into a negative margin while shut —
 * pass the gap the strip sits in — so the column opens by the strip AND its
 * gap together.
 *
 * The words it last showed stay through the fold and go when it ends (at
 * once under reduced motion, where nothing transitions). A strip already
 * open on the first render (a link with filters) is simply open: nothing
 * transitions from a first style.
 *
 * No `next/navigation` here — the Video tab's offline spec loads its strip
 * through `createLoader()`.
 */
export interface AppliedFilterStripProps {
  /** The cut in words, or null while nothing is applied (the strip folds). */
  sentence: string | null;
  /** "N of M points", "4 of 12". */
  count: string;
  /** The one quiet action's label — "Clear filter", "Back to all points". */
  action: string;
  onClear: () => void;
  /** The host column's flex gap, in px, folded away while the strip is shut. */
  gap: number;
  /**
   * Names the strip for specs and styles: `kind="film"` puts
   * `data-film-filter-strip` on it.
   */
  kind: string;
}

interface StripWords {
  sentence: string;
  count: string;
  action: string;
}

/** The fold's own length (globals.css `.filter-strip-reveal`). */
const STRIP_FOLD_MS = 250;

export function AppliedFilterStrip({
  sentence,
  count,
  action,
  onClear,
  gap,
  kind,
}: AppliedFilterStripProps) {
  const open = sentence !== null;
  const reduced = usePrefersReducedMotion();
  const [kept, setKept] = useState<StripWords | null>(
    open ? { sentence, count, action } : null,
  );
  // Derived during render (React's "storing information from previous
  // renders"): the newest open strip is the one to fold away. Compared by
  // its words, so a host re-rendering for other reasons sets nothing.
  if (
    open &&
    (kept === null ||
      kept.sentence !== sentence ||
      kept.count !== count ||
      kept.action !== action)
  ) {
    setKept({ sentence, count, action });
  }
  if (!open && kept !== null && reduced) setKept(null);
  const words = open ? { sentence, count, action } : kept;
  // Let the words go once the fold is over. A timer rather than
  // `transitionend`, which never fires for a fold that is interrupted or
  // turned round (a filter cleared and set again mid-way).
  const folding = !open && kept !== null;
  useEffect(() => {
    if (!folding) return;
    const timer = window.setTimeout(() => setKept(null), STRIP_FOLD_MS);
    return () => window.clearTimeout(timer);
  }, [folding]);

  return (
    <div
      data-filter-strip-reveal=""
      data-open={open || undefined}
      // Only while it folds away: its action is still drawn then, and must
      // not take focus or a click on its way out.
      inert={folding}
      className="filter-strip-reveal shrink-0"
      style={{ "--filter-strip-gap": `${gap}px` } as CSSProperties}
    >
      <div className="min-h-0 overflow-hidden">
        {words !== null && (
          <div
            role="status"
            {...{ [`data-${kind}-filter-strip`]: "" }}
            className="flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
            style={{ background: "var(--surface-subtle)" }}
          >
            <Filter
              className="size-[13px] shrink-0"
              strokeWidth={1.5}
              style={{ color: "var(--ink-500)" }}
              aria-hidden="true"
            />
            <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
              {words.sentence}
            </span>
            <span
              className="size-[3px] rounded-full"
              style={{ background: "var(--ink-300)" }}
              aria-hidden="true"
            />
            <span className="text-micro tabular">{words.count}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer rounded-[var(--radius-element)] text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              {words.action}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
