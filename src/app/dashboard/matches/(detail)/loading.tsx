/**
 * The match page's first loading state, at the route GROUP rather than inside
 * `[matchId]`, and deliberately neutral: page ground only, no rail, pane or
 * stepper shapes.
 *
 * A `loading.tsx` wraps its segment's page and every NESTED layout, but never
 * the layout beside it — so this is the nearest boundary above
 * `[matchId]/layout.tsx` (a skeleton inside `[matchId]` could not cover the
 * layout's wait, and without this group the matches LIST skeleton did).
 *
 * It now covers only the layout's status-hint query (`getMatchPageHint`), a
 * single cheap read. Once the hint lands, the layout streams its own
 * `<Suspense>` fallback — the Analysis steps skeleton or the report skeleton,
 * whichever the match will resolve to — over the long match load. Drawing
 * either shape here would guess before the hint exists, and a wrong guess
 * flashes one layout and then swaps to the other.
 */
import { PendingFrame } from "@/components/dashboard/loading/pending";

export default function Loading() {
  // The same fixed height as the layout's box, so the ground does not jump
  // when the layout's own fallback replaces it.
  return (
    <PendingFrame label="match" className="h-[calc(100vh-var(--header-h))]">
      {null}
    </PendingFrame>
  );
}
