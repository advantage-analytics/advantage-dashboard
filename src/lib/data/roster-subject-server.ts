import type { RosterSubject } from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import { getRosterPlayerOptions } from "@/lib/data/roster-server";

/**
 * Who a `?player=` link — or a resumed draft's saved For answer — names, or null for an id that names nobody here.
 *
 * The id arrives from a URL and is untrusted, so this is a lookup and not a
 * translation: `program_roster_full` returns nothing to a non-member, which
 * makes another program's id resolve to null rather than to a stranger.
 *
 * Both id eras are accepted. The roster's own links send a
 * `program_players.id`, but a claimed player's older links carry their login
 * id, and `RosterPlayerOption` keeps both columns — matching on only one is
 * the exact defect that made the previous shortcut a no-op. Players only:
 * `rosterPlayerOptions` drops staff seats, and the For field must offer nobody
 * its own picker would not.
 */
export async function rosterSubjectFor(
  programId: string,
  id: string,
): Promise<RosterSubject | null> {
  const onRoster = (await getRosterPlayerOptions(programId)).find(
    (row) => row.playerId === id || row.userId === id,
  );
  // Their `playerId`, never the id as typed — the login era resolves to the
  // profile id, which is what `matches.player1_id` wants.
  return onRoster
    ? { kind: "roster", playerId: onRoster.playerId, name: onRoster.name }
    : null;
}
