"use client";

import { useEffect, useState } from "react";

import type { MatchPoint } from "@/lib/data/match-points-server";
import { cn } from "@/lib/utils";

import type { FilmFilters } from "./film-filters";
import type { ShotStop } from "./film-shots";
import type { PointFocus } from "./film-timeline";
import type { FilmSectionId } from "./filters/types";
import { PointList } from "./point-list";

/**
 * The fullscreen room's points drawer (H2 frame R3).
 *
 * It is the 320px sheet and nothing more: the surface, its left hairline and
 * shadow, and the slide. What it holds is `PointList` on `tone="dark"` — the
 * same list the report column draws, the same rows, the same menu, the same
 * three zero states — so the room has no second list to keep in step. The
 * phase-1 duplicate that used to live here (a dark copy with its own tabs and
 * its own Shots list) is gone; the playing point unfolds its shots inside the
 * list instead, and Advanced opens in this column through the list's own
 * branch rather than as a modal over the film (R4).
 *
 * Advanced's open flag and its open sections are held here, not by the room:
 * they are the drawer's own view state, and keeping them here means the room
 * re-rendering four times a second while the film plays never touches them.
 */
export interface FilmRoomDrawerProps {
  /** `open` slides in; `closing` slides out, then `onExited` unmounts it.
   *  Flipping `closing` back to `open` turns the slide around mid-flight. */
  state: "open" | "closing";
  onExited: () => void;
  /** The 26px header glyph the drawer alone has: collapses the sheet. */
  onCollapse: () => void;
  /** Every point on the match — the filter universe and the count's denominator. */
  allPoints: MatchPoint[];
  /** The applied cut: the same array the shell's list gets. */
  visiblePoints: MatchPoint[];
  filters: FilmFilters;
  onFiltersChange: (filters: FilmFilters) => void;
  activePointId: string | null;
  /** Film-clock window of the playing point; the progress rule reads `--film-t`. */
  activeStart: number;
  activeEnd: number;
  onSelect: (point: MatchPoint) => void;
  onToggleSaved: (pointId: string) => void;
  /** Every timed shot on the film clock; only the playing point's unfold. */
  shotStops: ShotStop[];
  activeShotId: string | null;
  onSelectShot: (stop: ShotStop) => void;
  /** Follow-or-hold, the room's pass-through from `FilmRoom` to the list. */
  pointFocus: PointFocus;
  displayedPointId: string | null;
  onHoldPoint: (pointId: string | null) => void;
  onFollow: () => void;
  /** The playing point and its place in the cut: the pill's inputs. */
  nowPlaying: { id: string; index: number | null } | null;
}

export function FilmRoomDrawer({
  state,
  onExited,
  onCollapse,
  allPoints,
  visiblePoints,
  filters,
  onFiltersChange,
  activePointId,
  activeStart,
  activeEnd,
  onSelect,
  onToggleSaved,
  shotStops,
  activeShotId,
  onSelectShot,
  pointFocus,
  displayedPointId,
  onHoldPoint,
  onFollow,
  nowPlaying,
}: FilmRoomDrawerProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [openSections, setOpenSections] = useState<FilmSectionId[]>([]);

  // The drawer mounts off-canvas and slides in on the next frame. A CSS
  // transition (not a keyframe) carries both directions, so a close caught
  // mid-open, or a reopen caught mid-close, turns around from wherever the
  // sheet is instead of snapping to an end and starting over.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const shown = arrived && state === "open";

  return (
    <aside
      aria-label="Points"
      // The room's enter/exit fade catches every `data-film-chrome` node, so
      // the sheet leaves with the rest of the chrome rather than after it.
      data-film-chrome=""
      data-state={shown ? "open" : "closed"}
      // The fast path back to `closed`: the room also runs a timer, because a
      // page that stops painting never delivers this event.
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && state === "closing") onExited();
      }}
      className={cn(
        "absolute inset-y-0 right-0 flex w-[320px] max-w-full flex-col bg-[rgba(13,13,13,0.88)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1),-24px_0_48px_-12px_rgba(0,0,0,0.45)]",
        // A solid sheet travelling in from the edge: no fade, so it reads as
        // one surface arriving over the film rather than dissolving onto it.
        // In on the room's expo curve; out quicker, accelerating off-screen.
        // Reduced motion keeps the state change as a short fade, no travel.
        "transition-[translate] motion-reduce:transition-opacity motion-reduce:duration-200",
        shown
          ? "translate-x-0 duration-[420ms] ease-[var(--ease-out-expo)] motion-reduce:opacity-100"
          : "translate-x-full duration-[260ms] ease-[cubic-bezier(0.32,0,0.67,0)] motion-reduce:translate-x-0 motion-reduce:opacity-0",
      )}
    >
      <PointList
        allPoints={allPoints}
        visiblePoints={visiblePoints}
        filters={filters}
        onFiltersChange={onFiltersChange}
        advancedOpen={advancedOpen}
        onAdvancedOpenChange={setAdvancedOpen}
        openSections={openSections}
        onOpenSectionsChange={setOpenSections}
        activePointId={activePointId}
        activeStart={activeStart}
        activeEnd={activeEnd}
        onSelect={onSelect}
        onToggleSaved={onToggleSaved}
        tone="dark"
        onCollapse={onCollapse}
        shotStops={shotStops}
        activeShotId={activeShotId}
        onSelectShot={onSelectShot}
        pointFocus={pointFocus}
        displayedPointId={displayedPointId}
        onHoldPoint={onHoldPoint}
        onFollow={onFollow}
        nowPlaying={nowPlaying}
      />
    </aside>
  );
}
