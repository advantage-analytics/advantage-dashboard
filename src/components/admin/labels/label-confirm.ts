import type { LabelGame } from "@/lib/services/labels/operations";
import type { ServeHitterFollow } from "@/lib/services/labels/serve-hitter";
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
      /**
       * A game's header dragged past points whose players switch with their
       * new server (game-boundary.ts). A drag that switches nobody's players
       * is not asked about.
       */
      kind: "move-boundary";
      to: LabelGame;
      /** The destination's rank in its set, as the band numbers it. */
      gameInSet: number;
      /** The points to move, in the order to move them. */
      pointIds: readonly string[];
      /** The destination game's server. */
      server: LabelSide;
      /** How many of the points switch players. */
      swaps: number;
    }
  | {
      /**
       * A serve given to the other player (serve-hitter.ts): whether the
       * rest of the point, and the game's server, follow it. The one confirm
       * with a second answer — "Only this shot" writes the edit alone.
       */
      kind: "serve-hitter";
      shotId: string;
      pointNumber: number;
      /** The game's rank in its set, as the band numbers it. */
      gameInSet: number | null;
      follow: ServeHitterFollow;
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
  /** A second answer at the footer's left; absent on every confirm but one. */
  alternativeLabel?: string;
}

/** What a serve changing hands takes with it, as the confirm says it. */
function serveHitterCopy(
  confirm: Extract<LabelConfirm, { kind: "serve-hitter" }>,
  names: SideNames,
): LabelConfirmCopy {
  const { follow, pointNumber } = confirm;
  const player = names[follow.hitter];
  const rest =
    follow.point === "shots-and-winner"
      ? `Every other shot in point ${pointNumber} changes hands, and so does who won it.`
      : follow.point === "shots"
        ? `Every other shot in point ${pointNumber} changes hands.`
        : "";
  const base = {
    pendingLabel: "Switching…",
    tone: "primary" as const,
    alternativeLabel: "Only this shot",
  };
  if (!follow.game) {
    return {
      ...base,
      title: `${player} served point ${pointNumber}, switch the other shots?`,
      description: rest,
      confirmLabel: "Switch players",
    };
  }
  const { game, type, first, points, switched } = follow.game;
  const others =
    switched === 0
      ? ""
      : switched === 1
        ? "The players switch on 1 other point too."
        : `The players switch on ${switched} other points too.`;
  if (type === "game") {
    const where = `set ${game.setNumber}, game ${confirm.gameInSet ?? game.gameNumber}`;
    const scope =
      points === 1
        ? `${player} becomes the server of ${where}.`
        : `${player} becomes the server of all ${points} points in ${where}.`;
    return {
      ...base,
      title: `${player} served point ${pointNumber}, change the game's server?`,
      description: [scope, rest, others].filter(Boolean).join(" "),
      confirmLabel: "Change server",
    };
  }
  const name = type === "tiebreak" ? "tiebreak" : "match tiebreak";
  return {
    ...base,
    title: `${player} served point ${pointNumber}, reorder the ${name}?`,
    description: [
      `The ${name}'s serve order is rebuilt around it: ${names[first]} serves first, then two points each in turn.`,
      rest,
      others,
    ]
      .filter(Boolean)
      .join(" "),
    confirmLabel: "Reorder serves",
  };
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
    case "move-boundary": {
      const n = confirm.pointIds.length;
      const what = n === 1 ? "1 point" : `${n} points`;
      const all = confirm.swaps === n;
      const switched =
        n === 1
          ? "Every shot in it changes hands, and so does who won it."
          : `On ${all ? "each of them" : `${confirm.swaps} of them`}, every shot changes hands, and so does who won it.`;
      return {
        title: `Move ${what} to game ${confirm.gameInSet}?`,
        description: `${names[confirm.server]} serves set ${confirm.to.setNumber}, game ${confirm.gameInSet}, and becomes the server of ${n === 1 ? "this point" : "these points"}. ${switched}`,
        confirmLabel: n === 1 ? "Move point" : "Move points",
        pendingLabel: "Moving…",
        tone: "primary",
      };
    }
    case "serve-hitter":
      return serveHitterCopy(confirm, names);
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
        title: "Mark complete and publish?",
        description:
          confirm.warnings.length === 0
            ? "Every point is checked and the score adds up. The athlete's match is rebuilt from these labels: statistics, points and summary. The version it replaces is backed up, and Reopen lets you edit and publish again."
            : "Some things are still open. Publishing anyway rebuilds the athlete's match from these labels as they are. The version it replaces is backed up, and Reopen lets you fix them and publish again.",
        confirmLabel: "Publish",
        pendingLabel: "Publishing…",
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
