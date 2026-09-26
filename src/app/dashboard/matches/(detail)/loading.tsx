/**
 * The match page's skeleton, at the route GROUP rather than inside `[matchId]`.
 *
 * A `loading.tsx` wraps its segment's page and every NESTED layout, but never
 * the layout beside it. `[matchId]/layout.tsx` awaits the whole match before it
 * renders, so a skeleton inside `[matchId]` could not cover that wait — the
 * nearest boundary above it did, and that was `matches/loading.tsx`: the
 * matches LIST skeleton. Every jump to a match (the upload wizard's View match
 * most visibly) flashed the list first. `(list)` and `(detail)` give each route
 * its own boundary without changing a URL.
 */
import { MatchReportSkeleton } from "@/components/dashboard/loading/match-report-skeleton";

export default function Loading() {
  // The rail-and-pane report the page resolves to, with the pane picked from
  // `?tab=` — the parts live in `loading/match-report-pending.tsx` so the two
  // code-split views can reuse them as their own chunk fallbacks.
  return <MatchReportSkeleton />;
}
