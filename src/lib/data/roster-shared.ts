/**
 * The pure half of the `program_roster_full` read: rows → player options.
 *
 * Two callers consume that RPC — `getLadder()` (server, lineup forms) and the
 * upload wizard's who-played picker (client hook) — and until this file they
 * each carried their own copy of the same filter → name-fallback → sort
 * pipeline. The rules here are the kind that drift silently: the name
 * fallback chain has an opinion (email local-part before "Unnamed player"),
 * and unranked players sort LAST on purpose — a null is "we have not
 * decided", and floating those to S1 would make a form propose a ladder
 * nobody set.
 *
 * No Supabase import, no server directive — this must stay loadable from a
 * client module graph.
 */

/** The RPC's row shape, as far as this transform reads it. */
export interface RosterFullRow {
  player_id: string;
  user_id?: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  lineup_spot: number | null;
}

export interface RosterPlayerOption {
  /**
   * A `program_players.id` — the id this player's matches carry. It is what
   * gets written to `matches.player1_id`, and it is stable across a claim.
   */
  playerId: string;
  /** The login id bound to the profile, when someone has claimed it. */
  userId: string | null;
  name: string;
  /** Their rank, or null when the program has never set one. */
  ladderPosition: number | null;
}

/** Players only, named, in ladder order (unranked last, then by name). */
export function rosterPlayerOptions(
  rows: RosterFullRow[] | null | undefined
): RosterPlayerOption[] {
  return (rows ?? [])
    .filter((row) => row.role === 'player')
    .map((row) => ({
      playerId: row.player_id,
      userId: row.user_id ?? null,
      // `program_players` requires both names, so a player row always has
      // one. The fallback covers only the safety arm — a seat-holding player
      // with no profile row yet, who may never have filled in a profile
      // either.
      name:
        row.display_name?.trim() ||
        (row.email ?? '').split('@')[0] ||
        'Unnamed player',
      ladderPosition: row.lineup_spot,
    }))
    .sort((a, b) => {
      if (a.ladderPosition === b.ladderPosition) return a.name.localeCompare(b.name);
      if (a.ladderPosition === null) return 1;
      if (b.ladderPosition === null) return -1;
      return a.ladderPosition - b.ladderPosition;
    });
}
