import { expect, test } from "@playwright/test";

import {
  planSave,
  savedLineUpload,
  seedScoreForm,
  type ScoreFormState,
  toRecordResultInput,
  uploadInsteadHref,
} from "@/lib/schedule/score-seed";
import { endingMark, matchWon } from "@/lib/schedule/entry-state";
import { didUserWin, matchOutcome } from "@/lib/data/match-utils";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";

/**
 * `score-seed.ts` — the pure half of the score-only flow (T11).
 *
 * The assertion that matters most is the tiebreak encoding. A 7-6(5) set is
 * seven GAMES to six with five POINTS in the losing side's tiebreak cell,
 * exactly as `ScoreEntry` and `recordResult` already store it. Sending the
 * tiebreak points as the set score makes the set unreadable and the winner
 * wrong, everywhere a winner is derived from games — `matchWon`,
 * `transformDbMatch`, and the vision pipeline's set ordering. Guardrails §4.3.
 */

function preset(overrides: Partial<EventPreset> = {}): EventPreset {
  return {
    entryId: "entry-1",
    eventId: "event-1",
    eventName: "Rival State",
    matchId: null,
    round: "S1",
    playerName: "Ana Vasquez",
    playerUserId: "user-1",
    opponentName: "Rival Player",
    date: "2026-03-21",
    surface: "hard",
    bestOf: 3,
    adScoring: true,
    score: null,
    supportsVideo: true,
    eventHref: "/dashboard/team/schedule/event-1",
    site: "home",
    eventKind: "dual",
    opponentProgramKey: null,
    opponentSchool: null,
    ...overrides,
  };
}

test.describe("seedScoreForm", () => {
  test("a line with no score opens on bestOf-length nulls", () => {
    const state = seedScoreForm(preset({ bestOf: 3 }));

    expect(state.playerScores).toEqual([null, null, null]);
    expect(state.opponentScores).toEqual([null, null, null]);
    expect(state.playerTiebreaks).toEqual([null, null, null]);
    expect(state.opponentTiebreaks).toEqual([null, null, null]);
    expect(state.opponentName).toBe("Rival Player");
  });

  test("best-of-5 opens on five sets, not three", () => {
    expect(seedScoreForm(preset({ bestOf: 5 })).playerScores).toHaveLength(5);
  });

  test("a scored line seeds its sets and blanks its tiebreaks", () => {
    // `EventPreset.score` carries game counts and no tiebreaks at all, so a
    // seeded breaker would be a number nobody entered.
    const state = seedScoreForm(
      preset({ score: { player1: [6, 7], player2: [4, 6] } }),
    );

    expect(state.playerScores).toEqual([6, 7, null]);
    expect(state.opponentScores).toEqual([4, 6, null]);
    expect(state.playerTiebreaks).toEqual([null, null, null]);
    expect(state.opponentTiebreaks).toEqual([null, null, null]);
  });

  test("a score longer than the format is not truncated", () => {
    const state = seedScoreForm(
      preset({ bestOf: 1, score: { player1: [6, 3, 7], player2: [4, 6, 5] } }),
    );

    expect(state.playerScores).toEqual([6, 3, 7]);
    expect(state.opponentScores).toEqual([4, 6, 5]);
  });
});

test.describe("toRecordResultInput · games in the set cells, points in the tiebreaks", () => {
  test("a 7-6(5) set sends 7, 6, null and 5", () => {
    const input = toRecordResultInput(preset(), {
      opponentName: "Rival Player",
      playerScores: [7, null, null],
      opponentScores: [6, null, null],
      // The set winner took the breaker 7-x, so the number belongs to the
      // side that lost it — here, the opponent.
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [5, null, null],
      ending: null,
      stoppedBy: null,
    });

    expect(input.ourGames).toEqual([7]);
    expect(input.theirGames).toEqual([6]);
    expect(input.ourTiebreaks).toEqual([null]);
    expect(input.theirTiebreaks).toEqual([5]);
  });

  test("only the sets that were played are sent", () => {
    const input = toRecordResultInput(preset({ bestOf: 5 }), {
      opponentName: "Rival Player",
      playerScores: [6, 4, 6, null, null],
      opponentScores: [3, 6, 2, null, null],
      playerTiebreaks: [null, null, null, null, null],
      opponentTiebreaks: [null, null, null, null, null],
      ending: null,
      stoppedBy: null,
    });

    expect(input.ourGames).toEqual([6, 4, 6]);
    expect(input.theirGames).toEqual([3, 6, 2]);
    expect(input.ourTiebreaks).toHaveLength(3);
    expect(input.theirTiebreaks).toHaveLength(3);
  });

  test("a set with only the opponent scoring still counts as played", () => {
    const input = toRecordResultInput(preset(), {
      opponentName: "Rival Player",
      playerScores: [null, null, null],
      opponentScores: [6, null, null],
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [null, null, null],
      ending: null,
      stoppedBy: null,
    });

    expect(input.ourGames).toEqual([0]);
    expect(input.theirGames).toEqual([6]);
  });

  test("our games go first — never the opponent’s", () => {
    const input = toRecordResultInput(preset(), {
      opponentName: "Rival Player",
      playerScores: [6, 6, null],
      opponentScores: [1, 2, null],
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [null, null, null],
      ending: null,
      stoppedBy: null,
    });

    expect(input.ourGames).toEqual([6, 6]);
    expect(input.theirGames).toEqual([1, 2]);
  });
});

test.describe("toRecordResultInput · round", () => {
  test("a tournament sends the round", () => {
    const input = toRecordResultInput(
      preset({ eventKind: "tournament", round: "R16" }),
      seedFilled(),
    );

    expect(input.round).toBe("R16");
  });

  test("a dual sends null — its slot is its round, and the entry owns it", () => {
    const input = toRecordResultInput(
      preset({ eventKind: "dual", round: "S1" }),
      seedFilled(),
    );

    expect(input.round).toBeNull();
  });
});

test.describe("toRecordResultInput · opponent labels", () => {
  test("a doubles pair splits on the slash", () => {
    const input = toRecordResultInput(preset(), {
      ...seedFilled(),
      opponentName: "Rival One / Rival Two",
    });

    expect(input.opponentLabels).toEqual(["Rival One", "Rival Two"]);
  });

  test("an empty name sends no labels, so the action can refuse it", () => {
    const input = toRecordResultInput(preset(), {
      ...seedFilled(),
      opponentName: "   ",
    });

    expect(input.opponentLabels).toEqual([]);
  });

  test("the entry id travels through", () => {
    expect(toRecordResultInput(preset(), seedFilled()).entryId).toBe("entry-1");
  });
});

function seedFilled(): ScoreFormState {
  return {
    opponentName: "Rival Player",
    playerScores: [6, 6, null],
    opponentScores: [3, 4, null],
    playerTiebreaks: [null, null, null],
    opponentTiebreaks: [null, null, null],
    ending: null,
    stoppedBy: null,
  };
}

test.describe("the links into the upload wizard", () => {
  const open = { canUpload: true, hasOutcome: false };

  test("an untouched dual line with no result goes to its preset upload", () => {
    const line = preset();
    expect(uploadInsteadHref(line, seedScoreForm(line), open)).toBe(
      "/dashboard/team/upload?entry=entry-1",
    );
  });

  test("never where the wizard would drop digits, miss the round, or bounce", () => {
    const line = preset();
    const typed = {
      ...seedScoreForm(line),
      opponentTiebreaks: [null, 5, null],
      ending: null,
      stoppedBy: null,
    };
    expect(uploadInsteadHref(line, typed, open)).toBeNull();

    const scored = preset({ matchId: "match-1" });
    expect(uploadInsteadHref(scored, seedScoreForm(scored), open)).toBeNull();

    const run = preset({ eventKind: "tournament", round: "QF" });
    expect(uploadInsteadHref(run, seedScoreForm(run), open)).toBeNull();

    expect(
      uploadInsteadHref(line, seedScoreForm(line), {
        canUpload: true,
        hasOutcome: true,
      }),
    ).toBeNull();
    expect(
      uploadInsteadHref(line, seedScoreForm(line), {
        canUpload: false,
        hasOutcome: false,
      }),
    ).toBeNull();
  });

  test("a saved score offers video on a singles line and nothing on doubles, naming the match", () => {
    expect(savedLineUpload(preset(), "match-1", true)).toEqual({
      label: "S1",
      href: "/dashboard/team/upload?entry=entry-1&match=match-1",
      action: "Add video",
    });
    expect(
      savedLineUpload(
        preset({ discipline: "doubles", supportsVideo: false, round: "D2" }),
        "m",
        true,
      ),
    ).toBeNull();
    expect(savedLineUpload(preset(), "match-1", false)).toBeNull();
  });
});

test.describe("a match that stopped", () => {
  test("a retired match seeds its ending, and who retired from the winner", () => {
    const state = seedScoreForm(
      preset({
        matchId: "match-1",
        ending: "retired",
        score: { player1: [3, 2], player2: [6, 1], winner: "player2" },
      }),
    );
    expect(state.ending).toBe("retired");
    // player2 took it, so our player is the one who retired.
    expect(state.stoppedBy).toBe("ours");
  });

  test("a no-score default seeds from its saved outcome", () => {
    const state = seedScoreForm(preset(), { kind: "default", side: "theirs" });
    expect(state).toMatchObject({ ending: "defaulted", stoppedBy: "theirs" });
  });

  test("retired saves the score with who retired, which decides the winner", () => {
    const plan = planSave(
      preset(),
      {
        ...seedFilled(),
        playerScores: [3, 2, null],
        opponentScores: [6, 1, null],
        ending: "retired",
        stoppedBy: "theirs",
      },
      null,
    );
    expect(plan).toMatchObject({
      kind: "score",
      clearOutcomeFirst: false,
      input: {
        ourGames: [3, 2],
        theirGames: [6, 1],
        ending: { kind: "retired", side: "theirs" },
      },
    });
  });

  test("retired needs who, and a score", () => {
    expect(
      planSave(preset(), { ...seedFilled(), ending: "retired" }, null),
    ).toEqual({ kind: "error", message: "Choose who retired." });
    expect(
      planSave(
        preset(),
        { ...seedScoreForm(preset()), ending: "retired", stoppedBy: "ours" },
        null,
      ),
    ).toEqual({ kind: "error", message: "Enter the score when they retired." });
  });

  test("a default with no score is an outcome; with a score it is a match", () => {
    const blank = {
      ...seedScoreForm(preset()),
      ending: "defaulted" as const,
      stoppedBy: "ours" as const,
    };
    expect(planSave(preset(), blank, null)).toEqual({
      kind: "outcome",
      side: "ours",
    });
    expect(planSave(preset({ matchId: "match-1" }), blank, null)).toMatchObject(
      { kind: "error" },
    );
    expect(
      planSave(
        preset(),
        { ...seedFilled(), ending: "defaulted", stoppedBy: "ours" },
        { kind: "default", side: "ours" },
      ),
    ).toMatchObject({ kind: "score", clearOutcomeFirst: true });
  });

  test("a doubles line needs both names in their pair", () => {
    expect(
      planSave(
        preset({ discipline: "doubles" }),
        { ...seedFilled(), opponentName: "Zoe Adler" },
        null,
      ),
    ).toEqual({ kind: "error", message: "Choose both players in their pair." });
  });
});

test.describe("who took a match that stopped", () => {
  const match = (score: Record<string, unknown>) => ({
    id: "m",
    round: "S1",
    status: "manual" as const,
    score: score as never,
    opponentLabels: [],
    hasVideo: false,
  });

  test("the stored winner outranks the games", () => {
    // 3-6, 2-1 ret. by our player: they led nothing, and still lost the line.
    expect(
      matchWon(match({ player1: [3, 2], player2: [6, 1], winner: "player2" })),
    ).toBe(false);
    expect(
      matchWon(match({ player1: [6, 1], player2: [3, 2], winner: "player1" })),
    ).toBe(true);
  });

  test("without one, the games decide as before", () => {
    expect(matchWon(match({ player1: [6, 6], player2: [3, 4] }))).toBe(true);
  });

  test("a stopped score carries its mark", () => {
    expect(endingMark("retired")).toBe("ret.");
    expect(endingMark("defaulted")).toBe("def.");
    expect(endingMark(null)).toBeNull();
  });
});

test.describe("the matches, Home and profile rule agrees on a stopped match", () => {
  // 3-6, 2-1 ret. by player1: ahead on nothing, and the other side's match.
  const retired = {
    player1: [6, 2],
    player2: [3, 1],
    winner: "player2" as const,
  };

  test("a stored winner outranks the sets, from either seat", () => {
    expect(matchOutcome(retired, true)).toBe(false);
    expect(matchOutcome(retired, false)).toBe(true);
    expect(didUserWin(retired, true)).toBe(false);
  });

  test("without one, sets decide and level is no answer", () => {
    expect(matchOutcome({ player1: [6, 6], player2: [3, 4] }, true)).toBe(true);
    expect(matchOutcome({ player1: [6, 3], player2: [3, 6] }, true)).toBeNull();
  });
});
