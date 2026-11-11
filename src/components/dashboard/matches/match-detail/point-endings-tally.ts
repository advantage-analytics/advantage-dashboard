import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  countsAsWinner,
  errorMadeBy,
  isUnreturnedServe,
  winnerHitBy,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

/**
 * How points ended, as data: the six outcome keys and the one-pass tally
 * behind `point-endings-card.tsx`'s bars. Pure (no React, no `"use client"`)
 * so the team player profile's season fold (`lib/data/player-season.ts`) can
 * sum it per analyzed match on the server, where a `"use client"` module's
 * exports are client references rather than callable functions. The card
 * re-exports `outcomeTally` and `OutcomeKey`, so its import surface is
 * unchanged; the bucketing rules are documented on the card itself.
 */

export type OutcomeKey =
  | "winners"
  | "aces"
  | "serviceWinners"
  | "unforcedErrors"
  | "forcedErrors"
  | "doubleFaults";

export type OutcomeTally = Record<OutcomeKey, number>;

export function emptyOutcomeTally(): OutcomeTally {
  return {
    winners: 0,
    aces: 0,
    serviceWinners: 0,
    unforcedErrors: 0,
    forcedErrors: 0,
    doubleFaults: 0,
  };
}

/**
 * One pass, one bucket per point. The chain is exclusive on purpose: a point
 * counted in two segments would make the bar's own total disagree with the
 * counts in its segment hovers. With `errorSplitJudged` false the errors
 * bucket takes every error (a `result_type` ending in "error"), forced ones
 * included, and `forcedErrors` stays 0; a double fault is caught earlier in
 * the chain either way. A service winner is tested after the ace, so on a
 * derived match an unreturned serve stays an ace (`serveResultOf`'s order).
 */
export function outcomeTally(
  points: MatchPoint[],
  isPlayer1: boolean,
  isDerived: boolean,
  errorSplitJudged = true,
): OutcomeTally {
  const t = emptyOutcomeTally();

  for (const p of points) {
    const result = (p.resultType ?? "").toLowerCase();
    const iServed = p.serverIsPlayer1 === isPlayer1;

    if (isDerived ? isUnreturnedServe(p) : result === "ace") {
      if (iServed) t.aces += 1;
    } else if (result === "service winner") {
      if (iServed) t.serviceWinners += 1;
    } else if (result === "double fault") {
      if (iServed) t.doubleFaults += 1;
    } else if (countsAsWinner(p)) {
      if (winnerHitBy(p) === isPlayer1) t.winners += 1;
    } else if (
      errorSplitJudged
        ? result.includes("unforced error")
        : result.trim().endsWith("error")
    ) {
      if (errorMadeBy(p) === isPlayer1) t.unforcedErrors += 1;
    } else if (
      errorSplitJudged &&
      result.includes("forced error") &&
      !result.includes("unforced error")
    ) {
      if (errorMadeBy(p) === isPlayer1) t.forcedErrors += 1;
    }
  }

  return t;
}
