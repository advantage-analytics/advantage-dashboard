/**
 * Scoring for `scripts/ask-eval.ts`: one question's `expect` block against
 * the transcript its run produced.
 *
 * Every check is one a transcript can answer on its own — the error code,
 * the planner's shape, the visual's kind, the notice, the call and query
 * counts, the wall time, patterns over the rendered answer and over the
 * final query. Each yields pass or fail with a one-line reason; a question
 * with no `expect` is unscored. The harness prints the verdicts, writes the
 * `## Score` section and, with `--grade`, exits 1 on any failure.
 *
 * Pure: no model, no database, no files. `tests/ask-eval-grade.spec.ts`
 * holds it.
 */
import { parsePlanReply } from "@/lib/services/ask/ask";
import {
  ASK_VISUAL_KINDS,
  type AskErrorCode,
  type AskVisualKind,
} from "@/lib/services/ask/events";

/**
 * The planner's four reply shapes (`prompts.ts`): A writes the query, B
 * cannot answer, C is the review the server queries, D a comparison the
 * server queries.
 */
export const ASK_EVAL_SHAPES = ["A", "B", "C", "D"] as const;
export type AskEvalShape = (typeof ASK_EVAL_SHAPES)[number];

// Restated as a record so a code added to `AskErrorCode` fails the typecheck
// here instead of silently refusing every expect that names it.
const ERROR_CODES = {
  cannot_answer: true,
  no_data: true,
  llm_unavailable: true,
  answer_failed: true,
  needs_clarification: true,
} satisfies Record<AskErrorCode, true>;
export const ASK_EVAL_ERROR_CODES = Object.keys(ERROR_CODES) as AskErrorCode[];

/**
 * What a question's run must satisfy. Every field is optional; a block with
 * none scores as passed. Pattern fields hold regular-expression sources (the
 * JSON spelling, so `\\b`), each compiled case-insensitively.
 */
export interface AskEvalExpect {
  /** The error code the run must end with, or `none` for an answer. `THROWN` is what a thrown pipeline reports; no expect names it. */
  error?: AskErrorCode | "none";
  /** The kind of the answer's visual block, or `none` for no block. */
  visual?: AskVisualKind | "none";
  /** Whether the no-advice notice must fire. */
  notice?: boolean;
  /** At most this many model calls: plan attempts, the pattern reading and the answer together. A clean shape A is 2, a clean B, C or D is 1. */
  modelCalls?: number;
  /** At most this many queries sent to the database. */
  queries?: number;
  /** At most this many seconds of wall time. */
  seconds?: number;
  /**
   * Patterns that must each match the rendered answer — the headline, the
   * figure lines and the body as one text ({@link renderedAnswer}). Three
   * names for the one text, so a block can say what each pattern is about;
   * the model decides where a figure or a claim lands, and a check tied to
   * one part would fail on placement alone.
   */
  headline?: string[];
  figures?: string[];
  body?: string[];
  /** Patterns none of which may match the rendered answer — advice words, a placeholder name, "you" in a team answer. */
  absent?: string[];
  /** Patterns the final query — its scope_sql and sql as one text — must each match. A tagged opponent is `match_id in (...)`, never a name. */
  sql?: string[];
  /**
   * The planner's shape, read from the last model reply that parses as a
   * plan — or a list of the shapes that each answer the question, for one
   * the planner may fairly take either way ("compare my three matches": a
   * row per match, or the player beside the opponent across them).
   */
  shape?: AskEvalShape | AskEvalShape[];
  /** Why the block checks what it checks, for the reader; not graded. */
  note?: string;
}

/** What the harness records of one question's run; the grader reads nothing else. */
export interface AskEvalTranscript {
  /** Wall time of `askQuestion()`. */
  seconds: number;
  /** Every model reply, whole, in the order the calls were made. */
  modelReplies: readonly string[];
  /** Every query sent, in order, with the database's error if it refused one. */
  queries: readonly {
    scope: string | null;
    sql: string | null;
    error: string | null;
  }[];
  headline: string | null;
  figures: readonly { label: string; value: string }[];
  visual: { kind: string } | null;
  body: string;
  /** The error event's code, `THROWN` when the pipeline threw, null for an answer. */
  error: string | null;
  notice: boolean;
}

export interface AskEvalCheck {
  name: string;
  pass: boolean;
  /** One line: what was expected and what the transcript held. */
  reason: string;
}

export type AskEvalGrade =
  { scored: false } | { scored: true; pass: boolean; checks: AskEvalCheck[] };

const EXPECT_KEYS: readonly (keyof AskEvalExpect)[] = [
  "error",
  "visual",
  "notice",
  "modelCalls",
  "queries",
  "seconds",
  "headline",
  "figures",
  "body",
  "absent",
  "sql",
  "shape",
  "note",
];

const PATTERN_KEYS = ["headline", "figures", "body", "absent", "sql"] as const;
const MAX_KEYS = ["modelCalls", "queries", "seconds"] as const;

/**
 * What is wrong with an `expect` block, one line each; empty when it is
 * well-formed. A misspelt key or a value of the wrong kind would otherwise
 * grade as a pass it never checked, so the grader reports these as a
 * failing check and the spec runs them over the committed question files.
 */
export function expectProblems(expect: unknown): string[] {
  if (typeof expect !== "object" || expect === null || Array.isArray(expect)) {
    return ["expect is not an object"];
  }
  const block = expect as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of Object.keys(block)) {
    if (!(EXPECT_KEYS as readonly string[]).includes(key)) {
      problems.push(`unknown key "${key}"`);
    }
  }
  const { error, visual, notice, shape, note } = block;
  if (
    error !== undefined &&
    error !== "none" &&
    !(ASK_EVAL_ERROR_CODES as readonly unknown[]).includes(error)
  ) {
    problems.push(
      `error must be "none" or one of ${ASK_EVAL_ERROR_CODES.join(", ")}`,
    );
  }
  if (
    visual !== undefined &&
    visual !== "none" &&
    !(ASK_VISUAL_KINDS as readonly unknown[]).includes(visual)
  ) {
    problems.push(
      `visual must be "none" or one of ${ASK_VISUAL_KINDS.join(", ")}`,
    );
  }
  if (notice !== undefined && typeof notice !== "boolean") {
    problems.push("notice must be true or false");
  }
  if (
    shape !== undefined &&
    !(Array.isArray(shape)
      ? shape.length > 0 &&
        shape.every((one) =>
          (ASK_EVAL_SHAPES as readonly unknown[]).includes(one),
        )
      : (ASK_EVAL_SHAPES as readonly unknown[]).includes(shape))
  ) {
    problems.push(
      `shape must be one of ${ASK_EVAL_SHAPES.join(", ")}, or a list of them`,
    );
  }
  if (note !== undefined && typeof note !== "string") {
    problems.push("note must be a string");
  }
  for (const key of MAX_KEYS) {
    const value = block[key];
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    ) {
      problems.push(`${key} must be a number of 0 or more`);
    }
  }
  for (const key of PATTERN_KEYS) {
    const value = block[key];
    if (value === undefined) continue;
    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== "string")
    ) {
      problems.push(`${key} must be an array of pattern strings`);
      continue;
    }
    for (const source of value as string[]) {
      try {
        new RegExp(source, "i");
      } catch {
        problems.push(
          `${key} pattern ${JSON.stringify(source)} does not compile`,
        );
      }
    }
  }
  return problems;
}

/**
 * The answer as the player reads it, minus the visual block: the headline,
 * one line per figure tile (`- label: value`) and the body. The text the
 * pattern checks run over.
 */
export function renderedAnswer(transcript: AskEvalTranscript): string {
  return [
    transcript.headline ?? "",
    ...transcript.figures.map((figure) => `- ${figure.label}: ${figure.value}`),
    transcript.body,
  ]
    .filter((line) => line.trim() !== "")
    .join("\n");
}

/**
 * The shape of the last model reply that `parsePlanReply` reads as a plan,
 * or null when none does. The answer stage's prose and the pattern reading
 * never parse, so this is the plan attempt the run went with; a retried
 * planner's earlier replies are skipped.
 */
export function readShape(replies: readonly string[]): AskEvalShape | null {
  for (let index = replies.length - 1; index >= 0; index -= 1) {
    const parsed = parsePlanReply(replies[index]);
    if (parsed === null) continue;
    if ("cannot_answer" in parsed) return "B";
    if ("review" in parsed) return "C";
    if ("compare" in parsed) return "D";
    return "A";
  }
  return null;
}

function check(name: string, pass: boolean, reason: string): AskEvalCheck {
  return { name, pass, reason };
}

function compile(source: string): RegExp {
  return new RegExp(source, "i");
}

/** `expect` against `transcript`: unscored without a block, else every check with its reason. */
export function gradeTranscript(
  expect: AskEvalExpect | undefined,
  transcript: AskEvalTranscript,
  options: {
    /**
     * Checks left out of the grade. Agent mode (`--mode agent`) leaves out
     * `modelCalls` and `queries`: those ceilings are the one-shot planner's
     * budget, and looking before planning spends more of both by design.
     */
    ignore?: readonly (keyof AskEvalExpect)[];
  } = {},
): AskEvalGrade {
  if (expect === undefined) return { scored: false };
  if (options.ignore && options.ignore.length > 0) {
    const kept = { ...expect };
    for (const key of options.ignore) delete kept[key];
    return gradeTranscript(kept, transcript);
  }
  const problems = expectProblems(expect);
  if (problems.length > 0) {
    return {
      scored: true,
      pass: false,
      checks: problems.map((problem) => check("expect", false, problem)),
    };
  }

  const checks: AskEvalCheck[] = [];
  const got = (value: unknown) => (value === null ? "none" : String(value));

  if (expect.error !== undefined) {
    const actual = transcript.error;
    const pass =
      expect.error === "none" ? actual === null : actual === expect.error;
    checks.push(
      check(
        "error",
        pass,
        pass
          ? `error ${expect.error}`
          : `error: expected ${expect.error}, got ${got(actual)}`,
      ),
    );
  }

  if (expect.shape !== undefined) {
    const actual = readShape(transcript.modelReplies);
    const allowed = Array.isArray(expect.shape) ? expect.shape : [expect.shape];
    const pass = actual !== null && allowed.includes(actual);
    checks.push(
      check(
        "shape",
        pass,
        pass
          ? `shape ${actual}`
          : `shape: expected ${allowed.join(" or ")}, got ${actual ?? "none (no reply parsed as a plan)"}`,
      ),
    );
  }

  if (expect.visual !== undefined) {
    const actual = transcript.visual?.kind ?? null;
    const pass =
      expect.visual === "none" ? actual === null : actual === expect.visual;
    checks.push(
      check(
        "visual",
        pass,
        pass
          ? `visual ${expect.visual}`
          : `visual: expected ${expect.visual}, got ${got(actual)}`,
      ),
    );
  }

  if (expect.notice !== undefined) {
    const pass = transcript.notice === expect.notice;
    checks.push(
      check(
        "notice",
        pass,
        pass
          ? `notice ${expect.notice}`
          : `notice: expected ${expect.notice}, got ${transcript.notice}`,
      ),
    );
  }

  const counts: Record<(typeof MAX_KEYS)[number], number> = {
    modelCalls: transcript.modelReplies.length,
    queries: transcript.queries.length,
    seconds: transcript.seconds,
  };
  for (const key of MAX_KEYS) {
    const max = expect[key];
    if (max === undefined) continue;
    const actual = counts[key];
    const pass = actual <= max;
    checks.push(
      check(
        key,
        pass,
        pass
          ? `${key} ${actual} (max ${max})`
          : `${key}: expected at most ${max}, got ${actual}`,
      ),
    );
  }

  const rendered = renderedAnswer(transcript);
  for (const key of ["headline", "figures", "body"] as const) {
    for (const source of expect[key] ?? []) {
      const pass = compile(source).test(rendered);
      checks.push(
        check(
          key,
          pass,
          pass
            ? `${key} matches /${source}/`
            : `${key}: /${source}/ not found in the answer`,
        ),
      );
    }
  }
  for (const source of expect.absent ?? []) {
    const match = compile(source).exec(rendered);
    const pass = match === null;
    checks.push(
      check(
        "absent",
        pass,
        pass
          ? `absent /${source}/`
          : `absent: /${source}/ found in the answer (${JSON.stringify(match[0])})`,
      ),
    );
  }

  if (expect.sql !== undefined) {
    const final = transcript.queries[transcript.queries.length - 1];
    if (final === undefined) {
      checks.push(check("sql", false, "sql: no query ran"));
    } else {
      const text = `${final.scope ?? ""}\n${final.sql ?? ""}`;
      for (const source of expect.sql) {
        const pass = compile(source).test(text);
        checks.push(
          check(
            "sql",
            pass,
            pass
              ? `sql matches /${source}/`
              : `sql: /${source}/ not found in the final query`,
          ),
        );
      }
    }
  }

  return { scored: true, pass: checks.every((entry) => entry.pass), checks };
}

/**
 * The grade of a question whose tags were refused, so it never ran: a
 * failure when it was expected to be graded, unscored otherwise.
 */
export function refusedGrade(
  expect: AskEvalExpect | undefined,
  reason: string,
): AskEvalGrade {
  if (expect === undefined) return { scored: false };
  return {
    scored: true,
    pass: false,
    checks: [check("tags", false, `tag refused: ${reason}`)],
  };
}

/** The reasons of a grade's failing checks, in order; empty for a pass or an unscored question. */
export function failedReasons(grade: AskEvalGrade): string[] {
  if (!grade.scored) return [];
  return grade.checks
    .filter((entry) => !entry.pass)
    .map((entry) => entry.reason);
}

/** `PASS`, `FAIL <reasons>` or `unscored`, for a progress line. */
export function gradeLabel(grade: AskEvalGrade): string {
  if (!grade.scored) return "unscored";
  return grade.pass ? "PASS" : `FAIL ${failedReasons(grade).join("; ")}`;
}

export interface AskEvalTally {
  passed: number;
  failed: number;
  unscored: number;
}

/** How many of the graded questions passed, failed and were unscored. */
export function tally(grades: readonly AskEvalGrade[]): AskEvalTally {
  const counts: AskEvalTally = { passed: 0, failed: 0, unscored: 0 };
  for (const grade of grades) {
    if (!grade.scored) counts.unscored += 1;
    else if (grade.pass) counts.passed += 1;
    else counts.failed += 1;
  }
  return counts;
}
