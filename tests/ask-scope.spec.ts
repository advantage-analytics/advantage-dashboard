import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  ASK_NO_ADVICE_SENTENCE,
  ASK_TEAM_NO_ADVICE_SENTENCE,
  readAskSourceMatch,
} from "@/lib/services/ask/events";
import {
  PERSONAL_ASK_SCOPE,
  askBasePath,
  askScopeProgramId,
  type AskScope,
} from "@/lib/services/ask/scope";

/**
 * `scope.ts` — whose matches an Ask question is about — and the two small
 * things `events.ts` gained with it. Offline and pure.
 */

const TEAM: AskScope = {
  kind: "team",
  programId: "eeeeeeee-0000-4000-8000-000000000005",
  programName: "Westbrook College",
};

test.describe("AskScope", () => {
  test("each scope has its own page", () => {
    expect(askBasePath(PERSONAL_ASK_SCOPE)).toBe("/dashboard/ask");
    expect(askBasePath({ kind: "personal" })).toBe("/dashboard/ask");
    expect(askBasePath(TEAM)).toBe("/dashboard/team/ask");
  });

  test("the loaders' argument is the program's id, or null for a personal scope", () => {
    expect(askScopeProgramId(PERSONAL_ASK_SCOPE)).toBeNull();
    expect(askScopeProgramId(TEAM)).toBe(TEAM.programId);
  });

  test("is a leaf a client component can import: no imports at all", () => {
    const source = readFileSync("src/lib/services/ask/scope.ts", "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toContain("server-only");
  });
});

test.describe("readAskSourceMatch", () => {
  const SAVED_BEFORE_TEAM_ASK = {
    matchId: "m1",
    opponentName: "Anna Lee",
    playedOn: "2026-09-14",
    iWon: true,
    scoreText: "6-4, 6-3",
  };

  test("a source saved before playerName existed reads back with it null", () => {
    expect(readAskSourceMatch(SAVED_BEFORE_TEAM_ASK)).toEqual({
      ...SAVED_BEFORE_TEAM_ASK,
      playerName: null,
    });
  });

  test("a team source keeps its player; a wrong type is dropped to null", () => {
    expect(
      readAskSourceMatch({
        ...SAVED_BEFORE_TEAM_ASK,
        playerName: "Mara Sokolov",
      })?.playerName,
    ).toBe("Mara Sokolov");
    expect(
      readAskSourceMatch({ ...SAVED_BEFORE_TEAM_ASK, playerName: 7 })
        ?.playerName,
    ).toBeNull();
  });

  test("an unknown result stays null, and a row with no match id is not a source", () => {
    expect(readAskSourceMatch({ matchId: "m2" })).toEqual({
      matchId: "m2",
      opponentName: null,
      playedOn: null,
      iWon: null,
      scoreText: null,
      playerName: null,
    });
    for (const value of [null, "m1", [], {}, { matchId: 3 }]) {
      expect(readAskSourceMatch(value)).toBeNull();
    }
  });
});

test("the team no-advice sentence is the personal one about the program's matches", () => {
  expect(ASK_TEAM_NO_ADVICE_SENTENCE).toBe(
    ASK_NO_ADVICE_SENTENCE.replace("your matches", "the program's matches"),
  );
  expect(ASK_TEAM_NO_ADVICE_SENTENCE).not.toMatch(/\byour?\b/);
});
