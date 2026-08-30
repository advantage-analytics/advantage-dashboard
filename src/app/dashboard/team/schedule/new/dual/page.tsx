import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { getConferenceTable } from "@/lib/data/opponents-server";
import { getProgramSchedule } from "@/lib/data/schedule-server";
import { opponentDualHistory } from "@/lib/schedule/opponent-history";
import { divisionLabel } from "@/lib/data/programs-server";
import { DualForm } from "@/components/dashboard/schedule/dual-form";
import type { ConferenceProgram } from "@/lib/data/opponents-server";
import type { ProgramSearchResult } from "@/lib/data/programs-server";

/**
 * A conference row, as the directory row every downstream consumer expects.
 *
 * Both lists on step one hand back a `ProgramSearchResult`, because the caller
 * has to be able to treat a conference row and a search hit as the same thing —
 * and because `programKey` on it is what makes the opponent aggregatable.
 * `conference` is the table's own, which is the whole reason these rows are in
 * it; `ownerDisplay` is null because nothing here asked for it. The owner
 * projection belongs to the claim flow's definer RPC, and no part of this
 * screen shows who runs the other program.
 */
function toDirectoryRow(
  program: ConferenceProgram,
  conference: string | null
): ProgramSearchResult {
  return {
    programKey: program.programKey,
    schoolName: program.schoolName,
    team: program.teamKey,
    division: program.division,
    conference,
    state: program.state,
    status: program.status,
    ownerDisplay: null,
  };
}

/** 2c/25b — the new dual: find the school, then date, site and lineup. */
export default async function NewDualPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  // A hidden menu item is not authorization. A player who types this URL gets
  // the schedule they are allowed to read, not a form whose every write the
  // database would refuse.
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const [ladder, settings, conferenceTable, schedule] = await Promise.all([
    getLadder(active.id),
    getTeamSettings(active.id),
    getConferenceTable(active.id),
    // Read for the head-to-head half of every subline on step one. Staff-only
    // screen, and every member reads the program's matches in any case, so the
    // partial-read caveat `opponent-history.ts` documents cannot bite here.
    getProgramSchedule(active.id),
  ]);

  // The viewer's own row is in the conference table, flagged rather than
  // filtered — `getConferenceTable` says so. Step one wants it gone from the
  // list (a program does not play itself) but wants its key and its division,
  // which is the only place either is available without a second read.
  const self = conferenceTable.programs.find((program) => program.isSelf) ?? null;

  return (
    <DualForm
      ourName={active.name}
      ourTeam={active.team}
      ladder={ladder}
      defaultSurface={settings?.program.defaultSurface ?? null}
      ourConference={settings?.program.conference ?? null}
      ourDivision={divisionLabel(self?.division ?? null)}
      ourProgramKey={self?.programKey ?? null}
      conferencePrograms={conferenceTable.programs
        .filter((program) => !program.isSelf)
        .map((program) => toDirectoryRow(program, conferenceTable.conference))}
      // Entries rather than the Map itself: the array needs no assumption about
      // what the server/client serializer carries, and `SchoolSearch` rebuilds
      // it in one `useMemo`.
      historyEntries={[...opponentDualHistory(schedule)]}
    />
  );
}
