"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Filter } from "lucide-react";

import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * The applied-filter strip (v3's Data Table rule 6): the cut stated in
 * words — never chips, never a badge — a middot, the count, and one quiet
 * action. The ONE strip in the dashboard: the Matches page, both Opponents
 * pages, the Schedule, the match report's Video tab and the Visualizations
 * lightbox (match and season) all draw this, through a thin wrapper that
 * words their own cut. Do not hand-copy the markup again.
 *
 * It unfolds into its column rather than popping in, and folds away rather
 * than vanishing, the way the roster's "Not in the lineup" divider comes and
 * goes (globals.css `.filter-strip-reveal`): whatever sits below
 * eases down by the strip's height instead of jumping the moment a filter
 * lands. The host's flex gap is folded into a negative margin while shut —
 * pass the gap the strip sits in — so the column opens by the strip AND its
 * gap together. Outside production the strip reads its parent's computed
 * row gap once and warns when the two disagree, since a mismatch only ever
 * shows as a few pixels' offset.
 *
 * The words it last showed stay through the fold and go when it ends. Under
 * reduced motion it snaps open with a short fade and shuts at once. A strip
 * already open on the first render (a link with filters) is simply open:
 * nothing transitions from a first style.
 *
 * The wrapper is the `role="status"` region, and it is always mounted, so a
 * cut landing is announced (a live region that mounts already holding its
 * words usually is not). The action folds the strip, which goes `inert` on
 * its way out; when focus was on it, it moves to the control that set the
 * filter rather than falling to <body>. A host names that control with
 * `focusAfterClear` (the Video tab's point-list trigger sits AFTER its
 * strip); otherwise it is the last Tab stop before the strip, which on
 * every list page is the toolbar.
 *
 * No `next/navigation` here — the Video tab's offline spec loads its strip
 * through `createLoader()`.
 */
export interface AppliedFilterStripProps {
  /** The cut in words, or null while nothing is applied (the strip folds). */
  sentence: string | null;
  /** "N of M points", "4 of 12" — or null for a host with nothing to count
   *  (the Visualizations lightbox on a draft chart): no middot, no count. */
  count: string | null;
  /** The one quiet action's label — "Clear filter", "Back to all points". */
  action: string;
  onClear: () => void;
  /**
   * Moves focus to the control that set the filter, after a clear made from
   * the strip with focus on it. Returns whether it did; when it did not (or
   * is absent), focus goes to the last Tab stop before the strip.
   */
  focusAfterClear?: () => boolean;
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
  count: string | null;
  action: string;
}

/** The fold's own length — the faster exit (globals.css `.filter-strip-reveal`). */
const STRIP_FOLD_MS = 160;

/** Tab stops only: every clause drops `tabindex="-1"`, which a roving
 *  group's unselected items and programmatic-only targets carry. */
const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
]
  .map((clause) => `${clause}:not([tabindex="-1"])`)
  .join(", ");

/** Focus the last visible, live Tab stop that comes before `el` in the page. */
function focusControlBefore(el: Element): void {
  const controls = document.querySelectorAll<HTMLElement>(TABBABLE);
  for (let i = controls.length - 1; i >= 0; i--) {
    const control = controls[i];
    if (el.contains(control)) continue;
    if (
      !(control.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    )
      continue;
    if (control.closest("[inert]") || control.getClientRects().length === 0)
      continue;
    control.focus({ preventScroll: true });
    return;
  }
}

export function AppliedFilterStrip({
  sentence,
  count,
  action,
  onClear,
  focusAfterClear,
  gap,
  kind,
}: AppliedFilterStripProps) {
  const open = sentence !== null;
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
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

  // Outside production: the margin the strip folds away must be the gap its
  // column really has, or the page sits a few pixels off with nothing shut.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const actual = parseFloat(getComputedStyle(parent).rowGap);
    if (Number.isFinite(actual) && actual !== gap) {
      console.warn(
        `AppliedFilterStrip (${kind}): gap={${gap}} but its column's row gap is ${actual}px — pass the column's gap.`,
      );
    }
  }, [gap, kind]);

  const clear = () => {
    const strip = ref.current;
    const hadFocus = strip?.contains(document.activeElement) ?? false;
    onClear();
    if (!strip || !hadFocus) return;
    if (!focusAfterClear?.()) focusControlBefore(strip);
  };

  return (
    <div
      ref={ref}
      role="status"
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
            {words.count !== null && (
              <>
                <span
                  className="size-[3px] rounded-full"
                  style={{ background: "var(--ink-300)" }}
                  aria-hidden="true"
                />
                <span className="text-micro tabular">{words.count}</span>
              </>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={clear}
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
