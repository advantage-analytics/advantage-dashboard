"use client";

import { memo } from "react";
import { Scale } from "lucide-react";
import { lockedGameImbalance } from "@/lib/services/labels/game-boundary";
import {
  gameKey,
  type LabelGameBand,
  type LabelScores,
} from "@/lib/services/labels/score";
import type {
  LabelPoint,
  LabelStartScore,
} from "@/lib/services/labels/session";
import { BlackTextAction, gameSlot } from "./label-black-parts";
import type { SideNames } from "./label-format";

/**
 * A game whose start the labeller dragged into place (game-boundary.ts, the
 * lock) and whose points still do not add up. The lock takes the boundary as
 * the labeller's word, so the slots that would move the boundary again
 * ("already won", "isn't finished") stand down for it (`gameOverflow` /
 * `gameUnderflow` skip a locked game) and this one asks instead: an ending is
 * probably wrong. Design B, 2026-10-24.
 *
 * The same dashed amber slot as theirs (`gameSlot`), at the top of the game —
 * after its band, before its first row — with two answers: "Check N points"
 * steps through the points `lockedGameImbalance` doubts, one per click and
 * wrapping (`nextCheckPoint`), each through the console's flag jump; "Add
 * point" inserts one after the game's last row, as the underflow slot's does.
 * It goes once the game is decided on its last row.
 */

export interface LockedGameSlot {
  band: LabelGameBand;
  /** The game's points whose winner is in doubt, in rail order. */
  pointIds: string[];
  /** The game's last live row: where "Add point" inserts after. */
  lastPointId: string;
}

/**
 * Each locked game that does not add up, keyed by its first live row — the
 * row its band and this slot sit above. The session's last game is left
 * out while it is unfinished: the rail reads it as still being played
 * (`bandOutcomeShown`), as `gameUnderflow` does.
 */
export function lockedSlotsAtPoints(
  points: readonly LabelPoint[],
  games: LabelScores["games"],
  adScoring: boolean,
  /** Where the video starts in the match; null: at the beginning. */
  start: LabelStartScore | null = null,
): ReadonlyMap<string, LockedGameSlot> {
  const at = new Map<string, LockedGameSlot>();
  const doubted = lockedGameImbalance(points, adScoring, start);
  const byGame = new Map<string, string[]>();
  const first = new Map<string, string>();
  const last = new Map<string, string>();
  const doubtedIds = new Set(doubted);
  for (const point of points) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const key = gameKey(point);
    if (!first.has(key)) first.set(key, point.id);
    last.set(key, point.id);
    if (doubtedIds.has(point.id)) {
      byGame.set(key, [...(byGame.get(key) ?? []), point.id]);
    }
  }
  const lastGame = games.at(-1);
  for (const band of games) {
    const key = gameKey(band);
    const firstId = first.get(key);
    const lastId = last.get(key);
    if (!firstId || !lastId) continue;
    // Only a locked game: its first live row holds the lock.
    const head = points.find((point) => point.id === firstId);
    if (head?.gameStartLocked !== true) continue;
    if (band.outcome.kind === "decided" || band.winner === null) continue;
    if (band === lastGame && band.outcome.kind === "unfinished") continue;
    at.set(firstId, {
      band,
      pointIds: byGame.get(key) ?? [],
      lastPointId: lastId,
    });
  }
  return at;
}

/**
 * The point "Check N points" goes to next: the one after `last` in `ids`,
 * wrapping; the first when nothing was checked yet. When `last` has left the
 * list (its winner was put right) the one now at its place is next, so a
 * fixed point does not skip its neighbour.
 */
export function nextCheckPoint(
  ids: readonly string[],
  last: { id: string; index: number } | null,
): { id: string; index: number } | null {
  if (ids.length === 0) return null;
  if (last === null) return { id: ids[0], index: 0 };
  const at = ids.indexOf(last.id);
  const index = at === -1 ? last.index % ids.length : (at + 1) % ids.length;
  return { id: ids[index], index };
}

/**
 * The cursor "Check N points" keeps per game, as a plain closure the rail
 * holds for its life: `step(gameKey, ids)` is the id to go to now.
 */
export function checkStepper(): (
  key: string,
  ids: readonly string[],
) => string | null {
  const cursors = new Map<string, { id: string; index: number }>();
  return (key, ids) => {
    const next = nextCheckPoint(ids, cursors.get(key) ?? null);
    if (next === null) cursors.delete(key);
    else cursors.set(key, next);
    return next?.id ?? null;
  };
}

/** The slot's words: its title and its reason, as plain data. */
export function lockedGameWords(
  slot: LockedGameSlot,
  names: SideNames,
): { title: string; reason: string; check: string | null } {
  const { band, pointIds } = slot;
  const name =
    band.gameType === "game"
      ? `Game ${band.gameInSet}`
      : band.gameType === "tiebreak"
        ? "Tiebreak"
        : "Match tiebreak";
  const title = `${name} doesn’t add up: an ending is probably wrong`;
  // The last counted point's winner: the one the labeller's ending says won
  // the game. Not null — `lockedSlotsAtPoints` skips a game with no winner.
  const winner = band.winner ?? "p1";
  const opening =
    band.server === winner
      ? `${names[winner]} serves and wins its last point`
      : `${names[winner]} wins its last point`;
  const outcome = band.outcome;
  let but = "";
  if (outcome.kind === "unfinished") {
    but = `, but the points leave the game at ${outcome.score}.`;
  } else if (outcome.kind === "overflow") {
    const rows = `${outcome.extra} ${outcome.extra === 1 ? "point" : "points"}`;
    but =
      outcome.winner === winner
        ? `, but the points already give ${names[winner]} the game ${rows} before it.`
        : `, but the points give ${names[outcome.winner]} the game ${rows} before it.`;
  } else {
    but = ".";
  }
  const ask =
    pointIds.length > 0
      ? ` Check the points ${names[winner]} lost.`
      : " A point may be missing.";
  const n = pointIds.length;
  return {
    title,
    reason: `${opening}${but}${ask}`,
    check: n > 0 ? `Check ${n} ${n === 1 ? "point" : "points"}` : null,
  };
}

export const BlackGameLocked = memo(function BlackGameLocked({
  slot,
  names,
  onCheck,
  onAddPoint,
}: {
  slot: LockedGameSlot;
  names: SideNames;
  /** Step to the next doubted point of the game named by its key. */
  onCheck?: (gameKey: string, pointIds: readonly string[]) => void;
  /** Insert a point after the game's last row. */
  onAddPoint?: (afterPointId: string) => void;
}) {
  const words = lockedGameWords(slot, names);
  const key = gameKey(slot.band);
  const check =
    onCheck && words.check ? (
      <BlackTextAction
        ink="amber"
        data-game-imbalance-action="check"
        aria-label={`${words.check}: go to the next one`}
        onClick={(event) => {
          event.stopPropagation();
          onCheck(key, slot.pointIds);
        }}
      >
        {words.check}
      </BlackTextAction>
    ) : null;
  const add = onAddPoint ? (
    <BlackTextAction
      ink={check ? "quiet" : "amber"}
      data-game-imbalance-action="add"
      aria-label="Add point after the game’s last row"
      onClick={(event) => {
        event.stopPropagation();
        onAddPoint(slot.lastPointId);
      }}
    >
      Add point
    </BlackTextAction>
  ) : null;
  const actions =
    check || add ? (
      <span className="flex items-center gap-1">
        {check}
        {add}
      </span>
    ) : null;
  return gameSlot({
    icon: Scale,
    row: "game-imbalance",
    anchor: key,
    rootData: {
      "data-game-key": key,
      "data-game-imbalance-count": String(slot.pointIds.length),
    },
    title: words.title,
    reason: words.reason,
    action: actions,
    actionLabel: words.check ?? "Add point",
    details: [],
  });
});
