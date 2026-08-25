/**
 * Which ids on a match row mean "one of ours" — asked once, for every surface.
 *
 * `program_roster_full` returns TWO ids per person: `player_id`, "the id their
 * matches carry", and `user_id`, the login bound to that row. For a staff seat
 * and for an unclaimed coach-managed player the two are the same value (or
 * `user_id` is null), which is why a reader that looks at `player_id` alone
 * appears to work. **Only a CLAIMED player has two distinct ids**, and both
 * eras of their history are real:
 *
 * - A match recorded today carries their PROFILE id, because that is what
 *   `getLadder()` hands the upload wizard.
 * - A match recorded before coach-managed profiles existed carries their USER
 *   id. Claiming deliberately does not re-attribute those rows — the claim is a
 *   binding, and `my_player_ids()` in the read predicate is what lets the
 *   claimant see them (see `docs/ui-revamp-guardrails.md` §2).
 *
 * So "is this id ours?" has one answer, and it lives here rather than in each
 * loader. A second answer to who is on this team is not a variant reading — it
 * is a claimed player's season silently splitting in half at the moment they
 * claimed it, on whichever surface has the older copy of the rule.
 *
 * ── Why a builder plus a derived set ────────────────────────────────────────
 * The two callers want different structures off the same rule:
 *
 * - The Roster page RESOLVES an id to a roster row, so it wants the Map:
 *   `canonical.get(rawId) ?? rawId` folds both eras onto one key.
 * - Team Home only asks MEMBERSHIP, and hands the answer to `programSide()` as
 *   a `ReadonlySet<string>`.
 *
 * `rosterMatchIds()` is `new Set(canonicalRosterIds(rows).keys())` and nothing
 * else, so the two cannot disagree by construction. Handing Team Home the Map
 * itself would also work — its key set is exactly the membership answer — but
 * it would put a `.get()` in reach of a call site that has no business
 * resolving anything, and a canonical id read as a membership answer is the
 * same class of bug one level along. Each caller gets the shape its question
 * has; the rule exists once.
 */

/**
 * The two id columns of a `program_roster_full` row, and nothing else.
 *
 * `player_id` is nullable here to accept both readers' row types unchanged.
 * The RPC never returns a null one — all three of its arms select a non-null
 * id — but a row with no canonical id is nothing this can canonicalise TO, so
 * it is skipped rather than keyed on `null`.
 */
export interface RosterIdRow {
  player_id: string | null;
  user_id: string | null;
}

/**
 * Every id that resolves to a roster row, mapped to that row's `player_id`.
 *
 * A roster row's own `player_id` maps to itself, so `canonical.get(id) ?? id`
 * is total: an id belonging to nobody on this roster passes through unchanged.
 */
export function canonicalRosterIds(
  rows: readonly RosterIdRow[]
): Map<string, string> {
  const canonical = new Map<string, string>();
  for (const row of rows) {
    if (!row.player_id) continue;
    canonical.set(row.player_id, row.player_id);
    if (row.user_id && row.user_id !== row.player_id) {
      canonical.set(row.user_id, row.player_id);
    }
  }
  return canonical;
}

/**
 * Every id that means "us" on a match row — the membership half of the rule.
 *
 * Deliberately derived from `canonicalRosterIds` rather than built beside it:
 * one loop decides which ids belong to a roster row, and this is a view of it.
 */
export function rosterMatchIds(
  rows: readonly RosterIdRow[]
): ReadonlySet<string> {
  return new Set(canonicalRosterIds(rows).keys());
}
