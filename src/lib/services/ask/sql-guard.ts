import { parse } from "pgsql-ast-parser";

/**
 * Static check for the two model-written SQL strings the Ask route hands to
 * `public.ask_run_query(scope_sql, sql)` (design "Route → Check step", plan
 * step 4).
 *
 * This module is a security boundary. It was written as an early stop with
 * a clear error, when the query functions were callable from the browser and
 * the database's own guards were all there was. They are server-only now
 * (20261013055928), which makes this check the one thing that decides WHICH
 * functions a query may call: the database still limits what can be read (a
 * pinned viewer, a role with `SELECT` on four views, a read-only
 * transaction), but it cannot stop a call to set_config, an advisory lock or
 * pg_notify, and this can. `runQuery()` in `ask.ts` runs it on every string
 * before it reaches the database. Every decision below falls on the side of
 * refusing — a query wrongly refused costs one model retry: the
 * walk ALLOWLISTS the AST node kinds, relations, functions and keywords a
 * read-only aggregate over the `ask` views needs, and refuses anything else by
 * name.
 *
 * Pure: no database, no network, no Next.js. `pgsql-ast-parser` is plain
 * JavaScript (nearley + moo, no WASM, no native build), which is why it needs
 * no `serverExternalPackages` entry.
 */

export type AskSqlCheck = { ok: true } | { ok: false; reason: string };

/** The four `ask` views (design "Database"), the only relations `scope_sql` may read. */
export const ASK_VIEWS = ["matches", "match_stats", "points", "shots"] as const;

/**
 * The name `ask_run_query` binds `scope_sql` to — `sql` must read it and
 * `scope_sql` must not, and neither may define a CTE with that name.
 */
export const SCOPE_NAME = "scope";

/**
 * Every function a model-written query may call. Aggregates, window
 * functions, and date/number/text helpers; nothing that reads settings,
 * sleeps, touches sequences, or returns sets of rows. Compared lowercased
 * against the unqualified function name — a schema-qualified call is refused
 * before this list is consulted.
 */
export const ASK_SQL_FUNCTION_ALLOWLIST: ReadonlySet<string> = new Set([
  // aggregates
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "stddev",
  "stddev_pop",
  "stddev_samp",
  "variance",
  "var_pop",
  "var_samp",
  "bool_and",
  "bool_or",
  "every",
  "string_agg",
  "array_agg",
  "percentile_cont",
  "percentile_disc",
  "mode",
  // window
  "row_number",
  "rank",
  "dense_rank",
  "percent_rank",
  "cume_dist",
  "ntile",
  "lag",
  "lead",
  "first_value",
  "last_value",
  "nth_value",
  // null / comparison helpers
  "coalesce",
  "nullif",
  "greatest",
  "least",
  "exists",
  // number
  "round",
  "trunc",
  "abs",
  "floor",
  "ceil",
  "ceiling",
  "sign",
  "mod",
  "power",
  "sqrt",
  "ln",
  "log",
  "exp",
  "div",
  // date / time
  "date_trunc",
  "date_part",
  "now",
  "age",
  "make_date",
  "make_interval",
  "to_date",
  "to_timestamp",
  "to_char",
  "justify_interval",
  // text
  "lower",
  "upper",
  "initcap",
  "trim",
  "btrim",
  "ltrim",
  "rtrim",
  "length",
  "char_length",
  "concat",
  "concat_ws",
  "left",
  "right",
  "replace",
  "position",
  "strpos",
  "split_part",
  "substr",
  "substring",
]);

/** Value keywords (`current_date`, …) the walk accepts; `current_user` and friends are not here. */
const KEYWORD_ALLOWLIST: ReadonlySet<string> = new Set([
  "current_date",
  "current_time",
  "current_timestamp",
  "localtime",
  "localtimestamp",
]);

/**
 * The AST node kinds a read-only `SELECT` is made of. Anything the parser can
 * emit that is not listed here — every DDL and DML statement, `with
 * recursive`, `values`, `for update`, `$1` parameters, `default` — is refused
 * as unsupported syntax, which is the intended posture for a kind this guard
 * has not reasoned about.
 */
const NODE_ALLOWLIST: ReadonlySet<string> = new Set([
  // statements
  "select",
  "with",
  "union",
  "union all",
  // from items
  "table",
  "statement",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "CROSS JOIN",
  // expressions
  "ref",
  "call",
  "binary",
  "unary",
  "ternary",
  "case",
  "cast",
  "extract",
  "keyword",
  "list",
  "array select",
  "arrayIndex",
  "member",
  "substring",
  "overlay",
  "constant",
  "interval",
  // literals
  "string",
  "integer",
  "numeric",
  "boolean",
  "null",
]);

/** Statement kinds allowed at the top level — a single `SELECT`, with or without CTEs or a union. */
const TOP_LEVEL_ALLOWLIST: ReadonlySet<string> = new Set([
  "select",
  "with",
  "union",
  "union all",
]);

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

class Refusal extends Error {}

function refuse(reason: string): never {
  throw new Refusal(reason);
}

interface WalkState {
  /** Which of the two strings is being checked; decides whether `scope` is readable. */
  readonly mode: "scope_sql" | "sql";
  /** CTE names the statement defines (lowercased), readable as relations. */
  readonly cteNames: Set<string>;
  /** Whether a `scope` relation was read (meaningful in `sql` mode). */
  scopeReferenced: boolean;
  /** Whether `ask.match_stats` was read anywhere in the statement. */
  matchStatsReferenced: boolean;
  /** Whether a column named `side` was referenced anywhere in the statement. */
  sideReferenced: boolean;
}

/** The view with two rows per match, and the column that tells them apart. */
const TWO_SIDED_VIEW = "match_stats";
const SIDE_COLUMN = "side";

/**
 * The reason `sql` is refused when it reads `ask.match_stats` and never
 * mentions `side`: every sum over that view would then add the player's
 * row to the opponent's. Exported so the plan prompt can quote it.
 */
export const ASK_SIDE_REQUIRED_REASON =
  "sql reads ask.match_stats but never mentions side. That view has two rows per match (side = 'me' and side = 'opponent'); filter side = 'me', side = 'opponent', or sum with case when side = 'me' then … end.";

/**
 * Every CTE alias the statement defines, anywhere in its tree, collected
 * before the relation walk so a `with` nested inside a subquery still counts.
 * A CTE may not take the name of a view or of `scope`: that would shadow the
 * relation the guard believes the query reads.
 */
function collectCteNames(root: unknown, names: Set<string>): void {
  if (Array.isArray(root)) {
    for (const item of root) collectCteNames(item, names);
    return;
  }
  if (!isNode(root)) return;
  if (root.type === "with" && Array.isArray(root.bind)) {
    for (const binding of root.bind) {
      const alias =
        isNode(binding) && isNode(binding.alias)
          ? str(binding.alias.name)
          : undefined;
      if (!alias) refuse("A CTE in the query has no usable name.");
      const lower = alias.toLowerCase();
      if (
        lower === SCOPE_NAME ||
        (ASK_VIEWS as readonly string[]).includes(lower)
      ) {
        refuse(
          `A CTE may not be named "${alias}": that name is reserved for a relation the query reads.`,
        );
      }
      // CTE names are accepted as relations anywhere in the statement, not
      // only inside their own `with`, and an unqualified name the query does
      // not define resolves through the function's search_path to pg_catalog.
      // So a CTE called pg_roles in one subquery would let a bare `pg_roles`
      // elsewhere read the real catalog. No CTE needs such a name.
      if (/^(?:pg_|information_schema$)/.test(lower)) {
        refuse(
          `A CTE may not be named "${alias}": names beginning pg_ belong to the system catalog.`,
        );
      }
      names.add(lower);
    }
  }
  for (const [key, value] of Object.entries(root)) {
    if (key === "_location") continue;
    collectCteNames(value, names);
  }
}

function checkRelation(name: Node, state: WalkState): void {
  const schema = str(name.schema)?.toLowerCase();
  const relation = str(name.name)?.toLowerCase();
  if (!relation) refuse("A relation in the query has no usable name.");

  if (schema !== undefined && schema !== "ask") {
    refuse(
      `"${schema}.${relation}" is not an ask view; only ask.matches, ask.match_stats, ask.points and ask.shots may be read.`,
    );
  }
  if ((ASK_VIEWS as readonly string[]).includes(relation)) {
    if (relation === TWO_SIDED_VIEW) state.matchStatsReferenced = true;
    return;
  }
  if (schema === "ask") {
    refuse(
      `"ask.${relation}" is not one of the ask views (matches, match_stats, points, shots).`,
    );
  }
  if (relation === SCOPE_NAME) {
    if (state.mode === "scope_sql") {
      refuse("scope_sql defines scope and may not read it.");
    }
    state.scopeReferenced = true;
    return;
  }
  if (state.cteNames.has(relation)) return;
  refuse(
    `"${relation}" is not one of the ask views (matches, match_stats, points, shots)${
      state.mode === "sql" ? ", scope" : ""
    } or a CTE of the query.`,
  );
}

function checkCall(node: Node): void {
  const fn = isNode(node.function) ? node.function : undefined;
  const name = fn ? str(fn.name)?.toLowerCase() : undefined;
  if (!name) refuse("A function call in the query has no usable name.");
  const schema = fn ? str(fn.schema) : undefined;
  if (schema !== undefined) {
    refuse(`Schema-qualified function "${schema}.${name}()" is not allowed.`);
  }
  if (!ASK_SQL_FUNCTION_ALLOWLIST.has(name)) {
    refuse(`Function "${name}()" is not on the allowlist.`);
  }
}

function checkCast(node: Node): void {
  const to = isNode(node.to) ? node.to : undefined;
  // Array types nest the element type under `arrayOf`; look through them.
  const target =
    to && to.kind === "array" && isNode(to.arrayOf) ? to.arrayOf : to;
  const typeName = target ? str(target.name)?.toLowerCase() : undefined;
  if (!typeName) refuse("A cast in the query has no usable target type.");
  // regclass, regproc, regtype… resolve catalog names on the way in.
  if (typeName.startsWith("reg")) {
    refuse(`Cast to "${typeName}" is not allowed.`);
  }
}

function walk(value: unknown, state: WalkState): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, state);
    return;
  }
  if (!isNode(value)) return;

  const type = str(value.type);
  if (type !== undefined) {
    if (!NODE_ALLOWLIST.has(type)) {
      refuse(
        `Unsupported syntax: "${type}". Only a single read-only SELECT is allowed.`,
      );
    }
    switch (type) {
      case "table":
        if (!isNode(value.name))
          refuse("A relation in the query has no usable name.");
        checkRelation(value.name, state);
        break;
      case "call":
        checkCall(value);
        break;
      case "cast":
        checkCast(value);
        break;
      case "keyword": {
        const keyword = str(value.keyword)?.toLowerCase() ?? "";
        if (!KEYWORD_ALLOWLIST.has(keyword)) {
          refuse(`Keyword "${keyword}" is not allowed.`);
        }
        break;
      }
      case "ref": {
        // `schema.table.column` — a column reference may name a table alias,
        // never a schema; the relation itself is checked where it is read.
        const table = isNode(value.table) ? value.table : undefined;
        if (table && str(table.schema) !== undefined) {
          refuse(
            `Column reference "${str(table.schema)}.${str(table.name)}.${str(value.name)}" may not name a schema.`,
          );
        }
        if (str(value.name)?.toLowerCase() === SIDE_COLUMN) {
          state.sideReferenced = true;
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [key, value_] of Object.entries(value)) {
    if (key === "_location") continue;
    walk(value_, state);
  }
}

function checkOne(text: string, mode: WalkState["mode"]): WalkState {
  if (text.trim() === "") refuse(`${mode} is empty.`);

  let statements: unknown[];
  try {
    statements = parse(text);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    refuse(`${mode} could not be parsed: ${message}`);
  }
  if (statements.length !== 1) {
    refuse(`${mode} must be exactly one statement, got ${statements.length}.`);
  }
  const [statement] = statements;
  const top = isNode(statement) ? str(statement.type) : undefined;
  if (top === undefined || !TOP_LEVEL_ALLOWLIST.has(top)) {
    refuse(`${mode} must be a SELECT statement${top ? `, not "${top}"` : ""}.`);
  }

  const state: WalkState = {
    mode,
    cteNames: new Set(),
    scopeReferenced: false,
    matchStatsReferenced: false,
    sideReferenced: false,
  };
  collectCteNames(statement, state.cteNames);
  walk(statement, state);
  if (mode === "sql" && state.matchStatsReferenced && !state.sideReferenced) {
    refuse(ASK_SIDE_REQUIRED_REASON);
  }
  return state;
}

/**
 * Check the pair `ask_run_query` will run as
 * `with scope as (<scopeSql>) select … from (<sql>)`.
 *
 * - each string is exactly one `SELECT` (CTEs and unions allowed; nothing
 *   data-modifying anywhere, including inside a CTE);
 * - every relation is one of the four `ask` views, a CTE the query itself
 *   defines, or — in `sql` only — `scope`;
 * - `sql` reads `scope`, so the answer is computed over the matches the
 *   scope step chose;
 * - `sql` that reads `ask.match_stats` mentions `side` somewhere, so the
 *   player's row and the opponent's are never summed together
 *   ({@link ASK_SIDE_REQUIRED_REASON}); a mention is all that is checked —
 *   the view's two rows make a query without one wrong by construction, and
 *   one with it is the planner's to get right;
 * - every function is on {@link ASK_SQL_FUNCTION_ALLOWLIST}.
 *
 * The first problem found is the reason; the route feeds it back to the model.
 */
export function checkAskSql(input: {
  scopeSql: string;
  sql: string;
}): AskSqlCheck {
  try {
    checkOne(input.scopeSql, "scope_sql");
    const main = checkOne(input.sql, "sql");
    if (!main.scopeReferenced) {
      refuse(
        "sql must read from scope so the answer covers the matches scope_sql chose.",
      );
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: error.message };
    throw error;
  }
}
