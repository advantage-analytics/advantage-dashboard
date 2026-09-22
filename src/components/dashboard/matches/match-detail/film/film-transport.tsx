"use client";

import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  Minimize,
  MoreVertical,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Timer,
  TimerOff,
  Volume2,
  VolumeOff,
} from "lucide-react";

import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";

import { RepeatOff } from "./film-glyphs";
import { FilmTrack } from "./film-track";
import type { TrackSegment } from "./film-timeline";

/** Playback rates the speed control cycles through. */
export const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;

const GLYPH =
  "block h-[15px] w-[15px] cursor-pointer rounded-[2px] text-white/85 transition-opacity duration-200 hover:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** The two 14px point chevrons in the title row. */
const CHEVRON =
  "block h-3.5 w-3.5 shrink-0 cursor-pointer rounded-[2px] text-white/70 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/**
 * An icon-only control: `aria-label` plus the design system's dark tooltip
 * (`ChromeTooltip`, the one every icon-only control in the shell answers
 * hover with), always — with the key that does the same thing where there
 * is one.
 *
 * Nothing here takes `disabled`. In the room every control stays operable and
 * a control with nothing to do simply does nothing — a greyed-out chevron over
 * a film that is still playing reads as breakage, and the only inert control
 * on the bar is "More", which is `aria-disabled` because it is drawn but not
 * yet defined.
 */
function Glyph({
  label,
  shortcut,
  pressed,
  className,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  /** Colour overrides — the court glyph dims itself rather than resting. */
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ChromeTooltip label={label} shortcut={shortcut} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(GLYPH, pressed && "text-white", className)}
      >
        {children}
      </button>
    </ChromeTooltip>
  );
}

export interface FilmTransportProps {
  /** Extra classes on the block — the room passes its pointer-events state. */
  className?: string;
  title: string;
  subtitle: string | null;
  /** 1-based position of the playing point in the walked sequence, and its size. */
  position: { index: number; total: number } | null;
  segments: TrackSegment[];
  duration: number;
  currentTime: number;
  playing: boolean;
  muted: boolean;
  rate: number;
  looping: boolean;
  skippingDeadTime: boolean;
  /** Whether the playing point is bookmarked; null when no point is playing. */
  saved: boolean | null;
  canStep: boolean;
  /** Whether the mini court is drawn over the film. */
  courtOn: boolean;
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
  onStep: (direction: -1 | 1) => void;
  onToggleSaved: () => void;
  onToggleSkipDeadTime: () => void;
  onCycleRate: () => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onToggleCourt: () => void;
  onExit: () => void;
}

/**
 * The bottom block of the fullscreen frame (handoff F1): title row, the
 * set-by-set track, then the control row. Every glyph is 15px at 85%
 * white 18px apart; Save point fills once the point is saved, and nothing
 * else is filled. Text shadows are
 * off — the scrim under this block carries the contrast.
 *
 * Every toggle reads its state the same way here and in the tab's player
 * (`film-player.tsx`): the plain glyph when on, Lucide's slashed variant when
 * off — `TimerOff`, `VolumeOff`, and `RepeatOff` from `film-glyphs.tsx` for
 * the one the library lacks. Labels follow: "Loop this point — on/off",
 * "Skip dead time — on/off", "Sound — on/off", "Show the court — on/off".
 *
 * Each control's tooltip carries the key that does the same thing, which is
 * why the room needs no shortcut overlay: space · ← · → · S · D · L · M · C ·
 * Esc.
 */
export function FilmTransport(p: FilmTransportProps) {
  // Nothing on the bar is disabled, so the controls that need something to
  // act on carry the check themselves: with no walkable sequence a chevron
  // is a no-op, and before the playhead has reached its first point the
  // bookmark has nothing to save (`saved` is null only there — after that it
  // tracks the last point REACHED, so the control still works in the dead
  // time after a rally, which is when it is reached for).
  const stepBack = () => {
    if (p.canStep) p.onStep(-1);
  };
  const stepOn = () => {
    if (p.canStep) p.onStep(1);
  };
  const toggleSaved = () => {
    if (p.saved !== null) p.onToggleSaved();
  };

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 flex flex-col gap-[9px] px-6 pb-3.5",
        p.className,
      )}
    >
      <div className="flex items-end gap-3 pb-px">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[12px] font-medium text-white">
            {p.title}
          </span>
          {p.subtitle && (
            <span className="truncate text-[10px] text-white/55">
              {p.subtitle}
            </span>
          )}
        </div>
        <div className="flex-1" />
        <div
          className="flex items-center gap-3.5"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
        >
          {p.position && (
            <span className="mono text-[9px] tracking-[1.4px] text-white/50 uppercase">
              Point {p.position.index} / {p.position.total}
            </span>
          )}
          <ChromeTooltip label="Previous point" shortcut="←" side="top">
            <button
              type="button"
              aria-label="Previous point"
              onClick={stepBack}
              className={CHEVRON}
            >
              <ChevronLeft
                className="h-3.5 w-3.5"
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
          <ChromeTooltip label="Next point" shortcut="→" side="top">
            <button
              type="button"
              aria-label="Next point"
              onClick={stepOn}
              className={CHEVRON}
            >
              <ChevronRight
                className="h-3.5 w-3.5"
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
        </div>
      </div>

      <FilmTrack
        segments={p.segments}
        duration={p.duration}
        currentTime={p.currentTime}
        onSeek={p.onSeek}
      />

      <div className="flex h-10 items-center gap-[18px]">
        <Glyph
          label={p.playing ? "Pause" : "Play"}
          shortcut="space"
          onClick={p.onTogglePlay}
        >
          {p.playing ? (
            <Pause
              className="h-full w-full"
              strokeWidth={1.6}
              fill="currentColor"
              aria-hidden="true"
            />
          ) : (
            <Play
              className="h-full w-full"
              strokeWidth={1.6}
              fill="currentColor"
              aria-hidden="true"
            />
          )}
        </Glyph>
        <Glyph label="Previous point" shortcut="←" onClick={stepBack}>
          <SkipBack
            className="h-full w-full"
            strokeWidth={1.6}
            fill="currentColor"
            aria-hidden="true"
          />
        </Glyph>
        <Glyph label="Next point" shortcut="→" onClick={stepOn}>
          <SkipForward
            className="h-full w-full"
            strokeWidth={1.6}
            fill="currentColor"
            aria-hidden="true"
          />
        </Glyph>
        {/* Opening (R11): nothing is measured yet, so the slot reads one dash
            rather than the false precision of "0:00 / 0:00". */}
        <span className="mono tabular text-[11px] text-white/75">
          {p.duration > 0
            ? `${formatClock(p.currentTime)} / ${formatClock(p.duration)}`
            : "—"}
        </span>

        <div className="flex-1" />

        <Glyph
          label={p.saved ? "Saved — remove bookmark" : "Save point"}
          shortcut="S"
          pressed={p.saved === true}
          onClick={toggleSaved}
        >
          <Bookmark
            className="h-full w-full"
            strokeWidth={1.6}
            fill={p.saved ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </Glyph>

        <Glyph
          label={
            p.skippingDeadTime ? "Skip dead time — on" : "Skip dead time — off"
          }
          shortcut="D"
          pressed={p.skippingDeadTime}
          onClick={p.onToggleSkipDeadTime}
        >
          {p.skippingDeadTime ? (
            <Timer
              className="h-full w-full"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          ) : (
            <TimerOff
              className="h-full w-full"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          )}
        </Glyph>

        <ChromeTooltip label={`Playback speed, ${p.rate}×`} side="top">
          <button
            type="button"
            aria-label={`Playback speed, ${p.rate}×`}
            // Called with no argument on purpose: the room's handler takes an
            // optional direction, and a bare `onClick={p.onCycleRate}` would
            // hand it the click event.
            onClick={() => p.onCycleRate()}
            className="mono cursor-pointer rounded-[2px] text-[11px] font-medium text-white/85 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {p.rate}×
          </button>
        </ChromeTooltip>

        <Glyph
          label={p.looping ? "Loop this point — on" : "Loop this point — off"}
          shortcut="L"
          pressed={p.looping}
          onClick={p.onToggleLoop}
        >
          {p.looping ? (
            <Repeat
              className="h-full w-full"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          ) : (
            <RepeatOff
              className="h-full w-full"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          )}
        </Glyph>

        <Glyph
          label={p.muted ? "Sound — off" : "Sound — on"}
          shortcut="M"
          pressed={!p.muted}
          onClick={p.onToggleMute}
        >
          {p.muted ? (
            <VolumeOff
              className="h-full w-full"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          ) : (
            <Volume2
              className="h-full w-full"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          )}
        </Glyph>

        {/* A readout, not a surface: the court's own toggle. Off dims the
            glyph to 45% — the state is in the label, and this is the one
            control the frame colours rather than filling. */}
        <Glyph
          label={p.courtOn ? "Show the court — on" : "Show the court — off"}
          shortcut="C"
          pressed={p.courtOn}
          className={p.courtOn ? "text-white" : "text-white/45"}
          onClick={p.onToggleCourt}
        >
          <Grid2x2
            className="h-full w-full"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </Glyph>

        <Glyph label="Exit fullscreen" shortcut="Esc" onClick={p.onExit}>
          <Minimize
            className="h-full w-full"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </Glyph>

        {/* Drawn on the handoff, defined nowhere. Inert and says so. */}
        <ChromeTooltip label="More" detail="Not wired up yet" side="top">
          <button
            type="button"
            aria-disabled="true"
            aria-label="More — not available yet"
            className="block h-[15px] w-[15px] cursor-default rounded-[2px] text-white/85 opacity-45 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <MoreVertical
              className="h-full w-full"
              strokeWidth={1.6}
              aria-hidden="true"
            />
          </button>
        </ChromeTooltip>
      </div>
    </div>
  );
}
