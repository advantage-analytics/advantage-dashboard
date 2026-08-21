import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getUploadQueue } from "@/lib/data/schedule-server";
import { getTeamSingleMatch } from "@/lib/data/single-match-server";
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
 * Without `?entry=` there is nothing to preset, so this offers the lines that
 * have no video and hands off to the pinned flow.
 */
export default async function TeamUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string; match?: string }>;
}) {
  const { entry: entryId, match: matchId } = await searchParams;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard/matches/new");
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const groups = await getUploadQueue(active.id);

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

  if (entryId) {
    for (const group of groups) {
      const entry = group.entries.find((candidate) => candidate.id === entryId);
      if (!entry) continue;

      // The row that was clicked, not just the entry's first match. A
      // tournament entry is a whole run, so `?match=` is what says which round
      // this video belongs to.
      const match =
        (matchId
          ? entry.matches.find((candidate) => candidate.id === matchId)
          : undefined) ??
        entry.matches[0] ??
        null;
      const preset: EventPreset = {
        kind: "line",
        entryId: entry.id,
        eventId: group.event.id,
        eventName: group.event.name,
        matchId: match?.id ?? null,
        round: entry.slot ?? match?.round ?? null,
        playerName: entry.playerLabels.join(" / "),
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

  return <LinePicker groups={groups} />;
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
