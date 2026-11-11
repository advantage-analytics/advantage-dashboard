"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  sideCut,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import { useStatisticsLobKeys } from "@/components/dashboard/matches/match-detail/statistics-lob-keys";
import {
  netGameTally,
  type NetEnding,
  type NetEntry,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";
import {
  NetGameBody,
  type NetSegmentWatch,
} from "@/components/dashboard/matches/match-detail/net-game-body";
import { surnameLabels } from "@/lib/data/match-utils";

// The drawing — card, bars, legend, the dark segment readout — is
// `NetGameBody` (`net-game-body.tsx`), shared with the team player profile's
// season card. Its helpers are re-exported here so this module's call sites
// (`tests/net-game.spec.ts`) are unchanged.
export {
  cameInByLine,
  netEndingsFor,
  PASSED_OR_LOBBED,
} from "@/components/dashboard/matches/match-detail/net-game-body";

/**
 * The Statistics tab's "Net game" card, built on `PointEndingsCard`'s model:
 * the same section chrome, per-player name and total, 10px stacked bar with
 * 2px gaps and 4px outer corners, hatched related segments, 8px legend marks
 * and the dark segment readout.
 *
 * Per player, over the points THAT player came to the net on (`cameToNet`):
 *
 * - the endings bar (`netEndingOf`, from that player's view) — won by a
 *   Winner or an Opponent error, lost to an Own error, being Passed or being
 *   Lobbed. Lobbed needs the ball-paths file's lobs (`useStatisticsLobKeys`);
 *   without them those points are Passed and Lobbed leaves the bar and the
 *   legend, rather than reading as a measured zero.
 * - under it a 4px "came in by" bar (`netEntryOf`) — Approach, Serve and
 *   volley, Drawn in — with its counts as one line of text.
 *
 * Both bars are counted with the classifiers the Video tab's `netEnding` /
 * `netEntry` cut extras run, so a segment's count is exactly what its click
 * opens. "Estimated from movement": a player is seen at the net only when
 * they strike the ball there.
 *
 * The viewer's bar is first (`useMatchSides()`, guardrails §4). Shade 5 has
 * no light-mode token (the viz ramp stops at four steps a side), so it is
 * written as a hex: the value `--viz-you-light` / `--viz-opp-light` takes in
 * the dark scope.
 *
 * Empty (nobody came to the net): the card's anatomy with a dash for each
 * total, empty tracks, the legend and one sentence — never a skeleton
 * (`reference/empty-and-loading.md`). No points at all: nothing, like
 * `PointEndingsCard` (the Statistics view draws its own zero then).
 */

/** A segment's cut: that side's net points, by ending or by entry. */
export function netGameCut(
  side: "you" | "opp",
  by: { netEnding: NetEnding } | { netEntry: NetEntry },
): FilmCut {
  return sideCut(by, side, "net");
}

export function NetGameCard() {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { points } = useMatchData();
  const lobKeys = useStatisticsLobKeys();

  const youIsPlayer1 = sides.you.isPlayer1;
  const { youTally, oppTally } = useMemo(
    () => ({
      youTally: netGameTally(points, youIsPlayer1, lobKeys),
      oppTally: netGameTally(points, !youIsPlayer1, lobKeys),
    }),
    [points, youIsPlayer1, lobKeys],
  );
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  if (points.length === 0) return null;

  // Only with a playable video does a segment take a click; without one the
  // body gets no `watch` and draws the read-only card.
  const watch: NetSegmentWatch | undefined = meta.hasPlayableVideo
    ? (side, by, title) => actions.watchCut(netGameCut(side, by), title)
    : undefined;

  return (
    <NetGameBody
      youTally={youTally}
      oppTally={oppTally}
      youName={youName}
      oppName={oppName}
      hasLobs={!!lobKeys}
      watch={watch}
    />
  );
}
