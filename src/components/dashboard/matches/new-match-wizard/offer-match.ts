/**
 * Which of the schedule's candidate lines the details step's "Looks like"
 * strip may offer, and in what order.
 *
 * `findLineOffers` returns every open line for this player within two days of
 * the file's date. A date alone is too weak a match to put in front of someone
 * — two lines the same weekend look identical by date — so a line is offered
 * only when the opponent name or the score typed on this step also matches it.
 * This runs in memory on every keystroke; the date query is not re-asked.
 *
 * Name: exact `normalizedPersonName` equality (case and whitespace are noise),
 * both sides non-blank. No prefix, contains or initials matching.
 * Score: the line's recorded games equal the form's, set for set
 * (`sameRecordedScore`); tiebreak points are not compared.
 *
 * Order: name match first, then score match, then nearest date.
 */

import { normalizedPersonName } from "@/lib/data/person-name";
import { sameRecordedScore } from "./score-state";
import type { FormData, LineOffer } from "./types";

export function rankLineOffers(
  offers: readonly LineOffer[],
  input: {
    opponentName: string | null | undefined;
    playerScores: FormData["playerScores"];
    opponentScores: FormData["opponentScores"];
  },
): LineOffer[] {
  const typed = normalizedPersonName(input.opponentName);
  const ranked: { offer: LineOffer; name: boolean; score: boolean }[] = [];

  for (const offer of offers) {
    const offered = normalizedPersonName(offer.opponentName);
    const name = typed.length > 0 && offered.length > 0 && typed === offered;
    // A scored line with no games recorded would equal a blank form.
    const score =
      offer.score != null &&
      offer.score.player1.length > 0 &&
      sameRecordedScore(input, offer.score);
    if (name || score) ranked.push({ offer, name, score });
  }

  return ranked
    .sort(
      (a, b) =>
        Number(b.name) - Number(a.name) ||
        Number(b.score) - Number(a.score) ||
        (a.offer.daysFromFile ?? 0) - (b.offer.daysFromFile ?? 0),
    )
    .map(({ offer }) => offer);
}
