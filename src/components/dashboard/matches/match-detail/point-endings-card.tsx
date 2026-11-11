"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import {
  sideCut,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  PointEndingsBody,
  type SegmentWatch,
} from "@/components/dashboard/matches/match-detail/point-endings-body";
import {
  outcomeTally,
  type OutcomeKey,
} from "@/components/dashboard/matches/match-detail/point-endings-tally";
import { surnameLabels } from "@/lib/data/match-utils";

// The outcome keys and the one-pass tally live in `point-endings-tally.ts`, a
// pure module the team player profile's season fold also runs on the server.
// Re-exported here so every existing import of this module keeps working.
export { outcomeTally };
export type { OutcomeKey };

// The drawing — card, bars, legend, the dark segment readout — is
// `PointEndingsBody` (`point-endings-body.tsx`), shared with the team player
// profile's season card. Re-exported here so this module's call sites (the
// Net game card's `SegmentTooltip`, the specs' `outcomesFor`) are unchanged.
export {
  outcomesFor,
  SegmentTooltip,
} from "@/components/dashboard/matches/match-detail/point-endings-body";

/**
 * The Statistics tab's "How points ended" card (artboard 46a, lines 550–556).
 *
 * One 100% stacked bar per player over that player's OWN decisive shots:
 * winners, aces, service winners, unforced errors, forced errors, double
 * faults. Between them the two bars hold every point whose result type says
 * how it ended, so on a fully labelled match they add up to the match's
 * points (product decision, 2026-11-05). The bars are not compared
 * against each other by length — each is its own composition — so the hover
 * carries the cross-reference count instead.
 *
 * The viewer's bar is first (`useMatchSides()`, guardrails §4), never
 * player1's.
 *
 * BUCKETING follows `calculate_match_stats`, which reads these exclusively
 * off the free-text `points.result_type`:
 *   aces             `result_type = 'Ace'`
 *   service winners  `result_type = 'Service Winner'` that is not an ace
 *   double faults    `result_type = 'Double Fault'`
 *   winners          `result_type LIKE '%Winner%'` less 'Service Winner'
 *                    (`countsAsWinner`), as the published card counts them
 *   unforced errs    `result_type LIKE '%Unforced Error%'`
 *   forced errs      `result_type LIKE '%Forced Error%'`, not unforced
 * UNTIL THE ERRORS ARE JUDGED (`MatchFilterContext.errorSplitJudged`, read
 * off the filter context) there is no forced segment: the errors segment is
 * every error — forced and unforced, any `result_type` ending in "error" —
 * and reads "Errors" (`outcomesFor`), since nobody has called them either way.
 * Aces, service winners and double faults belong to the server structurally.
 * Winners are credited by `winnerHitBy` and errors by `errorMadeBy`: the
 * rules the Result filters a segment opens read.
 *
 * A SERVICE WINNER IS ITS OWN SEGMENT, not a winner (product decision,
 * 2026-10-30, as the head-to-head Winners row counts them) — unless a derived
 * match reads it as an ace, below.
 *
 * ACES ON A DERIVED MATCH. The derivation never emits 'Ace' (see
 * `services/splitstep/derivation/result-type.ts`): every unreturned serve is
 * a 'Service Winner', as is a return struck and missed. Product decision
 * (2026-09-29): on these matches an unreturned serve the server won IS an
 * ace (`isUnreturnedServe`), as the head-to-head Aces row counts it.
 *
 * Whole match, always: the tally is taken over every point in
 * `useMatchData().points`, the same read every point-derived card on this tab
 * makes (rally-length-card.tsx takes the identical dependency). The match
 * filters live on the Video tab only.
 *
 * With a playable video each segment opens its points in the Video tab
 * (`outcomeCut`, through the body's `watch`) on click or Enter — hovering
 * only reads. Without one the body draws exactly the read-only card.
 */

/** The errors segment's base cut while the split is not judged: every error. */
const ERRORS_BASE_CUT: FilmCut = { resultEnding: ["error"], ending: "error" };

/**
 * Each outcome's base cut, before a side is laid over it by `sideCut` — the
 * shared filters' Result › Ending, narrowed by a Film-only `ending` where
 * Ending alone would admit points this card counts in another segment (see
 * `FilmCutEnding`); aces are Serve › Result "Ace", exact on its own. The four
 * are exclusive, like the tally: a double fault is Error + Serve, which no
 * unforced error is.
 */
const OUTCOME_BASE_CUT: Record<OutcomeKey, FilmCut> = {
  winners: { resultEnding: ["winner"], ending: "winner" },
  unforcedErrors: { resultEnding: ["error"], ending: "unforced-error" },
  forcedErrors: { resultEnding: ["error"], ending: "forced-error" },
  doubleFaults: { resultEnding: ["error"], resultShot: ["Serve"] },
  aces: { serveResult: ["ace"] },
  serviceWinners: { serveResult: ["service-winner"] },
};

/**
 * The film cut behind one segment of one side's bar. Aces and service
 * winners are the SERVER's (Serve › Player); the rest are Result › Hit by,
 * the point of view Ending reads — whoever hit the winner or made the error,
 * the server for a double fault. That is the line `head-to-head-card.tsx`'s
 * `sideCut` draws for the same rows, so this delegates to it rather than
 * re-deriving it here. `you`/`opp` are relative, resolved through the filter
 * context's `youIsPlayer1` inside the film tab (guardrails §4); nothing here
 * reads player order.
 */
export function outcomeCut(
  key: OutcomeKey,
  side: "you" | "opp",
  errorSplitJudged = true,
): FilmCut {
  return sideCut(
    !errorSplitJudged && key === "unforcedErrors"
      ? ERRORS_BASE_CUT
      : OUTCOME_BASE_CUT[key],
    side,
    key === "aces" || key === "serviceWinners" ? "server" : "player",
  );
}

interface PointEndingsCardProps {
  /** Video-derived match — aces are its unreturned serves (`outcomeTally`). */
  isDerived: boolean;
}

export function PointEndingsCard({ isDerived }: PointEndingsCardProps) {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { points } = useMatchData();
  // Whether the errors are split forced/unforced — the filter context's
  // reading, never re-derived here. Unjudged, the third segment is "Errors".
  const errorSplitJudged = useMatchFilters().context.errorSplitJudged === true;

  const youIsPlayer1 = sides.you.isPlayer1;

  const { youTally, oppTally } = useMemo(
    () => ({
      youTally: outcomeTally(points, youIsPlayer1, isDerived, errorSplitJudged),
      oppTally: outcomeTally(
        points,
        !youIsPlayer1,
        isDerived,
        errorSplitJudged,
      ),
    }),
    [points, youIsPlayer1, isDerived, errorSplitJudged],
  );

  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  // Only with a playable video does a segment take a click; without one the
  // body gets no `watch` and draws the read-only card.
  const watch: SegmentWatch | undefined = meta.hasPlayableVideo
    ? (key, side, title) =>
        actions.watchCut(
          outcomeCut(key, side, errorSplitJudged),
          title,
          "point_endings",
        )
    : undefined;

  return (
    <PointEndingsBody
      youTally={youTally}
      oppTally={oppTally}
      youName={youName}
      oppName={oppName}
      errorSplitJudged={errorSplitJudged}
      watch={watch}
    />
  );
}
