/**
 * The one definition of "the same name".
 *
 * Case and internal whitespace are noise; everything else is signal. That is
 * exactly `normalized_person_name`'s rule in SQL
 * (`supabase/migrations/20260822140000_merge_program_players.sql`), which
 * `merge_program_players` enforces, and this is its TypeScript twin. The
 * roster's "Possible duplicate" chip and Add player's "already on this roster"
 * note both call it, so the affordances and the function that backs them agree
 * about which two rows are one person.
 *
 * Deliberately exact: no nicknames, no initials, no edit distance. A looser
 * rule would flag pairs the merge path then refuses to treat as one person —
 * a warning that cannot be acted on is worse than no warning at all.
 *
 * Takes a whole name or its parts, so a form holding first and last separately
 * compares against a roster row holding one string.
 */
export function normalizedPersonName(
  ...parts: (string | null | undefined)[]
): string {
  return parts
    .map((part) => part ?? "")
    .join(" ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
