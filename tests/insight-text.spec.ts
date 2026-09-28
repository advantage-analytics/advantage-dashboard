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

  test("an abbreviation or initial before a capital does not split", () => {
    for (const claim of [
      "Your win vs. Okafor came from second-serve returns.",
      "You held serve better than J. Smith in every set.",
      "Reid played the U.S. Open qualifier on hard courts.",
      "The St. Louis final turned on break points.",
    ]) {
      expect(splitInsight(`${claim} Reid won 78% of them.`)).toEqual({
        claim,
        evidence: "Reid won 78% of them.",
      });
    }
  });

  test("a sentence ending in a longer word still splits", () => {
    expect(splitInsight("Reid served well. Okafor did not.")).toEqual({
      claim: "Reid served well.",
      evidence: "Okafor did not.",
    });
  });

  test("a five-sentence summary keeps the first as the claim and the rest as evidence", () => {
    // The generator now asks for 4-5 sentences under 600 characters (was 2-3
    // under 350). The card's split is one sentence off the front, so the
    // longer text needs no change there.
    const claim =
      "Your first serve carried this match, and it is the shot to keep building on.";
    const evidence = [
      "You landed 68% of first serves and won 77% of those points, which kept Okafor off balance from the very first game.",
      "Second serves were a different story: at 1.5 double faults per set you handed back momentum in every close game.",
      "Rally length also tilted against you once exchanges passed eight shots, where Okafor took 61% of the points.",
      "Next week, work on a heavier second serve to the body and on staying patient through the longer rallies.",
    ].join(" ");
    const summary = `${claim} ${evidence}`;
    expect(summary.length).toBeGreaterThanOrEqual(450);
    expect(summary.length).toBeLessThan(600);
    expect(summary).toContain("1.5");

    const split = splitInsight(summary);
    expect(split).toEqual({ claim, evidence });
    expect(split.evidence?.match(/[.!?](\s|$)/g)).toHaveLength(4);
  });

  test("a lowercase continuation after an abbreviation does not split", () => {
    const summary =
      "Reid mixed serve placement, e.g. the wide slice, to break rhythm.";
    expect(splitInsight(summary)).toEqual({ claim: summary, evidence: null });
  });
});
