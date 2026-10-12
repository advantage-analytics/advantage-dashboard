/**
 * `programSide()` — which seat of a program match is the program's own.
 *
 * Its own module because two readers need the one rule and neither may copy
 * it: Team Home (`team-home-server.ts`), and team Ask's tag options
 * (`ask-tags.ts`), which must agree with `ask.my_side()` — the SQL restatement
 * in `20261012170339_ask_team_scope.sql` — about whose match a row is. Pure:
 * no Supabase, no `next/headers`, so the offline specs and a client module
 * graph can load it.
 */

/**
 * Which side of a match row is the program's — and `null` when nothing says.
 *
 * Team Home's rows are name-based: `player1_name vs player2_name`, with no
 * "us" anywhere in them. `<ResultMark>` draws a green check or a red cross, so
 * an answer guessed here shows a coach a win where they lost with nothing on
 * screen looking wrong. Two things establish the side; where neither does, the
 * row goes without a mark rather than with a coin flip.
 *
 * 1. **An id on this program's roster.** `program_roster_full.player_id` is
 *    documented as "the id their matches carry" (`roster-server.ts`), and it is
 *    what both writers of a program match put in `player1_id`: the upload
 *    wizard from the roster pick (`useUploadMatchWizard.ts` — "whose match this
 *    is, which in a team workspace is not the uploader"), and `recordResult`
 *    from the event entry's player (`lib/schedule/actions.ts`). An opponent
 *    cannot collide with it: opponent identities are written to
 *    `matches.opponent_player_id`, deliberately NOT to `player2_id`
 *    (`opponents-server.ts`), so a roster id in either column is one of ours.
 * 2. **The row is a line off this program's schedule.** `event_entry_id` says
 *    so, and what makes it evidence is a convention rather than a single
 *    writer — do not "verify" this clause by reading one function and stopping.
 *    **Two places write the column, and both write our side into `player1`:**
 *    - `recordResult` (`lib/schedule/actions.ts`) inserts `event_entry_id:
 *      entry.id` alongside `player1_name: ourLabel` / `player1_id:
 *      playerUserId`, having first refused an entry belonging to another
 *      program.
 *    - the upload wizard (`useUploadMatchWizard.ts:1130`) inserts
 *      `event_entry_id: preset?.entryId ?? null`, so the column is non-null
 *      exactly when the coach opened the wizard from a schedule preset — and
 *      that same preset supplies `playerName`/`playerUserId`, which
 *      `buildMatchData` puts in `player1_name`/`player1_id`. The roster pick a
 *      preset implies and the id `recordResult` would have written are the same
 *      person. (Its other branch fills a row that already carries the column
 *      rather than setting it, and writes `player1_name` the same way round.)
 *
 *    So the invariant is the convention `lib/schedule/entry-state.ts` reads the
 *    whole schedule under — a match tied to an entry has us in `player1` — not
 *    a property of one function. This clause is what covers a DOUBLES line,
 *    whose `player1_id` is deliberately null because two accounts do not fit
 *    one column. Should a third writer ever appear, it has to honour the same
 *    convention or this clause stops being true.
 *
 * Both clauses answer `player1` in every case they overlap on, which is the
 * point: they are two readings of one convention, not two rules. The id test
 * runs first because an id is evidence about THIS row, where the entry test is
 * evidence about how the row was written.
 */
export function programSide(
  row: {
    player1_id: string | null;
    player2_id: string | null;
    event_entry_id: string | null;
  },
  rosterIds: ReadonlySet<string>,
): "player1" | "player2" | null {
  if (row.player1_id && rosterIds.has(row.player1_id)) return "player1";
  if (row.player2_id && rosterIds.has(row.player2_id)) return "player2";
  if (row.event_entry_id) return "player1";
  return null;
}
