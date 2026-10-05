"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  Merge,
  MoreHorizontal,
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
import type { LabelPoint } from "@/lib/services/labels/session";
import { leftoverIds } from "@/lib/services/labels/game-shift";
import {
  destinationServerIn,
  neighbourGames,
} from "@/lib/services/labels/operations";
import { combineNeighbour } from "@/lib/services/labels/point-combine";
import { sharesVendorRally } from "@/lib/services/labels/point-split";
import { canResetPoint } from "@/lib/services/labels/reset";
import type { EditContext, LabelRowOperations } from "./label-row-parts";

/**
 * What the ⋯ menu can ask for on `point`, as plain data — the menu draws
 * these, and a spec can run them without opening a popover.
 *   · `addAbove` / `addBelow` — an empty point beside this one, in its game
 *     (`onInsertPoint`, before or after); the labeller fills it in place, as
 *     the suggestion slot's "Add point" row is filled. A manual edit, so it
 *     is there on every session — marks on or off.
 *   · `combineAbove` / `combineBelow` — this point and its live neighbour
 *     that way become one (`onCombinePoints`, point-combine.ts), the earlier
 *     kept; only when that neighbour is in the SAME game. Each carries the
 *     two numbers, so the labeller reads which point's shots go where. Three
 *     or more are combined by repeating.
 *   · `move` — the games either side of the point, each saying who serves it;
 *     picking one hands it to the console, which asks "switch players?" first
 *     when that is not this point's server. Empty when the point has no
 *     neighbouring game.
 *   · `shiftOverflow` — only on a leftover: a row sitting past the row that
 *     decided its game, whose score reads "Game–30" (`game-shift.ts`). Moves
 *     every leftover of that game into the next one, and on down the match.
 *   · `reset` — only on a point that has changed and has a stored seed, and
 *     not while another live point was built from one of its vendor rallies
 *     (`sharesVendorRally`): the two halves of a split. Reset would put the
 *     point's own fields back and call it `unchanged`, which a point whose
 *     rally was cut in two is not.
 *   · `remove` — always.
 */
export function pointMenuActions(
  point: LabelPoint,
  context: Pick<EditContext, "points" | "names" | "adScoring">,
  operations: LabelRowOperations,
): {
  addAbove: () => void;
  addBelow: () => void;
  combineAbove: { description: string; run: () => void } | null;
  combineBelow: { description: string; run: () => void } | null;
  move: { key: string; label: string; description?: string; run: () => void }[];
  shiftOverflow: (() => void) | null;
  reset: (() => void) | null;
  remove: () => void;
} {
  const number = point.pointIndex + 1;
  const above = combineNeighbour(context.points, point.id, "above");
  const below = combineNeighbour(context.points, point.id, "below");
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
 * The row's ⋯ — board 08g's `.mo`, revealed on the row's hover, on focus and
 * on the open point. Two panels in one menu: the actions, and — behind
 * "Move to game…" — the games either side of the point.
 *
 * `tone="dark"` is the black full-screen view's rail (board 08l's `.bk-ib`):
 * the same menu on the dark surface behind a 22px white trigger. Paint only —
 * every row and every request is the light one's.
 */
export function PointMenu({
  point,
  number,
  open: rowOpen,
  edit,
  operations,
  tone = "light",
}: {
  point: LabelPoint;
  number: number;
  open: boolean;
  edit: EditContext;
  operations: LabelRowOperations;
  tone?: FloatMenuTone;
}) {
  const dark = tone === "dark";
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"actions" | "move">("actions");
  // The requests are planned only while the menu is open: planning rescans
  // the session's rows, and a closed menu on every row would do it per render.
  const actions = open ? pointMenuActions(point, edit, operations) : null;
  const close = () => {
    setOpen(false);
    setPanel("actions");
  };
  /** Close, then run the request — every row's `onSelect`. */
  const pick = (run: () => void) => () => {
    close();
    run();
  };
  const iconInk = dark ? "text-white/50" : "text-[var(--ink-500)]";
  const iconClass = cn("size-3", iconInk);
  const now =
    point.setNumber !== null && point.gameNumber !== null
      ? `Now in set ${point.setNumber} · game ${point.gameNumber}`
      : undefined;
  return (
    <span
      data-cell=""
      className="flex justify-end"
      onClick={(event) => event.stopPropagation()}
    >
      {/* The dark tooltip around the menu, as every row's ⋯ wears it
          (`match-actions-menu.tsx`): open, the menu already says its name. */}
      <ChromeTooltip label="Point actions" side="top" hidden={open}>
        <span className="inline-flex">
          <FloatMenu
            open={open}
            onOpenChange={(next) => (next ? setOpen(true) : close())}
            width={232}
            tone={tone}
            label={`Point ${number} actions`}
            trigger={
              <button
                type="button"
                aria-label={`Point ${number} actions`}
                aria-haspopup="menu"
                aria-expanded={open}
                data-point-menu=""
                className={cn(
                  "flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-[opacity,color,background-color] duration-200 group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  dark
                    ? "size-[22px] hover:bg-white/[0.08] hover:text-white"
                    : "size-7 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]",
                  dark
                    ? open
                      ? "bg-white/[0.08] text-white"
                      : "text-white/55"
                    : open
                      ? "bg-[var(--surface-subtle)] text-[var(--ink-900)]"
                      : "text-[var(--ink-500)]",
                  open || rowOpen ? "opacity-100" : "opacity-0",
                )}
              >
                <MoreHorizontal
                  className={dark ? "size-3.5" : "size-[15px]"}
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
