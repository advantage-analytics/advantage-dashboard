import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { createClient } from "@/lib/supabase/server";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { getConferenceTable } from "@/lib/data/opponents-server";
import { getProgramSchedule } from "@/lib/data/schedule-server";
import { opponentDualHistory } from "@/lib/schedule/opponent-history";
import { divisionLabel } from "@/lib/data/programs-server";
import { NewDualDataProvider } from "@/components/dashboard/schedule/static/dual-school-step";
import { StaticDualBuilder } from "@/components/dashboard/schedule/static/static-dual-builder";
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

/**
 * How many programs the directory holds.
 *
 * `2c` draws "5 of 1,940" — the right-hand figure is the only one of the
 * artboard's three unbackable-looking numbers that a table can actually answer,
 * so it is answered rather than dropped. A `head` count over `programs`, with
 * no filter of our own: "the directory" is what the figure claims, and the one
 * row it can never list — the viewer's own — is not worth subtracting
 * silently.
 *
 * ── It is not, however, every row in the table ─────────────────────────────
 * `programs` is RLS-scoped to
 * `org_type = 'college' OR owner_user_id = auth.uid() OR user_program_role(id) is not null`,
 * so the count covers the public college directory plus whatever custom orgs
 * this viewer owns or belongs to. Two coaches can therefore read a different
 * total, and neither is wrong. Nothing leaks — the policy can only ever add
 * the reader's own rows — but this is a count of what the reader may see, not
 * of the table, and a filter added here would narrow that further rather than
 * correcting it.
 *
 * `/api/programs/search`, which fills the second list, cannot supply this: it
 * returns a capped page and no count of the rows it did not send. Null on a
 * failed read, and step one then prints what is listed and no total at all.
 */
async function directoryTotal(): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("programs")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("[new dual] could not count the program directory", {
      error: error.message,
    });
    return null;
  }
  return count ?? null;
}

/**
 * 2c/25b — the new dual: find the school, then date, site and lineup.
 *
 * ── Reading again, as of the schedule re-wiring ────────────────────────────
 * Four loaders in parallel — the ladder, the team settings, the conference
 * table and the whole program schedule — plus `opponentDualHistory()` over the
 * last of them, and the directory count above. Step one lists real programs
 * and real head-to-head records off the back of it; the ladder and the default
 * surface are read here for step two, which owns no route of its own.
 *
 * They reach the two steps through `NewDualDataProvider` rather than as props:
 * `StaticDualBuilder` owns the step state and takes none. See `NewDualData` in
 * `dual-school-step.tsx`.
 *
 * `dual-form.tsx` and `school-search.tsx` are the previous DB-wired
 * implementation of these two steps and are still dormant where they were —
 * this route reads the same loaders they needed, and the static tree renders
 * the result.
 *
 * The guards below are untouched.
 */
export default async function NewDualPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  // A hidden menu item is not authorization. A player who types this URL gets
  // the schedule they are allowed to read, not a form whose every write the
  // database would refuse.
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const [ladder, settings, conferenceTable, schedule, total] =
    await Promise.all([
      getLadder(active.id),
      getTeamSettings(active.id),
      getConferenceTable(active.id),
      // Read for the head-to-head half of every subline on step one. Staff-only
      // screen, and every member reads the program's matches in any case, so the
      // partial-read caveat `opponent-history.ts` documents cannot bite here.
      getProgramSchedule(active.id),
      directoryTotal(),
    ]);

  // The viewer's own row is in the conference table, flagged rather than
  // filtered — `getConferenceTable` says so. Step one wants it gone from the
  // list (a program does not play itself) but wants its key and its division,
  // which is the only place either is available without a second read.
  const self = conferenceTable.programs.find((program) => program.isSelf) ?? null;

  return (
    <NewDualDataProvider
      data={{
        ourName: active.name,
        ourTeam: active.team,
        ladder,
        defaultSurface: settings?.program.defaultSurface ?? null,
        ourConference: settings?.program.conference ?? null,
        ourDivision: divisionLabel(self?.division ?? null),
        ourProgramKey: self?.programKey ?? null,
        conferencePrograms: conferenceTable.programs
          .filter((program) => !program.isSelf)
          .map((program) => toDirectoryRow(program, conferenceTable.conference)),
        // Entries rather than the Map itself: the array needs no assumption
        // about what the server/client serializer carries, and step one rebuilds
        // it in one `useMemo`.
        historyEntries: [...opponentDualHistory(schedule)],
        directoryTotal: total,
      }}
    >
      <StaticDualBuilder />
    </NewDualDataProvider>
  );
}
