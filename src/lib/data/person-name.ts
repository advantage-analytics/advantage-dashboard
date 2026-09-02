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

/**
 * How a name is spelled on screen, for the surfaces that call this.
 *
 * `normalizedPersonName` above answers "are these the same person"; this
 * answers the other half — what to print once you know. The two are
 * deliberately separate: matching throws case away, display has to put a
 * plausible case back, and a function that did both would have to pick which
 * one it was wrong about.
 *
 * The input is whatever a human typed into a roster form or an uploader typed
 * into the wizard, so it arrives in every case there is — `clajerson gimena`,
 * `CLAJERSON GIMENA`, `Clajerson Gimena`. Rendering those three side by side is
 * the thing this exists to stop.
 *
 * Know what is NOT wired to it yet, because the gap is easy to misread as
 * coverage: only the claim and join flows call this — `toResult` in
 * `programs-server.ts` for every claim surface, and `displayName` in
 * `invite-acceptance.ts` for the join half. The roster still renders
 * `display_name` exactly as it was typed, and the invite email still prints the
 * inviter's name raw. A new surface has to opt in; nothing forces the call.
 *
 * Applied per whitespace-separated token, first match wins:
 *
 * - **R1 — deliberate mixed casing wins.** A token holding an uppercase letter
 *   after its first character AND at least one lowercase letter is returned
 *   untouched. `McCarthy`, `O'Brien`, `DeMarco`, `MacLeod`, `LaSalle` are people
 *   telling us how their name is spelled, and no rule table beats that. Note
 *   what this excludes: `GIMENA` holds uppercase after its first character but
 *   no lowercase, so an all-caps token is NOT deliberate casing — it falls
 *   through to R2, which is the whole point.
 * - **R1b — roman numerals.** A token made entirely of the letters `i`/`v`/`x`,
 *   in any case, two characters or more, is uppercased whole. Generational
 *   suffixes are all-caps, so R1 cannot protect them; without this, `III` would
 *   reach R2 and come back as `Iii`. `iii` becomes `III` for the same reason.
 * - **R2 — otherwise, re-case.** Lowercase the token, then uppercase the first
 *   letter of each segment split on `-` and `'`, so `gimena` and `GIMENA` both
 *   land on `Gimena`, `o'brien` on `O'Brien`, `smith-jones` on `Smith-Jones`.
 * - **R2a — the `mc` exception, inside R2 only.** A segment beginning `mc` with
 *   at least two more letters also uppercases the letter after the `mc`, so a
 *   roster row typed `MCCARTHY` renders `McCarthy` rather than `Mccarthy`.
 *
 * Two decisions were taken and declined, and both are decisions rather than
 * omissions:
 *
 * - **No particle table.** `DE LA CRUZ` becomes `De La Cruz`, not `de la Cruz`.
 *   Which particles lowercase is a per-family and per-country answer — Dutch
 *   `van` lowercases in the Netherlands and capitalizes in the United States —
 *   so any table we shipped would be confidently wrong for some share of a
 *   roster. `De La Cruz` is merely conventional, and a bearer who cares can
 *   type `de la Cruz`, which R1 then protects forever.
 * - **No `mac` equivalent to R2a.** `Macon`, `Macey` and `Mackey` are not
 *   Mac-names; a symmetric rule would render them `MacOn`, `MacEy`, `MacKey`
 *   and corrupt three real surnames to fix one. `mc` is safe because almost
 *   nothing else in a surname starts with it. A genuine `MacLeod` typed as
 *   `MacLeod` is already protected by R1, and one typed `MACLEOD` renders
 *   `Macleod` — wrong, but wrong in a way the bearer can fix by typing it, and
 *   quietly so rather than by mangling a stranger's name.
 *
 * On whitespace, this side is looser than the SQL one, on purpose. It collapses
 * `\s+`, which in JS includes tabs and the non-breaking spaces (U+00A0, U+202F,
 * U+FEFF) that `btrim`/`[[:space:]]` in
 * `supabase/migrations/20260822140000_merge_program_players.sql` leave alone. A
 * name pasted from Word therefore renders with clean single spaces while the
 * stored value keeps its NBSP. That divergence is harmless precisely because
 * this is display only: nothing here is a key, nothing here is written back,
 * and no comparison is made against it. Keep it that way — the moment a
 * title-cased string is stored or compared, this gap becomes the same
 * matching bug the doc above describes.
 *
 * Never throws, and returns `""` for empty or whitespace-only input, so a
 * caller can render it straight into JSX without a guard.
 *
 * Known and accepted: a given name spelled only from the letters `i`, `v` and
 * `x` is read as a roman numeral by R1b and uppercased — `Vivi` and `Ivi` both
 * lose, while `Livi` is safe on the strength of its `l`. Nothing in the token
 * distinguishes the two readings, and a generational suffix is the far commoner
 * one on a tennis roster.
 */
export function titleCaseName(value: string): string {
  return value.trim().split(/\s+/).map(titleCasedToken).join(" ");
}

/** R1's test: an uppercase after the first character, plus a lowercase somewhere. */
function isDeliberatelyMixedCase(token: string): boolean {
  const chars = Array.from(token);
  return chars.slice(1).some(isUpperCase) && chars.some(isLowerCase);
}

/**
 * Case tests by round-trip rather than `[A-Z]`, so `ÖZDEMIR` counts as
 * uppercase. `\p{Lu}` would say the same thing, but it needs an ES2018 target
 * and this project compiles to ES2017.
 */
function isUpperCase(char: string): boolean {
  return char !== char.toLowerCase() && char === char.toUpperCase();
}

function isLowerCase(char: string): boolean {
  return char !== char.toUpperCase() && char === char.toLowerCase();
}

/** R1b: `III`, `iv`, `xii`. Length 2 or more, so a lone `V` is a name. */
const ROMAN_NUMERAL_TOKEN = /^[ivx]{2,}$/i;

/** R2a: `mccarthy` — `mc` plus at least two more letters. */
const MC_SEGMENT = /^mc([a-z])([a-z]+)$/;

function titleCasedToken(token: string): string {
  if (isDeliberatelyMixedCase(token)) return token;
  if (ROMAN_NUMERAL_TOKEN.test(token)) return token.toUpperCase();
  return token.toLowerCase().replace(/[^-']+/g, titleCasedSegment);
}

/**
 * The last line is `capitalize()` from `@/lib/utils` spelled out rather than
 * called, deliberately: that module pulls in `clsx` and `tailwind-merge`, and
 * this one is a pure data module with no imports at all. One duplicated
 * expression is the cheaper of the two costs.
 */
function titleCasedSegment(segment: string): string {
  const mc = MC_SEGMENT.exec(segment);
  if (mc) return `Mc${mc[1].toUpperCase()}${mc[2]}`;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}
