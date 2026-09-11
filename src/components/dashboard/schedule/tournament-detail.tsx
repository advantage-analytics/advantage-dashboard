/*
 * LIVE — do not mistake this for part of the dormant tree.
 * `app/dashboard/team/schedule/[eventId]/page.tsx` renders it, beside
 * `dual-detail.tsx`, on the same `event-page.tsx` frame.
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
import { AddResultButton } from "@/components/dashboard/schedule/add-result-button";
import { TeamTotalsWidget } from "@/components/dashboard/schedule/team-totals-widget";
import { runRecord } from "@/components/dashboard/schedule/run-strip";
import { lineCoverageFrom, matchState } from "@/lib/schedule/entry-state";
import {
  drawOfRound,
  formatEventSpanWithYear,
  roundRank,
  siteTitle,
  surfaceTitle,
} from "@/lib/schedule/format";
import { runFinish } from "@/lib/schedule/tournament-run";
import { advButton } from "@/lib/ui/adv-button";
import type { EventTeamTotals } from "@/lib/data/event-team-totals";
import type { EntryMatch, EventDetail, EventEntry } from "@/lib/schedule/types";

/**
 * The tournament's five columns, stated once and handed to both `TableCard`
 * and every `LineRow` under it. The first is a ROUND, not a line: a dual's
 * first cell is a court that exists before anyone plays on it, a tournament's
 * is a round that only exists because a match was played in it.
 */
const COLUMNS = "grid-cols-[56px_52px_minmax(0,1fr)_120px_130px]";
const HEADERS = ["Round", "Result", "Match", "Score", "Status"];

/**
 * A tournament, on the T5 event frame — empty and filled by ONE renderer.
 *
 * ── Why there is no team result on this page ───────────────────────────────
 * A dual's detail line can declare the match over, because a dual IS over when
 * every line is in and the page can check that. A tournament has no such
 * signal: entries finish on different days, one result played is not a finished
 * weekend, and a word claiming otherwise says the opposite of what is true. So
 * the detail line carries the summed run record and how many matches it is
 * drawn from, and nothing else — the dual's closing word appears nowhere in
 * this file, deliberately.
 *
 * ── Entries are runs, and a run is rows ────────────────────────────────────
 * One table card, one `GroupHead` per entry, and that entry's matches as rows
 * ordered by `ROUND_ORDER`. Draw dividers appear only where an entry's own run
 * actually crossed draws (`groupByDraw` yielding more than one) — "Main draw"
 * above four rows that could not be anywhere else is a heading carrying no
 * information, and the subline already says which draw the run sits in.
 *
 * Everything the page draws arrives computed: `totals` is the route's read
 * (`getEventTeamTotals`), and the shape, the facts row and the table card are
 * `event-page.tsx`'s, so a dual and a tournament cannot drift apart a gap at a
 * time.
 */
export function TournamentDetail({
  detail,
  canEdit,
  totals,
}: {
  detail: EventDetail;
  canEdit: boolean;
  /** Summed over this event's analysed matches. Null when nothing is measured. */
  totals: EventTeamTotals | null;
}) {
  const { event, entries } = detail;

  // Matches, not entries. A coach reading "1 without video" under a tournament
  // is counting films to make, and one entry can be a four-match run — counting
  // entries told them to film once when four were waiting.
  const matches = entries.flatMap((entry) => entry.matches);
  const played = matches.length;

  const record = entries.reduce(
    (total, entry) => {
      const run = runRecord(entry.matches);
      return { won: total.won + run.won, lost: total.lost + run.lost };
    },
    { won: 0, lost: 0 },
  );

  // Counted over `matchState`, not `entryState`: a run is many matches, and
  // asking the entry gives every round the loudest round's answer.
  const states = matches.map(matchState);
  const needFile = states.filter((state) => state === "no-video").length;
  const working = states.filter((state) => state === "working").length;
  const ready = states.filter((state) => state === "ready").length;

  const counts: DetailCount[] = [
    {
      kind: "action",
      n: needFile,
      label: needFile === 1 ? "match needs a file" : "matches need a file",
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
      title={<EventTitle name={event.name} />}
      actions={
        canEdit ? (
          <>
            <Link
              href={`/dashboard/team/schedule/${event.id}/edit`}
              className={advButton("ghost", "md")}
            >
              Edit tournament
            </Link>
            <AddResultButton entries={entries} />
          </>
        ) : null
      }
      facts={
        <EventFacts
          date={formatEventSpanWithYear(event.startsOn, event.endsOn)}
          site={siteTitle(event.site)}
          surface={event.surface ? surfaceTitle(event.surface) : null}
          count={{
            n: entries.length,
            noun: entries.length === 1 ? "entry" : "entries",
          }}
          format={event.format}
        />
      }
      detail={
        <DetailLine
          score={
            played === 0 ? (
              // An em dash, not "0–0". A nil-all reads as a result; this event
              // has none yet, and the capsule beside it says so in words.
              <span style={{ color: "var(--ink-300)" }}>—</span>
            ) : (
              <span style={{ color: "var(--ink-900)" }}>
                {record.won}–{record.lost}
              </span>
            )
          }
          state={
            played === 0
              ? "No results yet"
              : // Singular at one, because "Across 1 matches" is the sort of
                // copy a reader trusts a little less afterwards.
                `Across ${played} ${played === 1 ? "match" : "matches"}`
          }
          counts={counts}
        />
      }
      rail={
        <div className="flex flex-col gap-4">
          <TeamTotalsWidget
            totals={totals}
            coverage={lineCoverageFrom(entries)}
          />
          <SchoolsFaced entries={entries} />
        </div>
      }
    >
      <TableCard columns={COLUMNS} headers={HEADERS}>
        {entries.map((entry) => (
          <EntryRun key={entry.id} entry={entry} canEdit={canEdit} />
        ))}
      </TableCard>
    </EventPageFrame>
  );
}

/**
 * One entry: its heading, and its run as rows.
 *
 * A fragment, not a bordered block — the card's rows carry no rules between
 * them, and the old page's per-entry `border-t` plus blue tick beside the name
 * were both the "coloured left stripe" register `event-page.tsx` rules out. The
 * heading itself is the separation.
 */
function EntryRun({ entry, canEdit }: { entry: EventEntry; canEdit: boolean }) {
  const segments = groupResultRowsByDraw(entry);
  const segmented = segments.length > 1;

  return (
    <>
      <GroupHead
        name
        label={entry.playerLabels.join(" / ") || "Unnamed entry"}
        note={runSubline(entry)}
      />
      {segments.map((segment) => (
        <div key={segment.draw}>
          {segmented ? (
            <div className="pt-2.5 pb-1">
              <span className="eyebrow-sm">{segment.draw}</span>
            </div>
          ) : null}
          {segment.rows.map(({ round, match, key }) => (
            <LineRow
              key={key}
              entry={entry}
              match={match}
              label={round ?? "—"}
              round={round}
              canEdit={canEdit}
              columns={COLUMNS}
              showSchool={false}
              // Every row `last`: inside the card the rows carry no rules
              // between them — the header's single hairline is the only one,
              // which is the table law `TableCard` draws.
              last
            />
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * A tournament run's rendered rows, including schedule-only outcomes.
 *
 * `groupByDraw` deliberately answers a match-only domain question used by the
 * run summary. This adapter is narrower: it exists only for the event table,
 * where an outcome without a `matches` row still needs a row of its own.
 *
 * Match rounds are seeded first so the existing row survives unchanged when
 * an inconsistent legacy payload contains both a match and an outcome at the
 * same round. `LineRow` then applies the domain's outcome precedence while
 * retaining that match's opponent label. Outcome-only rounds append to the
 * same ladder and the stable rank sort restores the loader's established
 * tournament order before draw grouping.
 */
function groupResultRowsByDraw(entry: EventEntry) {
  const rows: {
    round: string | null;
    match: EntryMatch | null;
    key: string;
    order: number;
  }[] = entry.matches.map((match, index) => ({
    round: match.round,
    match,
    key: `match-${match.id}`,
    order: index,
  }));

  for (const outcome of entry.outcomes ?? []) {
    if (rows.some((row) => row.round === outcome.round)) continue;
    rows.push({
      round: outcome.round,
      match: null,
      key: `outcome-${outcome.id}`,
      order: rows.length,
    });
  }

  rows.sort(
    (a, b) => roundRank(a.round) - roundRank(b.round) || a.order - b.order,
  );

  const home = entry.draw ?? "Main draw";
  const order: string[] = [];
  const buckets = new Map<string, typeof rows>();

  for (const row of rows) {
    const draw = drawOfRound(row.round) ?? home;
    if (!buckets.has(draw)) {
      buckets.set(draw, []);
      order.push(draw);
    }
    buckets.get(draw)!.push(row);
  }

  return order.map((draw) => ({ draw, rows: buckets.get(draw)! }));
}

/**
 * "Seed 3 · 2–1 · out in the quarter-final" — the heading's second line.
 *
 * Three segments, any of which can be absent, joined by middots. An entry that
 * has played nothing says which draw it is in and that it has played nothing,
 * because a bare seed under a name reads as a run that has been lost rather
 * than one that has not started.
 *
 * "Qualifier" replaces the seed for a qualifying entry: a seeding inside a
 * qualifying draw is a different number from a main-draw seed, and printing it
 * unqualified beside main-draw entries invites the two to be compared.
 */
function runSubline(entry: EventEntry): string {
  const qualifying = (entry.draw ?? "").toLowerCase().includes("qualif");

  if (entry.matches.length === 0) {
    return `${qualifying ? "Qualifier" : "Main draw"} · no matches yet`;
  }

  const record = runRecord(entry.matches);
  const segments = [
    qualifying ? "Qualifier" : entry.seed ? `Seed ${entry.seed}` : null,
    `${record.won}–${record.lost}`,
    runFinish(entry),
  ];

  return segments.filter(Boolean).join(" · ");
}

/**
 * The rail's second card — every school this weekend was played against, with
 * the record against each.
 *
 * ── The school is per ENTRY, not per match ─────────────────────────────────
 * `opponentSchool` lives on `program_event_entries` and is overwritten by the
 * last `recordResult` filed against that entry, so a run through four different
 * programs carries only the fourth. Summing `runRecord` over the entries that
 * name a school is therefore the honest reading of the column we have: it says
 * "this entry's run, filed against this school", not "these matches were played
 * against this school". A per-match answer needs a per-match column, which does
 * not exist yet.
 *
 * No "all opponents" footer link: the tournament page has no single opponent
 * for one to be about, and a link to the whole directory from here is a
 * different question than the one the card answers.
 */
function SchoolsFaced({ entries }: { entries: EventEntry[] }) {
  const order: string[] = [];
  const rows = new Map<
    string,
    { won: number; lost: number; programId: string | null }
  >();

  for (const entry of entries) {
    const school = entry.opponentSchool;
    if (!school) continue;

    if (!rows.has(school)) {
      rows.set(school, { won: 0, lost: 0, programId: null });
      order.push(school);
    }
    const row = rows.get(school)!;
    const run = runRecord(entry.matches);
    row.won += run.won;
    row.lost += run.lost;
    row.programId = row.programId ?? entry.opponentProgramId ?? null;
  }

  return (
    <div className="surface-card min-w-0 px-5 pt-4 pb-4">
      <span className="eyebrow">Schools faced</span>

      {order.length === 0 ? (
        <p className="mt-3 text-[12px]" style={{ color: "var(--ink-500)" }}>
          No schools yet
        </p>
      ) : (
        <div className="mt-1 flex flex-col">
          {order.map((school) => {
            const row = rows.get(school)!;
            const body = (
              <>
                <span
                  className="min-w-0 truncate"
                  style={{ color: "var(--ink-900)" }}
                >
                  {school}
                </span>
                <span
                  className="tabular shrink-0"
                  style={{ color: "var(--ink-600)" }}
                >
                  {row.won}–{row.lost}
                </span>
              </>
            );
            const className =
              "flex h-[36px] items-center justify-between gap-3 text-[12px]";

            // A link only where the event actually resolved a program. A row
            // that looks clickable and lands nowhere is worse than a plain one.
            return row.programId ? (
              <Link
                key={school}
                href={`/dashboard/opponents/${row.programId}`}
                className={className}
              >
                {body}
              </Link>
            ) : (
              <div key={school} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
