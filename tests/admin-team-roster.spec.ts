import { expect, test } from "@playwright/test";

import {
  rosterIdIndex,
  rosterMatchOwnerIds,
  rosterWithMatchCounts,
  type AdminRosterMatchRow,
  type AdminRosterPlayerRow,
} from "@/lib/data/admin-team-roster";

/**
 * Pure-logic specs for the Admin › Teams roster projection (T5).
 *
 * The thing under test is the two-id-space attribution: `matches.player1_id`
 * holds either a `program_players.id` or the auth uid of the account that
 * claimed that profile, with no foreign key and no normalisation, and a roster
 * row's season is the union of both. No I/O, no live DB — that is the whole
 * point of keeping the fold in a module with no Supabase client in it.
 */

function player(
  overrides: Partial<AdminRosterPlayerRow> = {},
): AdminRosterPlayerRow {
  return {
    id: "profile-1",
    first_name: "Ana",
    last_name: "Ruiz",
    class_year: "2027",
    lineup_spot: 1,
    email: null,
    claimed_by_user_id: null,
    ...overrides,
  };
}

function match(
  overrides: Partial<AdminRosterMatchRow> = {},
): AdminRosterMatchRow {
  return {
    id: "match-1",
    player1_id: "profile-1",
    player2_name: "Opponent",
    result: "won",
    score: { player1: [6, 6], player2: [4, 3] },
    date: "2026-02-01T12:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The two id spaces
// ---------------------------------------------------------------------------

test("counts matches keyed by profile id and by claimed auth uid together", () => {
  const claimed = player({
    id: "profile-1",
    claimed_by_user_id: "auth-uid-1",
  });

  const roster = rosterWithMatchCounts(
    [claimed],
    [
      match({
        id: "m1",
        player1_id: "profile-1",
        date: "2026-02-01T12:00:00Z",
      }),
      match({
        id: "m2",
        player1_id: "profile-1",
        date: "2026-02-08T12:00:00Z",
      }),
      // Recorded before the athlete claimed the profile: their auth uid.
      match({
        id: "m3",
        player1_id: "auth-uid-1",
        date: "2025-11-04T12:00:00Z",
        result: "lost",
        player2_name: "Older Opponent",
      }),
    ],
  );

  expect(roster).toHaveLength(1);
  expect(roster[0].matchCount).toBe(3);
  // Newest of the three, whichever id space it came from.
  expect(roster[0].lastMatch).toEqual({
    id: "m2",
    result: "won",
    // Read off the score, never off `result` — the column holds three
    // incompatible spellings live. See `AdminTeamRosterMatch.won`.
    won: true,
    opponent: "Opponent",
    date: "2026-02-08T12:00:00Z",
  });
});

test("a uid-keyed match can be the last match", () => {
  const roster = rosterWithMatchCounts(
    [player({ claimed_by_user_id: "auth-uid-1" })],
    [
      match({
        id: "m1",
        player1_id: "profile-1",
        date: "2025-10-01T12:00:00Z",
      }),
      match({
        id: "m2",
        player1_id: "auth-uid-1",
        date: "2026-03-03T12:00:00Z",
        result: "lost",
        player2_name: "Newest Opponent",
      }),
    ],
  );

  expect(roster[0].matchCount).toBe(2);
  expect(roster[0].lastMatch?.id).toBe("m2");
  expect(roster[0].lastMatch?.result).toBe("lost");
  expect(roster[0].lastMatch?.opponent).toBe("Newest Opponent");
});

test("a player with no matches reports zero and no last match", () => {
  const roster = rosterWithMatchCounts(
    [player({ id: "profile-2", first_name: "Bo", last_name: "Chen" })],
    [
      // Somebody else's match, and a row with no player at all.
      match({ id: "m1", player1_id: "profile-1" }),
      match({ id: "m2", player1_id: null }),
    ],
  );

  expect(roster).toHaveLength(1);
  expect(roster[0].matchCount).toBe(0);
  expect(roster[0].lastMatch).toBeNull();
});

test("a match belonging to nobody on the roster is not attributed", () => {
  const roster = rosterWithMatchCounts(
    [player()],
    [match({ id: "m1", player1_id: "some-opponent-profile" })],
  );

  expect(roster[0].matchCount).toBe(0);
});

test("counts stay separate when two players are on the roster", () => {
  const roster = rosterWithMatchCounts(
    [
      player({ id: "p1", lineup_spot: 1, claimed_by_user_id: "uid-1" }),
      player({
        id: "p2",
        first_name: "Bo",
        last_name: "Chen",
        lineup_spot: 2,
      }),
    ],
    [
      match({ id: "m1", player1_id: "p1" }),
      match({ id: "m2", player1_id: "uid-1" }),
      match({ id: "m3", player1_id: "p2" }),
    ],
  );

  expect(roster.map((row) => [row.id, row.matchCount])).toEqual([
    ["p1", 2],
    ["p2", 1],
  ]);
});

// ---------------------------------------------------------------------------
// The id index the query is built from
// ---------------------------------------------------------------------------

test("the index maps both ids onto the profile id, and the query names both", () => {
  const players = [
    player({ id: "p1", claimed_by_user_id: "uid-1" }),
    player({ id: "p2", claimed_by_user_id: null }),
  ];

  const index = rosterIdIndex(players);
  expect(index.get("p1")).toBe("p1");
  expect(index.get("uid-1")).toBe("p1");
  expect(index.get("p2")).toBe("p2");
  expect(index.get("stranger")).toBeUndefined();

  // Exactly the key set — the fetch and the attribution are one rule.
  expect(new Set(rosterMatchOwnerIds(players))).toEqual(
    new Set(["p1", "uid-1", "p2"]),
  );
});

test("an unclaimed row contributes only its own id", () => {
  expect(rosterMatchOwnerIds([player({ id: "p1" })])).toEqual(["p1"]);
});

test("an empty roster names no ids", () => {
  expect(rosterMatchOwnerIds([])).toEqual([]);
});

// ---------------------------------------------------------------------------
// Row shape and ordering
// ---------------------------------------------------------------------------

test("rows carry lineup spot, name, class and hasAccount", () => {
  const roster = rosterWithMatchCounts(
    [
      player({
        id: "p1",
        first_name: "Ana",
        last_name: "Ruiz",
        class_year: "2027",
        lineup_spot: 3,
        claimed_by_user_id: "uid-1",
      }),
    ],
    [],
  );

  expect(roster[0]).toMatchObject({
    id: "p1",
    name: "Ana Ruiz",
    classYear: "2027",
    lineupSpot: 3,
    hasAccount: true,
    claimedUserId: "uid-1",
  });
});

test("hasAccount is false for an unclaimed profile", () => {
  const roster = rosterWithMatchCounts(
    [player({ claimed_by_user_id: null })],
    [],
  );
  expect(roster[0].hasAccount).toBe(false);
  expect(roster[0].claimedUserId).toBeNull();
});

test("orders by lineup spot with null spots last, then by name", () => {
  const roster = rosterWithMatchCounts(
    [
      player({ id: "z", first_name: "Zoe", last_name: "A", lineup_spot: null }),
      player({ id: "b", first_name: "Bo", last_name: "Chen", lineup_spot: 2 }),
      player({ id: "a", first_name: "Ana", last_name: "Ruiz", lineup_spot: 1 }),
      player({
        id: "c",
        first_name: "Cal",
        last_name: "Diaz",
        lineup_spot: null,
      }),
    ],
    [],
  );

  expect(roster.map((row) => row.id)).toEqual(["a", "b", "c", "z"]);
});

test("an undated match never outranks a dated one", () => {
  const roster = rosterWithMatchCounts(
    [player()],
    [
      match({ id: "dated", date: "2026-01-01T12:00:00Z" }),
      match({ id: "undated", date: null }),
    ],
  );

  expect(roster[0].matchCount).toBe(2);
  expect(roster[0].lastMatch?.id).toBe("dated");
});
