import { expect, test } from "@playwright/test";

import {
  playedByRosterPlayer,
  ROSTER_PLAYER_PARAM,
  rosterPlayerCutName,
} from "@/lib/data/roster-player-cut";
import { transformDbMatch, type DbMatch } from "@/lib/data/matches-list-types";
import { canonicalRosterIds } from "@/lib/data/roster-ids";

/**
 * The team Matches list's `?rosterPlayer=` cut (`roster-player-cut.ts`), the
 * landing of the player profile's "N matches" link. It must keep exactly the
 * matches the profile counts — this player in EITHER seat, by roster id —
 * where the list's `?player=` name facet reads seat one only. Pure, offline.
 */

const seats = (
  p1: { name: string; profileId?: string | null },
  p2: { name: string; profileId?: string | null },
) => ({ player1: p1, player2: p2 });

test("the param is the one the profile rail links with", () => {
  expect(ROSTER_PLAYER_PARAM).toBe("rosterPlayer");
});

test("keeps a match with the player in either seat, and nothing else", () => {
  const seatOne = seats(
    { name: "Ada Okafor", profileId: "p-ada" },
    { name: "Ana Castillo", profileId: null },
  );
  // A teammate recorded it first: Ada is seat two. The name facet misses it.
  const seatTwo = seats(
    { name: "Bea Lindqvist", profileId: "p-bea" },
    { name: "Ada Okafor", profileId: "p-ada" },
  );
  const notHers = seats(
    { name: "Bea Lindqvist", profileId: "p-bea" },
    { name: "Zed Quill", profileId: null },
  );
  // Outside a team nothing is resolved: the cut keeps nothing, never all.
  const unresolved = seats({ name: "Ada Okafor" }, { name: "Someone" });

  const kept = [seatOne, seatTwo, notHers, unresolved].filter((m) =>
    playedByRosterPlayer(m, "p-ada"),
  );
  expect(kept).toEqual([seatOne, seatTwo]);
});

test("the strip names the player from whichever seat resolves to them", () => {
  const list = [
    seats(
      { name: "Bea Lindqvist", profileId: "p-bea" },
      {
        name: "Ada  Okafor",
        profileId: "p-ada",
      },
    ),
    seats({ name: "Ada Okafor", profileId: "p-ada" }, { name: "X" }),
  ];
  expect(rosterPlayerCutName(list, "p-ada")).toBe("Ada  Okafor");
  expect(rosterPlayerCutName(list, "p-bea")).toBe("Bea Lindqvist");
  expect(rosterPlayerCutName(list, "p-nobody")).toBeNull();
});

test("the list row carries seat two's id, so the roster can resolve it", () => {
  const row: DbMatch = {
    id: "m-1",
    player1_id: "p-bea",
    player2_id: "u-ada",
    player1_name: "Bea Lindqvist",
    player2_name: "Ada Okafor",
    tournament_name: null,
    round: null,
    date: "2026-09-21T00:00:00+00:00",
    score: { player1: [6], player2: [3] },
    result: null,
    match_type: "singles",
    court_type: null,
    verified: null,
    duration: null,
  };
  const match = transformDbMatch(row, "viewer");
  expect(match?.player2.id).toBe("u-ada");

  // `withRosterProfiles` resolves each seat through `canonicalRosterIds`:
  // a claimed player's login id lands on her roster profile.
  const canonical = canonicalRosterIds([
    { player_id: "p-ada", user_id: "u-ada" },
    { player_id: "p-bea", user_id: null },
  ]);
  const resolved = seats(
    { name: "Bea Lindqvist", profileId: canonical.get("p-bea") ?? null },
    { name: "Ada Okafor", profileId: canonical.get("u-ada") ?? null },
  );
  expect(playedByRosterPlayer(resolved, "p-ada")).toBe(true);
});
