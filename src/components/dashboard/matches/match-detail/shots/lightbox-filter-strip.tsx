"use client";

import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { draftCountLine } from "../match-filters/panel-draft";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/* ── Applied strip ─────────────────────────────────────────────────────── */

/**
 * The applied strip under the court's control row (DS Data Table rule 6, a
 * copy of the Video tab's `FilmFilterStrip`): the filter glyph, the cut as
 * one sentence of capitalised phrases joined by middots ("Aces · To the T"),
 * "N of M points", and one quiet action — "Back to all points" when a
 * Statistics row is the only cut, "Clear filter" otherwise. Never chips.
 */
interface FilterStripProps {
  phrases: string[];
  /** "N of M points" — omitted by a host with no points to count. */
  shown?: number;
  total?: number;
  statOnly: boolean;
  onClear: () => void;
}

/**
 * The strip unfolding into the court column instead of popping in (and
 * folding away instead of vanishing): `grid-template-rows: 0fr → 1fr`, the
 * same unfold as the film room's shot well, with the column's 12px gap
 * folded into a −12px margin while closed (globals.css
 * `.viz-filter-strip-reveal`). The stage below is `flex-1`, so it shrinks
 * on every frame of the unfold and the court re-fits with it
 * (`usePanZoom`'s resize path) — the court eases down rather than jumping
 * 49px in one frame.
 *
 * The strip keeps its last words while it folds away, and lets them go when
 * the fold ends (at once under reduced motion, where nothing transitions).
 * A strip already open on the first render (a link with filters) is simply
 * open: nothing transitions from a first style.
 */
export function LightboxFilterStrip(props: FilterStripProps) {
  const open = props.phrases.length > 0;
  const reduced = usePrefersReducedMotion();
  const [kept, setKept] = useState<FilterStripProps | null>(
    open ? props : null,
  );
  // Derived during render (React's "storing information from previous
  // renders"): the newest open strip is the one to fold away.
  if (open && !sameStrip(kept, props)) setKept(props);
  if (!open && kept !== null && reduced) setKept(null);
  const body = open ? props : kept;
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
      data-viz-filter-strip-reveal=""
      data-open={open || undefined}
      // Only while it folds away: its Clear button is still drawn then,
      // and must not take focus or a click on its way out.
      inert={folding}
      className="viz-filter-strip-reveal"
    >
      <div className="min-h-0 overflow-hidden">
        {body !== null && body.phrases.length > 0 && (
          <FilterStripBody {...body} onClear={props.onClear} />
        )}
      </div>
    </div>
  );
}

/** The fold's own length (globals.css `.viz-filter-strip-reveal`). */
const STRIP_FOLD_MS = 250;

function sameStrip(a: FilterStripProps | null, b: FilterStripProps): boolean {
  return (
    a !== null &&
    a.shown === b.shown &&
    a.total === b.total &&
    a.statOnly === b.statOnly &&
    a.phrases.length === b.phrases.length &&
    a.phrases.every((p, i) => p === b.phrases[i])
  );
}

function FilterStripBody({
  phrases,
  shown,
  total,
  statOnly,
  onClear,
}: FilterStripProps) {
  const sentence = phrases
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" · ");
  return (
    <div
      role="status"
      data-viz-filter-strip=""
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-[var(--radius-element)] px-3.5 py-2.5"
      style={{ background: "var(--surface-subtle)" }}
    >
      <Filter
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--ink-500)" }}
        aria-hidden="true"
      />
      <span className="text-[11px]" style={{ color: "var(--ink-700)" }}>
        {sentence}
      </span>
      {shown !== undefined && total !== undefined && (
        <>
          <span
            className="size-[3px] rounded-full"
            style={{ background: "var(--ink-300)" }}
            aria-hidden="true"
          />
          <span className="text-micro tabular">
            {draftCountLine(shown, total)}
          </span>
        </>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer rounded-[var(--radius-element)] text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {statOnly ? "Back to all points" : "Clear filter"}
      </button>
    </div>
  );
}
