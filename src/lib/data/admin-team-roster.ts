/**
 * The Admin › Teams detail page's roster projection — pure, and deliberately so.
 *
 * `admin-team-server.ts` reads the two tables behind it with the service role;
 * everything that decides WHICH matches belong to WHICH roster row lives here,
 * with no Supabase client and no `next/*` import anywhere in reach, so
 * `tests/admin-team-roster.spec.ts` can prove the attribution without a
 * database.
 *
 * ── Why the attribution is the interesting half ─────────────────────────────
 * `matches.player1_id` holds TWO id spaces and carries no foreign key: a
 * `program_players.id` for a match recorded against a coach-managed profile,
 * and a `users.id` (an auth uid) for one recorded by the athlete before
 * coach-managed profiles existed. Claiming a profile binds the account to the
 * row; it deliberately does NOT rewrite the older matches, because that would
 * split one athlete's season across two ids at an arbitrary moment and mutate
 * existing match data (`docs/ui-revamp-guardrails.md` §2). `my_player_ids()`
 * is the SQL authority that folds both eras together for a signed-in reader —
 * but it keys on `auth.uid()`, which is null under the service role, so this
 * page cannot ask it. What it can do is the same fold locally: it already holds
 * every `program_players.id` and every `claimed_by_user_id` on the program, and
 * that pair IS the rule. `rosterIdIndex()` below is that fold, and
 * `rosterMatchOwnerIds()` is the id list the query names — one expression, so
 * the rows fetched and the rows attributed cannot be about different sets.
 *
 * A roster row whose matches were only ever counted under its profile id looks
 * fine until the athlete claims it, at which point half their season silently
 * disappears from the console. That is the bug this module exists to not have.
 */

/** A live `program_players` row, reduced to what the roster projection reads. */
export interface AdminRosterPlayerRow {
  id: string;
  /** `not null` in the database; the display name is these two, trimmed. */
  first_name: string;
  last_name: string;
  class_year: string | null;
  lineup_spot: number | null;
  /** The auth uid bound to this profile, or null for an unclaimed row. */
  claimed_by_user_id: string | null;
}

/**
 * A `matches` row, reduced to what a roster line prints.
 *
 * `date` is nullable here although the column is `not null`: a row with no day
 * is nothing this can order, so it is treated as the oldest rather than trusted
 * to sort — the same reason `team-roster-server.ts` passes `nullsFirst: false`.
 */
export interface AdminRosterMatchRow {
  id: string;
  player1_id: string | null;
  /** `matches.player2_name` — who they played, as the row itself spells it. */
  player2_name: string | null;
  /** `matches.result` verbatim: `won` | `lost` | `retired` | … or null. */
  result: string | null;
  date: string | null;
}

/** The last match on a roster line, as the page prints it. */
export interface AdminTeamRosterMatch {
  id: string;
  /** `matches.result` unchanged — labelling belongs to the card, not here. */
  result: string | null;
  /** The opponent's label, or null when the row never carried one. */
  opponent: string | null;
  /** `matches.date`, raw ISO. Formatting is the component's business. */
  date: string | null;
}

/** One live player on the program's roster. */
export interface AdminTeamRosterPlayer {
  /** `program_players.id` — the id their newer matches carry. */
  id: string;
  /** "Ana Ruiz", trimmed; never null, since both halves are `not null`. */
  name: string;
  /** Their line in the lineup, or null where the program never set one. */
  lineupSpot: number | null;
  classYear: string | null;
  /** Whether a login is bound to this profile. */
  hasAccount: boolean;
  /** That login's id, or null — what the older half of their matches carry. */
  claimedUserId: string | null;
  /** Matches on either id space. See the module comment. */
  matchCount: number;
  /** The newest of those, or null when there are none. */
  lastMatch: AdminTeamRosterMatch | null;
}

/**
 * `program_roster`'s own name expression, minus its null handling: both halves
 * are `not null` on `program_players`, so the trim is the whole rule.
 */
function displayName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

/**
 * Every id that means "this roster row" on a match, mapped to the row's
 * `program_players.id`.
 *
 * A row's own id maps to itself, so `index.get(rawId)` answers "is this one of
 * ours, and whose?" in one lookup. A `claimed_by_user_id` shared by two live
 * rows is a broken claim rather than a reading this can honour — the later row
 * wins, which is arbitrary but total; splitting the match between them would
 * double-count it.
 */
export function rosterIdIndex(
  players: readonly AdminRosterPlayerRow[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const player of players) {
    index.set(player.id, player.id);
    if (player.claimed_by_user_id && player.claimed_by_user_id !== player.id) {
      index.set(player.claimed_by_user_id, player.id);
    }
  }
  return index;
}

/**
 * The ids a `matches.player1_id in (…)` filter has to name to find this
 * roster's matches — derived from `rosterIdIndex`, not built beside it, so the
 * fetch and the attribution are one rule counted once.
 *
 * Empty for an empty roster, and a caller must not build an `in()` filter from
 * an empty list: PostgREST refuses one.
 */
export function rosterMatchOwnerIds(
  players: readonly AdminRosterPlayerRow[],
): string[] {
  return [...rosterIdIndex(players).keys()];
}

/** Ordering key for a nullable `lineup_spot`: spots ascending, nulls last. */
function spotRank(spot: number | null): number {
  return spot ?? Number.POSITIVE_INFINITY;
}

/** Sortable instant for a nullable date: an undated row is the oldest. */
function instant(date: string | null): number {
  if (!date) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * The roster, with each row's match count and last match attributed across both
 * id spaces.
 *
 * `players` must already be the LIVE roster — not archived, not merged; that
 * filter is a `where` clause and belongs to the query, not to a pure function
 * that would then be quietly deciding policy. `matches` may contain rows
 * belonging to nobody on the roster (an opponent's profile, a deleted row);
 * they are skipped rather than bucketed under their raw id.
 *
 * Ordered by `lineup_spot` with null spots last, then by name, so two
 * spotless rows do not swap places between renders on PostgREST's row order.
 */
export function rosterWithMatchCounts(
  players: readonly AdminRosterPlayerRow[],
  matches: readonly AdminRosterMatchRow[],
): AdminTeamRosterPlayer[] {
  const index = rosterIdIndex(players);

  const counts = new Map<string, number>();
  const latest = new Map<string, AdminRosterMatchRow>();

  for (const match of matches) {
    if (!match.player1_id) continue;
    const playerId = index.get(match.player1_id);
    if (!playerId) continue;

    counts.set(playerId, (counts.get(playerId) ?? 0) + 1);

    const held = latest.get(playerId);
    if (!held || instant(match.date) > instant(held.date)) {
      latest.set(playerId, match);
    }
  }

  return players
    .map((player) => {
      const last = latest.get(player.id) ?? null;
      return {
        id: player.id,
        name: displayName(player.first_name, player.last_name),
        lineupSpot: player.lineup_spot,
        classYear: player.class_year,
        hasAccount: player.claimed_by_user_id !== null,
        claimedUserId: player.claimed_by_user_id,
        matchCount: counts.get(player.id) ?? 0,
        lastMatch: last
          ? {
              id: last.id,
              result: last.result,
              opponent: last.player2_name,
              date: last.date,
            }
          : null,
      } satisfies AdminTeamRosterPlayer;
    })
    .sort(
      (a, b) =>
        spotRank(a.lineupSpot) - spotRank(b.lineupSpot) ||
        a.name.localeCompare(b.name),
    );
}
