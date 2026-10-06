"use client";

import type { LabelPoint, LabelSide } from "@/lib/services/labels/session";
import type { LabelGame } from "@/lib/services/labels/operations";
import type { InsertPosition } from "@/lib/services/labels/point-insert";
import type { CombineDirection } from "@/lib/services/labels/point-combine";
import type {
  LabelPointPatch,
  LabelShotPatch,
} from "@/lib/services/labels/edit";
import type { LabelPointScore } from "@/lib/services/labels/score";
import type { SideNames } from "./label-format";

/**
 * What the rail's rows share: the context every row draws and saves from,
 * the requests a row can make of the console, and the two sides' names. It
 * imports neither kind of row, so both can import it without a cycle.
 */

/**
 * The row operations a row can ask for. Each is a request: the console
 * decides whether it needs a confirm first, and does the write.
 */
export interface LabelRowOperations {
  onAskDeleteShot: (
    shotId: string,
    shotNumber: number,
    pointNumber: number,
  ) => void;
  onAskDeletePoint: (pointId: string) => void;
  onRestoreShot: (shotId: string) => void;
  onRestorePoint: (pointId: string) => void;
  onMovePoint: (pointId: string, to: LabelGame) => void;
  onSetChecked: (pointId: string, checked: boolean) => void;
  /** After `afterShotId`, or at the end of the rally when null. */
  onAddShot: (pointId: string, afterShotId: string | null) => void;
  onAskResetShot: (
    shotId: string,
    shotNumber: number,
    pointNumber: number,
  ) => void;
  onAskResetPoint: (pointId: string) => void;
  /**
   * Put a stroke the SITE removed (a ghost, board 08m §3) back into the
   * rally. The shown ghost row's Restore asks.
   */
  onRestoreSiteRemoval: (shotId: string) => void;
  /**
   * Say no to a suggestion the marks made on a point (board 08m §4): `key`
   * is the suggestion's own (`missing_shot:<vendor stroke id>`). The dashed
   * suggestion's Dismiss asks.
   */
  onDismissSuggestion: (pointId: string, key: string) => void;
  /**
   * Add a point the vendor never saw beside `anchorPointId`: BEFORE it (the
   * default — board 08m §5's slot on the second of two points served from
   * one side, and the ⋯ menu's "Add point above") or AFTER it ("Add point below"). The later points move up one
   * and the new one takes the slot, in the anchor's game.
   */
  onInsertPoint: (anchorPointId: string, position?: InsertPosition) => void;
  /**
   * Move the points left over past a game's end — the rows after the one
   * that decided it, which read "Game–30" — into the next game, and on down
   * the match while games run over (`game-shift.ts`). `fromPointId` is one of
   * those leftovers. The rail's slot before the first of them asks; so does
   * a leftover's ⋯ menu.
   */
  onShiftGameOverflow: (fromPointId: string) => void;
  /**
   * Split a point at one of its shots (`point-split.ts`): that shot and
   * every shot after it become a new point right below. A shot row's
   * "Split point here" asks; never on the point's first live shot.
   */
  onSplitPoint: (pointId: string, shotId: string) => void;
  /**
   * Combine a point with its live neighbour above or below in the same game
   * (`point-combine.ts`): the earlier point keeps every shot, the later
   * becomes a tombstone. The ⋯ menu asks.
   */
  onCombinePoints: (pointId: string, direction: CombineDirection) => void;
  /**
   * Switch a point's players by hand (`player-swap.ts`): every stroke's
   * hitter, the winner and ended by flipped; the server, set and game
   * stay. The ⋯ menu asks — first of all on a point whose rows contradict
   * its server.
   */
  onSwitchPlayers: (pointId: string) => void;
}

/**
 * What every row needs to draw and save its editors. The rail builds ONE of
 * these per change of its inputs and hands the same object to every row, so
 * a memoised row re-renders only when something in here moves. Nothing that
 * moves with the film belongs in it: what is playing goes to the rows it
 * touches as their own props.
 */
export interface EditContext {
  editable: boolean;
  names: SideNames;
  selectedShotId: string | null;
  onSelectShot?: (shotId: string) => void;
  onPatchPoint?: (pointId: string, patch: LabelPointPatch) => void;
  onPatchShot?: (shotId: string, patch: LabelShotPatch) => void;
  operations?: LabelRowOperations;
  /** Ghosts folded open to their struck-through row. */
  openGhostIds?: ReadonlySet<string>;
  onToggleGhost?: (id: string) => void;
  /** Every row, for the move menu's neighbouring games. */
  points: readonly LabelPoint[];
  /** `labelScores(points, adScoring).points`, computed once by the console. */
  scores: ReadonlyMap<string, LabelPointScore>;
  /**
   * `session.adScoring`, for the rows that re-run the scoreboard's rule —
   * the leftover check behind "Move leftover points to the next game".
   * Absent means ad scoring, as the loader's own fallback does.
   */
  adScoring?: boolean;
  /** The ground the rail's rows are drawn on (`label-rail-tone.ts`); absent, dark. */
  tone?: import("./label-rail-tone").RailTone;
}

/**
 * The playing point's span on the FILE clock — the `<video>`'s own seconds,
 * which is what `--film-t` carries — from its `labelFilmStops` stop.
 */
export interface PlayingWindow {
  start: number;
  end: number;
}

/** A side's chip letter: its cell label's first character. */
export function sideInitial(side: LabelSide, names: SideNames): string {
  return names[side].trim().charAt(0).toUpperCase();
}

/** The two players, in the order every menu of them lists them. */
export const SIDES: readonly LabelSide[] = ["p1", "p2"];

export function sideLabel(
  side: LabelSide | null,
  names: SideNames,
): string | null {
  return side ? names[side] : null;
}
