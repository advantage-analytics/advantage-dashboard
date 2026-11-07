import { track } from "@/lib/analytics";
import type { OpponentCut, OpponentFilters } from "./opponents-views";

/**
 * `filter_changed` for the Opponents page: one event per facet that moved
 * between two cuts. Checklist facets (programs, faced-by players) send how
 * many are ticked rather than which — the event says a filter was used, not
 * whom it picked.
 */
export function trackOpponentCutChange(
  view: "opponents_personal" | "opponents_team",
  prev: OpponentCut,
  next: OpponentCut,
): void {
  if (prev.view !== next.view) {
    track("filter_changed", { view, filter_name: "view", value: next.view });
  }
  if (prev.sort !== next.sort) {
    track("filter_changed", { view, filter_name: "sort", value: next.sort });
  }
  const facets: (keyof OpponentFilters)[] = [
    "hand",
    "backhand",
    "programs",
    "facedBy",
  ];
  for (const facet of facets) {
    const before = prev.filters[facet];
    const after = next.filters[facet];
    if (Array.isArray(before) && Array.isArray(after)) {
      if (
        before.length === after.length &&
        before.every((value, i) => value === after[i])
      ) {
        continue;
      }
      track("filter_changed", {
        view,
        filter_name: facet,
        value: String(after.length),
      });
    } else if (before !== after) {
      track("filter_changed", {
        view,
        filter_name: facet,
        value: after == null ? "any" : String(after),
      });
    }
  }
}
