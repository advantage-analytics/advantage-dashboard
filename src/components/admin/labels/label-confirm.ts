import type { LabelGame } from "@/lib/services/labels/operations";
import type { LabelSide } from "@/lib/services/labels/session";
import type { SideNames } from "./label-format";

/**
 * The console's questions, as data: which confirm is open, and what it says.
 * Pure, so a spec can hold the copy without mounting Radix. Nothing is written
 * while a confirm is open: the write happens on the dialog's action, and Cancel
 * leaves every row as it was.
 */
export type LabelConfirm =
  | {
      kind: "delete-shot";
      shotId: string;
      /** As the rail numbers it: live strokes, 1…n. */
      shotNumber: number;
      pointNumber: number;
    }
  | {
      kind: "delete-point";
      pointId: string;
      pointNumber: number;
      /** Live strokes on the point. */
      shotCount: number;
    }
  | {
      kind: "move-point";
      pointId: string;
      pointNumber: number;
      to: LabelGame;
      /** The destination game's server — who the point's server becomes. */
      server: LabelSide;
      /**
       * What a yes switches besides the server (player-swap.ts
       * `moveSwapsPlayers`): every stroke's hitter, and the winner too when
       * the point has one; null when the rows already agree with the new
       * server and only `server` changes.
       */
      swaps: "shots" | "shots-and-winner" | null;
    }
  | {
      kind: "reset-shot";
      shotId: string;
      /** As the rail numbers it: live strokes, 1…n. */
      shotNumber: number;
      pointNumber: number;
    }
  | {
      kind: "reset-point";
      pointId: string;
      pointNumber: number;
      /** The point's own fields go back. */
      fields: boolean;
      /** Edited strokes that go back with it. */
      shots: number;
    }
  | {
      kind: "complete-session";
      /** What is still open (`completeWarnings`); empty when nothing is. */
      warnings: readonly string[];
    };

/** What a point's Reset replaces, and what it leaves. */
function resetPointDescription(fields: boolean, shots: number): string {
  const edited = `${shots} edited ${shots === 1 ? "shot" : "shots"}`;
  if (fields && shots > 0) {
    return `Your changes to this point — its game, server, serve side, winner, ending and who ended it — and to its ${edited} are replaced by the values they were seeded with. Shots you added or deleted, its note and checked mark stay as they are.`;
  }
  if (fields) {
    return "Your changes to this point — its game, server, serve side, winner, ending and who ended it — are replaced by the values it was seeded with. Its shots, note and checked mark stay as they are.";
  }
  return `Your changes to its ${edited} are replaced by the values they were seeded with. Shots you added or deleted, its note and checked mark stay as they are.`;
}

export interface LabelConfirmCopy {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  tone: "primary" | "danger";
}

export function labelConfirmCopy(
  confirm: LabelConfirm,
  names: SideNames,
): LabelConfirmCopy {
  switch (confirm.kind) {
    case "delete-shot":
      return {
        title: `Delete shot ${confirm.shotNumber}?`,
        description: `It comes off point ${confirm.pointNumber} and stops counting in the rally. You can undo this from the point's shots.`,
        confirmLabel: "Delete shot",
        pendingLabel: "Deleting…",
        tone: "danger",
      };
    case "delete-point":
      return {
        title: `Delete point ${confirm.pointNumber}?`,
        description:
          confirm.shotCount === 0
            ? "This deletes the row from the session. It stays as a deleted marker you can undo, and it no longer counts toward the points to check."
            : `This deletes the row and its ${confirm.shotCount === 1 ? "shot" : `${confirm.shotCount} shots`} from the session. It stays as a deleted marker you can undo, and it no longer counts toward the points to check.`,
        confirmLabel: "Delete point",
        pendingLabel: "Deleting…",
        tone: "danger",
      };
    case "move-point": {
      const player = names[confirm.server];
      const move = `Point ${confirm.pointNumber} moves to set ${confirm.to.setNumber}, game ${confirm.to.gameNumber}, and ${player} becomes its server.`;
      const swap =
        confirm.swaps === "shots-and-winner"
          ? " Every shot in this point changes hands, and so does who won it."
          : confirm.swaps === "shots"
            ? " Every shot in this point changes hands."
            : "";
      return {
        title: `${player} is serving this game, switch players?`,
        description: `${move}${swap}`,
        confirmLabel: "Switch players",
        pendingLabel: "Moving…",
        tone: "primary",
      };
    }
    case "reset-shot":
      return {
        title: `Reset shot ${confirm.shotNumber} to its original values?`,
        description: `Your changes to this shot in point ${confirm.pointNumber} are replaced by the values it was seeded with. Any field marked unclear stays marked.`,
        confirmLabel: "Reset",
        pendingLabel: "Resetting…",
        tone: "primary",
      };
    case "complete-session":
      return {
        title: "Mark this session complete?",
        description:
          confirm.warnings.length === 0
            ? "Every point is checked and the score adds up. The console becomes read-only; Reopen brings it back."
            : "Some things are still open. You can complete it anyway, and Reopen brings it back to fix them.",
        confirmLabel: "Mark complete",
        pendingLabel: "Completing…",
        tone: "primary",
      };
    case "reset-point":
      return {
        title: `Reset point ${confirm.pointNumber} to its original values?`,
        description: resetPointDescription(confirm.fields, confirm.shots),
        confirmLabel: "Reset",
        pendingLabel: "Resetting…",
        tone: "primary",
      };
  }
}
