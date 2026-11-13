"use client";

import Link from "next/link";
import {
  dayLabel,
  timeLabel,
  useIsClient,
} from "@/components/admin/admin-cells";
import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import { CopyButton } from "@/components/admin/matches/copy-button";
import { ResubmitButton } from "@/components/admin/matches/resubmit-button";
import {
  LABEL_INK,
  StepMark,
  type StepState,
} from "@/components/dashboard/shared/vertical-steps";
import { advButton } from "@/lib/ui/adv-button";
import { formatScoreText } from "@/lib/ui/score-format";
import { formatDuration } from "@/lib/format/duration";
import { cn } from "@/lib/utils";
import {
  ANALYSIS_LABEL,
  UPLOAD_PAUSED_LABEL,
  inFlightMark,
  isSubmitStalled,
  isUploadPaused,
} from "@/lib/data/match-analysis";
import {
  matchProgressSteps,
  type MatchProgressStep,
} from "@/lib/data/admin-match-progress";
import type { AdminMatchRow } from "@/lib/data/admin-matches-server";

/** The workspace's name as the drawer's sub-line says it. */
export function workspaceName(row: Pick<AdminMatchRow, "workspace">): string {
  return row.workspace.kind === "team" ? row.workspace.name : "Personal";
}

/** Hours of video, "1.40 h" — the pay report's two places; "—" for none. */
export function videoHoursLabel(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  return `${(seconds / 3600).toFixed(2)} h`;
}

/** "Won 6-3, 6-2 · UC Davis Men's Tennis" — or just the workspace, unscored. */
function subLine(row: AdminMatchRow): string {
  const where = workspaceName(row);
  if (row.sets.length === 0) return where;
  const result = row.won === true ? "Won " : row.won === false ? "Lost " : "";
  return `${result}${formatScoreText(row.sets)} · ${where}`;
}

/**
 * The job a Resubmit would retry: set only for a row in the `failed` bucket
 * that carries its failed job's id. The row and the side panel both ask this,
 * so the button is on the one exactly when it is on the other.
 */
export function resubmittableJobId(
  row: Pick<AdminMatchRow, "bucket" | "failedJobId">,
): string | null {
  return row.bucket === "failed" && row.failedJobId ? row.failedJobId : null;
}

/** The 30-day views sentence; "—" when the count is not measured. */
export function viewsSentence(views: number | null): string {
  if (views === null) return "—";
  if (views === 0) return "No views yet";
  return `${views.toLocaleString("en-US")} ${views === 1 ? "view" : "views"} in the last 30 days · admin views not counted`;
}

/**
 * Admin › Matches peek drawer (AdminMatches.dc.html's side panel): who played
 * whom, the result and the workspace, the progress steps
 * (`matchProgressSteps`), the match id with Copy, its 30-day views, and the
 * two ways on — the read-only report and the label console. The shared
 * `PeekDrawerFrame` draws the header (‹ › · counter · X), the width keyframe
 * and focus.
 */
export function MatchPeekDrawer({
  row,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  row: AdminMatchRow;
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const title = `${row.player} vs ${row.opponent}`;
  const failedJobId = resubmittableJobId(row);
  return (
    <PeekDrawerFrame
      kind="Match"
      label={title}
      index={index}
      total={total}
      canPrev={canPrev}
      canNext={canNext}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={row.id}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={`/admin/matches/${row.id}`} className={advButton()}>
            Open report
          </Link>
          {row.labelHref && (
            <Link
              href={row.labelHref}
              className="text-[13px] text-[var(--ink-700)] transition-colors duration-200 hover:text-[var(--ink-900)]"
            >
              Open in Labels
            </Link>
          )}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] pt-5 pb-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-[16px] leading-[1.35] font-medium text-[var(--ink-900)]">
            {title}
          </h2>
          <span className="text-[13px] text-[var(--ink-600)] tabular-nums">
            {subLine(row)}
          </span>
        </div>

        <MatchProgress row={row} />

        {failedJobId ? (
          // Keyed by the job: stepping to another failed match starts clean.
          <ResubmitButton key={failedJobId} jobId={failedJobId} />
        ) : null}

        <div className="flex items-center gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] py-1 pr-1 pl-3">
          <code
            aria-label="Match id"
            className="mono min-w-0 flex-1 text-[12px] break-all text-[var(--ink-900)]"
          >
            {row.id}
          </code>
          <CopyButton value={row.id} label="Copy match id" />
        </div>

        <p className="m-0 text-[13px] text-[var(--ink-700)]">
          {viewsSentence(row.views)}
        </p>
      </div>
    </PeekDrawerFrame>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────

const STEP_LINE = "text-[12px] leading-[18px]";

/** The step's state as the shared `StepMark` draws it. */
function stepMark(step: MatchProgressStep, row: AdminMatchRow): StepState {
  switch (step.state) {
    case "done":
      return "done";
    case "failed":
      return "fail";
    case "todo":
      return "later";
    case "current": {
      const { analysis } = row;
      if (step.name === "Uploaded") {
        return isUploadPaused(analysis) ? "wait" : "now";
      }
      // Not sent yet: nothing is running until the hand-off goes through.
      if (step.name === "Sent for analysis") return "wait";
      if (step.name === "Results landed") {
        return inFlightMark(analysis.status);
      }
      return "now";
    }
  }
}

/** "Tue 9:10 am"-style: the day label and the time, in the viewer's zone. */
function moment(at: string): string {
  const date = new Date(at);
  return `${dayLabel(date)} ${timeLabel(date)}`;
}

/**
 * The line under a step's name. Times only from what was recorded, and no
 * estimate of when a step ahead will happen — the DS bans invented ETAs.
 * A done step's time reads as the gap since the step before it ("4 min
 * later"); the first, and any step with no earlier time to count from, as
 * the moment itself.
 */
function stepSubLine(
  step: MatchProgressStep,
  previousAt: string | null,
  row: AdminMatchRow,
): string {
  const { analysis } = row;
  if (step.name === "Uploaded") {
    if (step.state === "current") {
      const percent = analysis.uploadPercent;
      const words = isUploadPaused(analysis)
        ? UPLOAD_PAUSED_LABEL
        : ANALYSIS_LABEL.uploading;
      return percent === undefined
        ? words
        : `${words} · ${Math.floor(percent)}%`;
    }
    const hours = videoHoursLabel(row.videoSeconds);
    return [
      step.at ? moment(step.at) : null,
      hours === "—" ? null : `${hours} of video`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  switch (step.state) {
    case "failed":
      return step.name === "Sent for analysis"
        ? "Did not reach Advantage Intelligence"
        : "Analysis failed";
    case "current":
      if (step.name === "Sent for analysis") {
        return isSubmitStalled(analysis) ? "Not sent" : "Waiting to send";
      }
      if (step.name === "Results landed")
        return ANALYSIS_LABEL[analysis.status];
      if (step.name === "Being labelled") return "In progress";
      return "";
    case "todo":
      return step.name === "Published"
        ? "The player sees it as verified from here"
        : "";
    case "done":
      break;
  }

  if (step.name === "Being labelled") {
    return row.labelState === "submitted" ? "Submitted for checking" : "";
  }
  if (!step.at) return "";
  // Published and Checked share one moment today; each states it outright.
  if (step.name === "Published" || step.name === "Checked") {
    return moment(step.at);
  }
  if (previousAt) {
    const gap = (Date.parse(step.at) - Date.parse(previousAt)) / 1000;
    if (gap >= 0) return `${formatDuration(gap)} later`;
  }
  return moment(step.at);
}

/** The side panel's Progress list: `matchProgressSteps(row)`, one row each. */
function MatchProgress({ row }: { row: AdminMatchRow }) {
  const isClient = useIsClient();
  const steps = matchProgressSteps(row);
  const lines = steps.map((step, i) => {
    if (!isClient) return "";
    // The latest recorded time among the done steps before this one.
    const previousAt =
      steps
        .slice(0, i)
        .filter((earlier) => earlier.state === "done" && earlier.at)
        .at(-1)?.at ?? null;
    return stepSubLine(step, previousAt, row);
  });

  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow leading-none">Progress</span>
      <ol className="flex flex-col" aria-label="Progress">
        {steps.map((step, i) => {
          const mark = stepMark(step, row);
          const last = i === steps.length - 1;
          return (
            <li
              key={step.name}
              className="flex gap-3"
              aria-current={step.state === "current" ? "step" : undefined}
            >
              <div className="flex w-4 shrink-0 flex-col items-center pt-px">
                <StepMark state={mark} />
                {!last && (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "my-1 w-px flex-1",
                      mark === "done"
                        ? "bg-[var(--ink-200)]"
                        : "bg-[var(--border-hairline)]",
                    )}
                  />
                )}
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-0.5",
                  !last && "pb-3",
                )}
              >
                <span
                  className={cn(
                    STEP_LINE,
                    step.state === "current" && "font-medium",
                  )}
                  style={{ color: LABEL_INK[mark] }}
                >
                  {step.name}
                </span>
                {lines[i] && (
                  <span
                    className={cn(
                      STEP_LINE,
                      "text-[var(--ink-600)] tabular-nums",
                    )}
                  >
                    {lines[i]}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
