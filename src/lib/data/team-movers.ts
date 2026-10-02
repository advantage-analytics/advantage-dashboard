import type { RosterMember } from "@/lib/data/team-roster-server";
import { meanOfPresent } from "@/lib/data/aggregate";

/**
 * "Top movers" — Team Home's answer to "who changed the most" (Platform Audit
 * Ta3, on Ta2's metric · value · delta track).
 *
 * Pure selection over the roster the Roster page already computes
 * (`getRosterData`): no query, no Supabase import, so the ranking rule can be
 * read and checked without a database. The per-match figures are the ones the
 * roster drawer already plots for the same player (`RosterMember.recent`) —
 * the movers list is a reading of those, never a second query for them.
 *
 * **What "change" means.** It is the current roster's change, not a calendar
 * window: for each drawer measure, the player's latest match that carries it
 * against the mean of their earlier matches in the drawer's window. A
 * player's headline is the measure that moved furthest in either direction;
 * the list is those headlines, largest movement first. A player needs two
 * matches with stats for a change — not a second week, and not the seven the
 * roster's own last-6-vs-earlier trend needs.
 *
 * **Who is in it.** Every player on the current roster with stats. Someone
 * with a single measured match has nothing to compare against yet: they are
 * listed after the movers as `firstMatch`, with their latest figure and a
 * delta of 0, and the card draws them under their own "First match" label so
 * that 0 never reads as a real "no change". Staff,
 * archived players (not on the roster) and players with no stats at all are
 * left out; a roster where nobody has stats is the empty case.
 */
export interface TopMover {
  playerId: string;
  name: string;
  /** `RosterMember.avatarUrl` — their photo, or null for initials. */
  avatarUrl: string | null;
  /** Last five results, oldest first — `RosterMember.form`. */
  form: RosterMember["form"];
  /** The measure's short label, e.g. "1st serve in". */
  metric: string;
  /** The measure in the player's latest match that has it, whole percent. */
  value: number;
  /** That match minus the mean of their earlier ones, in points. */
  delta: number;
  /**
   * No measure had an earlier match to compare against — the player's first
   * match with stats. `delta` is 0 and means "nothing yet", not "no change".
   */
  firstMatch: boolean;
}

/** How many rows the card shows — the frame draws seven. */
export const TOP_MOVERS_LIMIT = 7;

export function topMovers(
  members: readonly RosterMember[],
  limit: number = TOP_MOVERS_LIMIT,
): TopMover[] {
  const movers: TopMover[] = [];

  for (const member of members) {
    if (member.role !== "player") continue;

    // One anchor for every measure: the newest match (`recent` is newest
    // first) that carries any stats. Letting each measure find its own
    // newest reading would let a headline come from an older match while
    // the card says "latest match".
    const anchor = member.recent.findIndex((match) =>
      Object.values(match.values).some(isStat),
    );
    if (anchor === -1) continue;
    const latestValues = member.recent[anchor].values;
    const earlierMatches = member.recent.slice(anchor + 1);

    let best: TopMover | null = null;
    for (const measure of member.measures) {
      const latest = latestValues[measure.key];
      if (!isStat(latest)) continue;
      // Already whole percent (0 decimals), so the delta needs no re-rounding.
      const earlier = meanOfPresent(
        earlierMatches.map((match) => match.values[measure.key]),
        0,
      );
      const firstMatch = earlier === null;

      const candidate: TopMover = {
        playerId: member.playerId,
        name: member.name,
        avatarUrl: member.avatarUrl,
        form: member.form,
        // `RosterMeasure.label` is already the drawer table's own label —
        // `team-roster-server.ts` copies it from `ROSTER_DRAWER_MEASURES`
        // when it builds the row.
        metric: measure.label,
        value: Math.round(latest),
        delta: firstMatch ? 0 : Math.round(latest) - earlier,
        firstMatch,
      };
      if (best === null || movement(candidate) > movement(best)) {
        best = candidate;
      }
    }

    if (best) movers.push(best);
  }

  return movers.sort((a, b) => movement(b) - movement(a)).slice(0, limit);
}

function isStat(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

/** How far a row moved; a first match sorts below a real zero move. */
function movement(mover: TopMover): number {
  return mover.firstMatch ? -1 : Math.abs(mover.delta);
}
