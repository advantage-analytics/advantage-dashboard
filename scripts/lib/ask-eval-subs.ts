/**
 * `--sub "Placeholder=Real Name"` for `scripts/ask-eval.ts`.
 *
 * The committed question lists name placeholder players and opponents, since
 * a roster is not something to commit. A substitution puts a program's own
 * names in at run time — in the question's text, in the names it tags, and in
 * the note that says what a good answer does — so the file in the repo never
 * has to change.
 *
 * Pure: no argv, no files. `tests/ask-eval-subs.spec.ts` holds it.
 */

/** The fields of an eval question a name can appear in. */
export interface SubstitutableQuestion {
  q: string;
  opponents?: string[];
  matches?: string[];
  players?: string[];
  want?: string;
}

export type AskEvalSubs = ReadonlyMap<string, string>;

/** Every value that follows a `--sub` in an argument list, in order. */
export function subArgs(argv: readonly string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sub") {
      // A flag with nothing after it is kept as "" so it is reported, not
      // silently dropped.
      values.push(argv[index + 1] ?? "");
      index += 1;
    } else if (arg.startsWith("--sub=")) {
      values.push(arg.slice("--sub=".length));
    }
  }
  return values;
}

/**
 * `["Sokolov=Rudy Quan", …]` as a map. Split at the FIRST `=`, both sides
 * trimmed. Throws, naming the argument, on one with no `=` or an empty side,
 * and on a placeholder given twice with different names.
 */
export function parseSubs(specs: readonly string[]): Map<string, string> {
  const subs = new Map<string, string>();
  for (const spec of specs) {
    const at = spec.indexOf("=");
    const from = at === -1 ? "" : spec.slice(0, at).trim();
    const to = at === -1 ? "" : spec.slice(at + 1).trim();
    if (!from || !to) {
      throw new Error(
        `--sub "${spec}" is not "Placeholder=Real Name" (both sides needed).`,
      );
    }
    const already = subs.get(from);
    if (already !== undefined && already !== to) {
      throw new Error(`--sub names "${from}" twice: "${already}" and "${to}".`);
    }
    subs.set(from, to);
  }
  return subs;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `text` with every whole-word placeholder replaced by its name. Whole words
 * only — "Reyes" does not touch "Reyeson" — and case-sensitive, since these
 * are names. "Sokolov's" becomes "Rudy Quan's". One pass over the text, so a
 * name that happens to contain another placeholder is not substituted again.
 */
export function substitute(text: string, subs: AskEvalSubs): string {
  if (subs.size === 0) return text;
  // Longest first, so "Van Reyes" wins over "Reyes" where both are given.
  const keys = [...subs.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${keys.map(escape).join("|")})(?![\\p{L}\\p{N}_])`,
    "gu",
  );
  return text.replace(pattern, (match) => subs.get(match) ?? match);
}

/**
 * One question with the substitutions applied to its text, to every name it
 * tags and to its `want` note. Everything else it carries (`after`, …) is
 * passed through; the input is not changed.
 */
export function substituteQuestion<Question extends SubstitutableQuestion>(
  question: Question,
  subs: AskEvalSubs,
): Question {
  if (subs.size === 0) return question;
  const names = (list: string[] | undefined) =>
    list?.map((name) => substitute(name, subs));
  const next: Question = { ...question, q: substitute(question.q, subs) };
  if (question.opponents) next.opponents = names(question.opponents);
  if (question.matches) next.matches = names(question.matches);
  if (question.players) next.players = names(question.players);
  if (question.want !== undefined) next.want = substitute(question.want, subs);
  return next;
}
