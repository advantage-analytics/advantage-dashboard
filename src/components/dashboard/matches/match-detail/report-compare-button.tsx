"use client";

import { SlidersHorizontal } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";

/**
 * Compare, in the title row's action cluster (design 04 F6).
 *
 * A scope control, so it is drawn only once there is something to compare
 * against — `meta.canCompare`, a second analysed match — and is absent, never
 * greyed, before that (F5; spec › Decisions 3).
 *
 * No compare feature exists yet, so the control is inert: `aria-disabled` at
 * the frame's full strength, with the tooltip saying why. `aria-disabled`
 * rather than `disabled`, as `InertGlyph` in `film/film-player.tsx` does it —
 * a disabled button swallows the pointer events the tooltip opens on, and
 * drops out of the tab order, so a keyboard user could never reach the
 * explanation. It stays focusable; a click, Enter or Space does nothing.
 *
 * No focus classes: it is a `<button>`, and `focus.css` rings buttons.
 */
export function MatchReportCompareButton() {
  const { meta } = useMatchReport();
  if (!meta.canCompare) return null;

  return (
    <ChromeTooltip label="Comparing matches isn't available yet">
      <button
        type="button"
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
        className="inline-flex h-8 items-center gap-[7px] rounded-[var(--radius-button)] px-3 text-[12px] font-medium text-[var(--ink-700)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
      >
        <SlidersHorizontal
          className="size-3.5 shrink-0 text-[var(--ink-500)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        Compare
      </button>
    </ChromeTooltip>
  );
}
