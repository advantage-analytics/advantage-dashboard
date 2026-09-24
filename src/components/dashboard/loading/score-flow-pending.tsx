import { Calendar, ChevronRight } from "lucide-react";
import { FieldCaption } from "@/components/dashboard/matches/new-match-wizard/FieldCaption";
import { StepIndicator } from "@/components/dashboard/matches/new-match-wizard/StepIndicator";
import {
  SCORE_FLOW_CONTENT_CLS as CONTENT_CLS,
  SCORE_FLOW_TITLE,
} from "@/components/dashboard/schedule/score-flow-copy";
import { PendingBar, PendingFrame } from "./pending";

/**
 * `/dashboard/team/schedule/[eventId]/score` while the event is read — the
 * Add result page, drawn in `ScoreOnlyFlow`'s own geometry so nothing moves
 * when it lands.
 *
 * Top to bottom, lifted from the real components: the full-bleed one-step
 * `StepIndicator`; `PinnedLineBar`'s 36px strip (event link · chevron ·
 * "player vs opponent" · rule · date, Change on the right); the 832px column
 * at `pt-16 pb-10` with the eyebrow, the title and the lede; `ScoreBlock` —
 * the "Score" caption and format, the set numbers, two side rows of 40px
 * cells, the hint — and the "Didn't finish?" line under it; then the sticky
 * 64px footer: Cancel, the status slot, the primary.
 *
 * Known chrome renders as itself and holds still: the title is the page's own
 * constant, the Score caption and the bar's chevron and calendar are always
 * drawn. "Line n of N", the lede's dual-vs-tournament noun, the names, the
 * date and the set count cannot be known in `loading.tsx`, so they are bars.
 * The tournament's Round menu and the "Upload it instead" line depend on the
 * event too, and are left out rather than guessed.
 *
 * `pulse={false}`: each bar pulses by itself, so the real title does not.
 * The pinned strip's bars take `--ink-200`, as `EditEventPending`'s do — the
 * skeleton token is `--ink-100`, which vanishes on `--surface-subtle`. Nothing
 * here is focusable: a Cancel that can be tabbed to lies about the page.
 */
export function ScoreFlowPending() {
  return (
    <PendingFrame label="result form" pulse={false}>
      <div className="flex min-h-[calc(100vh-44px)] flex-col">
        <StepIndicator currentStep={0} totalSteps={1} />

        <PinnedLinePending />

        {/* Eyebrow, title, lede */}
        <div className={`${CONTENT_CLS} pt-16 pb-10`}>
          <div className="flex flex-col gap-3">
            <span className="flex h-[15px] items-center">
              <PendingBar className="h-2 w-20" />
            </span>
            <h1
              className="max-w-[560px] text-[30px] leading-[1.15] font-light tracking-[-0.3px] text-[var(--ink-900)]"
              style={{ textWrap: "pretty" }}
            >
              {SCORE_FLOW_TITLE}
            </h1>
            <span className="flex h-5 items-center">
              <PendingBar className="h-3 w-[440px]" />
            </span>
          </div>
        </div>

        {/* ScoreForm body: ScoreBlock, then the ending line */}
        <div className={`${CONTENT_CLS} flex flex-col gap-9 pb-16`}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center gap-3">
                <FieldCaption label="Score" required />
                <span className="flex-1" />
                <PendingBar className="h-3 w-28" />
              </div>
              <div className="flex justify-end gap-3 pr-0.5">
                {[0, 1].map((set) => (
                  <span key={set} className="flex w-10 justify-center">
                    <PendingBar className="h-2 w-2" />
                  </span>
                ))}
              </div>
              {["w-40", "w-36"].map((name) => (
                <div key={name} className="flex items-center gap-4">
                  <span className="flex min-w-0 flex-1">
                    <PendingBar className={`h-3.5 ${name}`} />
                  </span>
                  <span className="flex gap-3">
                    {[0, 1].map((set) => (
                      <PendingBar
                        key={set}
                        className="h-10 w-10 rounded-[var(--radius-cell)]"
                      />
                    ))}
                  </span>
                </div>
              ))}
              <span className="flex h-4 items-center pt-0.5">
                <PendingBar className="h-2.5 w-72" />
              </span>
            </div>

            <span className="flex h-[18px] items-center">
              <PendingBar className="h-3 w-48" />
            </span>
          </div>
        </div>

        {/* Footer: Cancel · status slot · primary */}
        <div className="sticky bottom-0 mt-auto border-t border-[var(--border-hairline)] bg-white">
          <div className={`${CONTENT_CLS} flex h-16 items-center gap-4`}>
            <PendingBar className="h-3 w-11" />
            <PendingBar className="h-2.5 w-40" />
            <div className="flex-1" />
            <PendingBar className="h-9 w-[140px] rounded-[6px]" />
          </div>
        </div>
      </div>
    </PendingFrame>
  );
}

/**
 * `PinnedLineBar`'s 36px strip, pending: the event link · chevron · "player vs
 * opponent" · rule · date, Change on the right. Its own export because two
 * skeletons draw it — this page's and the upload wizard's
 * (`upload-wizard-pending.tsx`), which a lineup slot opens with the same bar.
 *
 * The bars take `--ink-200`: the skeleton token is `--ink-100`, which vanishes
 * on the strip's `--surface-subtle`.
 */
export function PinnedLinePending() {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]">
      <PendingBar className="h-2.5 w-14 bg-[var(--ink-200)]" />
      <ChevronRight
        className="size-3 shrink-0 text-[var(--ink-300)]"
        strokeWidth={1.5}
      />
      <PendingBar className="h-3 w-48 bg-[var(--ink-200)]" />
      <span className="mx-2 h-3.5 w-px shrink-0 bg-[var(--border-medium)]" />
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <Calendar
          className="size-[13px] text-[var(--ink-400)]"
          strokeWidth={1.5}
        />
        <PendingBar className="h-2.5 w-14 bg-[var(--ink-200)]" />
      </span>
      <span className="flex-1" />
      <span className="inline-flex h-[22px] items-center px-2">
        <PendingBar className="h-2.5 w-11 bg-[var(--ink-200)]" />
      </span>
    </div>
  );
}
