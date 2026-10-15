import {
  ASK_SQL_FUNCTION_ALLOWLIST,
  ASK_SIDE_REQUIRED_REASON,
  ASK_VIEWS,
  SCOPE_NAME,
} from "@/lib/services/ask/sql-guard";
import {
  renderAskPercentageBlock,
  renderAskSchemaBlock,
} from "@/lib/services/ask/prompts";
import type { AskScope } from "@/lib/services/ask/scope";

/** The row cap `ask.exec_query()` applies to every query; stated to the caller rather than discovered. */
export const MCP_QUERY_ROW_CAP = 200;

/**
 * What `describe_views` answers: the five `ask` views as the plan prompt
 * lists them — the same renderer, so a column the prompt hides
 * (`video_time`, the seat ids) is hidden here too — the percentage
 * definitions, and the rules `run_query` holds a query to. Written for a
 * model reading it as a tool result: plain text, one section per heading.
 */
export function describeAskViews(mode: AskScope["kind"] = "personal"): string {
  const team = mode === "team";
  const views = ASK_VIEWS.map((view) => `ask.${view}`).join(", ");
  const functions = [...ASK_SQL_FUNCTION_ALLOWLIST].join(", ");
  return `# The ask views (${team ? "program scope" : "personal scope"})

${
  team
    ? "Five read-only views over one program's matches, each row already turned to the program's own player in that match. There is no other program's data and no other table."
    : "Five read-only views over the signed-in player's own matches, each row already turned to the player. There is no other player's data and no other table."
}

${renderAskSchemaBlock(mode)}

# Percentages

Every _pct column of ask.match_stats is round(100.0 * numerator / nullif(denominator, 0), 1) with exactly these pairs. For ONE match the view's own _pct column is already right. Across several matches, sum the numerator and the denominator and divide — never average per-match _pct columns.

${renderAskPercentageBlock()}

# Rules run_query holds a query to

- One read-only SELECT (CTEs and UNION allowed). No other statement kind, no parameters, no settings.
- Only these relations, with the ask. prefix: ${views} — plus ${SCOPE_NAME} and the query's own CTEs. Columns not listed above do not exist for you.
- run_query takes two strings. scope_sql is one SELECT that returns the single column match_id — the matches the question is about; its default is "select match_id from ask.matches". sql must read ${SCOPE_NAME}, which holds scope_sql's rows: join ${SCOPE_NAME} on match_id, or filter with match_id in (select match_id from ${SCOPE_NAME}).
- ${ASK_SIDE_REQUIRED_REASON}
- Functions allowed: ${functions}. Nothing schema-qualified.
- At most ${MCP_QUERY_ROW_CAP} rows come back. Aggregate; do not return one row per point or per shot.
- The data is read-only and the viewer is fixed by the server: a query cannot name another player, and every row is one the signed-in user may see in the app.`;
}
