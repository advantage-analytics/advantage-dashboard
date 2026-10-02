"use client";

/**
 * AttachmentUploadStatus — "Uploading your video", then "Video saved".
 *
 * What replaces the attachment wizard once "Trim and upload" is pressed, and
 * what the page settles on once the attachment is published. The same
 * centred 488px column, 24px light title and `VerticalStep` list the new-match
 * wizard's `UploadMatchSuccess` finishes on, so both uploads end on one
 * screen shape. It is its own component rather than a body extracted from
 * that one because the two tell different stories: that screen owns a match
 * it just created, an analysis hand-off and "Upload another"; this one owns
 * none of that, and one thing that screen promises is false here.
 *
 * ── Leaving cancels ─────────────────────────────────────────────────────────
 * `UploadMatchSuccess` reassures "You can keep using the dashboard." — its
 * transfer outlives the screen. An attachment's does not: the transfer
 * belongs to the flow, and unmounting the flow mid-upload cancels the attempt
 * (`use-attachment-flow.ts`). So that line is deliberately absent (decided
 * 2026-09-24), the leave guard is armed while anything is running, and "Back
 * to the match" mid-upload is an exit that cancels, not a detour.
 *
 * ── Only real numbers ───────────────────────────────────────────────────────
 * Percentages exist while something measurable is moving — the cut's own
 * progress, or bytes Azure accepted. The publication after the last block is a
 * server-side copy this browser cannot see, so it is named with no number.
 *
 * Adjust never reaches the saving half of this screen — a PATCH has no bytes
 * to show — only its settled "Alignment saved", without the upload's steps.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { formatEta } from "@/lib/data/match-analysis";
import {
  VerticalStep,
  type StepState,
} from "@/components/dashboard/shared/vertical-steps";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { formatFileSize } from "../new-match-wizard/utils";
import type { AttachmentMatchSummary } from "./MatchVideoAttachmentFlow";
import type { AttachmentSaveState } from "./use-attachment-flow";

type SavingState = Extract<AttachmentSaveState, { status: "saving" }>;
type SavedState = Extract<AttachmentSaveState, { status: "saved" }>;

export interface AttachmentUploadStatusProps {
  match: AttachmentMatchSummary;
  save: SavingState | SavedState;
  /** False for an adjust: nothing was uploaded, so there are no upload steps. */
  uploadsFile: boolean;
  /** The match's Film view — "Watch the film" and "Back to the match". */
  returnTarget: { href: string; label?: string };
  onCancel: () => void;
}

const MATCHES_HREF = "/dashboard/matches";

const QUIET_LINK =
  "inline-flex h-9 items-center gap-1.5 text-[13px] text-[var(--ink-700)] transition-colors duration-200 hover:text-[var(--ink-900)] focus-visible:outline-none";

const NOTE = "text-[12px] leading-[1.55] text-[var(--ink-600)]";

const DETAIL =
  "-mt-1 flex items-baseline justify-between gap-3 text-[11px] text-[var(--ink-400)] tabular-nums";

/* -------------------------------------------------------------------------
 * View model
 * ---------------------------------------------------------------------- */

type StepKey = "trim" | "upload" | "ready";

interface StepView {
  key: StepKey;
  state: StepState;
  label: string;
  value?: string;
}

/**
 * The three steps, from the save state alone.
 *
 * `keptBytes` is the size of what is (or will be) uploaded: the cut's
 * estimate while trimming, the transfer's own total afterwards, the published
 * size once saved.
 */
function stepsFor(
  save: SavingState | SavedState,
  keptBytes: number | null,
): StepView[] {
  const kept =
    keptBytes !== null && keptBytes > 0
      ? `${formatFileSize(keptBytes)} kept`
      : undefined;
  const trimmed: StepView = {
    key: "trim",
    state: "done",
    label: "Video trimmed",
    value: kept,
  };
  const ready: StepView = {
    key: "ready",
    state: "later",
    label: "Ready on the Film tab",
  };

  if (save.status === "saved") {
    return [
      trimmed,
      { key: "upload", state: "done", label: "Video uploaded" },
      { ...ready, state: "done" },
    ];
  }

  switch (save.phase) {
    case "trimming":
      return [
        {
          key: "trim",
          state: "now",
          label: "Trimming video",
          value:
            save.percent === null ? undefined : `${Math.floor(save.percent)}%`,
        },
        { key: "upload", state: "later", label: "Uploading video" },
        ready,
      ];
    case "committing":
      return [
        trimmed,
        { key: "upload", state: "done", label: "Video uploaded" },
        { ...ready, state: "now", label: "Saving to the Film tab" },
      ];
    default:
      return [
        trimmed,
        {
          key: "upload",
          state: "now",
          label: "Uploading video",
          value:
            save.percent === null ? undefined : `${Math.floor(save.percent)}%`,
        },
        ready,
      ];
  }
}

/* -------------------------------------------------------------------------
 * Pieces
 * ---------------------------------------------------------------------- */

function formatDay(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "<player> vs <opponent> · <date> · <score>" — each part only when known. */
export function attachmentMatchLine(match: AttachmentMatchSummary): string {
  const players = match.opponentName
    ? `${match.playerName} vs ${match.opponentName}`
    : match.playerName;
  return [players, formatDay(match.date), match.score || null]
    .filter(Boolean)
    .join(" · ");
}

function CancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <button
      type="button"
      onClick={onCancel}
      data-testid="attachment-cancel-upload"
      className="cursor-pointer text-[11px] text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--danger)]"
    >
      Cancel
    </button>
  );
}

/** The one instruction. Leaving is cancelling, so there is no reassurance. */
function KeepOpenNote() {
  return (
    <p
      data-testid="attachment-keep-open"
      className={cn(NOTE, "mt-1 text-[var(--ink-700)]")}
    >
      Keep this tab open until the upload finishes.
    </p>
  );
}

function stepBody(
  key: StepKey,
  state: StepState,
  save: SavingState | SavedState,
  onCancel: () => void,
): ReactNode {
  if (save.status !== "saving" || state !== "now") return null;

  if (key === "trim") {
    return (
      <>
        <AnalysisProgressTrack percent={save.percent ?? 0} live label="Trim" />
        <div className={DETAIL}>
          <span>
            {save.keptBytes !== null && save.totalBytes > 0
              ? `Keeping ${formatFileSize(save.keptBytes)} of ${formatFileSize(save.totalBytes)}, on this device`
              : "Cutting the match out of the recording, on this device"}
          </span>
          {save.canCancel && <CancelButton onCancel={onCancel} />}
        </div>
        <KeepOpenNote />
      </>
    );
  }

  if (key === "upload") {
    const moving = save.phase === "uploading" && save.totalBytes > 0;
    return (
      <>
        <AnalysisProgressTrack
          percent={save.percent ?? 0}
          live
          label="Video upload"
        />
        <div className={DETAIL}>
          <span data-testid="attachment-upload-detail">
            {moving
              ? `${formatFileSize(save.bytesTransferred)} of ${formatFileSize(save.totalBytes)}${
                  save.etaSeconds === null
                    ? ""
                    : ` · ${formatEta(save.etaSeconds)}`
                }`
              : "Preparing the upload…"}
          </span>
          {save.canCancel && <CancelButton onCancel={onCancel} />}
        </div>
        <KeepOpenNote />
      </>
    );
  }

  // The publication: bytes are in, the copy is not observable. Named, not
  // numbered — the sheen says it is still moving.
  return (
    <>
      <AnalysisProgressTrack percent={100} live label="Saving the video" />
      <p className={cn(NOTE, "mt-1 text-[var(--ink-700)]")}>
        Keep this tab open a few more seconds.
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------
 * The screen
 * ---------------------------------------------------------------------- */

export function AttachmentUploadStatus({
  match,
  save,
  uploadsFile,
  returnTarget,
  onCancel,
}: AttachmentUploadStatusProps) {
  const saved = save.status === "saved";

  // The size the upload keeps, held across the switch to "saved": the saved
  // state carries the uploaded size, and until the cut lands the estimate is
  // what there is. Adjusted during render — the documented way to derive
  // state from a changing prop without an effect.
  const reading =
    save.status === "saved"
      ? save.sizeBytes
      : save.phase === "trimming"
        ? save.keptBytes
        : save.totalBytes > 0
          ? save.totalBytes
          : null;
  const [keptBytes, setKeptBytes] = useState<number | null>(reading);
  if (reading !== null && reading !== keptBytes) setKeptBytes(reading);

  // The button that started this is gone; the title is where focus belongs.
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [saved]);

  const title = saved
    ? uploadsFile
      ? "Video saved"
      : "Alignment saved"
    : "Uploading your video";
  const steps = uploadsFile ? stepsFor(save, keptBytes) : [];

  return (
    <div
      data-testid={saved ? "attachment-saved" : "attachment-saving"}
      data-phase={save.status === "saving" ? save.phase : undefined}
      data-percent={
        save.status === "saving" && save.percent !== null
          ? String(save.percent)
          : undefined
      }
      data-kept-bytes={
        save.status === "saving" && save.keptBytes !== null
          ? String(save.keptBytes)
          : undefined
      }
      className="mx-auto w-full max-w-[488px] px-6 pt-[120px] pb-24"
    >
      <div className="animate-fadeIn flex flex-col">
        <div className="flex flex-col gap-2" aria-live="polite">
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-title-lg focus:outline-none"
            style={{ textWrap: "balance" }}
          >
            {title}
          </h1>
          <p
            data-testid="attachment-status-match"
            className="text-[13px] text-[var(--ink-600)]"
          >
            {attachmentMatchLine(match)}
          </p>
        </div>

        {steps.length > 0 && (
          <ol className="mt-9 flex flex-col" aria-label="Progress">
            {steps.map((step, index) => (
              <VerticalStep
                key={step.key}
                label={step.label}
                state={step.state}
                value={step.value}
                last={index === steps.length - 1}
              >
                {stepBody(step.key, step.state, save, onCancel)}
              </VerticalStep>
            ))}
          </ol>
        )}

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2">
          {saved ? (
            <>
              {/* `replace`: the wizard is finished, and Back onto it would
                  land on an add whose attachment now exists. */}
              <Link
                href={returnTarget.href}
                replace
                className={advButton("primary", "md")}
              >
                Watch the film
              </Link>
              <Link href={MATCHES_HREF} replace className={QUIET_LINK}>
                Back to matches
              </Link>
            </>
          ) : (
            // An exit, and an honest one: leaving unmounts the flow, which
            // cancels the upload. The leave guard asks on the chrome's links;
            // this one is this screen's own and says where it goes.
            <Link href={returnTarget.href} className={QUIET_LINK}>
              Back to the match
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
