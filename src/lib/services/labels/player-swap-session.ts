/**
 * The console's "Switch players" on one point (`planPlayerSwitch`,
 * player-swap.ts). Admin-gated like edit-session.ts.
 *
 * Its writes, in order, on `label_points` and `label_shots` only: one
 * compare-and-set UPDATE of the point's `winner`, `ended_by` and `status`
 * (`updateIfUnchanged`), then the flipped strokes grouped by value tuple
 * (`writeShotSwaps`). `server`, `set_number` and `game_number` are never
 * touched.
 *
 * "Switch N points" (court-end.ts) is the same switch on each of a game's
 * points in turn, inside one action, so ⌘Z takes them all back together.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { parseLabelPointSeed } from "./edit";
import {
  defaultLabelWriteDependencies,
  updateIfUnchanged,
  type LabelWriteDependencies,
} from "./edit-session";
import { readShotsOfPoints } from "./ending-session";
import {
  gated,
  normaliseId,
  readPointState,
  writeShotSwaps,
  type LabelOpResult,
} from "./operations-session";
import { planPlayerSwitch, type ShotSwapWrite } from "./player-swap";
import type { LabelPointStatus, LabelSide } from "./session";

export type LabelPlayerSwitchResult = LabelOpResult<{
  status: LabelPointStatus;
  winner: LabelSide | null;
  endedBy: LabelSide | null;
  /** Every stroke of the point, flipped. */
  shots: ShotSwapWrite[];
}>;

/** Read the point and its shots, plan the flip, write the point then the strokes. Never throws. */
export async function writeLabelPlayerSwitch(params: {
  supabase: AdminClient;
  pointId: unknown;
}): Promise<LabelPlayerSwitchResult> {
  const { supabase } = params;
  const pointId = normaliseId(params.pointId);
  if (!pointId) return { error: "Invalid point id." };

  const read = await readPointState(supabase, pointId);
  if ("error" in read) return read;
  const owned = await readShotsOfPoints(supabase, [pointId]);
  if ("error" in owned) return owned;

  const plan = planPlayerSwitch({
    status: read.row.status,
    server: read.row.server,
    setNumber: read.row.set_number,
    gameNumber: read.row.game_number,
    serveSide: read.row.serve_side,
    winner: read.row.winner,
    ending: read.row.ending,
    endedBy: read.row.ended_by,
    seed: parseLabelPointSeed(read.row.seed ?? null),
    shots: owned.shots,
  });
  if ("error" in plan) return plan;

  const failed = await updateIfUnchanged(
    supabase,
    "label_points",
    pointId,
    read.row.status,
    { ...plan.write },
    "switch the point's players",
  );
  if (failed) return { error: failed };
  const swapFailed = await writeShotSwaps(
    supabase,
    plan.shots,
    "switch the point's players",
  );
  if (swapFailed) return { error: swapFailed };
  return {
    ok: true,
    status: plan.write.status,
    winner: plan.write.winner,
    endedBy: plan.write.ended_by,
    shots: plan.shots,
  };
}

export function switchLabelPointPlayers(
  pointId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelPlayerSwitchResult> {
  return gated(
    deps,
    (supabase) => writeLabelPlayerSwitch({ supabase, pointId }),
    "switch the point's players",
  );
}

/** Most points one "Switch N points" may name: a long tiebreak, with room. */
export const MAX_SWITCH_POINTS = 40;

export type LabelPlayersSwitchResult = LabelOpResult<{
  /** Each switched point, in the order given. */
  points: {
    pointId: string;
    status: LabelPointStatus;
    winner: LabelSide | null;
    endedBy: LabelSide | null;
  }[];
  /** Every stroke of every switched point, flipped. */
  shots: ShotSwapWrite[];
}>;

/**
 * "Switch N points": {@link writeLabelPlayerSwitch} on each id in turn. Stops
 * at the first refusal and says which point; the ones before it stay
 * switched, inside the same undo step.
 */
export async function writeLabelPlayersSwitch(params: {
  supabase: AdminClient;
  pointIds: unknown;
}): Promise<LabelPlayersSwitchResult> {
  const { supabase } = params;
  const raw = Array.isArray(params.pointIds) ? params.pointIds : null;
  if (!raw || raw.length === 0 || raw.length > MAX_SWITCH_POINTS) {
    return { error: "Invalid point ids." };
  }
  const ids = raw.map(normaliseId);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return { error: "Invalid point ids." };
  }
  const points: Extract<LabelPlayersSwitchResult, { ok: true }>["points"] = [];
  const shots: ShotSwapWrite[] = [];
  for (const pointId of ids as string[]) {
    const one = await writeLabelPlayerSwitch({ supabase, pointId });
    if ("error" in one) {
      return {
        error:
          points.length === 0
            ? one.error
            : `${one.error} ${points.length} ${
                points.length === 1 ? "point was" : "points were"
              } switched first; ⌘Z takes them back.`,
      };
    }
    points.push({
      pointId,
      status: one.status,
      winner: one.winner,
      endedBy: one.endedBy,
    });
    shots.push(...one.shots);
  }
  return { ok: true, points, shots };
}

export function switchLabelPointsPlayers(
  pointIds: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelPlayersSwitchResult> {
  return gated(
    deps,
    (supabase) => writeLabelPlayersSwitch({ supabase, pointIds }),
    "switch the players",
  );
}
