/**
 * The one definition of "the same name".
 *
 * Case and internal whitespace are noise; everything else is signal — the rule
 * `normalized_person_name` applies in SQL
 * (`supabase/migrations/20260822140000_merge_program_players.sql`), which
 * `merge_program_players` enforces, and this is its TypeScript counterpart.
 *
 * Counterpart, not a twin, and the gap is worth knowing: JS `.trim()` and `\s`
 * treat tabs and the non-breaking spaces (U+00A0, U+202F, U+FEFF …) as
 * whitespace, while Postgres `btrim(text)` strips U+0020 only and `[[:space:]]`
 * excludes them. A name pasted from Word or a PDF with an NBSP in it therefore
 * normalizes here but not there — so this side can call two rows the same
 * person while `merge_program_players` refuses them, and the merge dialog's
 * confirm gate can open on a name the RPC then rejects. Closing that means
 * normalizing on the way in, not loosening either side.
 * The roster's "Possible duplicate" chip, Add player's "already on this roster"
 * note and the merge dialog's confirm-name gate all call it, so the affordances
 * and the function that backs them agree about which two rows are one person.
 *
 * Deliberately exact: no nicknames, no initials, no edit distance. A looser
 * rule would flag pairs the merge path then refuses to treat as one person —
 * a warning that cannot be acted on is worse than no warning at all.
 *
 * Note what this does NOT settle: whether two rows are *eligible* to be one
 * person. Each caller keeps its own filter — the roster chip wants exactly two
 * live, not-both-claimed players because that is what `merge_program_players`
 * will accept; Add player's note asks a looser question, because the row it is
 * warning about does not exist yet.
 *
 * Takes a whole name or its parts, so a form holding first and last separately
 * compares against a roster row holding one string. The first part is required
 * so that a no-argument call is a compile error — it would return `""`, which
 * compares equal to every blank-named row. A caller that passes a nullable
 * field explicitly still gets `""`, so comparing two possibly-nameless rows is
 * on the caller to rule out.
 */
export function normalizedPersonName(
  first: string | null | undefined,
  ...rest: (string | null | undefined)[]
): string {
  return [first, ...rest]
    .map((part) => part ?? "")
    .join(" ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
