"use client";

/**
 * MatchVideoAttachmentFlow — the SwingVision video attachment wizard.
 *
 * Add and replace ask two questions (which recording, then where the first
 * point is); adjust asks the one that changed. All three run inside the
 * EXISTING `WizardShell` — the same full-bleed step bar, the same 832px column
 * with its "Step N of M" eyebrow, the same sticky 64px footer — because this is
 * the same kind of task as creating a match, and a second wizard chrome beside
 * the first is how two flows start disagreeing about where Back lives. The
 * shell is used exactly as `UploadMatchFlow` uses it and is not modified:
 * everything different here arrives through its existing slots.
 *
 * What is pinned under the step bar is the MATCH, not a lineup line. The whole
 * premise of this flow is that the match already exists and its statistics are
 * already imported; the bar is what stops "add video" from reading like "add
 * match". It also means there is no re-entry through the match detail page —
 * this page carries its own subject.
 *
 * **This flow creates nothing.** No match, no draft, no processing job, no
 * analysis hook and no analysis quota. See `use-attachment-flow.ts`, which owns
 * every request this page can make, and the flow spec, which asserts the whole
 * set from a real browser.
 *
 * **Where it returns to is injectable.** `onSaved` is called once — with a
 * published attachment, after the result is known — and the caller decides what
 * that means. T21/T22 own the verified Film selection contract; a route
 * hard-coded here would be wrong the day it lands.
 *
 * **Widget states.** The two steps own their own four states and draw in all of
 * them. This component adds the commit's states. An upload that is running, and
 * one that has been published, leave the wizard altogether for
 * `AttachmentUploadStatus` ("Uploading your video" → "Video saved"), the same
 * screen shape the new-match wizard finishes on; an adjust's single PATCH stays
 * in the shell as an indeterminate strip, then settles on the same "saved"
 * screen. `failed` is a `role="alert"` strip whose retry is the footer's own
 * primary, and a cancel returns to the step exactly as it was. There is no data
 * loader, no Suspense region and no `return null` anywhere: a mode opened
 * without the attachment it requires draws the shell and says so.
 *
 * **Leaving cancels.** The transfer belongs to this component — unmounting it
 * mid-upload aborts the attempt — so the leave guard is armed for as long as a
 * commit is running (trimming, uploading, publishing) and released the moment
 * it is saved, failed or cancelled.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TriangleAlert, Info, Loader2, XCircle } from "lucide-react";

import { useLeaveGuard } from "@/components/dashboard/leave-guard-context";
import type { SourcePoint, SourceShot } from "@/lib/match-video/alignment";
import {
  modeUploadsFile,
  type ActiveAttachment,
  type MatchVideoMode,
} from "@/lib/match-video/types";
import {
  noteIconCls,
  noteStripCls,
  warningStripCls,
} from "../new-match-wizard/styles";
import { useWizardKeys } from "../new-match-wizard/useWizardKeys";
import { WizardShell } from "../new-match-wizard/WizardShell";
import { AttachmentAlignmentStep } from "./AttachmentAlignmentStep";
import { AttachmentUploadStatus } from "./AttachmentUploadStatus";
import { AttachmentFileStep } from "./AttachmentFileStep";
import {
  useAttachmentAlignment,
  type AlignmentSource,
} from "./use-attachment-alignment";
import {
  useAttachmentFlow,
  type AttachmentFlowApi,
  type UseAttachmentFlowOptions,
} from "./use-attachment-flow";

/* -------------------------------------------------------------------------
 * Props
 * ---------------------------------------------------------------------- */

/** Enough of the match to pin it. Loaded by the route (T21), never here. */
export interface AttachmentMatchSummary {
  playerName: string;
  opponentName: string | null;
  /** `YYYY-MM-DD`. */
  date: string;
  /** The event or tournament this match belongs to, when it has one. */
  eventName?: string | null;
  /** The score, already formatted. Shown as a fact, never re-derived here. */
  score?: string | null;
}

export interface MatchVideoAttachmentFlowProps {
  matchId: string;
  mode: MatchVideoMode;
  match: AttachmentMatchSummary;
  /** Imported rows; the first by `point_number` is the alignment anchor. */
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
  /** Required by `replace` and `align`; `null` on a first add. */
  activeAttachment: ActiveAttachment | null;
  /**
   * A read-only URL for the published file, in `align` mode only.
   *
   * Short-lived by construction (`GET .../video` mints it), and this flow never
   * refreshes it: a correction is minutes of scrubbing, not hours. When it is
   * missing the step says the video could not be opened rather than drawing a
   * player that will never load.
   */
  savedPlaybackUrl?: string | null;
  /**
   * The match's Film view: where Cancel and "Back to the match" go, and where
   * "Watch the film" goes once the video is saved. Injected rather than
   * derived — built once on the server by `matchFilmHref()`.
   */
  returnTarget: { href: string; label?: string };
  /**
   * Fired once, with a published attachment. Navigates nowhere: the saved
   * screen offers the way out, and the person takes it.
   */
  onSaved?: (attachment: ActiveAttachment) => void;
  /** Test seam. Production passes nothing. */
  deps?: UseAttachmentFlowOptions["deps"];
}

/* -------------------------------------------------------------------------
 * Copy
 * ---------------------------------------------------------------------- */

/** The one-step trim screen's body, shared by add and replace. */
const TRIM_DESCRIPTION =
  "Scrub to the serve of the first point. The cut is set around the match for you: from just before that serve to just after SwingVision's last point. Adjust either end if you need to.";

const TITLES: Record<MatchVideoMode, { file: string; align: string }> = {
  add: {
    file: "Add the match video",
    align: "Mark the first point",
  },
  replace: {
    file: "Replace the match video",
    align: "Mark the first point",
  },
  align: {
    file: "",
    align: "Adjust the first point",
  },
};

const DESCRIPTIONS: Record<MatchVideoMode, { file: string; align: string }> = {
  add: {
    file: "Your own recording of this match, played back beside the statistics SwingVision already imported. It is not sent for analysis and costs none of your video hours.",
    align: TRIM_DESCRIPTION,
  },
  replace: {
    file: "The video on this match stays exactly as it is until the new one is published. Nothing is deleted first.",
    align: TRIM_DESCRIPTION,
  },
  align: {
    file: "",
    align:
      "The video stays exactly as it is. Only the position of the first point changes, and every point in the film room moves with it.",
  },
};

/* -------------------------------------------------------------------------
 * The pinned match
 * ---------------------------------------------------------------------- */

function formatDayShort(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * The match this video belongs to, pinned under the step bar.
 *
 * Deliberately the same 36px bar as the new-match wizard's `PinnedLineBar` —
 * surface-subtle on a hairline, 12px players, 11px ink-600 facts — and
 * deliberately without its Change menu: there is nothing to switch to. The
 * subject of this flow was decided before the page opened.
 */
function PinnedMatchBar({ match }: { match: AttachmentMatchSummary }) {
  return (
    <div
      data-testid="attachment-pinned-match"
      className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]"
    >
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
        <span className="font-medium">{match.playerName}</span> vs{" "}
        {match.opponentName || "—"}
      </span>
      <span
        className="mx-2 h-3.5 w-px shrink-0 bg-[var(--border-medium)]"
        aria-hidden="true"
      />
      {match.eventName && (
        <span className="hidden shrink-0 truncate text-[11px] text-[var(--ink-600)] sm:inline">
          {match.eventName}
        </span>
      )}
      <span className="shrink-0 text-[11px] text-[var(--ink-600)]">
        {formatDayShort(match.date)}
      </span>
      {match.score && (
        <span className="mono tabular shrink-0 text-[11px] text-[var(--ink-600)]">
          {match.score}
        </span>
      )}
      <span className="flex-1" />
      <span className="shrink-0 text-[11px] text-[var(--ink-400)]">
        Existing match
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The alignment stage
 * ---------------------------------------------------------------------- */

/**
 * The alignment step plus the two things the flow has to keep for it.
 *
 * It is a child rather than inline because `WizardShell` remounts its content
 * on a step change (that is what replays the fade), and the alignment hook's
 * state would go with it. The confirmed text therefore lives one level up and
 * is restored here on mount: stepping back to check a filename must not throw
 * away a position somebody scrubbed for, and the hook's own reset — which fires
 * when the SOURCE changes — is the case where losing it is correct. The kept
 * window is restored the same way, and only for add and replace: an adjust
 * has no file to cut, so it is never handed the trim options at all.
 */
function AlignmentStage({
  flow,
  mode,
  source,
  points,
  shots,
  declaredDurationSeconds,
  savedConfirmedSeconds,
}: {
  flow: AttachmentFlowApi;
  mode: MatchVideoMode;
  source: AlignmentSource;
  points: readonly SourcePoint[];
  shots: readonly SourceShot[];
  declaredDurationSeconds?: number;
  savedConfirmedSeconds: number | null;
}) {
  const { setAlignment, setConfirmedText, setTrim, trimWindowFor } = flow;
  // Read once, on mount — the hook owns the window from then on.
  const [initialTrim] = useState(() => flow.trim);
  const trim = useMemo(
    () =>
      modeUploadsFile(mode)
        ? {
            defaultWindow: trimWindowFor,
            initial: initialTrim,
            onChange: setTrim,
          }
        : undefined,
    [initialTrim, mode, setTrim, trimWindowFor],
  );
  const api = useAttachmentAlignment({
    source,
    points,
    shots,
    declaredDurationSeconds,
    savedConfirmedSeconds,
    onAlignmentChange: setAlignment,
    trim,
  });

  const restore = useRef(flow.confirmedText);
  const setTime = api.setConfirmedTime;
  useEffect(() => {
    const text = restore.current;
    if (text) setTime(text);
  }, [setTime]);

  const text = api.confirmedTime;
  useEffect(() => {
    setConfirmedText(text);
  }, [setConfirmedText, text]);

  return <AttachmentAlignmentStep api={api} mode={mode} />;
}

/* -------------------------------------------------------------------------
 * Commit states
 * ---------------------------------------------------------------------- */

/**
 * An adjust's save: one PATCH, nothing measurable, so no number.
 *
 * Uploads never draw this — they leave the shell for `AttachmentUploadStatus`
 * the moment the commit starts.
 */
function SavingStrip({ label }: { label: string }) {
  return (
    <div
      className={`${noteStripCls} flex-col gap-2.5`}
      role="status"
      data-testid="attachment-saving"
      data-phase="aligning"
    >
      <span className="flex w-full items-center gap-2">
        <Loader2
          className={`${noteIconCls} animate-spin text-[var(--ink-400)]`}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="flex-1">
          <b className="font-medium text-[var(--ink-900)]">{label}</b>
        </span>
      </span>
      <span
        className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--ink-100)]"
        aria-hidden="true"
      >
        <span className="block h-full w-full rounded-full bg-[var(--blue)] motion-safe:animate-pulse" />
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The flow
 * ---------------------------------------------------------------------- */

export function MatchVideoAttachmentFlow({
  matchId,
  mode,
  match,
  points,
  shots,
  activeAttachment,
  savedPlaybackUrl,
  returnTarget,
  onSaved,
  deps,
}: MatchVideoAttachmentFlowProps) {
  const flow = useAttachmentFlow({
    matchId,
    mode,
    activeAttachment,
    points,
    shots,
    onSaved,
    deps,
  });
  const { step, steps, save, isBusy } = flow;
  const uploadsFile = modeUploadsFile(mode);

  // Armed from the moment the commit starts until it is saved, failed or
  // cancelled — each of which returns `save` to a non-saving status.
  useLeaveGuard(save.status === "saving");

  const contentRef = useRef<HTMLDivElement | null>(null);

  const canGoBack = uploadsFile && step === "align" && !isBusy;
  useWizardKeys({
    contentRef,
    canGoBack,
    onBack: flow.goBack,
    continueDisabled: !flow.canContinue,
    onContinue: flow.goNext,
  });

  /**
   * What the mode needs but was not given.
   *
   * A replace or an adjust without an active attachment, or an adjust with no
   * playback URL, is a routing mistake or a video that vanished between the
   * page loading and now. Either way it is stated on the page rather than
   * swallowed — and this is deliberately NOT an invitation to add one, because
   * the one thing worse than a refusal here is a second attachment created by
   * accident.
   */
  const blocked: string | null = useMemo(() => {
    if (mode !== "add" && !activeAttachment) {
      return mode === "align"
        ? "This match has no video to adjust. It may have been replaced or removed in another tab — reload to see where it stands."
        : "This match has no video to replace. Reload the match to see where it stands.";
    }
    if (mode === "align" && !savedPlaybackUrl) {
      return "The saved video could not be opened right now. Video storage may be unavailable — reload in a moment and try again.";
    }
    return null;
  }, [activeAttachment, mode, savedPlaybackUrl]);

  const source: AlignmentSource | null = useMemo(() => {
    if (mode === "align") {
      return savedPlaybackUrl ? { kind: "saved", url: savedPlaybackUrl } : null;
    }
    return flow.selection ? { kind: "local", file: flow.selection.file } : null;
  }, [flow.selection, mode, savedPlaybackUrl]);

  const continueLabel: ReactNode =
    step === "file"
      ? "Continue"
      : save.status === "failed"
        ? "Try again"
        : uploadsFile
          ? "Trim and upload"
          : "Save the alignment";

  const status: ReactNode =
    save.status === "saving" ? (
      <span className="text-[11px] text-[var(--ink-500)]">{save.label}</span>
    ) : save.status === "failed" ? (
      <span className="text-[11px] text-[var(--error)]">Not saved</span>
    ) : null;

  // A running upload, and any saved commit, leave the wizard: the steps are
  // answered, and what is left is progress and a way out.
  if (
    save.status === "saved" ||
    (save.status === "saving" && save.phase !== "aligning")
  ) {
    return (
      <AttachmentUploadStatus
        match={match}
        save={save}
        uploadsFile={uploadsFile}
        returnTarget={returnTarget}
        onCancel={flow.cancel}
      />
    );
  }

  return (
    <WizardShell
      stepIndex={flow.stepIndex}
      stepCount={steps.length}
      title={TITLES[mode][step]}
      description={DESCRIPTIONS[mode][step]}
      pinned={<PinnedMatchBar match={match} />}
      contentRef={contentRef}
      contentKey={step}
      contentClassName="mt-[52px]"
      back={canGoBack ? flow.goBack : undefined}
      /* While the bytes are moving, the footer's exits are gone on purpose:
         leaving is cancelling, and cancelling has its own named button. */
      cancelHref={!canGoBack && !isBusy ? returnTarget.href : undefined}
      status={status}
      secondary={
        step === "align" &&
        uploadsFile &&
        !blocked &&
        (save.status === "idle" || save.status === "failed") ? (
          /* Beside the primary it qualifies, as the canvas draws it: the
             button says "trim", this says what that costs. A phone's footer
             has no room for it beside Back and the primary, and the step's
             own "Keeps … of …" already says the same thing there. */
          <span
            data-testid="attachment-kept-note"
            className="hidden shrink-0 text-[12px] whitespace-nowrap text-[var(--ink-500)] sm:inline"
          >
            Only the kept part is uploaded
          </span>
        ) : undefined
      }
      continueLabel={continueLabel}
      onContinue={flow.goNext}
      continueDisabled={!flow.canContinue || blocked !== null}
    >
      {/* Everything below is held while a commit is in flight. The primary
          alone would not be enough: swapping the file, or re-typing the time,
          mid-upload would change what the request in flight is for. */}
      <div
        inert={isBusy}
        aria-busy={isBusy || undefined}
        className="flex flex-col gap-7"
      >
        {save.status === "saving" && <SavingStrip label={save.label} />}

        {save.status === "failed" && (
          <div
            className={noteStripCls}
            role="alert"
            data-testid="attachment-save-error"
            data-error-code={save.error.code}
          >
            <XCircle
              className={`${noteIconCls} text-[var(--error)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <b className="font-medium text-[var(--ink-900)]">
                {uploadsFile ? "The video was not saved" : "Nothing changed"}
              </b>
              {" — "}
              {save.error.message}
              {uploadsFile && (
                <>
                  {" "}
                  Your file and the time you marked are still here; Try again
                  picks up from them.
                </>
              )}
            </span>
          </div>
        )}

        {blocked ? (
          <div
            className={warningStripCls}
            role="alert"
            data-testid="attachment-blocked"
          >
            <TriangleAlert
              className={noteIconCls}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <b className="font-medium">This cannot be done right now</b>
              {" — "}
              {blocked}
            </span>
          </div>
        ) : step === "file" ? (
          <AttachmentFileStep
            state={flow.file.state}
            mode={mode === "replace" ? "replace" : "add"}
            isOver={flow.file.isOver}
            onDragOver={flow.file.onDragOver}
            onDragLeave={flow.file.onDragLeave}
            onDrop={flow.file.onDrop}
            onFileChange={flow.file.onFileChange}
            onRemove={flow.file.remove}
          />
        ) : source ? (
          <AlignmentStage
            flow={flow}
            mode={mode}
            source={source}
            points={points}
            shots={shots}
            declaredDurationSeconds={
              mode === "align"
                ? activeAttachment?.durationSeconds
                : flow.selection?.durationSeconds
            }
            savedConfirmedSeconds={
              mode === "align"
                ? (activeAttachment?.confirmedVideoTimeSeconds ?? null)
                : null
            }
          />
        ) : (
          /* Reachable only by stepping forward with nothing picked, which the
             footer refuses — an honest zero rather than a blank column. */
          <div className={noteStripCls} role="status">
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>Choose a video first — go back and pick the recording.</span>
          </div>
        )}
      </div>
    </WizardShell>
  );
}
