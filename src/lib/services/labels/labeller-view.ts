/**
 * What the labeller's console (`/label/[sessionId]`) is handed, and where it
 * opens. Pure, so the page and its spec share one answer.
 *
 * A labeller is an outside vendor: they label the rally, never the people in
 * it. So the session the page passes to the client carries no player names,
 * no match or job id and no derivation version — stripped here, server-side,
 * because hiding them in the markup alone would still ship them in the RSC
 * payload. The two sides are "Near" (p1) and "Far" (p2) — one word, like the
 * surnames an admin sees, so the rail's hitter cells don't clip — fixed for
 * the session as the console's court fallback is (`hitterHalf`'s `"near"`):
 * a changeover does not flip the words. "Player 1" / "Player 2" is the
 * alternative if that reads as confusing.
 */

import { homeShotSuggestions, type LabelMarks } from "./marks";
import { openFlags, scoreStop, slotStops, stepFlag } from "./flag-nav";
import { labelScores } from "./score";
import { withLiveScoreMarks } from "./score-marks";
import { matchTiebreakSet, sessionScoreMismatch } from "./set-scores";
import type { LabelSession, LabelSide } from "./session";

/** The labeller's words for each side, in every place the console prints one. */
export const LABELLER_SIDE_NAMES: Record<LabelSide, string> = {
  p1: "Near",
  p2: "Far",
};

/**
 * The overview checklist's sentences, said to a labeller. A labeller never
 * publishes — they submit, and an admin publishes — so every "publish" in
 * `completeWarnings` and the dashboard's checks reads as what submitting
 * hands over instead. Ordered: the longer phrases go first.
 */
const LABELLER_WORDING: readonly (readonly [RegExp, string])[] = [
  [/\bwill publish\b/g, "will go in"],
  [/\bpublishes\b/g, "goes in"],
  [/\ba publish\b/g, "submitting"],
  [/\bPublish\b/g, "Submit"],
  [/\bpublishing\b/g, "submitting"],
];

/** `text` with a publisher's words swapped for a labeller's (`LABELLER_WORDING`). */
export function labellerWording(text: string): string {
  return LABELLER_WORDING.reduce(
    (out, [from, to]) => out.replace(from, to),
    text,
  );
}

/**
 * `session` with every identifying field replaced: the player names become
 * the side labels, and the match id, job id and derivation version are
 * blanked. The rows, the scoring and the score fields stay — they are the
 * work.
 */
export function labellerSession(session: LabelSession): LabelSession {
  return {
    ...session,
    jobId: null,
    matchId: "",
    derivationVersion: "",
    player1Name: LABELLER_SIDE_NAMES.p1,
    player2Name: LABELLER_SIDE_NAMES.p2,
  };
}

/**
 * The first amber stop in rail order — what `]` would land on from nowhere:
 * an open score flag (`openFlags`, not the grey `data` ones), the set whose
 * score doesn't add up (`scoreStop`), or an amber slot between rows
 * (`slotStops`). Read as the console reads them on first render: the marks
 * with the live score marks merged in, and the score and slot lists off the
 * session's own fields. Null with nothing open — the console then opens on
 * its own default.
 */
export function firstAmberStop(
  session: LabelSession,
  marks: LabelMarks | null,
): string | null {
  const { points, adScoring, startScore } = session;
  const scores = labelScores(points, adScoring, startScore);
  const slots = slotStops(
    points,
    adScoring,
    matchTiebreakSet(session.matchScore, session.bestOf),
    startScore,
  );
  const stops: { pointId: string }[] = [...slots];
  if (marks) {
    const live = withLiveScoreMarks(
      {
        ...marks,
        suggestions: homeShotSuggestions(marks.suggestions, points),
      },
      points,
      adScoring,
      scores,
      startScore,
    );
    stops.push(...openFlags(points, live).filter((flag) => !flag.data));
    const stop = scoreStop(
      sessionScoreMismatch({
        points,
        games: scores.games,
        finalScore: session.finalScore,
        matchScore: session.matchScore,
        videoEndsEarly: session.videoEndsEarly,
        startScore,
      }),
      points,
    );
    if (stop) stops.push(stop);
  }
  return stepFlag(stops, points, null, 1)?.pointId ?? null;
}
