/*
 * LIVE — do not mistake this for part of the dormant tree.
 * `app/dashboard/team/schedule/[eventId]/page.tsx` renders it. The schedule
 * page's rail, `static/event-drawer.tsx`, summarises the same dual in 340px and
 * links each line to its match; this one is the DB-wired event page, where
 * lines are scored.
 *
 * See `./README.md` for the full live/dormant map.
 */

import Link from "next/link";
import {
  DetailLine,
  EventFacts,
  EventPageFrame,
  EventTitle,
  GroupHead,
  TableCard,
  type DetailCount,
} from "@/components/dashboard/schedule/event-page";
import { LineRow } from "@/components/dashboard/schedule/line-row";
import { TeamTotalsWidget } from "@/components/dashboard/schedule/team-totals-widget";
import { HeadToHeadWidget } from "@/components/dashboard/schedule/head-to-head-widget";
import {
  dualScore,
  entryPlayed,
  entryState,
  lineCoverageFrom,
  lineWon,
} from "@/lib/schedule/entry-state";
import {
  formatEventDatesLong,
  siteTitle,
  surfaceTitle,
} from "@/lib/schedule/format";
import { advButton } from "@/lib/ui/adv-button";
import type { EventTeamTotals } from "@/lib/data/event-team-totals";
import type {
  OpponentDualHistory,
  OpponentMeeting,
} from "@/lib/schedule/opponent-history";
import type { EventDetail, EventEntry } from "@/lib/schedule/types";

/**
 * The dual's five columns, stated once and handed to both `TableCard` and every
 * `LineRow` under it — line, outcome, matchup, score, status.
 */
const COLUMNS = "grid-cols-[56px_52px_minmax(0,1fr)_120px_130px]";
const HEADERS = ["Line", "Result", "Match", "Score", "Status"];

/**
 * A dual, on the T5 event frame — empty and filled by ONE renderer.
 *
 * The transition between them is the thing being designed: a dual stops being
 * empty when its rows have scores in them, and a separate "nothing played yet"
 * screen would have to be dismissed. That holds for the rail too — the widgets
 * render with dashes rather than being swapped for an empty state, which is why
 * nothing below branches on `entries.length`.
 *
 * Everything the page draws arrives computed. `totals`, `history` and
 * `meetings` are the route's reads (`getEventTeamTotals`, `opponentDualHistory`
 * / `opponentMeetings`); the shape, the facts row and the table card are
 * `event-page.tsx`'s, so a dual and a tournament cannot drift apart a gap at a
 * time.
 *
 * Every member of the program sees the same data — the membership-only RLS
 * policy hands every member the program's matches.
 */
export function DualDetail({
  detail,
  canEdit,
  totals,
  history,
  meetings,
}: {
  detail: EventDetail;
  canEdit: boolean;
  /** Summed over this dual's analysed matches. Null when nothing is measured. */
  totals: EventTeamTotals | null;
  history: OpponentDualHistory;
  /** Prior decided duals against this opponent, this one excluded. */
  meetings: OpponentMeeting[];
}) {
  const { event, entries } = detail;

  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");

  const score = dualScore(entries);
  const anyPlayed = score.us > 0 || score.them > 0;

  // Counted over `entryState`, which is the one spelling of what a line is
  // waiting for — the same answer the row's own action gives, so the summary
  // and the rows underneath it cannot disagree.
  const needFile = entries.filter(
    (entry) => entryState(entry) === "no-video",
  ).length;
  const working = entries.filter(
    (entry) => entryState(entry) === "working",
  ).length;
  const ready = entries.filter((entry) => entryState(entry) === "ready").length;

  // The primary is whatever is actually next: while a line has no result at
  // all, that is a score; once every line is in, it is the video.
  const needsScore = entries.some(
    (entry) => entry.forfeit === null && entryState(entry) === "empty",
  );

  const counts: DetailCount[] = [
    {
      kind: "action",
      n: needFile,
      label: needFile === 1 ? "line needs a file" : "lines need a file",
      href: "/dashboard/team/upload",
    },
    { kind: "live", n: working, label: "analyzing" },
    {
      kind: "done",
      n: ready,
      label: ready === 1 ? "report ready" : "reports ready",
    },
  ];

  return (
    <EventPageFrame
      title={<EventTitle vs name={event.name} />}
      actions={
        canEdit ? (
          <>
            <Link
              href={`/dashboard/team/schedule/${event.id}/edit`}
              className={advButton("ghost", "md")}
            >
              Edit dual
            </Link>
            <Link
              href={
                needsScore
                  ? `/dashboard/team/schedule/${event.id}/score`
                  : "/dashboard/team/upload"
              }
              className={advButton("primary", "md")}
            >
              {needsScore ? "Add score" : "Upload match video"}
            </Link>
          </>
        ) : null
      }
      facts={
        <EventFacts
          date={formatEventDatesLong(event.startsOn, event.endsOn)}
          site={siteTitle(event.site)}
          surface={event.surface ? surfaceTitle(event.surface) : null}
          count={{
            n: entries.length,
            noun: entries.length === 1 ? "line" : "lines",
          }}
          format={event.format}
        />
      }
      detail={
        <DetailLine
          score={
            <span
              // ink-300 until a point is actually on the board. A 0–0 in full
              // ink reads as a result rather than as an absence of one.
              style={{
                color: anyPlayed ? "var(--ink-900)" : "var(--ink-300)",
              }}
            >
              {score.us}–{score.them}
            </span>
          }
          mark={
            score.decided && score.us !== score.them
              ? score.us > score.them
              : null
          }
          state={score.decided ? "Final" : anyPlayed ? undefined : "Not played"}
          counts={counts}
        />
      }
      rail={
        <div className="flex flex-col gap-4">
          <TeamTotalsWidget
            totals={totals}
            coverage={lineCoverageFrom(entries)}
          />
          <HeadToHeadWidget history={history} meetings={meetings} />
        </div>
      }
    >
      <TableCard columns={COLUMNS} headers={HEADERS}>
        <GroupHead label="Singles" note={courtsNote(singles, "courts")} />
        {singles.map((entry, index) => (
          <LineRow
            key={entry.id}
            entry={entry}
            match={entry.matches[0] ?? null}
            label={entry.slot ?? `S${index + 1}`}
            round={null}
            canEdit={canEdit}
            columns={COLUMNS}
            showSchool={false}
            // Every row `last`: inside the card the rows carry no rules between
            // them — the header's single hairline is the only one, which is the
            // table law `TableCard` draws.
            last
          />
        ))}

        <GroupHead label="Doubles" note={doublesNote(doubles)} />
        {doubles.map((entry, index) => (
          <LineRow
            key={entry.id}
            entry={entry}
            match={entry.matches[0] ?? null}
            label={entry.slot ?? `D${index + 1}`}
            round={null}
            canEdit={canEdit}
            columns={COLUMNS}
            showSchool={false}
            last
          />
        ))}
      </TableCard>
    </EventPageFrame>
  );
}

/**
 * "won 4 of 6 courts" — lines won over lines in the group.
 *
 * Courts, NOT `dualScore`: the heading counts the courts a group holds, where
 * the number in the detail line counts the team points three doubles courts add
 * up to. The denominator is the group's real size rather than a hard-coded 6 or
 * 3, so a dual that fields a different number of lines still describes itself.
 */
function courtsNote(entries: EventEntry[], noun?: string): string | undefined {
  if (entries.length === 0) return undefined;
  const won = entries.filter((entry) => lineWon(entry) === true).length;
  return `won ${won} of ${entries.length}${noun ? ` ${noun}` : ""}`;
}

/**
 * The doubles heading, which says who the ONE doubles point went to.
 *
 * Two of three courts takes it — the ITA rule `dualScore` applies — and it is
 * said here because the courts a coach reads in this group do not add up to the
 * number in the detail line without it.
 */
function doublesNote(entries: EventEntry[]): string | undefined {
  const base = courtsNote(entries);
  if (!base) return undefined;

  const won = entries.filter((entry) => lineWon(entry) === true).length;
  // Played AND not won — `lineWon` alone answers `false` for a court nobody has
  // played, which would hand the opponent the doubles point before the doubles
  // were played.
  const lost = entries.filter(
    (entry) => entryPlayed(entry) && lineWon(entry) !== true,
  ).length;

  if (won >= 2) return `${base} — the team point is ours`;
  if (lost >= 2) return `${base} — the team point is theirs`;
  return base;
}
