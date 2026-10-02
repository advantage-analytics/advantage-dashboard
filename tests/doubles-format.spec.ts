import { expect, test } from "@playwright/test";

import {
  doublesFormatLabel,
  doublesFormatValueOf,
  lineFormat,
  singlesFormatLabel,
} from "@/lib/schedule/format";
import { validateSetScore } from "@/components/dashboard/matches/new-match-wizard/utils";
import { setWinner } from "@/components/dashboard/matches/new-match-wizard/score-state";
import { decidedWinner } from "@/lib/matches/patch-match";
import {
  DOUBLES_FORMATS,
  doublesFormatOptions,
} from "@/components/dashboard/schedule/static/event-fact-fields";
import type { EventFormat } from "@/lib/schedule/types";

/**
 * A dual's doubles lines play their own format — one set to 6, or an 8-game
 * pro-set — separate from the singles best-of, with their own ad scoring.
 */

const dual: EventFormat = {
  bestOf: 3,
  adScoring: false,
  // Singles no-ad, doubles ad — the high-school case.
  doubles: { gamesTo: 8, adScoring: true },
};

test("a doubles line plays one set of its own length and scoring", () => {
  expect(lineFormat(dual, "singles")).toEqual({
    bestOf: 3,
    adScoring: false,
    gamesTo: 6,
  });
  expect(lineFormat(dual, "doubles")).toEqual({
    bestOf: 1,
    adScoring: true,
    gamesTo: 8,
  });
});

test("a dual saved before the doubles field plays one set to 6", () => {
  const legacy: EventFormat = { bestOf: 3, adScoring: null };
  // No doubles answer, so the singles scoring it always used — null included.
  expect(lineFormat(legacy, "doubles")).toEqual({
    bestOf: 1,
    adScoring: null,
    gamesTo: 6,
  });
  expect(doublesFormatValueOf(legacy.doubles)).toBeUndefined();
  expect(doublesFormatLabel(legacy)).toBeNull();
  // No doubles capsule beside it, so the singles label keeps its old words.
  expect(singlesFormatLabel(legacy)).toBe("Best of 3 Sets");
});

test("the capsules name which lines each format covers", () => {
  expect(singlesFormatLabel(dual)).toBe(
    "Singles · Best of 3 Sets · No-Ad Scoring",
  );
  expect(doublesFormatLabel(dual)).toBe(
    "Doubles · 8-Game Pro-Set · Ad Scoring",
  );
  expect(
    doublesFormatLabel({ ...dual, doubles: { gamesTo: 6, adScoring: false } }),
  ).toBe("Doubles · One Set to 6 · No-Ad Scoring");
  // A null answer drops the scoring half rather than guessing it.
  expect(
    doublesFormatLabel({ ...dual, doubles: { gamesTo: 6, adScoring: null } }),
  ).toBe("Doubles · One Set to 6");
});

test("a saved doubles format looks up its option, and a null finds none", () => {
  expect(doublesFormatValueOf({ gamesTo: 8, adScoring: true })).toBe(
    "pro-set-8-ad",
  );
  expect(doublesFormatValueOf({ gamesTo: 6, adScoring: null })).toBeUndefined();
});

test("the doubles menu offers four formats with tiebreak and scoring", () => {
  expect(doublesFormatOptions(DOUBLES_FORMATS)).toEqual([
    {
      value: "set-to-6-no-ad",
      label: "One Set to 6",
      description: "Tiebreak at 6-6 · No-Ad Scoring",
    },
    {
      value: "set-to-6-ad",
      label: "One Set to 6",
      description: "Tiebreak at 6-6 · Ad Scoring",
    },
    {
      value: "pro-set-8-no-ad",
      label: "8-Game Pro-Set",
      description: "Tiebreak at 8-8 · No-Ad Scoring",
    },
    {
      value: "pro-set-8-ad",
      label: "8-Game Pro-Set",
      description: "Tiebreak at 8-8 · Ad Scoring",
    },
  ]);
});

test("a 6-game set validates exactly as it always has", () => {
  expect(validateSetScore(6, 4).kind).toBe("ok");
  expect(validateSetScore(7, 6).kind).toBe("ok");
  expect(validateSetScore(6, 5).kind).toBe("incomplete");
  expect(validateSetScore(8, 6)).toEqual({
    kind: "invalid",
    message: "Games must be 0–7.",
  });
  expect(validateSetScore(7, 3)).toEqual({
    kind: "invalid",
    message: "Set must end 6-0..6-4, 7-5, or 7-6.",
  });
});

test("an 8-game pro-set accepts 8-6, 9-7 and 9-8", () => {
  expect(validateSetScore(8, 6, 8).kind).toBe("ok");
  expect(validateSetScore(9, 7, 8).kind).toBe("ok");
  expect(validateSetScore(8, 9, 8).kind).toBe("ok");
  expect(validateSetScore(6, 4, 8).kind).toBe("incomplete");
  expect(validateSetScore(8, 7, 8).kind).toBe("incomplete");
  expect(validateSetScore(10, 8, 8).kind).toBe("invalid");
});

test("set and match winners follow the set length", () => {
  expect(setWinner(6, 4)).toBe("player");
  expect(setWinner(6, 4, 8)).toBeNull();
  expect(setWinner(9, 8, 8)).toBe("player");
  expect(setWinner(9, 8)).toBeNull();
  expect(decidedWinner([6], [8], 1, 8)).toBe("player2");
  expect(decidedWinner([6], [4], 1, 8)).toBeNull();
});
