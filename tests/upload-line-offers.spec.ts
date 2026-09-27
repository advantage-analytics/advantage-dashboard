import { expect, test } from "@playwright/test";

import { rankLineOffers } from "@/components/dashboard/matches/new-match-wizard/offer-match";
import type { LineOffer } from "@/components/dashboard/matches/new-match-wizard/types";

function offer(overrides: Partial<LineOffer> = {}): LineOffer {
  return {
    entryId: "entry",
    matchId: null,
    eventId: "event",
    eventName: "Fall Classic",
    eventKind: "dual",
    slot: "#2 Singles",
    playerName: "Marcus Reid",
    opponentName: "Jordan Alvarez",
    opponentProgramKey: null,
    opponentSchool: null,
    date: "2026-09-05",
    site: "home",
    surface: null,
    bestOf: 3,
    adScoring: null,
    score: null,
    daysFromFile: 0,
    ...overrides,
  };
}

const blankScore = {
  playerScores: [null, null, null],
  opponentScores: [null, null, null],
};

test.describe("rankLineOffers", () => {
  test("drops an offer that matches on date alone", () => {
    const offers = [offer({ score: { player1: [6, 6], player2: [4, 3] } })];
    expect(
      rankLineOffers(offers, { opponentName: "Someone Else", ...blankScore }),
    ).toEqual([]);
    expect(rankLineOffers(offers, { opponentName: "", ...blankScore })).toEqual(
      [],
    );
  });

  test("keeps a name match despite case and extra whitespace", () => {
    const offers = [offer()];
    expect(
      rankLineOffers(offers, {
        opponentName: "  jordan   ALVAREZ ",
        ...blankScore,
      }),
    ).toEqual(offers);
  });

  test("a blank typed name matches nothing, not even a blank offer name", () => {
    const offers = [
      offer({ entryId: "a", opponentName: "" }),
      offer({ entryId: "b" }),
    ];
    expect(rankLineOffers(offers, { opponentName: "", ...blankScore })).toEqual(
      [],
    );
    expect(
      rankLineOffers(offers, { opponentName: "   ", ...blankScore }),
    ).toEqual([]);
  });

  test("keeps a score match whose name does not match", () => {
    const offers = [offer({ score: { player1: [6, 7], player2: [4, 6] } })];
    expect(
      rankLineOffers(offers, {
        opponentName: "J. Alvarez",
        playerScores: [6, 7, null],
        opponentScores: [4, 6, null],
      }),
    ).toEqual(offers);
  });

  test("an offer with no score qualifies only by name", () => {
    const offers = [offer({ score: null })];
    expect(
      rankLineOffers(offers, {
        opponentName: "Someone Else",
        playerScores: [6, 6, null],
        opponentScores: [4, 3, null],
      }),
    ).toEqual([]);
    expect(
      rankLineOffers(offers, {
        opponentName: "Jordan Alvarez",
        playerScores: [6, 6, null],
        opponentScores: [4, 3, null],
      }),
    ).toEqual(offers);
  });

  test("a partially entered score does not match", () => {
    const offers = [offer({ score: { player1: [6, 6], player2: [4, 3] } })];
    for (const [playerScores, opponentScores] of [
      [
        [6, null, null],
        [4, null, null],
      ],
      [
        [6, 6, null],
        [4, null, null],
      ],
      [
        [6, 6, null],
        [null, null, null],
      ],
    ]) {
      expect(
        rankLineOffers(offers, {
          opponentName: "",
          playerScores,
          opponentScores,
        }),
      ).toEqual([]);
    }
  });

  test("orders name > score > daysFromFile", () => {
    const score = { player1: [6, 6], player2: [4, 3] };
    const scoreOnlyNear = offer({
      entryId: "score-0",
      opponentName: "Other Player",
      score,
      daysFromFile: 0,
    });
    const nameOnlyFar = offer({
      entryId: "name-2",
      score: null,
      daysFromFile: 2,
    });
    const scoreOnlyFar = offer({
      entryId: "score-1",
      opponentName: "Third Player",
      score,
      daysFromFile: 1,
    });
    const dateOnly = offer({
      entryId: "date-0",
      opponentName: "Nobody",
      score: null,
      daysFromFile: 0,
    });
    const ranked = rankLineOffers(
      [dateOnly, scoreOnlyFar, scoreOnlyNear, nameOnlyFar],
      {
        opponentName: "Jordan Alvarez",
        playerScores: [6, 6, null],
        opponentScores: [4, 3, null],
      },
    );
    expect(ranked.map((o) => o.entryId)).toEqual([
      "name-2",
      "score-0",
      "score-1",
    ]);
  });
});
