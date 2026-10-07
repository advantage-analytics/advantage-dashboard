"use client";

import { memo } from "react";
import { CornerUpLeft } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  gameUnderflow,
  planGamePull,
  type GameUnderflow,
  type PlannedGamePull,
} from "@/lib/services/labels/game-shift";
import { gameKey } from "@/lib/services/labels/score";
import type { LabelPoint } from "@/lib/services/labels/session";
import {
  AMBER_SLOT_ICON_INK,
  BLACK_SLOT,
  BlackTextAction,
} from "./label-black-parts";

/**
 * A game that ends short (`game-shift.ts` `gameUnderflow`): 30–40, and then
 * the next game's rows. The same dashed amber slot as the one a game that runs
 * over gets (`BlackGameOverflow`, label-black-point-row.tsx), drawn AFTER the
 * short game's last row rather than before a leftover, with one answer:
 * "Move here" pulls the next game's leading points in (`onPull`), or, when
 * the rule says the game is more likely missing a point than holding the next
 * game's (`add_point`), "Add point" inserts one after the last row
 * (`onAddPoint`, the console's insert). No Dismiss: the band keeps reading
 * "Unfinished" until the rows change. Drawn with marks on or off.
 */

export interface UnderflowSlot {
  underflow: GameUnderflow;
  /** `planGamePull` for the game, planned once here, not per render. */
  plan: PlannedGamePull;
}

/**
 * Each short game, keyed by its last live row — the row the slot goes after
 * — with its pull planned. Mirrors the rail's `overflowBeforePoints`.
 */
export function underflowAfterPoints(
  points: readonly LabelPoint[],
  adScoring: boolean,
  videoEndsEarly: boolean | null,
): ReadonlyMap<string, UnderflowSlot> {
  const after = new Map<string, UnderflowSlot>();
  for (const underflow of gameUnderflow(points, adScoring, {
    videoEndsEarly,
  })) {
    after.set(underflow.lastPointId, {
      underflow,
      plan: planGamePull(points, gameKey(underflow), adScoring),
    });
  }
  return after;
}

/** The slot's words: its title, its reason and the one answer's label. */
export function underflowWords(slot: UnderflowSlot): {
  title: string;
  reason: string;
  answer: "pull" | "add";
  action: string;
} {
  const { underflow, plan } = slot;
  const title = `Game ${underflow.gameInSet} isn’t finished at ${underflow.score}`;
  if ("ok" in plan) {
    const n = plan.summary.points;
    return {
      title,
      reason: `Pull ${n} ${n === 1 ? "point" : "points"} from game ${plan.summary.fromGame.gameInSet}`,
      answer: "pull",
      action: "Move here",
    };
  }
  return {
    title,
    reason: "A point may be missing",
    answer: "add",
    action: "Add point",
  };
}

export const BlackGameUnderflow = memo(function BlackGameUnderflow({
  slot,
  onPull,
  onAddPoint,
}: {
  slot: UnderflowSlot;
  /** Pull the next game's leading points into the game named by its key. */
  onPull?: (gameKey: string) => void;
  /** Insert a point after the short game's last row. */
  onAddPoint?: (afterPointId: string) => void;
}) {
  const { underflow, plan } = slot;
  const words = underflowWords(slot);
  const key = gameKey(underflow);
  // What the button's tooltip warns of: a pull that reads from two games,
  // and any pulled point whose players switch with its server.
  const details: string[] = [];
  if ("ok" in plan && plan.summary.games > 1) {
    details.push(
      `Pulls ${plan.summary.points} points across ${plan.summary.games} games`,
    );
  }
  if ("ok" in plan && plan.summary.swapped > 0) {
    details.push(
      plan.summary.swapped === 1
        ? "Players switch on 1 point"
        : `Players switch on ${plan.summary.swapped} points`,
    );
  }
  const handler = words.answer === "pull" ? onPull : onAddPoint;
  const button = handler ? (
    <BlackTextAction
      ink="amber"
      data-game-underflow-action={words.answer}
      aria-label={`${words.action}: ${words.reason}`}
      onClick={(event) => {
        event.stopPropagation();
        if (words.answer === "pull") onPull?.(key);
        else onAddPoint?.(underflow.lastPointId);
      }}
    >
      {words.action}
    </BlackTextAction>
  ) : null;
  return (
    <div
      data-row="game-underflow"
      data-game-underflow={underflow.lastPointId}
      data-game-key={key}
      className={BLACK_SLOT}
    >
      <CornerUpLeft
        className="size-3"
        style={{ color: AMBER_SLOT_ICON_INK }}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col gap-px">
        <span
          data-game-underflow-title=""
          className="truncate text-[12px] font-medium text-white"
        >
          {words.title}
        </span>
        <ChromeTooltip label={words.reason} side="top" wrap>
          <span
            data-game-underflow-detail=""
            className="truncate text-[11px] text-white/50"
          >
            {words.reason}
          </span>
        </ChromeTooltip>
      </span>
      {button ? (
        <span
          data-game-underflow-actions=""
          className="flex shrink-0 items-center justify-end"
        >
          {details.length > 0 ? (
            <ChromeTooltip
              label={words.action}
              detail={details.join(" · ")}
              side="top"
              align="end"
              wrap
            >
              {button}
            </ChromeTooltip>
          ) : (
            button
          )}
        </span>
      ) : null}
    </div>
  );
});
