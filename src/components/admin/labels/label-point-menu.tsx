"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
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
  move: { key: string; label: string; description?: string; run: () => void }[];
  reset: (() => void) | null;
  remove: () => void;
} {
  return {
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
 */
export function PointMenu({
  point,
  number,
  open: rowOpen,
  edit,
  operations,
}: {
  point: LabelPoint;
  number: number;
  open: boolean;
  edit: EditContext;
  operations: LabelRowOperations;
}) {
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
                  "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-[opacity,color,background-color] duration-200 group-hover/row:opacity-100 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  open
                    ? "bg-[var(--surface-subtle)] text-[var(--ink-900)]"
                    : "text-[var(--ink-500)]",
                  open || rowOpen ? "opacity-100" : "opacity-0",
                )}
              >
                <MoreHorizontal
                  className="size-[15px]"
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
                    className="size-3 text-[var(--ink-500)]"
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
