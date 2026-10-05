"use client";

import { Fragment, useMemo, type RefObject } from "react";
import { ClipboardList } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { cn } from "@/lib/utils";
import type {
  LabelGameType,
  LabelPoint,
  LabelSide,
} from "@/lib/services/labels/session";
import type {
  LabelPointPatch,
  LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelGame } from "@/lib/services/labels/operations";
import {
  bandsBeforePoints,
  labelScores,
  type LabelGameBand as LabelGameBandScore,
  type LabelPointScore,
} from "@/lib/services/labels/score";
import type { SideNames } from "./label-format";
import { LabelGameBand } from "./label-game-band";
import { DeletedPoint, PointRow } from "./label-point-row";
import type {
  EditContext,
  LabelRowOperations,
  PlayingWindow,
} from "./label-row-parts";
import { ShotRows } from "./label-shot-row";
import {
  POINT_COLUMNS,
  POINT_GRID,
  TABLE_MIN_WIDTH,
} from "./label-table-layout";

export type { LabelRowOperations };

/**
 * The stuck column header's height in px — its `min-h-[36px]`. The console
 * takes it off the top of the follow scroll's box, so the playing row is
 * brought to rest under the header rather than behind it.
 */
export const POINT_HEADER_HEIGHT = 36;

/**
 * The console's points table — board 08g's lower half.
 *
 * One row per `label_points` row, in `point_index` order (`PointRow`, in
 * `label-point-row.tsx`); the expanded point's strokes fold underneath it in
 * video order (the console keeps them there with `orderLabelShots`,
 * re-sorting after a time edit) as `ShotRows`, in `label-shot-row.tsx`. This
 * file owns the table's frame; a stroke's typed values are `EditableCell`s:
 * text until hovered, selected or opened from the keyboard, each change
 * handed straight to the console to autosave.
 *
 * Clicking a stroke (or tabbing into one) SELECTS it: the selected stroke
 * shows every field, and it is the one a court click places.
 *
 * Row operations (T7), each only a REQUEST to the console, which owns the
 * confirm and the write:
 *   · the ✕ at the far right of a stroke row, and Delete point in a point
 *     row's ⋯ menu, ask to delete it — the console opens a confirm dialog,
 *     and nothing is written before it;
 *   · the ⋯ menu's "Move to game…" lists the games either side, to move the
 *     point (the console asks "switch players?" when someone else serves it);
 *   · the open point's footer marks it checked (and Undo clears that), and
 *     adds a stroke after the selected one, or at the end of the rally;
 *   · Reset, on an edited stroke (beside its Edited pill) or an edited point
 *     (in its Status cell, and in its ⋯ menu) that has a stored seed, asks to
 *     put the row back to the values it was seeded with — it too only opens
 *     the console's confirm.
 *
 * A tombstone is not drawn as a row at all. A deleted point or shot is a thin
 * red rule with a "Deleted point" / "Deleted shot" pill on it — present, so
 * the labeller can see something was removed there, but never read as a
 * point to check or a stroke to count. The pill expands the rule to a
 * struck-through ghost of the row, with Undo.
 *
 * A GAME BAND (`LabelGameBand`, T14) is drawn above the first live point of
 * every `(set_number, game_number)` the scoreboard found: "Set 1 · Game 3",
 * the set's games before it, and who serves — the match Video tab's points
 * rail header, so the two lists read alike. The column headers are the DS
 * table header, `.eyebrow-sm`, here and over a point's strokes. A game with only tombstones in
 * it has no band. With `onSetGameType` / `onSetGameServer` the band's two
 * menus ask the console to change the whole game.
 *
 * The PLAYING point and stroke — the rows the video is on — carry
 * `data-playing="true"`: a light blue wash (on a point row only while it is
 * closed; open, it already has its own ground) and the row number in
 * `--blue` with a small play glyph after it. It is deliberately none of the
 * other row states — not the open point's grey, not the selected stroke's
 * white with hairlines, not an added stroke's ringed tint — and it changes
 * nothing: no point opens, no stroke is selected, nothing scrolls. The
 * playing POINT row also draws the points rail's 2px blue progress rule along
 * its foot, when the console hands in `playingWindow`.
 *
 * THE CARD IS THE SCROLLER (T19, `data-label-scroller`): it takes whatever
 * height its flex-column parent has left and scrolls BOTH ways inside itself
 * — down through the points, and sideways once the card is narrower than
 * `TABLE_MIN_WIDTH`. The column header is `sticky top-0` inside that same
 * element, so it stays at the card's top while the rows pass under it and
 * still travels sideways with the columns it names. It bleeds through the
 * table's side padding (`-mx-6 px-6`) so nothing shows beside it — a fold
 * overhangs the content — while its hairline stays the content's width.
 * `scrollerRef` hands the element to the console's follow scroll.
 *
 * Stateless but for one memo: which point is open, which stroke is selected,
 * which rows are playing, which tombstones are expanded and the rows
 * themselves are the caller's (`LabelConsole` holds them), so a spec can
 * render any state without clicking. The memo is the scoreboard —
 * `labelScores` walks every point, so it runs once per change of rows here
 * rather than once per row. `LabelPointsTableView` is the same table with the
 * scores handed in: no hook at all, for a spec that walks the element tree.
 */
export function LabelPointsTable({
  adScoring = true,
  ...props
}: Omit<LabelPointsTableViewProps, "scores" | "games"> & {
  /** `session.adScoring`: whether 40–40 goes to Ad, or the next point ends it. */
  adScoring?: boolean;
}) {
  const { points } = props;
  const scores = useMemo(
    () => labelScores(points, adScoring),
    [points, adScoring],
  );
  return (
    <LabelPointsTableView
      {...props}
      adScoring={adScoring}
      scores={scores.points}
      games={scores.games}
    />
  );
}

export interface LabelPointsTableViewProps {
  points: readonly LabelPoint[];
  /** Each live point's score before it, by id — `labelScores(…).points`. */
  scores: ReadonlyMap<string, LabelPointScore>;
  /**
   * The scoring `scores` were made with, for the rows' own re-reading of it
   * (a leftover point's "Move leftover points to the next game").
   */
  adScoring?: boolean;
  /** One band per game with a live point — `labelScores(…).games`. */
  games?: readonly LabelGameBandScore[];
  /** With both, and `editable`: the bands' game-type and server menus. */
  onSetGameType?: (game: LabelGame, type: LabelGameType) => void;
  onSetGameServer?: (game: LabelGame, server: LabelSide) => void;
  names: SideNames;
  expandedPointId: string | null;
  onTogglePoint?: (pointId: string) => void;
  /** False for a complete session, or with nothing to save to. */
  editable?: boolean;
  selectedShotId?: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  /** Absent: no ✕, no Undo, no ⋯ menu, no footer — the rows are read-only. */
  operations?: LabelRowOperations;
  /** Tombstones whose ghost row is showing. */
  openTombstoneIds?: ReadonlySet<string>;
  onToggleTombstone?: (id: string) => void;
  /** The point the video is on (see `playingRowAt`); null in dead time. */
  playingPointId?: string | null;
  /** The stroke the video is on, inside `playingPointId`. */
  playingShotId?: string | null;
  /**
   * The playing point's span in FILE seconds (its `labelFilmStops` stop) —
   * what its progress rule fills across. Absent: the row is marked, no rule.
   */
  playingWindow?: PlayingWindow | null;
  /** Lands on the scroll element — the card — for the follow scroll. */
  scrollerRef?: RefObject<HTMLDivElement | null>;
}

export function LabelPointsTableView({
  points,
  scores,
  adScoring = true,
  games = NO_GAMES,
  onSetGameType,
  onSetGameServer,
  names,
  expandedPointId,
  onTogglePoint,
  editable = false,
  selectedShotId = null,
  onSelectShot,
  onPatchPoint,
  onPatchShot,
  operations,
  openTombstoneIds = NO_IDS,
  onToggleTombstone,
  playingPointId = null,
  playingShotId = null,
  playingWindow = null,
  scrollerRef,
}: LabelPointsTableViewProps) {
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
    points,
    scores,
    adScoring,
    playingShotId,
  };
  // Each game's band goes above its first live point, once: a point moved
  // out of order never repeats it, and a tombstone never carries one.
  const bandBefore = bandsBeforePoints(points, games);
  return (
    <TooltipProvider>
      <div
        ref={scrollerRef}
        data-label-scroller=""
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
      >
        <div className={cn(TABLE_MIN_WIDTH, "px-6 pb-1.5")}>
          <div
            data-label-point-header=""
            className="sticky top-0 z-10 -mx-6 bg-[var(--surface-card)] px-6"
          >
            <div
              className={cn(
                POINT_GRID,
                "min-h-[36px] border-b border-[var(--border-hairline)] pt-0.5",
              )}
            >
              {POINT_COLUMNS.map((column, i) => (
                <span
                  key={i}
                  className={cn(
                    "eyebrow-sm whitespace-nowrap",
                    column.className,
                  )}
                >
                  {column.label}
                </span>
              ))}
            </div>
          </div>

          {points.length === 0 ? (
            <TableEmptyBody
              icon={ClipboardList}
              title="This session has no points"
            />
          ) : (
            points.map((point) => {
              if (point.status === "deleted") {
                return (
                  <DeletedPoint key={point.id} point={point} edit={edit} />
                );
              }
              const band = bandBefore.get(point.id);
              // One point unfolds: the current one (the console's
              // `currentPointId`, playing or resting). Nothing else does.
              const open = point.id === expandedPointId;
              return (
                <Fragment key={point.id}>
                  {band ? (
                    <LabelGameBand
                      band={band}
                      points={points}
                      names={names}
                      onSetGameType={editable ? onSetGameType : undefined}
                      onSetGameServer={editable ? onSetGameServer : undefined}
                    />
                  ) : null}
                  <PointRow
                    point={point}
                    open={open}
                    playing={point.id === playingPointId}
                    playingWindow={
                      point.id === playingPointId ? playingWindow : null
                    }
                    onToggle={onTogglePoint}
                    edit={edit}
                  >
                    {open && point.shots.length > 0 ? (
                      <ShotRows point={point} edit={edit} />
                    ) : null}
                  </PointRow>
                </Fragment>
              );
            })
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();
const NO_GAMES: readonly LabelGameBandScore[] = [];
