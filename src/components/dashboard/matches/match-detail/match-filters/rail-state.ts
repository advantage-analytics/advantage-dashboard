/**
 * The filters rail's open/close state, as a pure reducer so a spec can hold
 * the selection model without React (`filter-rail.tsx` drives it).
 *
 * Three phases because the close animates: the rail's WIDTH runs
 * `roster-drawer-out` (the roster/schedule/matches drawer shell), and only
 * when that animation ends does the rail leave the DOM — `"closing"` is the
 * rail still drawn, shrinking.
 *
 *   toggle   the Filter button. Open → closing (re-click closes); closed or
 *            closing → open (a click mid-close reopens rather than waiting).
 *   close    Esc, Cancel, Apply. Only an open rail starts closing.
 *   closed   the width animation ended. Only a closing rail finishes.
 *   reset    the host view unmounted (a switch to another view): gone at
 *            once, no animation — there is nothing left for it to sit beside.
 */
export type FilterRailPhase = "closed" | "open" | "closing";
export type FilterRailAction = "toggle" | "close" | "closed" | "reset";

export function filterRailReducer(
  phase: FilterRailPhase,
  action: FilterRailAction,
): FilterRailPhase {
  switch (action) {
    case "toggle":
      return phase === "open" ? "closing" : "open";
    case "close":
      return phase === "open" ? "closing" : phase;
    case "closed":
      return phase === "closing" ? "closed" : phase;
    case "reset":
      return "closed";
  }
}

/** Whether Esc should close the rail: open, and nobody above it took the key. */
export function escClosesRail(
  phase: FilterRailPhase,
  event: Pick<KeyboardEvent, "key" | "defaultPrevented">,
): boolean {
  return phase === "open" && event.key === "Escape" && !event.defaultPrevented;
}

/**
 * The element the filters drawer portals into: `MatchReportFrame`, which is
 * `relative` and does not scroll. See `filter-rail.tsx`.
 */
export const MATCH_REPORT_FRAME_ID = "match-report-frame";
