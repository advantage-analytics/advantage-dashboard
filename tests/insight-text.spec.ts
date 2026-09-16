import { expect, test } from "@playwright/test";

import { splitInsight } from "@/components/dashboard/matches/match-detail/insight-text";

/**
 * The insight card's claim/evidence split (F2). Pure and offline: nothing
 * here renders the card, only decides where the large sentence ends.
 */

/** F2's real summary text (docs/superpowers/specs/.../F2.html), stripped of markup. */
const F2_CLAIM = "The serve, not the rally, decided the second set.";
const F2_EVIDENCE =
  "Reid won 78% of first-serve points but landed only 54% of them. In set 2 that fell to 46% — the points were lost before the rally started.";

test.describe("splitInsight", () => {
  test("splits F2's summary into its claim and its evidence", () => {
    expect(splitInsight(`${F2_CLAIM} ${F2_EVIDENCE}`)).toEqual({
      claim: F2_CLAIM,
      evidence: F2_EVIDENCE,
    });
  });

  test("a one-sentence summary has no evidence", () => {
    const summary = "Reid dominated on serve all match.";
    expect(splitInsight(summary)).toEqual({ claim: summary, evidence: null });
  });

  test("a decimal does not split on its period", () => {
    const summary =
      "Reid needed 1.5 shots per rally on average to close out points.";
    expect(splitInsight(summary)).toEqual({ claim: summary, evidence: null });
  });

  test("a lowercase continuation after an abbreviation does not split", () => {
    const summary =
      "Reid mixed serve placement, e.g. the wide slice, to break rhythm.";
    expect(splitInsight(summary)).toEqual({ claim: summary, evidence: null });
  });
});
