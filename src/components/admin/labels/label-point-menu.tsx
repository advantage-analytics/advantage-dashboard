"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { LabelPoint } from "@/lib/services/labels/session";
import {
  destinationServerIn,
  neighbourGames,
} from "@/lib/services/labels/operations";
import { canResetPoint } from "@/lib/services/labels/reset";
import type { EditContext, LabelRowOperations } from "./label-row-parts";

/**
 * What the ⋯ menu can ask for on `point`, as plain data — the menu draws
 * these, and a spec can run them without opening a popover.
 *   · `addAbove` / `addBelow` — an empty point beside this one, in its game
 *     (`onInsertPoint`, before or after); the labeller fills it in place, as
 *     the suggestion slot's "Add point" row is filled. A manual edit, so it
 *     is there on every session — marks on or off.
 *   · `move` — the games either side of the point, each saying who serves it;
 *     picking one hands it to the console, which asks "switch players?" first
 *     when that is not this point's server. Empty when the point has no
 *     neighbouring game.
 *   · `reset` — only on a point that has changed and has a stored seed.
 *   · `remove` — always.
 */
export function pointMenuActions(
  point: LabelPoint,
  context: Pick<EditContext, "points" | "names">,
  operations: LabelRowOperations,
): {
  addAbove: () => void;
  addBelow: () => void;
  move: { key: string; label: string; description?: string; run: () => void }[];
  reset: (() => void) | null;
  remove: () => void;
} {
  return {
    addAbove: () => operations.onInsertPoint(point.id, "before"),
    addBelow: () => operations.onInsertPoint(point.id, "after"),
    move: neighbourGames(context.points, point.id).map((game) => {
      const server = destinationServerIn(context.points, point.id, game);
      return {
        key: `${game.setNumber}-${game.gameNumber}`,
        label: `Set ${game.setNumber} · Game ${game.gameNumber}`,
        description: server ? `${context.names[server]} serving` : undefined,
        run: () => operations.onMovePoint(point.id, game),
      };
    }),
    reset: canResetPoint(point)
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
  const actions = pointMenuActions(point, edit, operations);
  const close = () => {
    setOpen(false);
    setPanel("actions");
  };
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
      <Tooltip>
        <FloatMenu
          open={open}
          onOpenChange={(next) => (next ? setOpen(true) : close())}
          width={232}
          tone={tone}
          label={`Point ${number} actions`}
          trigger={
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
          }
        >
          {panel === "move" ? (
            <>
              <FloatMenuItem
                label="Back"
                icon={
                  <ChevronLeft
                    className={cn(
                      "size-3",
                      dark ? "text-white/50" : "text-[var(--ink-500)]",
                    )}
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
                  onSelect={() => {
                    close();
                    game.run();
                  }}
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
                    className={cn(
                      "size-3",
                      dark ? "text-white/50" : "text-[var(--ink-500)]",
                    )}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                }
                onSelect={() => {
                  close();
                  actions.addAbove();
                }}
              />
              <FloatMenuItem
                label="Add point below"
                description={`An empty point after point ${number}`}
                icon={
                  <ArrowDownToLine
                    className={cn(
                      "size-3",
                      dark ? "text-white/50" : "text-[var(--ink-500)]",
                    )}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                }
                onSelect={() => {
                  close();
                  actions.addBelow();
                }}
              />
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
              {actions.reset ? (
                <FloatMenuItem
                  label="Reset"
                  description="Back to the values it was seeded with"
                  onSelect={() => {
                    close();
                    actions.reset?.();
                  }}
                />
              ) : null}
              {actions.move.length > 0 || actions.reset ? (
                <FloatMenuDivider />
              ) : null}
              <FloatMenuItem
                label="Delete point"
                onSelect={() => {
                  close();
                  actions.remove();
                }}
              />
            </>
          )}
        </FloatMenu>
        {open ? null : (
          <TooltipContent side="top">Point actions</TooltipContent>
        )}
      </Tooltip>
    </span>
  );
}
