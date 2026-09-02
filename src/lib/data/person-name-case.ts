/**
 * How a name someone TYPES gets its case — the onboarding name step's rule
 * (Onboarding & Team Setup screen 1.2), applied on blur and re-applied by the
 * server before the value is stored.
 *
 * The design's sentence, which `tests/person-name-case.spec.ts` pins: title
 * case is applied on blur, not enforced by validation — "McEnroe",
 * "van der Berg" and "O'Neal" survive because we only touch the first letter
 * of each word and never lowercase the rest. A per-word rule cannot deliver
 * that ("van" would still become "Van"), so the rule is per FIELD:
 *
 *   - a value with any capital in it is left exactly as typed — the person has
 *     already made a casing decision, and it is theirs;
 *   - an all-lowercase value gets the first letter of each word raised, where
 *     a word starts at the beginning, after whitespace, after a hyphen or
 *     after an apostrophe ("smith-jones" → "Smith-Jones", "o'neal" → "O'Neal").
 *
 * Nothing is ever lowercased, so the rule is idempotent and a second blur is a
 * no-op. Whitespace is untouched here so a field mid-edit is never rewritten
 * under the cursor; `parseTypedName` is where trimming happens.
 *
 * This is deliberately NOT the same rule as a display-side title-caser for
 * legacy rows (which has to decide what to do with "MARCUS"): typed input is
 * trusted, stored data is not. Keep the two apart rather than merging them.
 *
 * Beside `person-name.ts` because both are rules about one person's name, but
 * a different rule: `normalizedPersonName` decides when two names are the SAME
 * name and lowercases everything; this one decides how one name is written.
 */

/** Per field. Mirrors the one cap the users table already carries for a name. */
export const PERSON_NAME_MAX = 120;

const HAS_CAPITAL = /\p{Lu}/u;

/** A lowercase letter that opens a word, with whatever precedes it captured. */
const WORD_INITIAL = /(^|[\s\-'’])(\p{Ll})/gu;

/** The blur rule. Letters only — see the module note. */
export function titleCaseTypedName(value: string): string {
  if (HAS_CAPITAL.test(value)) return value;
  return value.replace(
    WORD_INITIAL,
    (_match, lead: string, letter: string) => lead + letter.toUpperCase()
  );
}

/**
 * The server's read of the same field, off a payload a raw RPC can shape
 * however it likes. Trims, collapses internal whitespace, then applies the
 * blur rule so what is stored is what the person saw. `null` for anything
 * that is not a usable name — never `""`, because the column is nullable and
 * every reader is written for `null`.
 */
export function parseTypedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed === "" || collapsed.length > PERSON_NAME_MAX) return null;
  return titleCaseTypedName(collapsed);
}
