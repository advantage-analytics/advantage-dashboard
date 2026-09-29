import { PendingBar, PendingFrame } from "./pending";

/**
 * The analysing match page's skeleton — `AnalysisStepsColumn`'s geometry
 * (`analysis-steps-column.tsx`): the same `mx-auto w-full max-w-[488px]`
 * column, a title bar, a match-line bar, then the vertical stepper's four
 * rows (`VerticalStep`'s `size-4 rounded-full` mark beside a label, spaced
 * `gap-3.5`).
 *
 * `PendingFrame` alone carries the page's one `role="status"` — nesting a
 * `PendingRegion` inside it would add a second. Everything visual lives in
 * `PendingFrame`'s own `aria-hidden` wrapper.
 *
 * `[matchId]/layout.tsx`'s `<Suspense>` fallback while the match loads, when
 * its status hint says the page will draw the Analysis steps. Kept free of
 * `next/navigation` so it renders offline in
 * `tests/analysis-steps-pending.spec.ts`.
 */
export function AnalysisStepsPending() {
  return (
    <PendingFrame label="analysis progress">
      <div className="mx-auto w-full max-w-[488px] px-6 pt-[clamp(64px,18vh,176px)]">
        <div className="flex flex-col gap-2">
          <PendingBar className="h-6 w-56" />
          <PendingBar className="h-4 w-40" />
        </div>
        <ol className="mt-9 flex flex-col gap-5">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className="flex items-center gap-3.5">
              <PendingBar className="size-4 rounded-full" />
              <PendingBar className="h-3 w-32" />
            </li>
          ))}
        </ol>
      </div>
    </PendingFrame>
  );
}
