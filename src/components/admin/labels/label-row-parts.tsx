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
import type { RailTone } from "./label-rail-tone";

/**
 * What the rail's rows share: the context every row draws and saves from,
 * the requests a row can make of the console, and the two sides' names. It
 * imports neither kind of row, so both can import it without a cycle.
 */

/** What a row can ask of the console, which decides and does the write. */
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
  /** Put a stroke the site removed (a ghost) back into the rally. */
  onRestoreSiteRemoval: (shotId: string) => void;
  /** Dismiss a suggestion on a point, by its own `key`. */
  onDismissSuggestion: (pointId: string, key: string) => void;
  /** Add a point beside `anchorPointId`: before it (the default) or after. */
  onInsertPoint: (anchorPointId: string, position?: InsertPosition) => void;
  /** Move a game's leftover points into the next game (`game-shift.ts`). */
  onShiftGameOverflow: (fromPointId: string) => void;
  /** Split a point at one of its shots (`point-split.ts`). */
  onSplitPoint: (pointId: string, shotId: string) => void;
  /**
   * Combine a point with a live neighbour in its game (`point-combine.ts`).
   */
  onCombinePoints: (pointId: string, direction: CombineDirection) => void;
  /** Switch a point's players by hand (`player-swap.ts`). */
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
  /**
   * The hint line's answers under a rally ball marked out: remove every live
   * stroke after `shotId` in its point as hit after the point ended, and put
   * a removal's tombstones back. Absent where the console cannot write.
   */
  onRemoveShotsAfter?: (pointId: string, shotId: string) => void;
  onRestoreShots?: (pointId: string, shotIds: string[]) => void;
  /** Ghosts folded open to their struck-through row. */
  openGhostIds?: ReadonlySet<string>;
  onToggleGhost?: (id: string) => void;
  /** Every row, for the move menu's neighbouring games. */
  points: readonly LabelPoint[];
  /** `labelScores(points, adScoring).points`, computed once by the console. */
  scores: ReadonlyMap<string, LabelPointScore>;
  /** `session.adScoring`. Absent means ad scoring. */
  adScoring?: boolean;
  /**
   * `session.playOnLets`. False (and absent) means lets are replayed, so a
   * serve row's result offers `Let`; true, the result is the landing's alone.
   */
  playOnLets?: boolean;
  /** The ground the rail's rows are drawn on (`label-rail-tone.ts`); absent, dark. */
  tone?: RailTone;
}

/** The playing point's span on the FILE clock, which `--film-t` carries. */
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
