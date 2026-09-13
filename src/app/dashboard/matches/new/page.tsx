import type { Metadata } from "next";
import { UploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard/UploadMatchFlow";
import type { RosterSubject } from "@/components/dashboard/matches/new-match-wizard/useUploadMatchWizard";
import {
  draftBelongsToWorkspace,
  draftWorkspaceRefusal,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import { loadMatchDraft } from "@/lib/wizard/actions";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getRosterPlayerOptions } from "@/lib/data/roster-server";
import { isProviderSupported, type ProviderId } from "@/lib/services/upload";

export const metadata: Metadata = {
  title: "New match",
};

/**
 * Who a `?player=` link names, or null for an id that names nobody here.
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
async function rosterSubjectFor(
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

/**
 * The wizard, fresh — or resumed from a draft the Matches table offered
 * (`?draft=`).
 *
 * `?source=` preselects the Source field for a link that already named one —
 * Home's day-zero page sends SwingVision importers here. `?player=` answers
 * the For field for the roster's "Upload for this player" shortcut. Neither
 * skips step one: that step asks three things, and one of them decides
 * `matches.player1_id`, where a wrong value hands read access to the wrong
 * person and attributes every statistic to them. A link may answer a question
 * on that step; it may not answer them all and move on.
 *
 * Both are validated rather than trusted: an unknown or retired provider id
 * falls through to the wizard's own default, and a player id that names nobody
 * on the ACTIVE program's roster opens an unseeded wizard.
 */
export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; source?: string; player?: string }>;
}): Promise<React.JSX.Element> {
  const { draft: draftId, source, player } = await searchParams;

  // Independent reads, so they overlap. The workspace is resolved for a
  // `?player=` visit (to name a roster player) and for a `?draft=` one (to
  // check the draft belongs here) — it is `cache()`d and the dashboard layout
  // has already paid for it, but a page should not await a question it is not
  // asking.
  const [loadedDraft, workspace] = await Promise.all([
    draftId ? loadMatchDraft(draftId) : null,
    player || draftId ? getWorkspaceContext() : null,
  ]);

  // A draft belongs to the workspace it was saved in, and resume is where that
  // gets checked: `match_drafts` is RLS-scoped to its author, not to a
  // program, so the author's own link opens in whatever workspace is active —
  // including one the draft's event line, opponent pool and roster context
  // have no relationship to. Refused rather than re-homed; see
  // `draftWorkspaceRefusal()` for why a silent switch is not the answer.
  const resumable =
    loadedDraft === null ||
    (workspace !== null &&
      draftBelongsToWorkspace(loadedDraft.programId, workspace.active));
  const draft = resumable ? loadedDraft : null;
  const draftRefusal =
    loadedDraft !== null && !resumable
      ? draftWorkspaceRefusal(
          workspace?.available.find((option) =>
            draftBelongsToWorkspace(loadedDraft.programId, option),
          )?.name ?? null,
        )
      : null;

  const initialProvider: ProviderId | null =
    source && isProviderSupported(source) ? (source as ProviderId) : null;
  // Only a team workspace has a roster to name, and only there does the wizard
  // ask For at all — in a personal one the uploader IS the player, so a
  // `?player=` has nowhere to land.
  const initialSubject =
    player && workspace?.active.kind === "team"
      ? await rosterSubjectFor(workspace.active.id, player)
      : null;

  return (
    <UploadMatchFlow
      draft={draft}
      draftRefusal={draftRefusal}
      initialProvider={initialProvider}
      initialSubject={initialSubject}
    />
  );
}
