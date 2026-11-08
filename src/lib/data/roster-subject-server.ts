import type { RosterSubject } from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type { MatchDraft } from "@/components/dashboard/matches/new-match-wizard/types";
import { getRosterPlayerOptions } from "@/lib/data/roster-server";
import { resolveRosterSubject } from "@/lib/wizard/roster-subject";

/**
 * Who the For field opens on — a `?player=` link, a resumed draft's saved
 * player, or an older draft's saved name — or null when nobody on the active
 * program's roster is named, and the picker asks. The ranking is
 * `resolveRosterSubject()`.
 *
 * Every input is untrusted (a URL, or a payload the viewer wrote), so this is
 * a lookup and not a translation: `program_roster_full` returns nothing to a
 * non-member, which makes another program's id resolve to null rather than to
 * a stranger. Players only: `rosterPlayerOptions` drops staff seats, and the
 * For field must offer nobody its own picker would not.
 *
 * Skips the roster read entirely when there is nothing to look up.
 */
export async function rosterSubjectFor(
  programId: string,
  input: {
    linkPlayerId?: string | null;
    draft?: Pick<MatchDraft, "subject" | "formData" | "preset"> | null;
  },
): Promise<RosterSubject | null> {
  const { linkPlayerId, draft } = input;
  if (!linkPlayerId && !draft) return null;
  return resolveRosterSubject(await getRosterPlayerOptions(programId), input);
}
