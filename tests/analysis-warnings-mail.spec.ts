import { expect, test } from "@playwright/test";

import { analysisWarningsInternalEmail } from "@/lib/services/email";
import { derivationWarnings } from "@/lib/services/notifications/analysis-warnings-mail";
import type { Transcript } from "@/lib/services/splitstep/derivation";

/**
 * No refusals (product decision, 2026-10-17): a derivation that has to guess
 * publishes anyway and mails the guesses to the alerts inbox. These pin which
 * guesses become warnings, and that a clean match mails nothing.
 */

function transcript(overrides: {
  rec?: Partial<Transcript["reconciliation"]>;
  guessed?: number[];
  leading?: number[];
  frozen?: number[];
}): Transcript {
  return {
    ok: true,
    reason: null,
    reconciliation: {
      ok: true,
      player1Label: "A",
      player1Source: "fold",
      foldedSets: [],
      games: [],
      reason: null,
      unresolvedPoints: [],
      settledWinners: [],
      ...overrides.rec,
    },
    points: [],
    winnerShare: 0,
    serveGeometryRetention: 0,
    unreturnedServeRate: 0,
    guessedRallies: overrides.guessed ?? [],
    frozenRallies: overrides.frozen ?? [],
    leadingUnscoredRallies: overrides.leading ?? [],
    segmentation: null,
  };
}

test("a reconciled match with nothing guessed has no warnings", () => {
  expect(derivationWarnings(transcript({}))).toEqual([]);
});

test("every guess the derivation made becomes a warning", () => {
  const warnings = derivationWarnings(
    transcript({
      rec: {
        ok: false,
        player1Source: "guess",
        reason: "folded score does not match the entered score",
      },
      guessed: [4, 9],
      leading: [1],
      frozen: [20, 21, 22],
    }),
  );
  expect(warnings.map((w) => w.title)).toEqual([
    "Score not verified",
    "Players identified without the score",
    "2 point winner(s) guessed",
    "1 rally(ies) before the first score",
    "3 rally(ies) under a frozen score",
  ]);
  expect(warnings[0].detail).toContain("does not match the entered score");
  expect(warnings[1].detail).toContain("a guess");
  expect(warnings[2].detail).toContain("4, 9");
});

test("the internal mail lists each warning and links the match", () => {
  const msg = analysisWarningsInternalEmail({
    to: "alerts@example.test",
    jobId: "job-1",
    matchId: "match-1",
    matchTitle: "Alex Rivera vs. Jordan Chen",
    warnings: [{ title: "Score not verified", detail: "the fold missed" }],
  });
  expect(msg.subject).toBe(
    "Published with 1 warning: Alex Rivera vs. Jordan Chen",
  );
  expect(msg.text).toContain("Score not verified");
  expect(msg.text).toContain("the fold missed");
  expect(msg.html).toContain("/dashboard/matches/match-1");
  expect(msg.tags).toEqual({ type: "analysis_warnings_internal" });
});
