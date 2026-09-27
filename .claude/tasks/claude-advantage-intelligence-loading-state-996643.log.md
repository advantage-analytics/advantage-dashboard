# Run log — claude/advantage-intelligence-loading-state-996643

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Render FocusCardPending in TeamHomeSkeleton instead of null insight — done

**gate:** mechanical GATE PASS (lint, typecheck, full Playwright suite); completion review VERDICT: pass (all five criteria met, no out-of-scope changes).
**changed:** `src/components/dashboard/loading/team-home-skeleton.tsx` — `FocusCardPending` added to the `./home-skeleton` import and `TeamHomeSkeleton`'s `insight={null}` replaced with `insight={<FocusCardPending />}`, so the `/dashboard/team` route-level loading page draws the Advantage Intelligence card in the rail (insight → court → history) instead of letting it pop in after its siblings. Widget-states check: loading ✓ fixed (route skeleton now matches the streamed region's fallback), empty ✓ unchanged (day zero via `TeamHomeDayZeroPage`, populated-empty via `FocusEmpty band`), error ✓ (`WidgetBoundary` wraps the region).
**follow-ups:**

1. The personal Home route skeleton (`HomePageSkeleton` in `loading/home-skeleton.tsx`) has the same omission — its rail draws only `ServePlacementSkeleton`, no Focus card. Separate branch per scope discipline.
