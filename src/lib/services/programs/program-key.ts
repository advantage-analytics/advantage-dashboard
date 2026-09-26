/**
 * The two directory identifiers a collegiate program row cannot be written
 * without — derived from what an admin typed, never guessed at write time.
 *
 * `programs_college_fields_check` demands `program_key` AND `school_group` on
 * every `org_type = 'college'` row, and both carry a unique index:
 * `programs_program_key_key` on the key, `programs_group_team_key` on
 * `(school_group, team)`. So a "Create team" dialog that collects a name and a
 * squad has to produce both, in the shape the seeded directory already uses,
 * or the insert fails on a constraint the admin never saw.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 * `admin-program-actions.ts` is `"use server"`, and such a module may export
 * only async functions. These are pure and synchronous — and the whole point
 * of them is that a test can hold them without standing up Supabase — so they
 * live here and are imported there.
 *
 * ── The shape, measured rather than invented ────────────────────────────────
 * Read from the live directory on 2026-09-15, 1,941 collegiate rows:
 *
 *   program_key   "Western Kentucky University" + womens -> WesternKentuckyUniversityW
 *                 the name with every non-alphanumeric removed, each word's
 *                 first letter raised, and M / W appended for the squad.
 *                 1,254 of 1,941 live keys are exactly this.
 *   school_group  "Academy of Art University" in CA -> academyartuniversity|CA
 *                 lowercased, `&` spelled "and", the words "of" and "the"
 *                 dropped, everything else non-alphanumeric removed, then the
 *                 state after a pipe. 1,898 of 1,941 match exactly.
 *
 * The rows that do NOT match are the ITA's own abbreviations —
 * `GeorgiaTechW` for Georgia Institute of Technology, `LongBeachStateUnivW`,
 * `CaliforniaInstOfTechM`. Those are data we were given, not a rule we can
 * reproduce, and nothing here tries to: this generates a key for a program the
 * directory does not have yet. What it must be is stable, unique and
 * recognisably in the house format, and it is all three.
 *
 * `school_group` is the thing that ties a school's two squads together (the
 * unique index is on the pair), which is why the state rides in it: two
 * "Bethel University" rows in different states are two schools, and joining
 * them under one group would make the men's team of one collide with the
 * men's team of the other.
 */

/** Squad suffix on a key. A club or high school has no squad and no key. */
const SQUAD_SUFFIX: Record<string, string> = { mens: "M", womens: "W" };

/**
 * Split on anything that is not a letter or a digit, after folding accents.
 * "Université de Montréal" has to reach the joiner as three ASCII words, or
 * the key carries a character no URL and no index wants.
 */
function words(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/**
 * The directory key for a program — `/claim/[programKey]` is addressed by it,
 * so it is a URL segment as well as a unique index.
 *
 * `team` is the stored value (`mens` / `womens`), not the label. Anything else
 * — null for a non-college org — appends nothing, which is correct: only a
 * college row is allowed a key at all, and only a college row has a squad.
 */
export function programKeyFor(schoolName: string, team: string | null): string {
  const stem = words(schoolName)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  return stem + (team ? (SQUAD_SUFFIX[team] ?? "") : "");
}

/**
 * The school half of `(school_group, team)` — what makes two squads one
 * school, and what keeps two same-named schools in different states apart.
 */
export function schoolGroupFor(
  schoolName: string,
  state: string | null,
): string {
  const stem = words(schoolName.replace(/&/g, " and "))
    // Dropped on the directory's own rule: "Academy of Art University" groups
    // as `academyartuniversity`. Standalone words only — the "the" inside
    // "Bethel" is not a word.
    .filter((word) => !/^(?:of|the)$/i.test(word))
    .join("")
    .toLowerCase();
  const where = (state ?? "").trim().toUpperCase();
  return where ? `${stem}|${where}` : stem;
}
