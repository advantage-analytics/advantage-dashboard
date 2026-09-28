import type { LabelGame } from "@/lib/services/labels/operations";
import type { LabelSide } from "@/lib/services/labels/session";
import type { SideNames } from "./label-format";

/**
 * The console's two questions, as data: which confirm is open, and what it
 * says. Pure, so a spec can hold the copy without mounting Radix (whose
 * portal renders nothing under `renderToStaticMarkup`).
 *
 * Nothing is written while a confirm is open. The ✕ on a row and a move into
 * a game someone else serves only ever OPEN one of these; the write happens
 * on the dialog's action, and Cancel leaves every row as it was.
 */
export type LabelConfirm =
  | {
      kind: "delete-shot";
      shotId: string;
      /** As the table numbers it: live strokes, 1…n. */
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
    };

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
        description: `This deletes the row from point ${confirm.pointNumber}. It stays as a deleted marker you can undo, and the vendor's original detection stays in the raw file.`,
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
      return {
        title: `${player} is serving this game, switch players?`,
        description: `Point ${confirm.pointNumber} moves to set ${confirm.to.setNumber}, game ${confirm.to.gameNumber}, and ${player} becomes its server.`,
        confirmLabel: "Switch players",
        pendingLabel: "Moving…",
        tone: "primary",
      };
    }
  }
}
