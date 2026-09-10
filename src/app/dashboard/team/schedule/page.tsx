import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { zonedDayString } from "@/lib/data/match-utils";
import {
  canUploadForProgram,
  scheduleCapabilitiesFor,
} from "@/lib/workspace/types";
import {
  getOpponentPrograms,
  getProgramSchedule,
  scheduleRowsFrom,
  seasonSummaryFrom,
} from "@/lib/data/schedule-server";
import { StaticSchedule } from "@/components/dashboard/schedule/static/static-schedule";
import type { EventDetail } from "@/lib/schedule/types";

export const metadata = { title: "Schedule" };

/**
 * `Tc2` / `Tc2c` -- the program's schedule: one full-width table, and the
 * selected event's detail as a right rail.
 *
 * Reads `program_events`, not `matches`. That is the whole reason this page
 * exists rather than a team filter over `/dashboard/matches`: a schedule has
 * rows before anyone has played anything, and a matches list by definition
 * does not.
 *
 * Fetches once -- `getProgramSchedule` -- and passes the full data down so
 * selection in the list opens the rail with no further round-trip. The one
 * addition is `getOpponentPrograms`, for the conference the rail prints under
 * an opponent's name; it reads `programs` once for every opponent the season
 * names, and nothing when no line names one.
 *
 * `rows.length === 0` is what selects the day-zero frame, which is why
 * nothing here branches on it: a program with no events hands the component
 * an empty `rows` and the component already knows what that means.
 *
 * Both permission answers come from the workspace rather than from the
 * schedule: `scheduleCapabilitiesFor` names every Schedule action the page
 * exposes, and `canUploadForProgram` separately gates day zero's "One-off
 * match in Matches".
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const schedule = await getProgramSchedule(active.id);

  const rows = scheduleRowsFrom(schedule);

  // Build the detail map: every event's detail, keyed by id, so the client
  // component can swap the rail without a fetch.
  // Built from the loop's own `event` rather than through `eventDetailFrom`,
  // which re-`find()`s the very array this is iterating — an O(n²) walk over
  // the season for a map we already hold both halves of.
  const details: Record<string, EventDetail> = {};
  for (const event of schedule.events) {
    details[event.id] = {
      event,
      entries: schedule.entriesByEvent.get(event.id) ?? [],
    };
  }

  // `?event=` opens the rail on one event, the way the roster's `?player=`
  // does; the component ignores an id that names no row.
  const { event: eventParam } = await searchParams;
  const initialSelectedId = typeof eventParam === "string" ? eventParam : null;

  const opponents = await getOpponentPrograms(
    [...schedule.entriesByEvent.values()].flatMap((entries) =>
      entries.map((entry) => entry.opponentProgramId),
    ),
  );

  return (
    <StaticSchedule
      schedule={{ rows, details }}
      season={seasonSummaryFrom(schedule)}
      // Today in the PROGRAM's zone, not the server's. `starts_on` is a plain
      // calendar date authored where the coach is, and the server is UTC on
      // Vercel — comparing the two against a UTC "today" makes Upcoming a day
      // wrong for every western coach from late afternoon onward.
      // `zonedDayString` is the app's one answer to "what day is it there",
      // shared with Team Home's dual sheet and the roster's claimed-today pill.
      //
      // Passed as a prop rather than read from a clock in the component: it
      // also renders on the server, and a `new Date()` there would give the
      // two renders different answers.
      today={zonedDayString(new Date(), active.timeZone)}
      capabilities={scheduleCapabilitiesFor(active)}
      canAddOwnMatch={canUploadForProgram(active)}
      programName={active.name}
      opponents={opponents}
      initialSelectedId={initialSelectedId}
    />
  );
}
