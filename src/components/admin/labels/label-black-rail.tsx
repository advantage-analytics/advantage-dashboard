"use client";

import { Fragment, useMemo, type FocusEvent, type RefObject } from "react";
import { Minimize2 } from "lucide-react";
import type { FollowAffordance } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  LabelPointPatch,
  LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelMarks } from "@/lib/services/labels/marks";
import type { LabelGame } from "@/lib/services/labels/operations";
import {
  labelScores,
  type LabelGameBand as LabelGameBandScore,
} from "@/lib/services/labels/score";
import type {
  LabelGameType,
  LabelPoint,
  LabelSide,
} from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import {
  BlackDeletedPoint,
  BlackGameBand,
  BlackPointRow,
  BlackSuggestedPoint,
  openPointSuggestions,
} from "./label-black-point-row";
import { BlackShotsWell } from "./label-black-shot-row";
import type { SideNames } from "./label-format";
import type {
  EditContext,
  LabelRowOperations,
  PlayingWindow,
} from "./label-row-parts";
import { LabelSaveStatus } from "./label-save-status";
import type { SaveStatus } from "./save-status";

/**
 * The black view's points rail (T33, board 08l's `.bk-rail`): the Video
 * tab's points list in its dark tone, carrying labels.
 *
 * A 46px header — "{player1} vs {player2}", "{checked} / {total} checked",
 * the save line in its dark tone and the way out (`Minimize2`, "Exit full
 * screen") — over the ONE scroller (`data-label-rail-scroller`), which is
 * what the console's follow scroll moves: a `BlackGameBand` before each
 * game's first live point, a `BlackPointRow` per point with the score before
 * it and its marks (board 08m, `label-black-mark.tsx`) in its tail, a
 * one-line dark tombstone with its Undo (`BlackDeletedPoint`) for a
 * deleted one, a dashed slot (`BlackSuggestedPoint`, board 08m §5) before a
 * point the marks think is missing a point in front of it, and the recessed
 * shots well (`BlackShotsWell`) under the open point only. The scroller
 * never scrolls sideways: every row is built to fit the rail from its
 * narrowest (520px), and `overflow-x-hidden` holds that.
 * The "Now playing" pill is pinned over the scroller's top-centre while held
 * and a point is playing, as it is over the light table.
 *
 * Stateless but for the scoreboard memo, exactly as `LabelPointsTableView`:
 * every callback is the console's, handed down unchanged, so follow and
 * hold, the shot loop, autosave, the row operations and the game menus work
 * here as they do in the light table — only the paint is this file's.
 */
export function LabelBlackRail({
  player1Name,
  player2Name,
  checked,
  total,
  saveStatus,
  onExit,
  scrollerRef,
  onFocusCapture,
  affordance,
  onFollow,
  points,
  adScoring = true,
  names,
  marks = null,
  expandedPointId,
  onTogglePoint,
  editable = false,
  selectedShotId = null,
  onSelectShot,
  onPatchPoint,
  onPatchShot,
  operations,
  onSetGameServer,
  onSetGameType,
  openTombstoneIds = NO_IDS,
  onToggleTombstone,
  marksEnabled = false,
  openGhostIds = NO_IDS,
  onToggleGhost,
  playingPointId = null,
  playingShotId = null,
  playingWindow = null,
}: {
  player1Name: string;
  player2Name: string;
  /** `labelProgress(points)`. */
  checked: number;
  total: number;
  saveStatus: SaveStatus;
  /** Back to the layout the console was in before this one. */
  onExit: () => void;
  /** Lands on the scroller, for the console's follow scroll. */
  scrollerRef?: RefObject<HTMLDivElement | null>;
  /** The console's editor-focus hold, on the rows' frame. */
  onFocusCapture?: (event: FocusEvent<HTMLDivElement>) => void;
  /** The "Now playing" pill's words while held; null for no pill. */
  affordance: FollowAffordance | null;
  onFollow: () => void;
  points: readonly LabelPoint[];
  /** `session.adScoring`. */
  adScoring?: boolean;
  names: SideNames;
  /**
   * The derivation's marks on these rows (the console's `marks` state). Null
   * draws the rows with no chip, no hover line and no suggestion.
   */
  marks?: LabelMarks | null;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
  editable?: boolean;
  selectedShotId?: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  /** Absent: no ⋯ menu, no tick, no Add shot — the rows are read-only. */
  operations?: LabelRowOperations;
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
  onSetGameType?: (game: LabelGame, type: LabelGameType) => void;
  openTombstoneIds?: ReadonlySet<string>;
  onToggleTombstone?: (id: string) => void;
  /**
   * `session.marksEnabled`: with it, and `marks` built, a stroke the site
   * removed is drawn as a ghost (board 08m §3); without, an ordinary row.
   */
  marksEnabled?: boolean;
  /** Ghosts shown as their struck-through row (the console's state). */
  openGhostIds?: ReadonlySet<string>;
  onToggleGhost?: (id: string) => void;
  playingPointId?: string | null;
  playingShotId?: string | null;
  playingWindow?: PlayingWindow | null;
}) {
  const scores = useMemo(
    () => labelScores(points, adScoring),
    [points, adScoring],
  );
  const edit: EditContext = {
    editable,
    names,
    selectedShotId,
    onSelectShot,
    onPatchPoint,
    onPatchShot,
    operations: editable ? operations : undefined,
    openTombstoneIds,
    onToggleTombstone,
    marksEnabled,
    openGhostIds,
    onToggleGhost,
    points,
    scores: scores.points,
    playingShotId,
  };
  const bandBefore = bandsBeforePoints(points, scores.games);
  // The slots still waiting for an answer, by the point whose row follows.
  const slotBefore = openPointSuggestions(points, edit, marks);

  return (
    <TooltipProvider>
      <div
        data-label-rail-header=""
        className="flex h-[46px] shrink-0 items-center gap-[10px] pr-[10px] pl-[14px] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]"
      >
        <span
          data-label-rail-title=""
          className="truncate text-[12px] font-medium text-white"
        >
          {player1Name} vs {player2Name}
        </span>
        <span
          data-label-rail-progress=""
          className="mono tabular shrink-0 text-[10px] whitespace-nowrap text-white/45"
        >
          {checked} <span className="text-white/25">/</span> {total} checked
        </span>
        <span className="flex-1" />
        <LabelSaveStatus status={saveStatus} tone="dark" />
        <button
          type="button"
          data-label-black-exit=""
          aria-label="Exit full screen"
          onClick={onExit}
          className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <Minimize2
            className="size-3.5"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* The scroller and the pill's positioning context: the pill sits over
          the rows rather than among them, so it stays put while they move. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="flex min-h-0 flex-1 flex-col"
          onFocusCapture={onFocusCapture}
        >
          <div
            ref={scrollerRef}
            data-label-rail-scroller=""
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-2"
          >
            {points.map((point) => {
              if (point.status === "deleted") {
                return (
                  <BlackDeletedPoint key={point.id} point={point} edit={edit} />
                );
              }
              const band = bandBefore.get(point.id);
              const slot = slotBefore.get(point.id);
              // The playing point is always unfolded, whatever is held: the
              // labeller sees its strokes light as they are hit. A held
              // point stays open beside it.
              const open =
                point.id === expandedPointId || point.id === playingPointId;
              return (
                <Fragment key={point.id}>
                  {band ? (
                    <BlackGameBand
                      band={band}
                      points={points}
                      names={names}
                      onSetGameType={editable ? onSetGameType : undefined}
                      onSetGameServer={editable ? onSetGameServer : undefined}
                    />
                  ) : null}
                  {/* The slot sits between the pair's two rows: after the
                      point before it (and any band), before this one. */}
                  {slot ? (
                    <BlackSuggestedPoint
                      suggestion={slot}
                      point={point}
                      edit={edit}
                    />
                  ) : null}
                  <BlackPointRow
                    point={point}
                    open={open}
                    playing={point.id === playingPointId}
                    playingWindow={
                      point.id === playingPointId ? playingWindow : null
                    }
                    score={scores.points.get(point.id)?.scoreBefore ?? null}
                    onToggle={onTogglePoint}
                    edit={edit}
                    marks={marks}
                  >
                    {open ? (
                      <BlackShotsWell point={point} edit={edit} marks={marks} />
                    ) : null}
                  </BlackPointRow>
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* The film room's return pill (point-list.tsx `FollowPill`) in the
            room's own dark recipe — the inset hairline, since the rail is
            as dark as the room — pinned to the scroller's top-centre, over
            the rows. */}
        {affordance ? (
          <button
            type="button"
            data-label-follow-pill=""
            aria-label={affordance.ariaLabel}
            onClick={onFollow}
            className={cn(
              "absolute top-3 left-1/2 z-10 inline-flex h-7 -translate-x-1/2 cursor-pointer items-center rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5 text-[11px] font-medium whitespace-nowrap text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] transition-[background-color,transform] duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.97]",
              // Pinned top, so it drops in (the keyframe reads the sign).
              "film-follow-pill-in [--film-pill-rise:-4px]",
            )}
          >
            {affordance.label}
          </button>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

/**
 * Each game's band goes above its first live point, once — as
 * `LabelPointsTableView` places them: a point moved out of order never
 * repeats it, and a tombstone never carries one.
 */
function bandsBeforePoints(
  points: readonly LabelPoint[],
  games: readonly LabelGameBandScore[],
): ReadonlyMap<string, LabelGameBandScore> {
  const bandByGame = new Map(
    games.map((band) => [`${band.setNumber}·${band.gameNumber}`, band]),
  );
  const bandBefore = new Map<string, LabelGameBandScore>();
  for (const point of points) {
    if (point.status === "deleted") continue;
    const key = `${point.setNumber}·${point.gameNumber}`;
    const band = bandByGame.get(key);
    if (!band) continue;
    bandBefore.set(point.id, band);
    bandByGame.delete(key);
  }
  return bandBefore;
}

const NO_IDS: ReadonlySet<string> = new Set();
