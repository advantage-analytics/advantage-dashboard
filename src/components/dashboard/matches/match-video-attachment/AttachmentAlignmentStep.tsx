"use client";

/**
 * AttachmentAlignmentStep — find the first point in the recording.
 *
 * The whole feature reduces to one number: where, in THIS file, the first
 * point's serve contact happens. Everything else — every seek in the film
 * room, every point the report can jump to — is that number plus arithmetic
 * the pure module already owns. So the step is built to make one position easy
 * to land on precisely and hard to get wrong by accident: a player with named
 * controls, a scrub rail that answers the keyboard, a fine step for the last
 * frames, and a millisecond field that says exactly what was chosen.
 *
 * The presentation is the new-match wizard's video step, not a second visual
 * language: the same `--ink-900` frame at 16:9, the same in-frame control row,
 * the same note-strip register for a quiet sentence and the same yellow strip
 * for the one thing that must be answered. Those classes come from
 * `new-match-wizard/styles.ts` rather than being retyped here.
 * Design: `.skills/advantage-analytics-design/reference/primitives.md`
 * (Wizard & Task Primitives; Notice strips).
 *
 * **Nothing here saves.** No fetch, no Supabase, no upload: the step reports a
 * validated alignment upward and the orchestration step (plan 13) decides what
 * to do with it. A spec asserts the local path issues no request with a real
 * scheme, exactly as the file step does.
 *
 * **Widget states.** All four are local and all four draw. Loading is the frame
 * with a `role="status"` spinner while metadata arrives — the frame itself is
 * already the right shape, so there is nothing to mirror with a skeleton.
 * Ready is the player plus its controls. Empty is the field before anything has
 * been entered, which is an honest zero and not an error: the step says what to
 * do rather than complaining that it has not been done. Error comes in three
 * separable flavours, and separating them is the point — a media failure
 * (`role="alert"`), a refusal about the entered time or the coverage
 * (`role="alert"`), and a declined `play()` (a quiet `role="status"` note,
 * because the file is fine). No `return null` anywhere.
 */

import { memo, useId } from "react";
import {
  TriangleAlert,
  Info,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  XCircle,
} from "lucide-react";

import { advButton } from "@/lib/ui/adv-button";
import { formatConfirmedVideoTime } from "@/lib/match-video/alignment";
import {
  focusRingCls,
  noteIconCls,
  noteStripCls,
  warningStripCls,
} from "../new-match-wizard/styles";
import {
  COARSE_STEP_SECONDS,
  FINE_STEP_SECONDS,
  JUMP_STEP_SECONDS,
  PREVIEW_LEAD_SECONDS,
  type AttachmentAlignmentApi,
} from "./use-attachment-alignment";

/** The frame's ceiling, matching the wizard's video step. */
const PLAYER_MAX_HEIGHT = "405px";

const controlCls = `inline-flex size-7 items-center justify-center rounded-[var(--radius-element)] text-white transition-colors duration-150 hover:bg-white/10 disabled:opacity-40 ${focusRingCls}`;

export interface AttachmentAlignmentStepProps {
  api: AttachmentAlignmentApi;
  /**
   * Which job this is. Only the copy changes: the parsing, the coverage check
   * and the zero rule are identical, and `align` additionally has a saved time
   * to beat, which the hook enforces rather than the wording.
   */
  mode: "add" | "replace" | "align";
}

/* -------------------------------------------------------------------------
 * Scrub rail
 * ---------------------------------------------------------------------- */

/**
 * The scrub surface, hand-built rather than an `<input type="range">`.
 *
 * A range input's arrow key moves by its `step`, and the step here has to be a
 * millisecond for the value to be expressible — which would make one arrow
 * press move a two-hour recording by a thousandth of a second. Owning the
 * keyboard means the arrows can be a fine step, Shift a second, and Page a jump,
 * which is what someone hunting a serve contact actually wants.
 */
function ScrubRail({
  durationSeconds,
  currentTimeSeconds,
  disabled,
  onSeekTo,
  onSeekBy,
}: {
  durationSeconds: number;
  currentTimeSeconds: number;
  disabled: boolean;
  onSeekTo: (seconds: number) => void;
  onSeekBy: (delta: number) => void;
}) {
  const span = durationSeconds > 0 ? durationSeconds : 0;
  const pct =
    span > 0
      ? Math.max(0, Math.min(100, (currentTimeSeconds / span) * 100))
      : 0;

  const seekFromEvent = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || span <= 0) return;
    onSeekTo(((clientX - rect.left) / rect.width) * span);
  };

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Scrub the video"
      aria-valuemin={0}
      aria-valuemax={Math.round(span * 1000) / 1000}
      aria-valuenow={Math.round(currentTimeSeconds * 1000) / 1000}
      aria-valuetext={formatConfirmedVideoTime(currentTimeSeconds)}
      aria-disabled={disabled}
      data-testid="alignment-scrub"
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromEvent(event.clientX, event.currentTarget);
      }}
      onPointerMove={(event) => {
        if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId))
          return;
        seekFromEvent(event.clientX, event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        const fine = event.shiftKey ? COARSE_STEP_SECONDS : FINE_STEP_SECONDS;
        switch (event.key) {
          case "ArrowLeft":
            event.preventDefault();
            onSeekBy(-fine);
            break;
          case "ArrowRight":
            event.preventDefault();
            onSeekBy(fine);
            break;
          case "PageUp":
            event.preventDefault();
            onSeekBy(JUMP_STEP_SECONDS);
            break;
          case "PageDown":
            event.preventDefault();
            onSeekBy(-JUMP_STEP_SECONDS);
            break;
          case "Home":
            event.preventDefault();
            onSeekTo(0);
            break;
          case "End":
            event.preventDefault();
            onSeekTo(span);
            break;
          default:
            break;
        }
      }}
      className={`relative flex h-6 w-full cursor-pointer touch-none items-center ${focusRingCls}`}
    >
      <span
        className="h-1 w-full rounded-full bg-[var(--border-medium)]"
        aria-hidden="true"
      />
      <span
        className="absolute left-0 h-1 rounded-full bg-[var(--blue)]"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
      <span
        className="absolute size-3 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--blue)] shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        style={{ left: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Step
 * ---------------------------------------------------------------------- */

function AttachmentAlignmentStepImpl({
  api,
  mode,
}: AttachmentAlignmentStepProps) {
  const fieldId = useId();
  const {
    videoRef,
    sourceUrl,
    mediaStatus,
    playbackDurationSeconds,
    currentTimeSeconds,
    isPlaying,
    playNotice,
    timing,
    confirmedTime,
    plan,
    error,
    needsZeroConfirmation,
    isNoOpCorrection,
    canSubmit,
  } = api;

  const playable = mediaStatus === "ready";
  const summary = timing.ok ? timing.value : null;
  const untimedPoints = summary?.untimedPointCount ?? 0;
  const untimedShots = summary?.untimedShotCount ?? 0;

  return (
    <div className="flex flex-col gap-9">
      {/* ---- What we are looking for ------------------------------------ */}
      <div className="flex flex-col gap-3.5">
        <span className="eyebrow">The first point</span>
        {summary ? (
          <p className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
            <b className="font-medium text-[var(--ink-900)]">
              Find the serve contact that starts point{" "}
              {summary.anchorPointNumber}
            </b>
            {" — the first point of the match. "}
            SwingVision recorded it at{" "}
            <span
              className="mono tabular"
              data-testid="alignment-anchor-source"
            >
              {formatConfirmedVideoTime(summary.anchorSourceSeconds)}
            </span>{" "}
            on its own recording, which is not this file. Marking it here is
            what lines the two up.
          </p>
        ) : (
          /* Missing timing is a fact about the import, stated as one. It is NOT
             "this video is not long enough" — that copy belongs to
             `insufficient_coverage` alone, and borrowing it here would send
             someone hunting for a longer recording that would not help. */
          <div
            className={warningStripCls}
            role="alert"
            data-testid="alignment-timing-missing"
            data-error-code={timing.ok ? undefined : timing.error.code}
          >
            <TriangleAlert
              className={noteIconCls}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <b className="font-medium">This match cannot be aligned</b>
              {" — "}
              {timing.ok ? "" : timing.error.message} Its imported points do not
              carry the timestamps an alignment is measured against, and nothing
              here will invent them.
            </span>
          </div>
        )}
      </div>

      {/* ---- Player ------------------------------------------------------ */}
      <div className="flex flex-col gap-3">
        <div
          className="relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-element)] bg-[var(--ink-900)]"
          style={{ aspectRatio: 16 / 9, maxHeight: PLAYER_MAX_HEIGHT }}
        >
          <video
            ref={videoRef}
            /* Only a SAVED attachment names its source here. A local file's
               object URL is assigned by the hook's effect, which owns creating
               and revoking it in one closure. */
            src={sourceUrl || undefined}
            playsInline
            preload="metadata"
            onLoadedMetadata={api.onLoadedMetadata}
            onTimeUpdate={api.onTimeUpdate}
            onSeeked={api.onSeeked}
            onError={api.onMediaError}
            onPlay={api.onPlay}
            onPause={api.onPause}
            data-testid="alignment-video"
            className="block size-full bg-black object-contain"
          />

          {mediaStatus === "loading" && (
            <span
              role="status"
              aria-label="Loading the video"
              data-testid="alignment-media-loading"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--ink-900)] text-[11px] text-white/70"
            >
              <Loader2
                className="size-6 animate-spin"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Opening the video…
            </span>
          )}

          {/* In-frame controls, each named. The scrub rail sits below the
              frame rather than inside it, so the playhead and the clock are
              legible against the page instead of against the picture. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/55 to-transparent pt-8 pb-2.5">
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => api.seekBy(-COARSE_STEP_SECONDS)}
                disabled={!playable}
                aria-label="Back one second"
                className={controlCls}
              >
                <SkipBack
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={api.togglePlay}
                disabled={!playable}
                aria-label={isPlaying ? "Pause" : "Play"}
                data-testid="alignment-play"
                className={controlCls}
              >
                {isPlaying ? (
                  <Pause
                    className="size-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ) : (
                  <Play
                    className="size-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => api.seekBy(COARSE_STEP_SECONDS)}
                disabled={!playable}
                aria-label="Forward one second"
                className={controlCls}
              >
                <SkipForward
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
              <span className="mx-1 h-3 w-px bg-white/35" aria-hidden="true" />
              <button
                type="button"
                onClick={() => api.seekBy(-FINE_STEP_SECONDS)}
                disabled={!playable}
                aria-label="Back a fine step"
                data-testid="alignment-fine-back"
                className={`${controlCls} text-[11px]`}
              >
                <span aria-hidden="true">−</span>
              </button>
              <button
                type="button"
                onClick={() => api.seekBy(FINE_STEP_SECONDS)}
                disabled={!playable}
                aria-label="Forward a fine step"
                data-testid="alignment-fine-forward"
                className={`${controlCls} text-[11px]`}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
          </div>
        </div>

        <ScrubRail
          durationSeconds={playbackDurationSeconds}
          currentTimeSeconds={currentTimeSeconds}
          disabled={!playable}
          onSeekTo={api.seekTo}
          onSeekBy={api.seekBy}
        />

        <div className="flex items-center justify-between">
          <span
            className="mono tabular text-micro"
            data-testid="alignment-playhead"
          >
            {formatConfirmedVideoTime(currentTimeSeconds)}
          </span>
          <span className="mono tabular text-micro">
            {formatConfirmedVideoTime(playbackDurationSeconds)}
          </span>
        </div>

        {mediaStatus === "error" && (
          <div
            className={noteStripCls}
            role="alert"
            data-testid="alignment-media-error"
          >
            <XCircle
              className={`${noteIconCls} text-[var(--error)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <b className="font-medium text-[var(--ink-900)]">
                This video can&apos;t be played here
              </b>
              {" — go back and choose a file your browser can play, since you"}
              {" have to scrub it to find the first point."}
            </span>
          </div>
        )}

        {/* A refused `play()` is a browser policy or an interrupted load, not a
            broken file. Quiet strip, `role="status"`, and the same control is
            still the retry. */}
        {playNotice && mediaStatus !== "error" && (
          <div
            className={noteStripCls}
            role="status"
            data-testid="alignment-play-notice"
          >
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>{playNotice}</span>
          </div>
        )}
      </div>

      {/* ---- The confirmed time ------------------------------------------ */}
      <div className="flex flex-col gap-3.5">
        <span className="eyebrow">
          {mode === "align" ? "Adjust the first point" : "Mark the first point"}
        </span>

        <div className="flex flex-wrap items-center gap-2.5">
          <label
            htmlFor={fieldId}
            className="text-[12px] text-[var(--ink-700)]"
          >
            First point at
          </label>
          <input
            id={fieldId}
            type="text"
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            placeholder="hh:mm:ss.sss"
            value={confirmedTime}
            onChange={(event) => api.setConfirmedTime(event.target.value)}
            aria-label="First point time, as hh:mm:ss.sss"
            aria-invalid={error !== null}
            data-testid="alignment-time-input"
            className="mono tabular h-9 w-[140px] rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-2.5 text-[13px] text-[var(--ink-900)] outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
          <button
            type="button"
            onClick={api.useCurrentTime}
            disabled={!playable}
            data-testid="alignment-use-current"
            className={advButton("outline", "sm")}
          >
            Use current time
          </button>
          <button
            type="button"
            onClick={api.previewLastPoint}
            disabled={!plan?.ok}
            data-testid="alignment-preview-last"
            /* The video-clock instant this jumps to, published so the seek can
               be checked against the alignment rather than against whatever the
               element clamped it to on a short file. */
            data-target-seconds={
              plan?.ok
                ? Math.max(
                    0,
                    plan.value.coverage.requiredVideoEndSeconds -
                      PREVIEW_LEAD_SECONDS,
                  )
                : undefined
            }
            className={advButton("ghost", "sm")}
          >
            Preview the last point
          </button>
        </div>

        <p className="text-[11px] leading-[1.6] text-[var(--ink-500)]">
          Scrub to the serve contact, then press{" "}
          <b className="font-medium text-[var(--ink-700)]">Use current time</b>,
          or type the position yourself. Arrow keys on the scrub bar move a fine
          step; hold Shift for a second.
        </p>

        {/* Zero: a real answer, and usually not the one intended. The field
            keeps whatever was entered — this asks, it never rewrites. Typing
            `00:00:00.000` and landing on it with Use current time both clear
            the acknowledgement, so both arrive here. */}
        {needsZeroConfirmation && (
          <div
            className={warningStripCls}
            role="alert"
            data-testid="alignment-zero-confirm"
          >
            <TriangleAlert
              className={noteIconCls}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <b className="font-medium">
                The first point is at the very start of this video?
              </b>{" "}
              That is right only if the recording opens on the serve.{" "}
              <button
                type="button"
                onClick={api.confirmZero}
                data-testid="alignment-zero-yes"
                className={`cursor-pointer font-medium underline underline-offset-2 ${focusRingCls}`}
              >
                Yes, it starts there
              </button>
            </span>
          </div>
        )}

        {error && (
          <div
            className={noteStripCls}
            role="alert"
            data-testid="alignment-error"
            data-error-code={error.code}
          >
            <XCircle
              className={`${noteIconCls} text-[var(--error)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              {error.message}
              {error.code === "insufficient_coverage" && (
                <>
                  {" "}
                  The time you marked is still here — adjust it, or go back and
                  choose a recording that runs to the end of the match.
                </>
              )}
            </span>
          </div>
        )}

        {isNoOpCorrection && (
          <div
            className={noteStripCls}
            role="status"
            data-testid="alignment-no-change"
          >
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              This is the time already saved. Move it to something else to save
              a correction.
            </span>
          </div>
        )}

        {canSubmit && plan?.ok && (
          <div
            className={noteStripCls}
            role="status"
            data-testid="alignment-ready"
            data-offset-seconds={plan.value.offsetSeconds}
          >
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              The recording covers the match. Point{" "}
              {plan.value.timing.finalPointNumber} ends at{" "}
              <span className="mono tabular">
                {formatConfirmedVideoTime(
                  plan.value.coverage.requiredVideoEndSeconds,
                )}
              </span>{" "}
              in this file — preview it if you want to be sure.
            </span>
          </div>
        )}

        {/* Untimed interior rows are counted and named, never filled in. They
            do not block the alignment: the offset is measured from the first
            point, and a point with no timestamp of its own simply cannot be
            jumped to. Saying so here is the only honest option. */}
        {(untimedPoints > 0 || untimedShots > 0) && (
          <div
            className={noteStripCls}
            role="status"
            data-testid="alignment-untimed"
            data-untimed-points={untimedPoints}
            data-untimed-shots={untimedShots}
          >
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              <b className="font-medium text-[var(--ink-900)]">
                {untimedPoints > 0
                  ? `${untimedPoints} ${untimedPoints === 1 ? "point has" : "points have"} no timestamp`
                  : `${untimedShots} ${untimedShots === 1 ? "shot has" : "shots have"} no timestamp`}
                {untimedPoints > 0 && untimedShots > 0
                  ? `, and so do ${untimedShots} ${untimedShots === 1 ? "shot" : "shots"}`
                  : ""}
              </b>
              {" — "}
              they came out of the import that way. They stay in the match and
              keep their statistics; the video just cannot jump to them.
            </span>
          </div>
        )}

        {/* Empty is a state, not a complaint: before anything is entered the
            step says what to do and shows no refusal. */}
        {plan === null && timing.ok && (
          <div
            className={noteStripCls}
            role="status"
            data-testid="alignment-empty"
          >
            <Info
              className={`${noteIconCls} text-[var(--ink-400)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              {mode === "align"
                ? "Nothing changes until you enter a different time."
                : "Nothing uploads until you mark the first point and confirm."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export const AttachmentAlignmentStep = memo(AttachmentAlignmentStepImpl);
