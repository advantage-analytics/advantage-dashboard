"use client";

import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

import { lastNameOf } from "./film-filters";
import {
  shotRowCells,
  shotRowRevealDelay,
  UNMEASURED,
  type ShotStop,
} from "./film-shots";
import type { followAffordance } from "./film-timeline";

/**
 * "This point" (handoff H1 §B, frame `E-route-P1-P2.html`): the card under
 * the player that follows the playhead. Its head is an eyebrow and the point
 * stepper; under it the point's shots in rally order, one grid row per stroke,
 * each a seek to that stroke; under those a footer that says how the point
 * ran and how it ended.
 *
 * Every time here is on the FILM clock: `shots` arrive already placed by
 * `shotStops`, and the point's window by `filmStops`; nothing here converts.
 *
 * Attribution (guardrails §4): the stroke's player name comes from
 * `useMatchSides()`, never from player1/player2 read off the shot.
 */
/**
 * The two column sets, and the switch between them.
 *
 * Breakpoint: **880px of report pane**, queried against the unnamed
 * `@container` on `MatchReportPane` (`match-report.tsx`). At a 1440 viewport
 * the pane's content box is 796px with the app sidebar expanded (1440 − 232px
 * sidebar − 300px match rail − 112px pane padding) and 964px with it collapsed
 * (the rail returns 168px), so 880px is the midpoint that separates the two
 * shell states without anything here reading sidebar state.
 *
 * Columns are ADDED, never re-sorted: Spin and Type appear between the
 * five shared ones, which hold the same order in both states.
 */
const NARROW_COLUMNS = "grid-cols-[16px_104px_88px_minmax(0,1fr)_48px]";
const WIDE_COLUMNS =
  "@min-[880px]:grid-cols-[16px_104px_60px_76px_74px_minmax(0,1fr)_48px]";
/** Spin and Type: drawn only in the wide set. */
const WIDE_ONLY = "hidden @min-[880px]:block";

export const FilmThisPoint = memo(function FilmThisPoint({
  point,
  shots,
  position,
  activeShotId,
  affordance,
  onFollow,
  onSelectShot,
  onStep,
}: {
  /**
   * The DISPLAYED point (T20): the held one while the viewer holds a point,
   * else the one the playhead is inside; null before the first serve. The
   * rows, the footer and the empty copy all read it, so while held they stay
   * put when the film crosses into the next point.
   */
  point: MatchPoint | null;
  /** The displayed point's timed shots, in rally order, on the film clock. */
  shots: ShotStop[];
  /**
   * The PLAYING point's 1-based place in the applied cut, and the cut's size
   * — null in dead time and for a point outside the cut.
   */
  position: { index: number; total: number } | null;
  /**
   * The playing point's lit shot. It belongs to the playing point's shots, so
   * while held on another point no drawn row matches it and none is washed.
   */
  activeShotId: string | null;
  /**
   * The header line's strings while held on a point other than the playing
   * one; null otherwise. Non-null replaces the counter with the line.
   */
  affordance: ReturnType<typeof followAffordance>;
  /** Back to following the film — the header line's press. */
  onFollow: () => void;
  /**
   * Hold a point. The card's shot clicks already arrive wrapped (the tab's
   * `onSelectShot` holds or follows before it seeks), so the card itself
   * never calls this; it is here so the card's props name both transitions.
   */
  onHoldPoint: (pointId: string) => void;
  onSelectShot: (stop: ShotStop) => void;
  /** Walk the applied cut — the same step the transport takes. */
  onStep: (direction: -1 | 1) => void;
}) {
  const sides = useMatchSides();
  const youIsPlayer1 = sides.you.isPlayer1;

  const seconds = point?.duration != null ? Math.round(point.duration) : null;
  const ended = point ? point.resultType || "Point" : null;

  return (
    <section
      aria-label="This point"
      className="surface-card flex min-h-0 flex-1 flex-col"
      style={{ padding: "10px 8px 8px" }}
    >
      <div className="flex shrink-0 items-center gap-2.5 pt-0.5 pr-[5px] pb-2.5 pl-3">
        <span className="eyebrow">This point</span>
        <div className="flex-1" />
        <div className="inline-flex shrink-0 items-center gap-0.5">
          <StepButton
            direction={-1}
            label="Previous point"
            disabled={!position}
            onStep={onStep}
          />
          {affordance ? (
            // T20 (frame C1): while held, the line takes the counter's place
            // between the step buttons — it carries the playing point's number
            // — and the counter returns as-is on re-follow. `h-7` in the
            // `size-7` row, so the head keeps its height; the counter's 56px
            // `min-w` is not applied here.
            <button
              type="button"
              aria-label={affordance.ariaLabel}
              onClick={onFollow}
              className="film-follow-pill-in inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-element)] px-1.5 text-[11px] font-medium whitespace-nowrap transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              style={{ color: "var(--ink-600)" }}
            >
              {affordance.label}
              <ChevronRight aria-hidden className="size-3" strokeWidth={1.6} />
            </button>
          ) : (
            <span
              className="mono tabular min-w-[56px] text-center text-[11px] whitespace-nowrap"
              style={{ color: "var(--ink-500)" }}
            >
              {position
                ? `${position.index} / ${position.total}`
                : `${UNMEASURED} / ${UNMEASURED}`}
            </span>
          )}
          <StepButton
            direction={1}
            label="Next point"
            disabled={!position}
            onStep={onStep}
          />
        </div>
      </div>

      <div
        className={cn(
          "mb-1.5 grid shrink-0 items-center gap-x-4 border-b border-[var(--border-hairline)] px-3 pb-2.5",
          NARROW_COLUMNS,
          WIDE_COLUMNS,
        )}
      >
        <HeadCell>#</HeadCell>
        <HeadCell>Player</HeadCell>
        <HeadCell className={WIDE_ONLY}>Spin</HeadCell>
        <HeadCell>Stroke</HeadCell>
        <HeadCell className={WIDE_ONLY}>Type</HeadCell>
        <HeadCell>Placement</HeadCell>
        <HeadCell>Result</HeadCell>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!point ? (
          <span className="text-micro px-3 py-3">
            Press play, or pick a point — it lands here with every shot.
          </span>
        ) : shots.length === 0 ? (
          <span className="text-micro px-3 py-3">
            The shots on this point were never timed against the video.
          </span>
        ) : (
          shots.map((stop, i) => (
            <ShotRow
              key={stop.shot.id}
              stop={stop}
              order={i + 1}
              playerName={lastNameOf(
                stop.shot.isPlayer1 === youIsPlayer1
                  ? sides.you.name
                  : sides.opp.name,
              )}
              isActive={stop.shot.id === activeShotId}
              onSelect={onSelectShot}
            />
          ))
        )}
      </div>

      <div className="mx-3 mt-2.5 flex shrink-0 items-center gap-2.5 border-t border-[var(--border-hairline)] pt-3 pb-1">
        <span className="text-micro tabular">
          {shots.length} {shots.length === 1 ? "shot" : "shots"}
          {seconds != null ? ` · ${seconds}s` : ""}
        </span>
        {ended && (
          <>
            <span className="text-[11px]" style={{ color: "var(--ink-300)" }}>
              ·
            </span>
            <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
              {ended}
            </span>
          </>
        )}
      </div>
    </section>
  );
});

function HeadCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("text-[10px]", className)}
      style={{ color: "var(--ink-400)" }}
    >
      {children}
    </span>
  );
}

function StepButton({
  direction,
  label,
  disabled,
  onStep,
}: {
  direction: -1 | 1;
  label: string;
  disabled: boolean;
  onStep: (direction: -1 | 1) => void;
}) {
  const Icon = direction === -1 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => onStep(direction)}
      className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon
        className="size-3.5"
        strokeWidth={1.5}
        style={{ color: "var(--nav-fg)" }}
      />
    </button>
  );
}

/**
 * One stroke, as a grid row over the card's own column tracks. Memoized
 * because `timeupdate` re-renders the card ~4×/s and only the row changing
 * state should draw.
 */
const ShotRow = memo(function ShotRow({
  stop,
  order,
  playerName,
  isActive,
  onSelect,
}: {
  stop: ShotStop;
  /** Position in the rally, 1-based. */
  order: number;
  playerName: string;
  isActive: boolean;
  onSelect: (stop: ShotStop) => void;
}) {
  const cells = shotRowCells(stop.shot, order, playerName);

  return (
    <button
      type="button"
      data-shot-id={stop.shot.id}
      aria-current={isActive ? "true" : undefined}
      aria-label={`${cells.order}. ${cells.player} ${cells.stroke}, ${cells.placement}, ${cells.result} — jump to this shot`}
      onClick={() => onSelect(stop)}
      // T9: the same reveal the room's shot well draws, on the shell's own
      // row height. Mount-driven — rows are keyed by `shot.id`, so the card
      // swapping points mounts a fresh set and replays this, while the
      // four-times-a-second `timeupdate` re-render bails out of the memo
      // above.
      style={{ animationDelay: `${shotRowRevealDelay(order)}ms` }}
      className={cn(
        "film-shot-row-in grid h-10 w-full shrink-0 cursor-pointer items-center gap-x-4 rounded-[var(--radius-element)] px-3 text-left transition-colors duration-200 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        NARROW_COLUMNS,
        WIDE_COLUMNS,
        isActive && "bg-[var(--surface-subtle)]",
      )}
    >
      <span
        className="mono tabular text-[10px]"
        style={{ color: "var(--ink-400)" }}
      >
        {cells.order}
      </span>
      <Cell ink="var(--ink-900)">{cells.player}</Cell>
      <Cell className={WIDE_ONLY} ink="var(--ink-600)">
        {cells.spin}
      </Cell>
      <Cell ink={order === 1 ? "var(--ink-900)" : "var(--ink-700)"}>
        {cells.stroke}
      </Cell>
      <Cell className={WIDE_ONLY} ink="var(--ink-700)">
        {cells.type}
      </Cell>
      <Cell
        ink={
          cells.placement === UNMEASURED ? "var(--ink-400)" : "var(--ink-700)"
        }
      >
        {cells.placement}
      </Cell>
      <Cell
        ink={cells.result === UNMEASURED ? "var(--ink-400)" : "var(--ink-700)"}
      >
        {cells.result}
      </Cell>
    </button>
  );
});

function Cell({
  children,
  ink,
  className,
}: {
  children: React.ReactNode;
  ink: string;
  className?: string;
}) {
  return (
    <span
      className={cn("truncate text-[12px]", className)}
      style={{ color: ink }}
    >
      {children}
    </span>
  );
}
