import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canManageTeamSchedule } from "@/lib/workspace/types";
import { createClient } from "@/lib/supabase/server";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { getOpponentDirectory } from "@/lib/data/opponents-server";
import { getProgramSchedule } from "@/lib/data/schedule-server";
import { opponentDualHistory } from "@/lib/schedule/opponent-history";
import { NewDualDataProvider } from "@/components/dashboard/schedule/static/dual-school-step";
import { NewDualFlow } from "@/components/dashboard/schedule/static/new-dual-flow";

/**
 * This program's `programs.program_key`, so step one can drop it from the
 * directory. Read on its own rather than off the directory: the directory is
 * college rows of one squad, and a program outside either still needs to be
 * kept from scheduling a dual against itself.
 */
async function ownProgramKey(programId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("program_key")
    .eq("id", programId)
    .maybeSingle();
  return (data as { program_key: string | null } | null)?.program_key ?? null;
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
 * Three steps of the upload wizard's chrome since T15 — `new-dual-flow.tsx`
 * frames `DualSchoolStep`, `DualFactsStep` and `DualLineupStep` on
 * `WizardShell`. This route is unchanged by that: it reads once for the whole
 * flow, as it always did.
 *
 * ── Reading again, as of the schedule re-wiring ────────────────────────────
 * Loaders in parallel — the ladder, the team settings, this squad's whole
 * college directory (chained on the settings, which name the squad), the
 * program's own directory key and the whole program schedule — plus
 * `opponentDualHistory()` over the last of them, and the directory count
 * above. Step one lists real programs
 * and real head-to-head records off the back of it; the ladder and the default
 * surface are read here for step two, which owns no route of its own.
 *
 * They reach the three steps through `NewDualDataProvider` rather than as
 * props: `NewDualFlow` owns the step state and takes none. See `NewDualData`
 * in `dual-school-step.tsx`.
 *
 * `dual-form.tsx` and `school-search.tsx` were the previous DB-wired
 * implementation of these two steps and are deleted — this route reads the same
 * loaders they needed, and the static tree renders the result.
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
  if (!canManageTeamSchedule(active)) redirect("/dashboard/team/schedule");

  const settingsRead = getTeamSettings(active.id);
  const [ladder, settings, directory, ourProgramKey, schedule, total] =
    await Promise.all([
      getLadder(active.id),
      settingsRead,
      // Chained on the settings rather than after the whole batch: the
      // directory is narrowed to this program's squad, and waiting for the
      // other four reads to learn it would serialise the slowest read here.
      settingsRead.then((read) =>
        getOpponentDirectory(read?.program.team ?? null),
      ),
      ownProgramKey(active.id),
      // Read for the head-to-head half of every subline on step one. Staff-only
      // screen, and every member reads the program's matches in any case, so the
      // partial-read caveat `opponent-history.ts` documents cannot bite here.
      getProgramSchedule(active.id),
      directoryTotal(),
    ]);

  // The viewer's own row is in the directory — same squad, a college. Step
  // one drops it from the list (a program does not play itself) but opens the
  // Division menu on its division, and this is the one read that carries it.
  const self =
    directory.find((program) => program.programKey === ourProgramKey) ?? null;

  return (
    <NewDualDataProvider
      data={{
        ladder,
        defaultSurface: settings?.program.defaultSurface ?? null,
        ourConference: settings?.program.conference ?? null,
        // Which squad this program fields — step one lists only opponents it
        // could actually play. Null when the settings read came back empty,
        // which step one reads as "do not narrow": see `NewDualData`.
        ourTeam: settings?.program.team ?? null,
        ourDivision: self?.division ?? null,
        // Its own read, not off `self`: `self` exists only for a college row
        // of the squad, and a null key here would make step one's
        // `programKey !== ourProgramKey` filter drop nothing — letting a coach
        // schedule a dual against themselves.
        ourProgramKey,
        directory,
        // Entries rather than the Map itself: the array needs no assumption
        // about what the server/client serializer carries, and step one rebuilds
        // it in one `useMemo`.
        historyEntries: [...opponentDualHistory(schedule)],
        directoryTotal: total,
      }}
    >
      <NewDualFlow />
    </NewDualDataProvider>
  );
}
