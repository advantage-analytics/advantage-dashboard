import { expect, test } from "@playwright/test";

import {
  askOpponentKey,
  buildAskTagOptions,
  buildTeamAskTagOptions,
  type AskMatchSide,
  type AskRosterRow,
  type DbAskTeamMatch,
} from "@/lib/data/ask-tags";
import { programSide } from "@/lib/data/program-side";
import { rosterMatchIds } from "@/lib/data/roster-ids";
import type { DbPersonalMatch } from "@/lib/data/personal-matches-server";

/**
 * `ask-tags.ts` — what the Ask composer's `@` menu offers, derived from the
 * viewer's personal matches. Offline: plain rows in, options out.
 *
 * What these guard is quiet. An opponent split in two by a trailing space
 * shows two half-counts and a tag that reaches half the matches; one built
 * from the wrong seat offers the viewer's own name as an opponent. Neither
 * errors.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const PROFILE = "22222222-2222-4222-8222-222222222222";
const MY_IDS = [ME, PROFILE];

/** `playerSide()`'s three steps, restated so the spec stays offline. */
function sideOf(match: DbPersonalMatch): AskMatchSide {
  if (match.player1_id && MY_IDS.includes(match.player1_id)) return "player1";
  if (match.player2_id && MY_IDS.includes(match.player2_id)) return "player2";
  if (!match.player1_id && !match.player2_id && match.created_by === ME)
    return "player1";
  return null;
}

let nextId = 0;

/** A match with the viewer as player one unless the row says otherwise. */
function match(over: Partial<DbPersonalMatch>): DbPersonalMatch {
  nextId += 1;
  return {
    id: `match-${nextId}`,
    date: "2026-09-01T15:00:00+00:00",
    player1_id: ME,
    player2_id: null,
    player1_name: "Me Myself",
    player2_name: "Anna Lee",
    created_by: ME,
    score: { player1: [6, 6], player2: [4, 3] },
    tournament_name: null,
    round: null,
    result: null,
    match_type: null,
    court_type: null,
    verified: null,
    duration: null,
    opponent_hand: null,
    opponent_backhand: null,
    ...over,
  };
}

test.describe("opponent options", () => {
  test("one opponent across several matches is one option with the count", () => {
    const { opponents } = buildAskTagOptions(
      [
        match({ date: "2026-09-03T15:00:00+00:00" }),
        match({ date: "2026-09-02T15:00:00+00:00" }),
        match({ date: "2026-09-01T15:00:00+00:00" }),
        match({ player2_name: "Bea Ortiz" }),
      ],
      sideOf,
    );

    expect(opponents.map((o) => [o.name, o.matchCount])).toEqual([
      ["Anna Lee", 3],
      ["Bea Ortiz", 1],
    ]);
  });

  test("names differing only in case or surrounding whitespace group together", () => {
    const { opponents } = buildAskTagOptions(
      [
        match({ date: "2026-09-01T15:00:00+00:00", player2_name: "ANNA LEE" }),
        match({ date: "2026-09-02T15:00:00+00:00", player2_name: " anna lee" }),
        match({
          date: "2026-09-04T15:00:00+00:00",
          player2_name: "Anna  Lee ",
        }),
        match({ date: "2026-09-03T15:00:00+00:00", player2_name: "Anna Lee" }),
      ],
      sideOf,
    );

    expect(opponents).toHaveLength(1);
    expect(opponents[0]).toMatchObject({
      id: "anna lee",
      // The most recent match's spelling, tidied.
      name: "Anna Lee",
      matchCount: 4,
    });
    expect(askOpponentKey("  ANNA   lee ")).toBe(opponents[0].id);
  });

  test("a near-miss stays a different opponent", () => {
    const { opponents } = buildAskTagOptions(
      [match({ player2_name: "Anna Lee" }), match({ player2_name: "A. Lee" })],
      sideOf,
    );
    expect(opponents).toHaveLength(2);
  });

  test("a blank or null opponent name yields no opponent option", () => {
    const { matches, opponents } = buildAskTagOptions(
      [
        match({ player2_name: null }),
        match({ player2_name: "" }),
        match({ player2_name: "   " }),
      ],
      sideOf,
    );

    expect(opponents).toEqual([]);
    // Still taggable as matches.
    expect(matches).toHaveLength(3);
    expect(matches.every((m) => m.opponentName === null)).toBe(true);
    expect(askOpponentKey(null)).toBeNull();
    expect(askOpponentKey("  ")).toBeNull();
  });

  test("ordered by match count, ties to the most recently played", () => {
    const { opponents } = buildAskTagOptions(
      [
        match({ date: "2026-09-05T15:00:00+00:00", player2_name: "Solo New" }),
        match({ date: "2026-09-01T15:00:00+00:00", player2_name: "Solo Old" }),
        match({ date: "2026-08-02T15:00:00+00:00", player2_name: "Twice" }),
        match({ date: "2026-08-01T15:00:00+00:00", player2_name: "Twice" }),
      ],
      sideOf,
    );
    expect(opponents.map((o) => o.name)).toEqual([
      "Twice",
      "Solo New",
      "Solo Old",
    ]);
  });

  test("the opponent is the other seat, whichever seat the viewer holds", () => {
    const { matches, opponents } = buildAskTagOptions(
      [
        // The viewer's claimed profile sits in seat two.
        match({
          player1_id: "99999999-9999-4999-8999-999999999999",
          player2_id: PROFILE,
          player1_name: "Cara Diaz",
          player2_name: "Me Myself",
          score: { player1: [6, 6], player2: [4, 3] },
        }),
      ],
      sideOf,
    );

    expect(opponents.map((o) => o.name)).toEqual(["Cara Diaz"]);
    expect(matches[0]).toMatchObject({
      opponentName: "Cara Diaz",
      // Read from the viewer's seat: they lost 4-6, 3-6.
      scoreText: "4-6, 3-6",
      iWon: false,
    });
  });

  test("a match whose side cannot be named offers no opponent", () => {
    const { matches, opponents } = buildAskTagOptions(
      [
        match({
          player1_id: "99999999-9999-4999-8999-999999999999",
          player2_id: "88888888-8888-4888-8888-888888888888",
          player1_name: "Cara Diaz",
          player2_name: "Dee Evans",
        }),
      ],
      sideOf,
    );

    expect(opponents).toEqual([]);
    expect(matches[0]).toMatchObject({ opponentName: null, iWon: null });
  });

  test("handedness is the most recent one recorded; unknown values are dropped", () => {
    const { opponents } = buildAskTagOptions(
      [
        match({ date: "2026-09-03T15:00:00+00:00", opponent_hand: null }),
        match({ date: "2026-09-02T15:00:00+00:00", opponent_hand: "Left" }),
        match({ date: "2026-09-01T15:00:00+00:00", opponent_hand: "right" }),
        match({ player2_name: "Bea Ortiz", opponent_hand: "ambidextrous" }),
      ],
      sideOf,
    );

    expect(opponents.map((o) => [o.name, o.hand])).toEqual([
      ["Anna Lee", "left"],
      ["Bea Ortiz", null],
    ]);
  });
});

test.describe("match options", () => {
  test("one per match, newest first, with date, opponent, tournament and score", () => {
    const { matches } = buildAskTagOptions(
      [
        match({ id: "old", date: "2026-08-01T15:00:00+00:00" }),
        match({
          id: "new",
          date: "2026-09-20T15:00:00+00:00",
          player2_name: "Bea Ortiz",
          tournament_name: "Fall Invitational",
          score: { player1: [6, 3, 7], player2: [4, 6, 5] },
        }),
        match({ id: "mid", date: "2026-09-01T15:00:00+00:00", score: null }),
      ],
      sideOf,
    );

    expect(matches.map((m) => m.matchId)).toEqual(["new", "mid", "old"]);
    expect(matches[0]).toEqual({
      matchId: "new",
      playedOn: "2026-09-20",
      opponentName: "Bea Ortiz",
      tournamentName: "Fall Invitational",
      scoreText: "6-4, 3-6, 7-5",
      iWon: true,
      playerName: null,
    });
    // No score: no score text, and no outcome rather than a loss.
    expect(matches[1]).toMatchObject({ scoreText: null, iWon: null });
  });

  test("an undated match sorts last, wherever it arrives", () => {
    const { matches } = buildAskTagOptions(
      [
        match({ id: "undated", date: null as unknown as string }),
        match({ id: "older", date: "2026-08-01T15:00:00+00:00" }),
        match({ id: "unreadable", date: "not a date" }),
        match({ id: "newer", date: "2026-09-01T15:00:00+00:00" }),
      ],
      sideOf,
    );

    expect(matches.map((m) => m.matchId)).toEqual([
      "newer",
      "older",
      "undated",
      "unreadable",
    ]);
    expect(matches[2].playedOn).toBeNull();
  });

  test("no matches, no options", () => {
    expect(buildAskTagOptions([], sideOf)).toEqual({
      matches: [],
      opponents: [],
      players: [],
    });
  });
});

// ── Team scope ──────────────────────────────────────────────────────────────

/**
 * `buildTeamAskTagOptions()` — the same menu over a program's matches. What
 * it guards is as quiet as the personal half: a match turned to the wrong
 * seat offers the program's own player as an opponent, and a claimed
 * player's two id eras split one player into two options with half the
 * matches each.
 */
test.describe("team options", () => {
  const SOKOLOV = "aaaaaaaa-0000-4000-8000-00000000000a";
  const SOKOLOV_LOGIN = "aaaaaaaa-0000-4000-8000-0000000000a1";
  const REYES = "bbbbbbbb-0000-4000-8000-00000000000b";
  const COACH = "cccccccc-0000-4000-8000-00000000000c";
  const ENTRY = "dddddddd-0000-4000-8000-00000000000d";

  const ROSTER: AskRosterRow[] = [
    // A claimed player: profile id and login differ, and both are hers.
    {
      player_id: SOKOLOV,
      user_id: SOKOLOV_LOGIN,
      display_name: "Mara  Sokolov ",
      role: "player",
    },
    // Coach-managed, unclaimed.
    {
      player_id: REYES,
      user_id: null,
      display_name: "Jo Reyes",
      role: "player",
    },
    // A staff seat: its id means "us", but it is nobody's player profile.
    {
      player_id: COACH,
      user_id: COACH,
      display_name: "Pat Coach",
      role: "coach",
    },
  ];

  function teamMatch(over: Partial<DbAskTeamMatch>): DbAskTeamMatch {
    return {
      ...match({
        player1_id: SOKOLOV,
        player1_name: "M. Sokolov",
        player2_name: "Anna Lee",
        created_by: COACH,
      }),
      event_entry_id: null,
      ...over,
    };
  }

  test("each match is turned to the roster's seat and named from the roster, not from what was typed", () => {
    const options = buildTeamAskTagOptions(
      [
        teamMatch({ id: "first", date: "2026-09-03T15:00:00+00:00" }),
        // The roster player in seat two: the opponent is seat one.
        teamMatch({
          id: "second",
          date: "2026-09-02T15:00:00+00:00",
          player1_id: null,
          player1_name: "Bea Ortiz",
          player2_id: REYES,
          player2_name: "J Reyes",
          score: { player1: [6, 6], player2: [4, 3] },
        }),
      ],
      ROSTER,
    );

    expect(options.matches).toEqual([
      {
        matchId: "first",
        opponentName: "Anna Lee",
        playedOn: "2026-09-03",
        iWon: true,
        scoreText: "6-4, 6-3",
        tournamentName: null,
        playerName: "Mara Sokolov",
        playerId: SOKOLOV,
      },
      {
        matchId: "second",
        opponentName: "Bea Ortiz",
        playedOn: "2026-09-02",
        // Seat two lost 4-6, 3-6: the result is the roster player's.
        iWon: false,
        scoreText: "4-6, 3-6",
        tournamentName: null,
        playerName: "Jo Reyes",
        playerId: REYES,
      },
    ]);
    expect(options.opponents.map((opponent) => opponent.name)).toEqual([
      "Anna Lee",
      "Bea Ortiz",
    ]);
  });

  test("a claimed player's two id eras are one player with every match", () => {
    const options = buildTeamAskTagOptions(
      [
        teamMatch({ id: "profile-era" }),
        teamMatch({ id: "login-era", player1_id: SOKOLOV_LOGIN }),
        teamMatch({ id: "reyes", player1_id: REYES, player1_name: "Jo" }),
      ],
      ROSTER,
    );
    expect(options.players).toEqual([
      { id: SOKOLOV, name: "Mara Sokolov", matchCount: 2 },
      { id: REYES, name: "Jo Reyes", matchCount: 1 },
    ]);
    expect(
      options.matches
        .filter((option) => option.playerId === SOKOLOV)
        .map((option) => option.matchId)
        .sort(),
    ).toEqual(["login-era", "profile-era"]);
  });

  test("players are listed by match count, ties by name, and only those who have played", () => {
    const options = buildTeamAskTagOptions(
      [
        teamMatch({ id: "a", player1_id: REYES }),
        teamMatch({ id: "b", player1_id: SOKOLOV }),
      ],
      [
        ...ROSTER,
        {
          player_id: "eeeeeeee-0000-4000-8000-00000000000e",
          user_id: null,
          display_name: "Never Played",
          role: "player",
        },
      ],
    );
    expect(options.players.map((player) => player.name)).toEqual([
      "Jo Reyes",
      "Mara Sokolov",
    ]);
  });

  test("a doubles line hung on a schedule entry is ours in seat one, keeps its stored label and is nobody's player option", () => {
    const options = buildTeamAskTagOptions(
      [
        teamMatch({
          id: "doubles",
          player1_id: null,
          player1_name: "Sokolov / Reyes",
          player2_name: "Lee / Ortiz",
          event_entry_id: ENTRY,
          match_type: "Doubles",
        }),
      ],
      ROSTER,
    );
    expect(options.matches[0]).toMatchObject({
      matchId: "doubles",
      opponentName: "Lee / Ortiz",
      playerName: "Sokolov / Reyes",
      playerId: null,
      iWon: true,
    });
    expect(options.players).toEqual([]);
  });

  test("a coach's own login in the seat is still our side, named as stored, and not a player", () => {
    const options = buildTeamAskTagOptions(
      [teamMatch({ id: "coach-upload", player1_id: COACH })],
      ROSTER,
    );
    expect(options.matches[0]).toMatchObject({
      opponentName: "Anna Lee",
      playerName: "M. Sokolov",
      playerId: null,
    });
    expect(options.players).toEqual([]);
  });

  test("a match whose side cannot be decided is still taggable: no player, no opponent, no outcome", () => {
    const options = buildTeamAskTagOptions(
      [
        teamMatch({
          id: "unknown",
          player1_id: "99999999-0000-4000-8000-000000000009",
          player2_id: null,
        }),
      ],
      ROSTER,
    );
    expect(options.matches).toEqual([
      {
        matchId: "unknown",
        opponentName: null,
        playedOn: "2026-09-01",
        iWon: null,
        scoreText: "6-4, 6-3",
        tournamentName: null,
        playerName: null,
        playerId: null,
      },
    ]);
    expect(options.opponents).toEqual([]);
    expect(options.players).toEqual([]);
  });

  test("the side is programSide()'s, for every shape of row", () => {
    const rosterIds = rosterMatchIds(ROSTER);
    const rows = [
      teamMatch({ id: "p1" }),
      teamMatch({ id: "p2", player1_id: null, player2_id: SOKOLOV_LOGIN }),
      teamMatch({ id: "entry", player1_id: null, event_entry_id: ENTRY }),
      teamMatch({ id: "none", player1_id: null }),
    ];
    const options = buildTeamAskTagOptions(rows, ROSTER);
    for (const row of rows) {
      const side = programSide(row, rosterIds);
      const option = options.matches.find((m) => m.matchId === row.id);
      expect(option?.opponentName ?? null, row.id).toBe(
        side === "player1"
          ? row.player2_name
          : side === "player2"
            ? row.player1_name
            : null,
      );
    }
    expect(rows.map((row) => programSide(row, rosterIds))).toEqual([
      "player1",
      "player2",
      "player1",
      null,
    ]);
  });

  test("no roster and no matches: nothing to tag", () => {
    expect(buildTeamAskTagOptions([], [])).toEqual({
      matches: [],
      opponents: [],
      players: [],
    });
  });
});

test.describe("personal options carry no player", () => {
  test("playerName is null, there is no playerId, and players is empty", () => {
    const options = buildAskTagOptions([match({})], sideOf);
    expect(options.matches[0].playerName).toBeNull();
    expect("playerId" in options.matches[0]).toBe(false);
    expect(options.players).toEqual([]);
  });
});
