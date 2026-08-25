/**
 * How a tennis score is spelled, in one place.
 *
 * Round 44: "Tiebreaks are superscripts everywhere: 6-7³ (digit 0.6em, raised,
 * 0.5px off)". `6-7(3)` is the pre-r11 form and must not come back.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Five call sites had grown five private `formatScore`s and they had already
 * drifted apart: the schedule joined sets with a space and separated games with
 * an EN DASH ("6–4 6–2"), the home rail joined with a space and a hyphen
 * ("6-4 6-2"), the matches list and the search palette used a hyphen and a
 * comma ("6-4, 6-2"). None of them rendered a tiebreak at all, so a set decided
 * 7-6 read the same as one decided 7-5.
 *
 * ── The spelling this adopts, and why ───────────────────────────────────────
 * Hyphen between the games, comma-space between the sets — "4-6, 6-7³". That is
 * what the round-44 artboards spell, and it is what the busiest surfaces
 * already produced, so adopting the schedule's en-dash form would have changed
 * more than it fixed. The schedule's event rows therefore read "6-4, 6-2" where
 * they used to read "6–4 6–2" — a deliberate change, not a regression.
 *
 * ── Why it lives in `lib/`, not beside `<ScoreLine>` ────────────────────────
 * Three consumers need the *rule* without the markup: `lib/schedule/format.ts`
 * (a lib module, which must not import from a component),
 * `match-summary-row.tsx` (its own boxed per-set scoreboard — it shares which
 * side holds the tiebreak digit, not the layout), and every caller that can
 * only hold a plain string. `<ScoreLine>` in
 * `components/dashboard/score-line.tsx` is this file's markup form and nothing
 * more.
 *
 * Everything here is pure. Nothing in this file fetches, and nothing decides
 * who is looking — see `scoreSetsFrom`'s `swap`.
 */

/** One set, already oriented: `player1` is the side the row is about. */
export interface ScoreLineSet {
  player1: number;
  player2: number;
  /**
   * Tiebreak POINTS, not games — and stored on the side that LOST the set,
   * which is the encoding every writer in the app uses. See
   * `single-score-entry.tsx` ("The tiebreak belongs to whoever LOST the set —
   * the winner took it 7-x") and `edit-match-dialog.tsx`.
   */
  player1Tiebreak?: number | null;
  player2Tiebreak?: number | null;
}

/** Between the two game counts of one set. */
export const GAME_SEPARATOR = "-";

/** Between sets. */
export const SET_JOINER = ", ";

/**
 * The digit that goes in superscript: the tiebreak points of whoever LOST the
 * set. `7-6³` and `6-7³` are the same tiebreak seen from the two sides, and in
 * both the 3 belongs to the loser — that is what the notation means.
 *
 * **This is the whole "which side holds the digit" rule.** A surface that draws
 * its own scoreboard still calls this rather than restating it: a per-row
 * scoreboard that prints only one side's games (`match-summary-row.tsx`) raises
 * the digit on the row that WON the set, because that is the row showing the 7.
 *
 * No fallback to the other side's value. A tiebreak recorded against the set's
 * WINNER is not the number this notation prints, and printing it anyway would
 * be a wrong score that looks like a right one — so a misfiled value renders
 * nothing rather than a plausible lie.
 *
 * ── Only a one-game margin can have been a tiebreak ─────────────────────────
 * The guard below is on the set's SHAPE, `Math.abs(player1 - player2) === 1`,
 * and never on the stored value. A tiebreak IS the set's last game, so a set
 * it decided is always won by exactly one game; win a set without one and you
 * must win by two, which is why `6-0` through `6-4` and `7-5` are margin ≥ 2.
 * Margin 1 therefore implies a tiebreak, and it keeps implying one for a
 * super-tiebreak stored as `1-0` and for a pro-set played out to `9-8`.
 *
 * This was settled from production rather than from the schema, because the
 * schema permits shapes the data does not contain. Of the 47 sets carrying a
 * non-null tiebreak, 41 are zero-fill — `0`/`0` written onto shapes no
 * tiebreak can decide (`6-3`, `6-4`, `6-2`, `7-5`, `1-6`, …) — and 40 of them
 * printed a spurious superscript before this guard, since `0 ?? null` is `0`
 * and every consumer gates on `!== null`. (The 41st, a `3-3`, escaped only
 * because equal games already returned null here.) The real tiebreaks are
 * three: `1-0` won 10-5, `0-1` won 11-9, and `8-9` won 7-3.
 *
 * Two narrower guards have been tried in this repo and both were wrong, in
 * opposite directions. `mine === 7 && theirs === 6` (once in
 * `match-summary-row.tsx`) is a shape guard drawn too tight: it hides exactly
 * the super-tiebreaks the data stores as `1-0` / `0-1`. `tiebreak > 0` (once
 * in `matches-list-types.ts`) is a guard on VALUE, and hides a legitimate
 * `7-6` won 7-0 in points. Shape, and the whole of it.
 */
export function tiebreakOf(set: ScoreLineSet): number | null {
  if (Math.abs(set.player1 - set.player2) !== 1) return null;
  if (set.player1 > set.player2) return set.player2Tiebreak ?? null;
  if (set.player2 > set.player1) return set.player1Tiebreak ?? null;
  return null;
}

/**
 * The same score as plain text, games only.
 *
 * For the places that can only hold a string — an `aria-label`, a prompt, a
 * `title`. A superscript cannot survive the trip, so this deliberately drops
 * the tiebreak rather than inventing a second notation for it; prefer
 * `<ScoreLine>` wherever markup is allowed.
 */
export function formatScoreText(sets: ScoreLineSet[]): string {
  return sets
    .map((set) => `${set.player1}${GAME_SEPARATOR}${set.player2}`)
    .join(SET_JOINER);
}

/** The raw `matches.score` JSONB column, as every loader hands it over. */
export interface RawMatchScore {
  player1: number[];
  player2: number[];
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
}

/**
 * Raw `matches.score` JSON → the sets `<ScoreLine>` takes.
 *
 * `swap` is for a row shown to whoever is stored as player2: it flips the game
 * counts AND the tiebreak arrays together, because flipping one without the
 * other silently moves a tiebreak onto the wrong side of the set.
 */
export function scoreSetsFrom(
  score: RawMatchScore | null | undefined,
  { swap = false }: { swap?: boolean } = {}
): ScoreLineSet[] {
  if (!score?.player1?.length || !score?.player2?.length) return [];

  const ours = swap ? score.player2 : score.player1;
  const theirs = swap ? score.player1 : score.player2;
  const ourBreaks = swap ? score.player2_tiebreaks : score.player1_tiebreaks;
  const theirBreaks = swap ? score.player1_tiebreaks : score.player2_tiebreaks;

  return ours.map((games, index) => ({
    player1: games,
    player2: theirs[index] ?? 0,
    player1Tiebreak: ourBreaks?.[index] ?? null,
    player2Tiebreak: theirBreaks?.[index] ?? null,
  }));
}
