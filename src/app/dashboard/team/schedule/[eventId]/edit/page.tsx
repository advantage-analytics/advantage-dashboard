import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { createClient } from "@/lib/supabase/server";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import {
  eventDetailFrom,
  getProgramSchedule,
} from "@/lib/data/schedule-server";
import { NewDualDataProvider } from "@/components/dashboard/schedule/static/dual-school-step";
import { NewDualFlow } from "@/components/dashboard/schedule/static/new-dual-flow";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import type { EventDetail } from "@/lib/schedule/types";

/**
 * Editing an event — today, editing a dual.
 *
 * The same flow the dual was created on, minus the question it can no longer
 * ask. `NewDualFlow` in `mode="edit"` opens on step two with the school pinned
 * and unchangeable, seeds the draft from this event's own facts and its nine
 * saved lines, draws the settled ones read-only, and writes through
 * `updateDual` — see that file's header for why each of those follows from the
 * one fact that a dual's opponent is fixed once its lines point at it.
 *
 * ── The gate ───────────────────────────────────────────────────────────────
 * `/dashboard/team/schedule/new/dual`'s and `[eventId]/score`'s, one line for
 * one line: team workspace, then staff. A hidden button is not authorization —
 * `updateDual` opens with its own `requireStaff` and the database refuses the
 * writes besides, so a player offered this form would retype a lineup and be
 * turned down at the end of it. They land back on the event instead, which is
 * the page they came from and are allowed to read.
 *
 * ── The reads ──────────────────────────────────────────────────────────────
 * The season, then this event sliced out of it — `getProgramSchedule` is
 * `cache()`d and the event page beside this one has usually already paid for
 * it. `eventDetailFrom` returning null is the same answer for "no such event"
 * and "not this program's event", which is what a caller poking at ids
 * deserves.
 *
 * The ladder and the default surface are read for the same reason the create
 * route reads them: `useDualDraft` asks `NewDualData` for both. The rest of
 * that context is step one's — the conference table, the head-to-head map, the
 * directory count — and step one is unreachable here, so those are supplied
 * empty rather than read. They are the create route's cost, not this one's.
 */
export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");
  if (!isProgramStaff(active)) redirect(`/dashboard/team/schedule/${eventId}`);

  const schedule = await getProgramSchedule(active.id);
  const detail = eventDetailFrom(schedule, eventId);
  if (!detail) notFound();

  // A tournament edit is its own flow (T20) over `useTournamentDraft` and
  // `updateTournament`. Until it lands, this route answers for duals only —
  // `notFound()` rather than a dual builder pointed at a tournament, which
  // would offer nine courts an event with draws and seeds has never had.
  if (detail.event.kind !== "dual") notFound();

  const [ladder, settings, opponentProgram] = await Promise.all([
    getLadder(active.id),
    getTeamSettings(active.id),
    opponentDirectoryRow(detail),
  ]);

  return (
    <NewDualDataProvider
      data={{
        ladder,
        defaultSurface: settings?.program.defaultSurface ?? null,
        // Step one's own, and step one cannot be reached from an edit. Stated
        // as empty rather than read: a conference table and a directory count
        // fetched for a screen nobody can open are round trips paid for
        // nothing.
        ourConference: settings?.program.conference ?? null,
        ourDivision: null,
        ourProgramKey: null,
        conferencePrograms: [],
        historyEntries: [],
        directoryTotal: null,
      }}
    >
      <NewDualFlow
        mode="edit"
        event={detail}
        opponentProgram={opponentProgram}
      />
    </NewDualDataProvider>
  );
}

/**
 * The opponent's directory row, where this dual's lines resolved one.
 *
 * A dual's lines all name one school, so the first entry that carries a
 * program id answers — and a dual entered as free text carries none, which is
 * null here and a school pinned from `event.name` downstream.
 *
 * Read here rather than in the flow because `EventEntry` stores the opponent's
 * program *id* while `opponentRosterForDual` — the client call that fills the
 * opponent-name popups — is keyed on `program_key`. `programs` is
 * world-readable, and `program_key` is unique, so this is a lookup.
 */
async function opponentDirectoryRow(
  detail: EventDetail
): Promise<ProgramSearchResult | null> {
  const programId =
    detail.entries.find((entry) => entry.opponentProgramId)
      ?.opponentProgramId ?? null;
  if (!programId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("program_key, school_name, team, division, conference, state, status")
    .eq("id", programId)
    .maybeSingle();

  if (!data) return null;

  return {
    programKey: data.program_key,
    schoolName: data.school_name,
    team: data.team as ProgramSearchResult["team"],
    division: data.division,
    conference: data.conference,
    state: data.state,
    status: data.status as ProgramSearchResult["status"],
    // Nothing on this screen shows who runs the other program — the owner
    // projection belongs to the claim flow's definer RPC, as the create
    // route's own directory mapper says.
    ownerDisplay: null,
  };
}
