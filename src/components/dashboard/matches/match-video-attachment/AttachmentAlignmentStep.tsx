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
 *
 * ── Add and replace: one step that marks AND cuts ─────────────────────────
 *
 * When the hook carries a kept window (`api.trimEnabled`), the scrub rail is
 * the trim rail of the approved canvas ("Main"): 40px, the ends outside the
 * window washed in page tone, the window one 2px Signal Blue bracket, a white
 * playhead, and "▲ first point" / "last point ▲" under it. Marking the first
 * point places both cuts; the Start and End readouts beneath move either one
 * to the playhead. It is the wizard trim step's vocabulary (`CutField`, the
 * washed ends, the bracket) rebuilt here rather than extracted: that screen is
 * a guarded seam (`docs/ui-revamp-guardrails.md` §3.1) whose rail is bound to
 * its filmstrip, drag handles and camera questions, and none of that belongs
 * to an attachment. No camera question is ever asked here — an attachment
 * never reaches the Advantage Intelligence vendor.
 *
 * The captions under the readouts say where each cut sits RELATIVE TO THE
 * MATCH, recomputed from the window: "10 s before the first point you marked"
 * and "10 s after SwingVision's last point" at the defaults, the measured
 * distance once a cut is moved, and "after" / "before" when a moved cut has
 * crossed into the match — which is also when the coverage refusal shows.
 */

import { memo, useId } from "react";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
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
import type { AttachmentTrimWindow } from "@/lib/match-video/trim-window";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  focusRingCls,
  noteIconCls,
  noteStripCls,
  warningStripCls,
} from "../new-match-wizard/styles";
import { formatClock, formatTimecode } from "../new-match-wizard/utils";
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
  trim,
}: {
  durationSeconds: number;
  currentTimeSeconds: number;
  disabled: boolean;
  onSeekTo: (seconds: number) => void;
  onSeekBy: (delta: number) => void;
  /**
   * Draw the trim rail: 40px, washed ends, the kept window bracketed. `window`
   * is null until a first point is marked, and the rail is then the whole
   * recording with nothing washed.
   */
  trim?: { window: AttachmentTrimWindow | null };
}) {
  const span = durationSeconds > 0 ? durationSeconds : 0;
  const toPct = (seconds: number) =>
    span > 0 ? Math.max(0, Math.min(100, (seconds / span) * 100)) : 0;
  const pct = toPct(currentTimeSeconds);

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
      className={
        trim
          ? `relative h-10 w-full cursor-pointer touch-none rounded-[var(--radius-button)] bg-[var(--surface-dark)] ${focusRingCls}`
          : `relative flex h-6 w-full cursor-pointer touch-none items-center ${focusRingCls}`
      }
    >
      {trim ? (
        <TrimRailMarks window={trim.window} toPct={toPct} playheadPct={pct} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

/**
 * What the trim rail draws: the washed ends, the bracket, the playhead.
 *
 * The rail's own corners clip nothing (`overflow` stays visible so the focus
 * ring shows), so the washes carry the outer radii themselves. The window is
 * published as data attributes — in seconds, not pixels — so a spec can check
 * the rail against the readouts without measuring geometry.
 */
function TrimRailMarks({
  window,
  toPct,
  playheadPct,
}: {
  window: AttachmentTrimWindow | null;
  toPct: (seconds: number) => number;
  playheadPct: number;
}) {
  const startPct = window ? toPct(window.startSeconds) : 0;
  const endPct = window ? toPct(window.endSeconds) : 100;
  return (
    <span
      className="absolute inset-0"
      aria-hidden="true"
      data-testid="alignment-trim-window"
      data-start-seconds={window?.startSeconds}
      data-end-seconds={window?.endSeconds}
    >
      {window && (
        <>
          <span
            className="absolute inset-y-0 left-0 rounded-l-[var(--radius-button)] bg-[var(--surface-page)] opacity-[0.78]"
            style={{ width: `${startPct}%` }}
          />
          <span
            className="absolute inset-y-0 right-0 rounded-r-[var(--radius-button)] bg-[var(--surface-page)] opacity-[0.78]"
            style={{ width: `${100 - endPct}%` }}
          />
          <span
            className="absolute inset-y-0 rounded-[var(--radius-button)] border-2 border-[var(--blue)]"
            style={{
              left: `${startPct}%`,
              width: `${Math.max(0, endPct - startPct)}%`,
            }}
          />
        </>
      )}
      <span
        className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-white"
        style={{ left: `${playheadPct}%` }}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------
 * Trim readouts
 * ---------------------------------------------------------------------- */

/**
 * A distance for a caption: "10 s" under a minute, a clock above it.
 *
 * Tenths survive when they are there — a cut moved to 9.6 s must not read as
 * the default "10 s" — and vanish when they are not.
 */
function formatDistance(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return `${Number(abs.toFixed(1))} s`;
  return formatClock(abs);
}

/**
 * One cut: its timecode joined to the button that moves it to the playhead.
 *
 * The canvas's pair, and the wizard trim step's `CutField` in spirit — the
 * number is the way BACK to the cut (it seeks there, moving nothing), the icon
 * is the way the cut comes to the playhead. Both cuts keep the button on the
 * right, as drawn. No `overflow-hidden` on the group: `focusRingCls` is a
 * box-shadow and clipping it would hide keyboard focus.
 */
function TrimReadout({
  side,
  seconds,
  caption,
  disabled,
  onJump,
  onSet,
}: {
  side: "start" | "end";
  seconds: number | null;
  caption: string;
  disabled: boolean;
  onJump: () => void;
  onSet: () => void;
}) {
  const isStart = side === "start";
  const captionId = useId();
  const Glyph = isStart ? ArrowLeftToLine : ArrowRightToLine;
  const setLabel = isStart ? "Set the start here" : "Set the end here";
  return (
    <div
      className={`flex flex-col gap-1.5 ${isStart ? "items-start" : "items-end"}`}
    >
      <div className="inline-flex h-8 items-stretch rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)]">
        <button
          type="button"
          onClick={onJump}
          disabled={disabled}
          aria-label={`Go to the ${side}`}
          className={`inline-flex min-w-[112px] cursor-pointer items-center justify-center gap-2 rounded-l-[5px] border-r border-[var(--border-field)] px-2.5 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] disabled:pointer-events-none ${focusRingCls}`}
        >
          <span className="text-[11px] font-medium text-[var(--ink-400)]">
            {isStart ? "Start" : "End"}
          </span>
          <span
            className="mono tabular text-[12px] text-[var(--ink-900)]"
            data-testid={`alignment-trim-${side}`}
            data-seconds={seconds ?? undefined}
          >
            {seconds === null ? "—" : formatTimecode(seconds)}
          </span>
        </button>
        <ChromeTooltip label={setLabel}>
          <button
            type="button"
            onClick={onSet}
            disabled={disabled}
            aria-label={setLabel}
            aria-describedby={captionId}
            className={`inline-flex w-8 cursor-pointer items-center justify-center rounded-r-[5px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] disabled:pointer-events-none disabled:opacity-50 ${focusRingCls}`}
          >
            <Glyph className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </ChromeTooltip>
      </div>
      <span
        id={captionId}
        data-testid={`alignment-trim-${side}-caption`}
        className="px-0.5 text-[11px] leading-[1.4] text-[var(--ink-500)]"
      >
        {caption}
      </span>
    </div>
  );
}

/**
 * The rail's two landmarks, the canvas's small labels under it.
 *
 * Each sits at the instant it names — the marked serve and SwingVision's last
 * required instant on this file's clock — which is ten seconds inside a
 * default cut. Anchored on the side that keeps the text over the rail: the
 * first point's label grows rightward from it, the last point's leftward.
 */
function TrimRailLabels({
  firstPct,
  lastPct,
}: {
  firstPct: number;
  lastPct: number;
}) {
  return (
    <div
      className="relative h-3.5 text-[10px] leading-none whitespace-nowrap text-[var(--ink-400)]"
      data-testid="alignment-trim-labels"
    >
      <span
        className="absolute top-0"
        style={{ left: `min(${firstPct}%, calc(100% - 72px))` }}
      >
        ▲ first point
      </span>
      <span
        className="absolute top-0"
        style={{ right: `min(${100 - lastPct}%, calc(100% - 72px))` }}
      >
        last point ▲
      </span>
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
    trimEnabled,
    trimWindow,
    defaultTrimWindow,
    markedSeconds,
    lastPointSeconds,
    coverageDurationSeconds,
    trimRefused,
  } = api;

  const playable = mediaStatus === "ready";
  const summary = timing.ok ? timing.value : null;
  const untimedPoints = summary?.untimedPointCount ?? 0;
  const untimedShots = summary?.untimedShotCount ?? 0;
  const marked = trimEnabled && trimWindow !== null && markedSeconds !== null;

  /* The kept window, told against the match rather than the file. */
  let startCaption = "Set when you mark the first point";
  let endCaption = "Set when you mark the first point";
  if (marked && lastPointSeconds !== null) {
    const lead = markedSeconds - trimWindow.startSeconds;
    startCaption =
      lead === 0
        ? "At the first point you marked"
        : `${formatDistance(lead)} ${lead > 0 ? "before" : "after"} the first point you marked`;
    const tail = trimWindow.endSeconds - lastPointSeconds;
    endCaption =
      Math.abs(tail) < 0.05
        ? "At SwingVision's last point"
        : `${formatDistance(tail)} ${tail > 0 ? "after" : "before"} SwingVision's last point`;
  }
  const atDefaults =
    marked &&
    defaultTrimWindow !== null &&
    trimWindow.startSeconds === defaultTrimWindow.startSeconds &&
    trimWindow.endSeconds === defaultTrimWindow.endSeconds;

  // The rail spans the element's timeline, which is what it seeks.
  const railSpan = playbackDurationSeconds;
  const railPct = (seconds: number) =>
    railSpan > 0 ? Math.max(0, Math.min(100, (seconds / railSpan) * 100)) : 0;

  return (
    <div className="flex flex-col gap-9">
      {/* ---- What we are looking for ------------------------------------ */}
      {/* Add and replace say it in the page's own description; only a
          missing-timing refusal still needs saying here. */}
      {trimEnabled && summary ? null : (
        <div className="flex flex-col gap-3.5">
          {!trimEnabled && <span className="eyebrow">The first point</span>}
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
                {timing.ok ? "" : timing.error.message} Its imported points do
                not carry the timestamps an alignment is measured against, and
                nothing here will invent them.
              </span>
            </div>
          )}
        </div>
      )}

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

          {/* The canvas's two in-frame facts, trim screen only: the playhead
              bottom-left, and the one blue mark once the serve is marked.
              Below `sm` they move to the top corners, clear of the controls. */}
          {trimEnabled && (
            <span
              className="mono tabular pointer-events-none absolute top-2.5 left-3.5 z-10 rounded-[var(--radius-cell)] bg-black/55 px-2 py-[3px] text-[11px] text-white sm:top-auto sm:bottom-3"
              data-testid="alignment-playhead"
            >
              {formatConfirmedVideoTime(currentTimeSeconds)}
            </span>
          )}
          {marked && (
            <span
              className="pointer-events-none absolute top-2.5 right-3.5 z-10 rounded-[var(--radius-cell)] bg-[var(--blue)] px-2 py-[3px] text-[11px] font-medium text-white sm:top-auto sm:bottom-3"
              data-testid="alignment-marked-badge"
            >
              First point marked
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
          trim={trimEnabled ? { window: trimWindow } : undefined}
        />

        {trimEnabled ? (
          <>
            {/* Tucked up under the rail, as drawn: the labels belong to it. */}
            <div className="-mt-1.5">
              {marked && lastPointSeconds !== null ? (
                <TrimRailLabels
                  firstPct={railPct(markedSeconds)}
                  lastPct={railPct(lastPointSeconds)}
                />
              ) : (
                <div className="h-3.5" aria-hidden="true" />
              )}
            </div>

            <div
              className="grid grid-cols-2 items-start gap-x-3 gap-y-3 sm:flex sm:justify-between"
              data-testid="alignment-trim"
              data-at-defaults={atDefaults ? "true" : "false"}
            >
              <TrimReadout
                side="start"
                seconds={marked ? trimWindow.startSeconds : null}
                caption={startCaption}
                disabled={!playable || !marked}
                onJump={() => trimWindow && api.seekTo(trimWindow.startSeconds)}
                onSet={api.setTrimStartHere}
              />
              <span
                className="order-last col-span-2 self-center text-center text-[12px] text-[var(--ink-500)] sm:order-none sm:col-span-1 sm:mt-2"
                data-testid="alignment-trim-keeps"
              >
                {marked ? (
                  <>
                    Keeps{" "}
                    <span className="tabular">
                      {formatTimecode(
                        Math.max(
                          0,
                          trimWindow.endSeconds - trimWindow.startSeconds,
                        ),
                      )}
                    </span>{" "}
                    of{" "}
                    <span className="tabular">
                      {formatTimecode(coverageDurationSeconds)}
                    </span>
                  </>
                ) : (
                  "Nothing is cut until you mark the first point"
                )}
              </span>
              <TrimReadout
                side="end"
                seconds={marked ? trimWindow.endSeconds : null}
                caption={endCaption}
                disabled={!playable || !marked}
                onJump={() => trimWindow && api.seekTo(trimWindow.endSeconds)}
                onSet={api.setTrimEndHere}
              />
            </div>
          </>
        ) : (
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
        )}

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
          {mode === "align" ? "Adjust the first point" : "The first point"}
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
            {trimEnabled ? "Mark the first point here" : "Use current time"}
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
          <b className="font-medium text-[var(--ink-700)]">
            {trimEnabled ? "Mark the first point here" : "Use current time"}
          </b>
          , or type the position yourself. Arrow keys on the scrub bar move a
          fine step; hold Shift for a second.
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
            data-trim={trimRefused ? "true" : undefined}
          >
            <XCircle
              className={`${noteIconCls} text-[var(--error)]`}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span>
              {error.message}
              {error.code === "insufficient_coverage" &&
                (trimRefused ? (
                  <>
                    {" "}
                    The cut leaves part of the match out — move the start before
                    the first point and the end after SwingVision&apos;s last
                    point.
                  </>
                ) : (
                  <>
                    {" "}
                    The time you marked is still here — adjust it, or go back
                    and choose a recording that runs to the end of the match.
                  </>
                ))}
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
              {trimEnabled
                ? "The cut covers the match"
                : "The recording covers the match"}
              . Point {plan.value.timing.finalPointNumber} ends at{" "}
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
