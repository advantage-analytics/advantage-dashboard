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
 * (`video_time`, the seat ids) is hidden here too, while the `mcpOnly` court
 * positions are listed here alone — how to read and bin those positions, the
 * percentage definitions, and the rules `run_query` holds a query to. Written for a
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

${renderAskSchemaBlock(mode, { mcp: true })}

# Court positions

ask.shots contact_x, contact_y, landing_x and landing_y are metres in one frame turned to the ${team ? "program's player" : "player"} on every point: their own baseline at y = 0, the net at 11.885, the opponent's baseline at 23.77, x from the centre line with positive to their right as they face the net. Singles sidelines are at x = -4.115 and 4.115, the service lines at y = 5.485 and 18.285. Draw the ${team ? "program's player" : "player"} at the bottom.

- Positions are for drawing and for finer cuts. result says whether a ball was in, and zone / direction name where it went: they are what the app's statistics count, so never call a ball in or out from its coordinates, and say so when a figure built from positions differs from one built from zone.
- Up to ${MCP_QUERY_ROW_CAP} shots: select the positions and draw every ball. More than that: group by landing_section, or bin the positions with floor(), and draw from the counts. Never draw a sample cut off at ${MCP_QUERY_ROW_CAP} rows as if it were every shot.
- Leave landing_pinned shots out of any figure about where serves landed.
- Return count(*) with every share or average, and say how many matches it rests on: positions exist only where ask.matches.has_coords is true. When the matches mix sources (ask.matches.source), say so, or split by it.

A heatmap of the ${team ? "program's player's" : "player's"} forehands that landed in, over every match in scope (2 m × 2 m cells):

select floor(s.landing_x / 2) as cell_x, floor(s.landing_y / 2) as cell_y, count(*) as shots
from ask.shots s
join ${SCOPE_NAME} on ${SCOPE_NAME}.match_id = s.match_id
where s.mine and s.shot_type = 'Forehand' and s.result = 'In' and s.landing_x is not null
group by 1, 2

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
