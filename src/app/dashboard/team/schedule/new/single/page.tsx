import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { UploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";

/**
 * 25h — a single match in a team workspace.
 *
 * A challenge, a practice set, an outside tournament: played by one of the
 * program's players, but not part of any event, so nothing mints a line for it
 * and there is no lineup to read. That makes the team's contribution exactly
 * one fact — WHOSE match it is — and everything after it is the personal
 * wizard's details step, unchanged.
 *
 * Which is why this is the same wizard again rather than a third one. It
 * differs from the line flow only in what step 1 asks.
 *
 * The match it creates carries `program_id` but no `event_entry_id`: it counts
 * toward the player's season and appears on Team Home, and it deliberately does
 * NOT touch a dual's team score, because nothing about a challenge match should.
 */
export default async function NewSingleMatchPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  // A personal workspace has no roster to pick from, so the question this page
  // exists to ask does not arise — that is just the ordinary wizard.
  if (active.kind !== "team") redirect("/dashboard/matches/new");
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const [roster, settings] = await Promise.all([
    getLadder(active.id),
    getTeamSettings(active.id),
  ]);

  const preset: EventPreset = {
    kind: "single",
    entryId: null,
    eventId: null,
    eventName: null,
    matchId: null,
    round: null,
    roster,
    // Chosen in step 1. Empty is what gates Continue.
    playerName: "",
    opponentName: "",
    // Today, not an event's date — a single match has no event to inherit one
    // from. The details step can change it.
    date: new Date().toISOString().slice(0, 10),
    surface: settings?.program.defaultSurface ?? null,
    bestOf: 3,
    // Deliberately null: unlike a dual, nothing here has declared a format, so
    // the details step asks. A false default would be a wrong answer that looks
    // like a real one, and the pipeline refuses a job without a real one.
    adScoring: null,
    score: null,
    supportsVideo: true,
    eventHref: "/dashboard/team/schedule",
  };

  return <UploadMatchFlow preset={preset} />;
}
