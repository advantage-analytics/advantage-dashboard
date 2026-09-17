"use client";

import { memo } from "react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Workspace } from "@/lib/workspace/types";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

import { filmProgressWidth } from "./film-clock";
import { lastNameOf } from "./film-filters";
import { serverFirstScore } from "./film-score";
import { shotLabel, type ShotStop } from "./film-shots";
import { PointRow } from "./point-list";

/**
 * "This point" (design canvas "Video B4"): the card under the player that
 * follows the playhead. Its head is the point's own row — the same `PointRow`
 * the list draws, so the mark, the score, the bookmark and the blue rule read
 * identically in both places — and under it the point's shots in rally
 * order, one row per stroke, each a seek to that stroke. The room's Shots
 * tab (`film-point-panel.tsx`), brought into the tab.
 *
 * Every time here is on the FILM clock: `shots` arrive already placed by
 * `shotStops`, and the point's window by `filmStops`; nothing here converts.
 *
 * Attribution (guardrails §4): `isYou`, the initials and the stroke's player
 * name all come from `useMatchSides()` upstream or here — never from
 * player1/player2 read off the point.
 */
export function FilmThisPoint({
  point,
  isYou,
  initials,
  workspace,
  showPointScore,
  activeStart,
  activeEnd,
  shots,
  position,
  activeShotId,
  onSelectPoint,
  onToggleSaved,
  onSelectShot,
  onOpenRoom,
}: {
  /** The point the playhead is inside, or null before the first serve. */
  point: MatchPoint | null;
  isYou: boolean;
  initials: string;
  workspace: Pick<Workspace, "kind" | "mark" | "iconUrl">;
  showPointScore: boolean;
  activeStart: number;
  activeEnd: number;
  /** This point's timed shots, in rally order, on the film clock. */
  shots: ShotStop[];
  /** 1-based place of the point in the applied cut, and the cut's size. */
  position: { index: number; total: number } | null;
  activeShotId: string | null;
  onSelectPoint: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
  onSelectShot: (stop: ShotStop) => void;
  onOpenRoom: () => void;
}) {
  const sides = useMatchSides();
  const youIsPlayer1 = sides.you.isPlayer1;

  const serverName = point
    ? lastNameOf(
        point.serverIsPlayer1 === youIsPlayer1
          ? sides.you.name
          : sides.opp.name,
      )
    : null;
  const score =
    point && showPointScore ? serverFirstScore(point.pointScore) : null;
  const activeIndex = shots.findIndex((s) => s.shot.id === activeShotId);

  return (
    <section
      aria-label="This point"
      className="surface-card flex min-h-0 flex-1 flex-col"
      style={{ padding: "10px 8px" }}
    >
      <div className="flex items-baseline gap-2.5 px-3 pt-1 pb-2">
        <span className="eyebrow">This point</span>
        {point ? (
          <span className="text-micro tabular truncate">
            Point {point.pointNumber} · Set {point.setNumber}, game{" "}
            {point.gameNumber}
            {score ? ` · ${score}` : ""} · {serverName} serving
          </span>
        ) : (
          <span className="text-micro">
            Press play, or pick a point — it lands here with every shot.
          </span>
        )}
      </div>

      {point && (
        <PointRow
          point={point}
          isYou={isYou}
          initials={initials}
          workspace={workspace}
          showPointScore={showPointScore}
          isActive
          activeStart={activeStart}
          activeEnd={activeEnd}
          onSelect={onSelectPoint}
          onToggleSaved={onToggleSaved}
        />
      )}

      <div className="mx-3 mt-1 border-t border-[var(--border-hairline)]" />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1">
        {point && shots.length === 0 ? (
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

      <div className="flex items-center gap-2 border-t border-[var(--border-hairline)] px-3 pt-2.5 pb-1">
        <span className="text-micro tabular">
          {position ? `Point ${position.index} / ${position.total}` : "—"}
          {" · "}
          {shots.length > 0
            ? `Shot ${activeIndex >= 0 ? activeIndex + 1 : "–"} of ${shots.length}`
            : "No timed shots"}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenRoom}
          className="cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)]"
        >
          Open in the room
        </button>
      </div>
    </section>
  );
}

/**
 * One stroke — the room's `ShotRow` in the light treatment. Memoized for the
 * same reason as `PointRow`: `timeupdate` re-renders the card ~4×/s and only
 * the row changing state should draw.
 */
const ShotRow = memo(function ShotRow({
  stop,
  order,
  playerName,
  isActive,
  onSelect,
}: {
  stop: ShotStop;
  /** Position in the rally, 1-based (a faulted first serve is numbered 0 upstream). */
  order: number;
  playerName: string;
  isActive: boolean;
  onSelect: (stop: ShotStop) => void;
}) {
  const { shot } = stop;
  const detail = [
    playerName,
    shot.zone,
    shot.result && shot.result !== "In" ? shot.result : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const label = shotLabel(shot);

  return (
    <button
      type="button"
      data-shot-id={shot.id}
      aria-current={isActive ? "true" : undefined}
      aria-label={`${label}, ${detail} — jump to this shot`}
      onClick={() => onSelect(stop)}
      className={cn(
        "relative flex h-10 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-element)] px-3 text-left transition-colors duration-200 hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        isActive && "bg-[var(--surface-subtle)]",
      )}
    >
      <span className="mono tabular w-4 shrink-0 text-right text-[10px] text-[var(--ink-400)]">
        {order}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[12px] text-[var(--ink-900)]">
          {label}
        </span>
        <span className="text-micro truncate">{detail}</span>
      </span>
      <div className="flex-1" />
      {shot.speedMph != null && (
        <span className="mono tabular shrink-0 text-[12px] text-[var(--ink-700)]">
          {Math.round(shot.speedMph)} mph
        </span>
      )}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 bg-[var(--blue)]"
          style={{ width: filmProgressWidth(stop.start, stop.end) }}
        />
      )}
    </button>
  );
});
