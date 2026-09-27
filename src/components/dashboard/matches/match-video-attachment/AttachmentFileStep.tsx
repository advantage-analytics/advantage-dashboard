"use client";

/**
 * AttachmentFileStep — pick the recording, verify it, say what it is.
 *
 * The presentation is the new-match wizard's file step, not a second visual
 * language: the same 280px dashed drop zone (dashed means waiting for
 * something real), the same note-strip register for a quiet sentence, and the
 * same selected-file anatomy — a 40px lead holding a still from the file, the
 * name at 14px, mono facts ending in the one word that matters. Those classes
 * come from `new-match-wizard/styles.ts` and `utils.ts` rather than being
 * retyped here, so a palette change reaches both steps at once.
 * Design: `.skills/advantage-analytics-design/reference/primitives.md`
 * (Wizard & Task Primitives; Notice strips).
 *
 * What is deliberately DIFFERENT from that step is the requirements block.
 * The wizard's `VideoRequirements` prints the analysis vendor's camera,
 * resolution and frame-rate rules; an attachment never reaches that vendor, so
 * repeating them here would invent a restriction. What an attachment actually
 * needs is coverage — the recording has to contain the match the spreadsheet
 * already described.
 *
 * Nothing on this step uploads. The note strip says so in as many words,
 * because "checked" beside a 6 GB file otherwise reads as "sent".
 *
 * **Widget states.** The four states are all local and all rendered here:
 * empty is the drop zone itself (the honest zero, not a skeleton — there is
 * nothing loaded to mirror), loading is the same zone with a spinner and
 * `role="status"` while the local probe runs, ready is the file row, and the
 * error is a `role="alert"` note strip that keeps the drop zone beneath it so
 * the retry is the same control that failed. No data loader, no Suspense
 * region and no `return null` anywhere: the step always draws.
 */

import { memo, useEffect, useId, useRef } from "react";
import {
  Clapperboard,
  Film,
  HardDrive,
  Info,
  Loader2,
  X,
  XCircle,
} from "lucide-react";

import { MATCH_VIDEO_MAX_BYTES_LABEL } from "@/lib/match-video/limits";
import { noteIconCls, noteStripCls } from "../new-match-wizard/styles";
import { formatFileSize, formatTimecode } from "../new-match-wizard/utils";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_EXTENSION_LABEL,
  type AttachmentFileState,
} from "./use-attachment-file";

export interface AttachmentFileStepProps {
  state: AttachmentFileState;
  /**
   * Whether this match already has a video. Only the copy changes: the checks,
   * the refusals and the upload timing are identical either way.
   */
  mode: "add" | "replace";
  isOver: boolean;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

interface Requirement {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  lead: string;
  rest: string;
}

/**
 * What an ATTACHMENT needs — coverage and a container, nothing about the shot.
 *
 * No camera position, no resolution floor, no frame rate: those are the
 * analysis vendor's rules and this file never goes there. It is played back
 * beside data SwingVision already produced, so the only thing that can make it
 * unusable is not containing the match.
 */
const ATTACHMENT_REQUIREMENTS: readonly Requirement[] = [
  {
    icon: Clapperboard,
    lead: "The whole match",
    rest: " — from before the first point to after the last. The next step asks you to mark where the first point starts.",
  },
  {
    icon: Film,
    lead: `${ATTACHMENT_EXTENSION_LABEL}`,
    rest: " — one file per match, and one your browser can play, since you scrub it on the next step.",
  },
  {
    icon: HardDrive,
    lead: MATCH_VIDEO_MAX_BYTES_LABEL,
    rest: " — the recording itself, at whatever quality your camera made it. Nothing is re-encoded.",
  },
];

/**
 * A still from the file, as the row's 40px lead.
 *
 * Its own object URL, created and revoked inside one effect with the `src` set
 * from it — a memoised URL revoked from a cleanup is already dead by the time
 * development's second effect run looks for it. A few seconds in rather than
 * frame zero, which on a phone recording is usually the ground.
 */
function VideoStill({
  file,
  durationSeconds,
}: {
  file: File;
  durationSeconds: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => {
      // Detach before revoking — Safari otherwise keeps the handle alive.
      el.pause();
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);
  const at = Math.min(5, durationSeconds * 0.05) || 0.001;
  return (
    <video
      ref={ref}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      onLoadedMetadata={(e) => {
        if (e.currentTarget.currentTime === 0) e.currentTarget.currentTime = at;
      }}
      className="size-10 object-cover opacity-90"
    />
  );
}

function AttachmentFileStepImpl({
  state,
  mode,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onRemove,
}: AttachmentFileStepProps) {
  const inputId = useId();
  const busy = state.status === "checking";
  const ready = state.status === "ready" ? state.selection : null;

  const browse = () => document.getElementById(inputId)?.click();

  const input = (
    <input
      id={inputId}
      type="file"
      accept={ATTACHMENT_ACCEPT}
      onChange={onFileChange}
      disabled={busy}
      data-testid="attachment-file-input"
      className="hidden"
    />
  );

  return (
    <div className="flex flex-col gap-9">
      {!ready ? (
        <div className="flex flex-col gap-3.5">
          {/* The column's width on the page tone with a 1px dashed hairline —
              dashed means a place waiting for something real. */}
          <div
            role="button"
            tabIndex={0}
            aria-disabled={busy}
            onClick={busy ? undefined : browse}
            onKeyDown={(e) => {
              if (!busy && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                browse();
              }
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            aria-label={
              mode === "replace"
                ? "Drop the replacement video here, or browse"
                : "Drop the match video here, or browse"
            }
            data-testid="attachment-drop-zone"
            className={`flex h-[280px] cursor-pointer flex-col items-center justify-center gap-3.5 rounded-[var(--radius-card)] border border-dashed transition-colors duration-200 ease-[var(--ease-primary)] ${
              isOver
                ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                : "border-[var(--border-medium)] bg-[var(--surface-page)] hover:border-[var(--ink-300)]"
            } ${busy ? "cursor-default" : ""}`}
          >
            {busy ? (
              <Loader2
                className="size-7 animate-spin text-[var(--ink-300)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            ) : (
              <Film
                className="size-7 text-[var(--ink-300)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            )}
            <span className="flex flex-col items-center gap-1.5">
              <span
                className="text-[13px] font-medium text-[var(--ink-900)]"
                {...(busy ? { role: "status" as const } : {})}
              >
                {busy ? (
                  "Checking the video…"
                ) : (
                  <>
                    Drop {mode === "replace" ? "the replacement" : "the match"}{" "}
                    video here, or{" "}
                    <span className="text-[var(--blue)]">browse</span>
                  </>
                )}
              </span>
              <span className="text-micro" data-testid="attachment-zone-facts">
                {state.status === "checking"
                  ? `${state.filename} · ${formatFileSize(state.sizeBytes)} · nothing is uploading yet`
                  : `One video per match · ${ATTACHMENT_EXTENSION_LABEL} · ${MATCH_VIDEO_MAX_BYTES_LABEL}`}
              </span>
            </span>
            {input}
          </div>

          {state.status === "rejected" && (
            <div
              className={noteStripCls}
              role="alert"
              data-testid="attachment-file-error"
              data-error-code={state.error.code}
            >
              <XCircle
                className={`${noteIconCls} text-[var(--error)]`}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>
                <b className="font-medium text-[var(--ink-900)]">
                  This video can&apos;t be used
                </b>
                {" — "}
                {state.error.message}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <span className="eyebrow">Video</span>

          {/* A checked file becomes a step-1 field: 40px lead, 14px name, mono
              facts in the subline. Replace is the quiet blue action; remove is
              a 28px icon square named by its label. */}
          <div className="flex items-center gap-4 border-b border-[var(--border-hairline)] pb-4">
            <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-button)] bg-[var(--ink-900)]">
              <VideoStill
                file={ready.file}
                durationSeconds={ready.durationSeconds}
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className="truncate text-[14px] leading-5 text-[var(--ink-900)]"
                data-testid="attachment-file-name"
              >
                {ready.filename}
              </span>
              <span
                className="mono tabular text-micro leading-4"
                data-testid="attachment-file-facts"
              >
                {[
                  formatTimecode(ready.durationSeconds),
                  formatFileSize(ready.sizeBytes),
                  "checked",
                ].join(" · ")}
              </span>
            </span>
            <button
              type="button"
              onClick={browse}
              className="cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove video"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-150 hover:bg-[var(--surface-subtle)]"
            >
              <X
                className="size-3.5 text-[var(--ink-500)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
            {input}
          </div>

          {/* The honest thing about timing: nothing has left the machine. */}
          <div className={noteStripCls}>
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              Nothing is uploading yet. The upload starts once you mark the
              first point on the next step.
            </span>
          </div>
        </div>
      )}

      {/* The requirements stay under a checked file — the next step still has
          to find the first point inside it. */}
      <div className="flex flex-col gap-3.5">
        <span className="eyebrow">What the video needs</span>
        <div className="flex flex-col gap-2.5">
          {ATTACHMENT_REQUIREMENTS.map(({ icon: Icon, lead, rest }) => (
            <div key={lead} className="flex items-start gap-3">
              <Icon
                className={`${noteIconCls} text-[var(--ink-400)]`}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
                <b className="font-medium text-[var(--ink-900)]">{lead}</b>
                {rest}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const AttachmentFileStep = memo(AttachmentFileStepImpl);
