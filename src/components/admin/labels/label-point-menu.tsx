"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpToLine,
  Ban,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  Merge,
  MoreHorizontal,
  RotateCcw,
  Undo2,
} from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
  type FloatMenuTone,
} from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";
import type { LabelPointPatch } from "@/lib/services/labels/edit";
import { deriveEnding } from "@/lib/services/labels/ending-derived";
import type { LabelPoint } from "@/lib/services/labels/session";
import { leftoverIds } from "@/lib/services/labels/game-shift";
import {
  destinationServerIn,
  neighbourGames,
} from "@/lib/services/labels/operations";
import {
  canSwitchPlayers,
  rowsContradictServer,
  servingShot,
} from "@/lib/services/labels/player-swap";
import { combineNeighbour } from "@/lib/services/labels/point-combine";
import { sharesVendorRally } from "@/lib/services/labels/point-split";
import { canResetPoint } from "@/lib/services/labels/reset";
import type { EditContext, LabelRowOperations } from "./label-row-parts";

/**
 * The patch that makes a let or a non-point a played point again: the ending
 * its rows describe (`deriveEnding` — with the winner when they settle one
 * the point does not hold, as `endingPatchForShotChange` writes it), else
 * the ending it was seeded with, else none. `ghosts` is whether the session
 * draws the site's removed strokes as ghosts (`drawsGhosts`).
 */
export function countPointPatch(
  point: Pick<LabelPoint, "winner" | "shots" | "seed">,
  ghosts: boolean,
): Pick<LabelPointPatch, "ending" | "ended_by" | "winner"> {
  const derived = deriveEnding(point, ghosts);
  if (derived) {
    return {
      ending: derived.ending,
      ended_by: derived.endedBy,
      ...(derived.winner !== null && derived.winner !== point.winner
        ? { winner: derived.winner }
        : {}),
    };
  }
  const seeded = point.seed?.ending ?? null;
  if (
    seeded !== null &&
    seeded !== "let_replayed" &&
    seeded !== "not_a_point"
  ) {
    return { ending: seeded, ended_by: point.seed?.ended_by ?? null };
  }
  return { ending: null };
}

/**
 * What the ⋯ menu can ask for on `point`, as plain data.
 *
 * - `addAbove` / `addBelow`: an empty point beside this one, in its game.
 * - `combineAbove` / `combineBelow`: only when that neighbour is in the same
 *   game (point-combine.ts).
 * - `switchPlayers`: on every live point with a stroke that names a hitter
 *   (player-swap.ts). When the rows contradict the server it `contradicts`, and
 *   the menu lists it first.
 * - `markLet` / `markNotAPoint`: one point patch; null once the point is
 *   either. `countPoint` puts the ending back (`countPointPatch`).
 * - `move`: the games either side of the point; empty with no neighbouring
 *   game.
 * - `shiftOverflow`: only on a row sitting past the one that decided its game
 *   (game-shift.ts).
 * - `reset`: only on a changed point with a stored seed, and not while another
 *   live point was built from one of its vendor rallies (`sharesVendorRally`):
 *   half of a split is not `unchanged`.
 * - `remove`: always.
 */
export function pointMenuActions(
  point: LabelPoint,
  context: Pick<
    EditContext,
    "points" | "names" | "adScoring" | "onPatchPoint"
  > & {
    /** Whether a site-removed stroke is a ghost here; a stroke by default. */
    ghosts?: boolean;
  },
  operations: LabelRowOperations,
): {
  addAbove: () => void;
  addBelow: () => void;
  combineAbove: { description: string; run: () => void } | null;
  combineBelow: { description: string; run: () => void } | null;
  switchPlayers: {
    description: string;
    /** The rows say the other side served: listed first, and why. */
    contradicts: boolean;
    run: () => void;
  } | null;
  markLet: (() => void) | null;
  markNotAPoint: (() => void) | null;
  countPoint: (() => void) | null;
  move: { key: string; label: string; description?: string; run: () => void }[];
  shiftOverflow: (() => void) | null;
  reset: (() => void) | null;
  remove: () => void;
} {
  const number = point.pointIndex + 1;
  const above = combineNeighbour(context.points, point.id, "above");
  const below = combineNeighbour(context.points, point.id, "below");
  const contradicts = rowsContradictServer(point);
  const serveHitter = contradicts ? servingShot(point.shots)?.hitter : null;
  const uncounted =
    point.ending === "let_replayed" || point.ending === "not_a_point";
  const patch = (values: LabelPointPatch) => () =>
    context.onPatchPoint?.(point.id, values);
  return {
    addAbove: () => operations.onInsertPoint(point.id, "before"),
    addBelow: () => operations.onInsertPoint(point.id, "after"),
    combineAbove: above
      ? {
          description: `Point ${number}'s shots join point ${above.pointIndex + 1}`,
          run: () => operations.onCombinePoints(point.id, "above"),
        }
      : null,
    combineBelow: below
      ? {
          description: `Point ${below.pointIndex + 1}'s shots join point ${number}`,
          run: () => operations.onCombinePoints(point.id, "below"),
        }
      : null,
    switchPlayers: canSwitchPlayers(point)
      ? {
          description:
            contradicts && point.server && serveHitter
              ? `${context.names[point.server]} serves this game, but ${context.names[serveHitter]} hits the serve here`
              : point.winner
                ? "Every shot changes hands, and so does who won it"
                : "Every shot changes hands",
          contradicts,
          run: () => operations.onSwitchPlayers(point.id),
        }
      : null,
    markLet: uncounted ? null : patch({ ending: "let_replayed" }),
    markNotAPoint: uncounted ? null : patch({ ending: "not_a_point" }),
    countPoint: uncounted
      ? patch(countPointPatch(point, context.ghosts ?? false))
      : null,
    shiftOverflow: leftoverIds(context.points, context.adScoring ?? true).has(
      point.id,
    )
      ? () => operations.onShiftGameOverflow(point.id)
      : null,
    move: neighbourGames(context.points, point.id).map((game) => {
      const server = destinationServerIn(context.points, point.id, game);
      return {
        key: `${game.setNumber}-${game.gameNumber}`,
        label: `Set ${game.setNumber} · Game ${game.gameNumber}`,
        description: server ? `${context.names[server]} serving` : undefined,
        run: () => operations.onMovePoint(point.id, game),
      };
    }),
    reset:
      canResetPoint(point) && !sharesVendorRally(point, context.points)
        ? () => operations.onAskResetPoint(point.id)
        : null,
    remove: () => operations.onAskDeletePoint(point.id),
  };
}

/**
 * The row's ⋯: a 22px trigger in the rail's ink. Two panels in one menu: the
 * actions and, behind "Move to game…", the games either side of the point.
 */
export function PointMenu({
  point,
  number,
  edit,
  operations,
  menu = "dark",
  ghosts = false,
}: {
  point: LabelPoint;
  number: number;
  edit: EditContext;
  operations: LabelRowOperations;
  /** The menu's tone: portalled, so the rail's palette does not reach it. */
  menu?: FloatMenuTone;
  /** Whether the well draws site-removed strokes as ghosts (`drawsGhosts`). */
  ghosts?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"actions" | "move">("actions");
  // The requests are planned only while the menu is open: planning rescans
  // the session's rows, and a closed menu on every row would do it per render.
  const actions = open
    ? pointMenuActions(point, { ...edit, ghosts }, operations)
    : null;
  const close = () => {
    setOpen(false);
    setPanel("actions");
  };
  /** Close, then run the request — every row's `onSelect`. */
  const pick = (run: () => void) => () => {
    close();
    run();
  };
  const iconInk = menu === "dark" ? "text-white/50" : "text-[var(--ink-500)]";
  const iconClass = cn("size-3", iconInk);
  const now =
    point.setNumber !== null && point.gameNumber !== null
      ? `Now in set ${point.setNumber} · game ${point.gameNumber}`
      : undefined;
  // "Switch players": first of all when the rows contradict the server,
  // after the Combine items otherwise.
  const switchItem = actions?.switchPlayers ? (
    <FloatMenuItem
      label="Switch players"
      description={actions.switchPlayers.description}
      icon={
        <ArrowLeftRight
          className={iconClass}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      }
      onSelect={pick(actions.switchPlayers.run)}
    />
  ) : null;
  const switchFirst = actions?.switchPlayers?.contradicts === true;
  return (
    <span
      data-cell=""
      className="flex justify-end"
      onClick={(event) => event.stopPropagation()}
    >
      {/* The tooltip hides while open: the menu already says its name. */}
      <ChromeTooltip label="Point actions" side="top" hidden={open}>
        <span className="inline-flex">
          <FloatMenu
            open={open}
            onOpenChange={(next) => (next ? setOpen(true) : close())}
            width={232}
            tone={menu}
            label={`Point ${number} actions`}
            trigger={
              <button
                type="button"
                aria-label={`Point ${number} actions`}
                aria-haspopup="menu"
                aria-expanded={open}
                data-point-menu=""
                className={cn(
                  "flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-[color,background-color,scale] duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100",
                  open ? "bg-white/[0.08] text-white" : "text-white/55",
                )}
              >
                <MoreHorizontal
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            }
          >
            {!actions ? null : panel === "move" ? (
              <>
                <FloatMenuItem
                  label="Back"
                  icon={
                    <ChevronLeft
                      className={iconClass}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  }
                  onSelect={() => setPanel("actions")}
                />
                <FloatMenuDivider />
                <FloatMenuLabel>Move point {number} to</FloatMenuLabel>
                {actions.move.map((game) => (
                  <FloatMenuItem
                    key={game.key}
                    label={game.label}
                    description={game.description}
                    onSelect={pick(game.run)}
                  />
                ))}
                <FloatMenuNote>
                  Only the games either side of this point.
                </FloatMenuNote>
              </>
            ) : (
              <>
                {switchFirst ? (
                  <>
                    {switchItem}
                    <FloatMenuDivider />
                  </>
                ) : null}
                <FloatMenuItem
                  label="Add point above"
                  description={`An empty point before point ${number}`}
                  icon={
                    <ArrowUpToLine
                      className={iconClass}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  }
                  onSelect={pick(actions.addAbove)}
                />
                <FloatMenuItem
                  label="Add point below"
                  description={`An empty point after point ${number}`}
                  icon={
                    <ArrowDownToLine
                      className={iconClass}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  }
                  onSelect={pick(actions.addBelow)}
                />
                {actions.combineAbove ? (
                  <FloatMenuItem
                    label="Combine with point above"
                    description={actions.combineAbove.description}
                    icon={
                      <Merge
                        className={iconClass}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={pick(actions.combineAbove.run)}
                  />
                ) : null}
                {actions.combineBelow ? (
                  <FloatMenuItem
                    label="Combine with point below"
                    description={actions.combineBelow.description}
                    icon={
                      <Merge
                        className={cn("size-3 rotate-180", iconInk)}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={pick(actions.combineBelow.run)}
                  />
                ) : null}
                {switchFirst ? null : switchItem}
                <FloatMenuDivider />
                {actions.markLet ? (
                  <FloatMenuItem
                    label="Mark as a let"
                    description="Replayed. The score skips it."
                    icon={
                      <RotateCcw
                        className={iconClass}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={pick(actions.markLet)}
                  />
                ) : null}
                {actions.markNotAPoint ? (
                  <FloatMenuItem
                    label="Not a point"
                    description="Not part of the match. The score skips it."
                    icon={
                      <Ban
                        className={iconClass}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={pick(actions.markNotAPoint)}
                  />
                ) : null}
                {actions.countPoint ? (
                  <FloatMenuItem
                    label="Count this point"
                    description="It was played. The score counts it again."
                    icon={
                      <Undo2
                        className={iconClass}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={pick(actions.countPoint)}
                  />
                ) : null}
                <FloatMenuDivider />
                {actions.move.length > 0 ? (
                  <FloatMenuItem
                    label="Move to game…"
                    description={now}
                    trailing={
                      <ChevronRight
                        className="size-3"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={() => setPanel("move")}
                  />
                ) : null}
                {actions.shiftOverflow ? (
                  <FloatMenuItem
                    label="Move leftover points to the next game"
                    description="This game is already won before this point"
                    icon={
                      <CornerDownRight
                        className={iconClass}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    }
                    onSelect={pick(actions.shiftOverflow)}
                  />
                ) : null}
                {actions.reset ? (
                  <FloatMenuItem
                    label="Reset"
                    description="Back to the values it was seeded with"
                    onSelect={pick(actions.reset)}
                  />
                ) : null}
                {actions.move.length > 0 ||
                actions.shiftOverflow ||
                actions.reset ? (
                  <FloatMenuDivider />
                ) : null}
                <FloatMenuItem
                  label="Delete point"
                  onSelect={pick(actions.remove)}
                />
              </>
            )}
          </FloatMenu>
        </span>
      </ChromeTooltip>
    </span>
  );
}
