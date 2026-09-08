import type { RosterMember } from "@/lib/data/team-roster-server";

/**
 * "Top movers" — Team Home's answer to "who changed the most" (Platform Audit
 * Ta3, on Ta2's metric · value · delta track).
 *
 * Pure selection over the roster the Roster page already computes
 * (`getRosterData`): no query, no Supabase import, so the ranking rule can be
 * read and checked without a database. Every number here is one the roster
 * drawer already prints for the same player — the movers list is a different
 * ordering of those, never a second computation of them.
 *
 * **What "biggest change" means.** Each player carries four drawer measures
 * (`ROSTER_DRAWER_MEASURES`), and each measure's `trend` is its mean over the
 * player's last six matches against the mean of everything earlier, in points.
 * A player's headline is the measure whose trend moved furthest in either
 * direction; the list is those headlines, largest movement first. The frame's
 * caption says "since last week"; the trend's window is the drawer's six
 * matches rather than seven days, because a week of college tennis can hold
 * one match or five and the drawer's window is the one already explained on
 * the roster.
 *
 * **Who is left out.** A player with no measure that earned a trend — nothing
 * earlier to compare against, or no stats at all — has no movement to report
 * and is not in the list. A roster where nobody has one is the empty case.
 */
export interface TopMover {
  playerId: string;
  name: string;
  /** Last five results, oldest first — `RosterMember.form`. */
  form: RosterMember["form"];
  /** The measure's short label, e.g. "1st serve in". */
  metric: string;
  /** The measure's recent mean, whole percent. */
  value: number;
  /** Recent minus earlier, in points. Never zero — zero is not a move. */
  delta: number;
}

/** How many rows the card shows — the frame draws seven. */
export const TOP_MOVERS_LIMIT = 7;

export function topMovers(
  members: readonly RosterMember[],
  limit: number = TOP_MOVERS_LIMIT
): TopMover[] {
  const movers: TopMover[] = [];

  for (const member of members) {
    if (member.role !== "player") continue;

    let best: TopMover | null = null;
    for (const measure of member.measures) {
      if (measure.trend === null || measure.value === null) continue;
      const delta = Math.round(measure.trend);
      if (delta === 0) continue;
      if (best === null || Math.abs(delta) > Math.abs(best.delta)) {
        best = {
          playerId: member.playerId,
          name: member.name,
          form: member.form,
          // `RosterMeasure.label` is already the drawer table's own label —
          // `team-roster-server.ts` copies it from `ROSTER_DRAWER_MEASURES`
          // when it builds the row — so looking it up again would be a second
          // spelling of the same word and a scan per measure.
          metric: measure.label,
          value: Math.round(measure.value),
          delta,
        };
      }
    }

    if (best) movers.push(best);
  }

  return movers
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}
