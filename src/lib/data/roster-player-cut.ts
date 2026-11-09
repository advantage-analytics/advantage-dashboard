import type { DisplayMatch } from "@/lib/data/matches-list-types";

/**
 * The team Matches list's `?rosterPlayer=<player_id>` cut: every match that
 * names one roster player in EITHER seat — exactly the set the player
 * profile's "N matches" counts (`readPlayerMatchSides`), so the rail's link
 * lands on its own number.
 *
 * The list's Roster facet (`?player=<name>`) cannot do this: it reads
 * `player1` by name, the program's side of an ordinary row, so a match a
 * teammate recorded first — the player in seat two — is not there. This cut
 * compares the roster profile each seat's stored id resolves to
 * (`withRosterProfiles`, via `canonicalRosterIds`), so both of a claimed
 * player's ids count, and a name typed two ways cannot split it.
 *
 * Pure, and only meaningful on the team list: outside a team no seat carries
 * a `profileId`, so the cut keeps nothing — never everything.
 */
export const ROSTER_PLAYER_PARAM = "rosterPlayer";

type Seats = {
  player1: Pick<DisplayMatch["player1"], "name" | "profileId">;
  player2: Pick<DisplayMatch["player2"], "name" | "profileId">;
};

/** Whether either seat of `match` resolves to the roster player `playerId`. */
export function playedByRosterPlayer(match: Seats, playerId: string): boolean {
  return (
    match.player1.profileId === playerId || match.player2.profileId === playerId
  );
}

/**
 * The name the cut states in the applied-filter strip — the seat's own name
 * on the newest match that resolves to `playerId`, as the list shows it — or
 * `null` when no listed match names them.
 */
export function rosterPlayerCutName(
  matches: readonly Seats[],
  playerId: string,
): string | null {
  for (const m of matches) {
    if (m.player1.profileId === playerId) return m.player1.name;
    if (m.player2.profileId === playerId) return m.player2.name;
  }
  return null;
}
