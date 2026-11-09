import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  rallyLengthBandOf,
  type RallyLengthBand,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * The Rally length card's tally, pure: no React, so the team player
 * profile's season fold (`seasonRallyBands`, `lib/data/player-season.ts`)
 * runs the very loop the match report's card runs, on the server.
 *
 * Three bands — 1–4 / 5–8 / 9+ shots (`rallyLengthBandOf`, the filter
 * model's, so the card, the head-to-head rows and the Video tab's Rally
 * length pills agree). `rallyLength` is 0 when the source recorded no shot
 * count — not a one-shot rally — so those points are in no band, and out of
 * the average too.
 *
 * Every "won" test is `wonByPlayer1 === youIsPlayer1` (guardrails §4): the
 * caller hands in which seat is the viewer's, nothing here picks one.
 */

/** One band: its points, and who won them. */
export interface RallyBandCount {
  key: RallyLengthBand;
  /** Points in the band. */
  count: number;
  /** Of them, the points the viewer (or the player profiled) won. */
  youWon: number;
  /** The rest. */
  oppWon: number;
}

export interface RallyBandTally {
  /** Short, medium, long — the card's order. */
  bands: RallyBandCount[];
  /** Points in any band: the ones with a shot count recorded. */
  total: number;
  /** Their shot counts added up. */
  shotSum: number;
  /** `shotSum / total` — the card's "N shots average"; `null` with no banded point. */
  avgShots: number | null;
}

export const RALLY_BAND_KEYS: readonly RallyLengthBand[] = [
  "short",
  "medium",
  "long",
];

function finish(
  counters: Record<RallyLengthBand, { count: number; youWon: number }>,
  shotSum: number,
): RallyBandTally {
  const bands = RALLY_BAND_KEYS.map<RallyBandCount>((key) => ({
    key,
    count: counters[key].count,
    youWon: counters[key].youWon,
    oppWon: counters[key].count - counters[key].youWon,
  }));
  const total = bands.reduce((sum, band) => sum + band.count, 0);
  return {
    bands,
    total,
    shotSum,
    avgShots: total > 0 ? shotSum / total : null,
  };
}

function zeroCounters(): Record<
  RallyLengthBand,
  { count: number; youWon: number }
> {
  return {
    short: { count: 0, youWon: 0 },
    medium: { count: 0, youWon: 0 },
    long: { count: 0, youWon: 0 },
  };
}

/** One match's bands, from the viewer's seat. */
export function rallyBandTally(
  points: readonly Pick<MatchPoint, "rallyLength" | "wonByPlayer1">[],
  youIsPlayer1: boolean,
): RallyBandTally {
  const counters = zeroCounters();
  let shotSum = 0;
  for (const p of points) {
    const key = rallyLengthBandOf(p.rallyLength);
    if (!key) continue;
    counters[key].count += 1;
    if (p.wonByPlayer1 === youIsPlayer1) counters[key].youWon += 1;
    shotSum += p.rallyLength;
  }
  return finish(counters, shotSum);
}

/** Several tallies added band by band — a season of `rallyBandTally`s. */
export function sumRallyBandTallies(
  tallies: readonly RallyBandTally[],
): RallyBandTally {
  const counters = zeroCounters();
  let shotSum = 0;
  for (const t of tallies) {
    for (const band of t.bands) {
      counters[band.key].count += band.count;
      counters[band.key].youWon += band.youWon;
    }
    shotSum += t.shotSum;
  }
  return finish(counters, shotSum);
}
