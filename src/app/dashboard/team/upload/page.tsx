import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import { getUploadQueue } from "@/lib/data/schedule-server";
import { getTeamSingleMatch } from "@/lib/data/single-match-server";
import { getLadder } from "@/lib/data/roster-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { supportsVideo } from "@/lib/schedule/entry-state";
import { formatEventSpan, siteLabel } from "@/lib/schedule/format";
import { UploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";

/**
 * Uploading a match video in a team workspace.
 *
 * This is the SAME wizard as `/dashboard/matches/new`, not a copy of it. The
 * only difference is that step 1 arrives answered: the event knows the players,
 * the date, the surface, the format and usually the score, so the coach trims
 * and confirms and nothing else.
 *
 * Building a second four-step wizard was the first attempt, and it was wrong:
 * five fields are required by the vision pipeline and validated in
 * `job-request.ts`, and collecting them in two components is how those two
 * drift — silently, because the page still renders.
 *
 * `?player=` is the roster row's upload shortcut. It presets whose match this
 * is and leaves the rest of step 1 to be filled in — the coach knows the player
 * before they know the opponent, which is the order the roster puts them in.
 *
 * Without `?entry=` there is nothing to preset, so staff get the lines that have
 * no video and hand off to the pinned flow. A player gets the wizard itself —
 * see `staff` below for why they are never offered a line.
 */
export default async function TeamUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string; match?: string; player?: string }>;
}) {
  const { entry: entryId, match: matchId, player: playerId } = await searchParams;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard/matches/new");
  // Staff always; a player only where the program set `players_can_upload`
  // AND their own `program_members.upload_enabled` is on — the roster row's
  // "Can send video" switch. Two settings rather than one because a coach
  // handing the budget to a single senior cannot say that program-wide.
  //
  // Not `isProgramStaff` — that turned every player away no matter what the
  // program had chosen, which made the Team settings toggle a label rather
  // than a setting. Not `players_can_upload` alone either, which made the
  // roster switch the same kind of label. `canUploadForProgram` is the same
  // predicate `landingPath()` reads, so a switch into this workspace lands
  // here exactly when this line would admit the viewer.
  //
  // This is where a *player* is turned away and nowhere else: staff are
  // answered before either flag is read, so no arrangement of switches can
  // bounce a coach off their own program's upload page.
  if (!canUploadForProgram(active)) redirect("/dashboard/team/schedule");

  // Who may open this page and who may attach a match to a SCHEDULED LINE are
  // two different questions, and only the second one is authorization. The
  // database answers it: `matches_block_client_regraft` refuses any client
  // INSERT that names an `event_entry_id` unless `is_program_staff`, with no
  // `players_can_upload` exception — deliberately, because a player fabricating
  // a result against their own program's dual is the finding that trigger was
  // written for.
  //
  // The `?entry=` branch below builds precisely that insert: its preset carries
  // `entryId`, which the wizard writes as `event_entry_id`. So a player offered
  // a line would upload the whole video, answer every step, and only then be
  // refused — at the last step, with the bytes already spent. The wizard's
  // `explainWriteFailure()` renders that 42501 as the trigger's own sentence
  // ("Only a program's staff can attach a match to a scheduled line.") instead
  // of burying it under "Database error:", which makes the dead end legible
  // without making it any less of a dead end. The queue is not theirs to pick
  // from, so they are not shown it and a hand-typed `?entry=` is dropped rather
  // than honoured.
  //
  // NOTE for anyone reading back to where that staff rule came from. The
  // migration that first wrote it, `20260821232306`, justifies it with "only
  // staff ever set it: /dashboard/team/upload redirects non-staff". That
  // sentence is stale as of this line — the page now admits players wherever
  // `programs.players_can_upload` is set. What keeps the rule's premise true is
  // no longer the page's front door but this split — staff get the line picker,
  // players get the wizard with no line — plus the trigger itself, which is
  // still the thing actually enforcing it.
  //
  // The stale sentence survives only in that migration's file header. The
  // deployed function is `20260824211820`'s (it kept the `event_entry_id` rule
  // verbatim and added the `player1_id` roster bound), and its `comment on
  // function` makes no claim about this page. Both migrations are applied and
  // neither is edited in place, so the correction lives here, on the guard it
  // is about.
  const staff = isProgramStaff(active);
  if (entryId && !staff) redirect("/dashboard/team/upload");

  // NOT hoisted above the `?match=` branch below. That branch never reads the
  // queue, and `getUploadQueue` is four serialized round trips over the whole
  // season — paid, then discarded, on every single-match upload.
  // `async-defer-await`: await it where it is used.

  // `?match=` with no `?entry=` is a single match — it exists, it belongs to no
  // event, and the destination is already settled. Same pinned step 1, minus
  // the event facts there are none of.
  if (!entryId && matchId) {
    const single = await getTeamSingleMatch(active.id, matchId);
    if (!single) redirect("/dashboard/team/upload");

    const preset: EventPreset = {
      kind: "line",
      entryId: null,
      eventId: null,
      eventName: single.context,
      matchId: single.id,
      round: single.round,
      playerName: single.playerName,
      playerUserId: single.playerUserId,
      opponentName: single.opponentName,
      date: single.date.slice(0, 10),
      surface: single.surface,
      bestOf: single.score?.player1.length === 1 ? 1 : 3,
      // Nothing declared a format for a challenge match, so the details step
      // asks. Never `false` by default — the pipeline refuses a job without a
      // real answer, and a wrong one that looks real is worse than none.
      adScoring: null,
      score: single.score,
      supportsVideo: true,
      eventHref: `/dashboard/team/schedule/single/${single.id}`,
    };

    return <UploadMatchFlow preset={preset} />;
  }

  // `?player=` from a roster row. Nothing about the match is known yet, so this
  // is the single-match preset with the player already chosen. The id comes
  // from `program_roster_full`, so it is the same `player_id` the match will be
  // recorded against — a coach-managed athlete included, which is the point.
  if (!entryId && !matchId && playerId) {
    const [roster, settings] = await Promise.all([
      getLadder(active.id),
      getTeamSettings(active.id),
    ]);
    const picked = roster.find((p) => p.userId === playerId);
    // An id that names nobody on this roster falls through to the queue rather
    // than presetting a stranger. It arrives from a URL, so it is untrusted.
    if (picked) {
      const preset: EventPreset = {
        kind: "single",
        entryId: null,
        eventId: null,
        eventName: null,
        matchId: null,
        round: null,
        roster,
        playerName: picked.name,
        playerUserId: picked.userId,
        opponentName: "",
        date: new Date().toISOString().slice(0, 10),
        surface: settings?.program.defaultSurface ?? null,
        bestOf: 3,
        // Null, not false: nothing has declared a format for a match that does
        // not exist yet, and the pipeline refuses a job without a real answer.
        adScoring: null,
        score: null,
        supportsVideo: true,
        eventHref: "/dashboard/team/roster",
      };
      return <UploadMatchFlow preset={preset} />;
    }
  }

  if (entryId) {
    const groups = await getUploadQueue(active.id);
    for (const group of groups) {
      const entry = group.entries.find((candidate) => candidate.id === entryId);
      if (!entry) continue;

      // The row that was clicked, not just the entry's first match. A
      // tournament entry is a whole run, so `?match=` is what says which round
      // this video belongs to.
      const requested = matchId
        ? entry.matches.find((candidate) => candidate.id === matchId)
        : undefined;

      // A `?match=` the queue does not hold is NOT a reason to fall back to
      // `entry.matches[0]`. That attached the video and the camera answers to
      // a DIFFERENT ROUND of the same tournament run — the coach clicked R32
      // and the file landed on Q1, with nothing on screen to show for it. The
      // entry-not-found case two lines below already redirects; this is the
      // same mistake one level down.
      if (matchId && !requested) redirect("/dashboard/team/upload");

      const match = requested ?? entry.matches[0] ?? null;
      const preset: EventPreset = {
        kind: "line",
        entryId: entry.id,
        eventId: group.event.id,
        eventName: group.event.name,
        matchId: match?.id ?? null,
        round: entry.slot ?? match?.round ?? null,
        playerName: entry.playerLabels.join(" / "),
        // Singles only. A doubles line has two accounts and one `player1_id`
        // column, so there is no non-arbitrary answer and null is the honest
        // one — see the note on EventPreset.playerUserId.
        playerUserId:
          entry.discipline === "doubles"
            ? null
            : (entry.playerUserIds[0] ?? null),
        opponentName:
          (match?.opponentLabels ?? entry.opponentLabels).join(" / ") || "",
        date: group.event.startsOn,
        surface: group.event.surface,
        bestOf: group.event.format.bestOf,
        adScoring: group.event.format.adScoring,
        score: match?.score ?? null,
        supportsVideo: supportsVideo(entry),
        eventHref: `/dashboard/team/schedule/${group.event.id}`,
      };

      return <UploadMatchFlow preset={preset} />;
    }
    // The id names a line that already has video, or one from another program.
    redirect("/dashboard/team/upload");
  }

  // A player has no line to pick, so there is nothing to preset and the queue is
  // not worth four round trips to render as a list of links they must not
  // follow. This is the same wizard with no preset — the one
  // `/dashboard/matches/new` renders — and in a team workspace it is not a
  // personal upload: `useUploadMatchWizard` sets `programId` from the active
  // workspace, so the match is filed under the program with `event_entry_id`
  // null and `player1_id` the uploader's own id (`preset ? picked : userId`).
  // That clears all three of `matches_block_client_regraft`'s INSERT checks for
  // a member — their own program, no line, and a `player1_id` that is a
  // `program_members` user of it — which is why this path works where the line
  // picker's does not.
  if (!staff) return <UploadMatchFlow />;

  return <LinePicker groups={await getUploadQueue(active.id)} />;
}

/**
 * Which line is this for?
 *
 * Deliberately not a wizard step — it is a list of links. The wizard proper
 * starts once a destination exists, which is what lets it be the same wizard
 * the personal flow uses.
 */
function LinePicker({
  groups,
}: {
  groups: Awaited<ReturnType<typeof getUploadQueue>>;
}) {
  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-[780px] flex-col gap-6 px-6 py-10">
        <div>
          <div className="text-title-lg">Which match did you film?</div>
          <div className="text-body-sm mt-1.5">
            Every line without video. Pick one — the wizard fills in what the
            event already knows.
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="text-body-sm">
            Every line with a result already has video. A line has to have been
            played before there is a match to film.
          </p>
        ) : null}

        {groups.map((group) => (
          <div key={group.event.id}>
            <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5">
              <span className="eyebrow">
                {group.event.kind === "dual"
                  ? `vs ${group.event.name}`
                  : group.event.name}{" "}
                · {formatEventSpan(group.event.startsOn, group.event.endsOn)} ·{" "}
                {siteLabel(group.event.site)}
              </span>
              <div className="flex-1" />
              <span
                className="text-micro tabular"
                style={{ color: "var(--ink-600)" }}
              >
                {/* Rows, not entries — a tournament run contributes one row
                    per round, and counting entries said 4 above 6 links. */}
                {group.entries.reduce(
                  (count, entry) => count + Math.max(1, entry.matches.length),
                  0
                )}{" "}
                without video
              </span>
            </div>

            {group.entries.flatMap((entry) =>
              // One row per videoless MATCH, so a tournament run offers each
              // round separately. An entry with no matches yet is one row.
              (entry.matches.length > 0
                ? entry.matches.map((match) => ({ match, key: match.id }))
                : [{ match: null, key: entry.id }]
              ).map(({ match, key }) => (
              <Link
                key={key}
                href={
                  match
                    ? `/dashboard/team/upload?entry=${entry.id}&match=${match.id}`
                    : `/dashboard/team/upload?entry=${entry.id}`
                }
                className="grid grid-cols-[44px_1fr_120px_16px] items-center gap-3.5 border-b border-[var(--border-hairline)] py-3 transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
              >
                <span
                  className="mono text-[11px]"
                  style={{ color: "var(--ink-600)" }}
                >
                  {entry.slot ?? match?.round ?? "—"}
                </span>
                <span className="min-w-0 truncate text-[13px] text-[var(--ink-900)]">
                  {entry.playerLabels.join(" / ")}{" "}
                  <span style={{ color: "var(--ink-600)" }}>vs</span>{" "}
                  {(match?.opponentLabels ?? entry.opponentLabels).join(" / ") ||
                    "—"}
                </span>
                <span
                  className="text-micro text-right"
                  style={{ color: "var(--ink-500)" }}
                >
                  {supportsVideo(entry) ? "" : "import only"}
                </span>
                <ChevronRight
                  strokeWidth={1.5}
                  className="size-3.5 text-[var(--ink-400)]"
                />
              </Link>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
