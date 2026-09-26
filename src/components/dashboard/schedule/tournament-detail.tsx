"use client";

/*
 * LIVE — do not mistake this for part of the dormant tree.
 * `app/dashboard/team/schedule/[eventId]/page.tsx` renders it, beside
 * `dual-detail.tsx`, on the event-table kit (`event-table.tsx`).
 *
 * See `./README.md` for the full live/dormant map.
 */

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, GraduationCap, MapPin, Trophy, Users } from "lucide-react";
import {
  EventFact,
  EventHeader,
  EventPageLayout,
  EventTitle,
  EventRow,
  EventTable,
  EventTableFooter,
  EventToolbar,
  SummaryCell,
  SummaryStrip,
  type ToolbarOption,
} from "@/components/dashboard/schedule/event-table";
import {
  selectIgnoringCut,
  useRowSelection,
} from "@/components/dashboard/schedule/use-row-selection";
import {
  EventLineDrawer,
  LineContextList,
  LineContextRow,
} from "@/components/dashboard/schedule/event-line-drawer";
import { scoreHref } from "@/lib/schedule/score-seed";
import {
  DATE_COL,
  RESULT_COL,
} from "@/components/dashboard/matches/match-list-layout";
import { drawerSideName } from "@/components/dashboard/matches/drawer-sections";
import { RowLifecycle } from "@/components/dashboard/matches/row-state";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { EmptyMark } from "@/components/ui/empty-mark";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { StatusChip } from "@/components/ui/status-chip";
import { getInitials } from "@/lib/data/match-utils";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import { advButton } from "@/lib/ui/adv-button";
import {
  endingMark,
  matchState,
  resolveEntryResult,
  resultState,
  resultWon,
  supportsVideo,
} from "@/lib/schedule/entry-state";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import {
  drawOfRound,
  formatEventShortDay,
  formatEventSpanWithYear,
  roundRank,
  siteTitle,
  surfaceTitle,
} from "@/lib/schedule/format";
import { nextRound, runFinish, runRecord } from "@/lib/schedule/tournament-run";
import type { EventTeamTotals } from "@/lib/data/event-team-totals";
import type {
  EntryMatch,
  EventDetail,
  EventEntry,
  EventFormat,
} from "@/lib/schedule/types";

/**
 * Date · Round · Opponent · Result · Score · Analysis
 * (`TournamentDrawer.dc.html`). No Player column: the entry's group head
 * names who played every row under it.
 *
 * **Spatial thesis.** A coach reads this table down, a run at a time: the
 * entry's head names the player, then each round answers "when, which round,
 * against whom, how did it go". Date leads and the outcome sits in fixed
 * tracks so the eye drops straight down one x per fact; the two text columns
 * take the slack. It is the Matches table's grammar with Round in Player's
 * place, so the tracks it shares are that table's, not look-alikes:
 *
 * - **Date** — `DATE_COL`, 72px: `tables.md` rule 1, "Date leads … 72px".
 *   The narrower track it had was a near-miss that put this table's first
 *   column a different width from every other list in the product.
 * - **Round** — 48px: sized to its heading, not its cell. "ROUND" in the 9px
 *   eyebrow with 2.5px tracking is ~46px and clipped at the 40px it had; the
 *   widest code (`R128`, 11px mono) is ~27px, so the heading sets the floor.
 * - **Opponent** — `minmax(150px,1fr)`: a name, truncating, sharing spare
 *   width with Analysis as the Matches team grid's text columns do
 *   (d233f439).
 * - **Result** — `RESULT_COL`, 60px: sized to its widest content, the
 *   "RESULT" heading, which the narrower track it had clipped (`tables.md`
 *   rule 1). The glyph and `EmptyMark`'s dash start at one x inside it.
 * - **Score** — 140px: wider than Matches' 116px because a tournament cell
 *   also carries the ending ("ret.") or a `StatusChip` ("Withdrawn") where
 *   a round was not played.
 * - **Analysis** — `minmax(96px,1fr)`: the lifecycle word or "Score only".
 *
 * Beside the 340px drawer the column narrows; below the tracks' minimums the
 * card scrolls sideways (`TABLE_MIN_WIDTH`) instead of crushing a track, so
 * no heading clips and the Score column keeps one x in both states.
 */
const ROUND_COL = "48px";
const SCORE_COL = "140px";
const OPPONENT_MIN = "150px";
const ANALYSIS_MIN = "96px";
const TRACKS = `${DATE_COL} ${ROUND_COL} minmax(${OPPONENT_MIN},1fr) ${RESULT_COL} ${SCORE_COL} minmax(${ANALYSIS_MIN},1fr)`;
/** Six tracks' minimums plus five 16px gaps (`gap-x-4`): 646px. */
const TABLE_MIN_PX =
  [DATE_COL, ROUND_COL, OPPONENT_MIN, RESULT_COL, SCORE_COL, ANALYSIS_MIN]
    .map((track) => parseInt(track, 10))
    .reduce((sum, px) => sum + px, 0) +
  5 * 16;
/** The header and every row read their tracks from this one custom property. */
const GRID = "grid-cols-(--tournament-tracks)";
const TABLE_MIN_WIDTH = "min-w-(--tournament-min-width)";
const TABLE_VARS = {
  "--tournament-tracks": TRACKS,
  "--tournament-min-width": `${TABLE_MIN_PX}px`,
} as React.CSSProperties;
const COLUMNS = [
  "Date",
  "Round",
  "Opponent",
  "Result",
  "Score",
  "Analysis",
] as const;

type Pill = "all" | "main" | "qualifying" | "needs-video";
const PILLS: readonly ToolbarOption<Pill>[] = [
  { value: "all", label: "All matches" },
  { value: "main", label: "Main draw" },
  { value: "qualifying", label: "Qualifying" },
  { value: "needs-video", label: "Needs video" },
];

type ResultCut = "won" | "lost";
type Sort = "round" | "player";
const SORTS: readonly ToolbarOption<Sort>[] = [
  { value: "round", label: "Round order" },
  { value: "player", label: "Player" },
];

/**
 * One row of the tournament table: a round an entry has a result in.
 *
 * `id` is the selection key (`?match=`): the match id for a played round, the
 * outcome id for a round that only has a schedule outcome (default,
 * withdrawal, forfeit) — that round has no `matches` row to name. `round` is
 * what the score flow and the drawer ask `resolveEntryResult` with.
 */
export interface TournamentRow {
  id: string;
  entry: EventEntry;
  round: string | null;
  match: EntryMatch | null;
  /** "Main draw", "Qualifying" or "Consolation" — from the round, else the entry. */
  draw: string;
}

/**
 * A tournament's event page: the header (name, one subline of facts, Edit
 * tournament + Add result), a four-cell summary strip, and every entry's run
 * as a table grouped by entry.
 *
 * Rows peek, never navigate: a click selects the round (`aria-current`,
 * `?match=<id>`, see `TournamentRow.id`) and opens `EventLineDrawer` beside
 * the table as "Match n / N", with the player's run as its context list. The
 * per-round and per-entry actions live in that drawer: Edit result on an
 * outcome-only round, View match, Add video, and the entry's next-round Add
 * result. An entry with nothing played has no row to open, so its group head
 * carries its own "Add first result" for a coach.
 *
 * ── Why there is no team result on this page ───────────────────────────────
 * A dual is over when every line is in and the page can check that. A
 * tournament has no such signal: entries finish on different days, and one
 * result played is not a finished weekend. So the strip carries the summed run
 * record and how many matches it is drawn from, and never a closing word.
 */
export function TournamentDetail({
  detail,
  canEdit,
  totals,
  rosterPlayerIds = {},
  initialMatchId = null,
}: {
  detail: EventDetail;
  canEdit: boolean;
  /** Summed over this event's analysed matches. Null when nothing is measured. */
  totals: EventTeamTotals | null;
  /**
   * Lineup id → the roster profile id it resolves to. An entry's name links
   * to `/dashboard/team/roster/<profile id>` only when its id is here: a
   * lineup id can be an auth uid, which the roster route does not resolve.
   */
  rosterPlayerIds?: Record<string, string>;
  /** `?match=` as the server read it — ignored unless it names a row. */
  initialMatchId?: string | null;
}) {
  const { event, entries } = detail;

  const [pill, setPill] = useState<Pill>("all");
  const [resultCut, setResultCut] = useState<ResultCut | null>(null);
  const [sort, setSort] = useState<Sort>("round");

  const runs = useMemo(
    () => entries.map((entry) => ({ entry, rows: tournamentRows(entry) })),
    [entries],
  );
  const allRows = useMemo(() => runs.flatMap((run) => run.rows), [runs]);
  const cut = pill !== "all" || resultCut !== null;

  // The toolbar's cut: pill, then the Result filter, then the entry order.
  // An entry the cut leaves empty drops out; with no cut every entry shows,
  // an entry with no results as its head alone.
  const visible = useMemo(() => {
    const keep = (row: TournamentRow) =>
      pillKeeps(pill, row) && (resultCut === null || rowCut(row) === resultCut);
    const groups = runs
      .map((run) => ({ entry: run.entry, rows: run.rows.filter(keep) }))
      .filter((run) => !cut || run.rows.length > 0);
    return sort === "round"
      ? groups
      : [...groups].sort((a, b) =>
          entryLabel(a.entry).localeCompare(entryLabel(b.entry), undefined, {
            sensitivity: "base",
          }),
        );
  }, [runs, pill, resultCut, sort, cut]);

  const visibleIds = useMemo(
    () => visible.flatMap((run) => run.rows.map((row) => row.id)),
    [visible],
  );
  const selection = useRowSelection({
    ids: visibleIds,
    initialId: initialMatchId,
    param: "match",
  });

  const drawerRow = selection.drawerId
    ? (allRows.find((row) => row.id === selection.drawerId) ?? null)
    : null;
  const drawerRun = drawerRow
    ? (runs.find((run) => run.entry.id === drawerRow.entry.id) ?? null)
    : null;
  // The run list names every round of the entry, whatever the toolbar hides.
  // Choosing one the cut hides lifts the cut first, so the selection is not
  // cleared the moment it lands on a row that is not listed.
  const chooseRow = (id: string) =>
    selectIgnoringCut(selection, id, visibleIds, () => {
      setPill("all");
      setResultCut(null);
    });

  // Matches, not entries, and not outcome-only rounds: a default or a
  // withdrawal decided a round without a match, so it has no score to count
  // toward the record and no film to make a report from.
  const matches = entries.flatMap((entry) => entry.matches);
  const record = entries.reduce(
    (total, entry) => {
      const run = runRecord(entry.matches);
      return { won: total.won + run.won, lost: total.lost + run.lost };
    },
    { won: 0, lost: 0 },
  );
  const ready = matches.filter((match) => matchState(match) === "ready").length;
  const deepest = deepestRun(entries);
  const serveIn = totals?.ours.firstServeInPct ?? null;
  const serveInTheirs = totals?.theirs.firstServeInPct ?? null;

  return (
    <EventPageLayout
      header={
        <EventHeader
          title={<EventTitle name={event.name} />}
          subline={[
            <EventFact
              key="date"
              tabular
              icon={
                <Calendar
                  className="size-[13px] text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
            >
              {formatEventSpanWithYear(event.startsOn, event.endsOn)}
            </EventFact>,
            <EventFact
              key="site"
              icon={
                <MapPin
                  className="size-[13px] text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
            >
              {siteTitle(event.site)}
            </EventFact>,
            event.host ? (
              <EventFact
                key="host"
                icon={
                  <GraduationCap
                    className="size-[13px] text-[var(--ink-400)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                }
              >
                {event.host}
              </EventFact>
            ) : null,
            event.surface ? (
              <EventFact
                key="surface"
                icon={
                  <Image
                    src="/icons/tennis-court-icon.svg"
                    width={13}
                    height={13}
                    alt=""
                    aria-hidden="true"
                  />
                }
              >
                {surfaceTitle(event.surface)}
              </EventFact>
            ) : null,
            <EventFact
              key="entries"
              icon={
                <Users
                  className="size-[13px] text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
            >
              {plural(entries.length, "entry", "entries")}
            </EventFact>,
          ]}
          actions={
            canEdit ? (
              <>
                <Link
                  href={`/dashboard/team/schedule/${event.id}/edit`}
                  className={advButton("ghost", "md")}
                >
                  Edit tournament
                </Link>
                {/* The score flow, opened on the first entry still waiting.
                    The page picks the entry and the round. */}
                <Link
                  href={`/dashboard/team/schedule/${event.id}/score`}
                  className={advButton("primary", "md")}
                >
                  Add result
                </Link>
              </>
            ) : null
          }
        />
      }
      strip={
        <SummaryStrip>
          <SummaryCell
            label="Record"
            value={
              matches.length === 0 ? (
                // An em dash, not "0–0": a nil-all reads as a result.
                <EmptyMark />
              ) : (
                `${record.won}–${record.lost}`
              )
            }
            trailing={
              matches.length === 0
                ? "no results yet"
                : `across ${plural(matches.length, "match", "matches")}`
            }
          />
          <SummaryCell
            label="Deepest run"
            value={deepest ? deepest.round : <EmptyMark />}
            trailing={deepest ? deepest.names.join(", ") : undefined}
          />
          <SummaryCell
            label="First serve in"
            value={serveIn === null ? <EmptyMark /> : `${Math.round(serveIn)}%`}
            trailing={
              serveIn !== null && serveInTheirs !== null
                ? `vs ${Math.round(serveInTheirs)}%`
                : undefined
            }
          />
          <SummaryCell
            label="Reports"
            value={
              matches.length === 0 ? (
                <EmptyMark />
              ) : (
                `${ready} of ${matches.length}`
              )
            }
            trailing={matches.length === 0 ? undefined : "ready"}
          />
        </SummaryStrip>
      }
      toolbar={
        <EventToolbar<Pill, "result", Sort>
          pills={PILLS}
          pill={pill}
          onPillChange={setPill}
          filter={{
            sections: [
              {
                label: "Result",
                segmented: [
                  {
                    key: "result",
                    options: [
                      { value: null, label: "Any" },
                      { value: "won", label: "Won" },
                      { value: "lost", label: "Lost" },
                    ],
                  },
                ],
              },
            ],
            value: () => resultCut,
            onSelect: (_key, value) => setResultCut(value as ResultCut | null),
            onClear: () => setResultCut(null),
            hasActive: resultCut !== null,
            resultCount: visibleIds.length,
            totalCount: allRows.length,
            label: "Filter matches",
            noun: { singular: "match", plural: "matches" },
          }}
          sort={{ options: SORTS, value: sort, onChange: setSort }}
        />
      }
      table={
        <div style={TABLE_VARS}>
          <EventTable
            grid={GRID}
            columns={COLUMNS}
            minWidth={TABLE_MIN_WIDTH}
            // Group heads count: an entry with no results still draws its head
            // and "No matches yet", so the card is not empty.
            rowCount={visible.length}
            empty={
              entries.length === 0 ? (
                <TableEmptyBody
                  icon={Trophy}
                  title="No entries on this tournament"
                />
              ) : (
                <TableEmptyBody
                  icon={Trophy}
                  title="No matches in this view"
                  action={{
                    label: "Show all matches",
                    onClick: () => {
                      setPill("all");
                      setResultCut(null);
                    },
                  }}
                />
              )
            }
          >
            {visible.map((run, index) => (
              <Fragment key={run.entry.id}>
                <EntryHead
                  entry={run.entry}
                  rosterPlayerIds={rosterPlayerIds}
                  first={index === 0}
                  canEdit={canEdit}
                />
                {run.rows.map((row) => (
                  <MatchTableRow
                    key={row.id}
                    row={row}
                    selected={selection.selectedId === row.id}
                    onToggle={selection.toggle}
                  />
                ))}
              </Fragment>
            ))}
          </EventTable>
        </div>
      }
      footer={
        <EventTableFooter
          start={[
            plural(allRows.length, "match", "matches"),
            plural(entries.length, "entry", "entries"),
            formatFooter(event.format),
          ].join(" · ")}
        />
      }
      drawer={
        drawerRow && drawerRun ? (
          <EventLineDrawer
            kind="Match"
            event={event}
            entry={drawerRow.entry}
            round={drawerRow.round}
            lineLabel={drawerRow.round ?? "—"}
            eventLabel={event.name}
            canEdit={canEdit}
            nextResultHref={scoreHref(
              event.id,
              drawerRow.entry.id,
              nextRound(drawerRow.entry),
            )}
            index={selection.index}
            total={selection.total}
            canPrev={selection.canPrev}
            canNext={selection.canNext}
            closing={selection.closing}
            autoFocus={selection.openedByKeyboard}
            onPrev={() => selection.step(-1)}
            onNext={() => selection.step(1)}
            onClose={() => selection.close(drawerRow.id)}
            onClosed={selection.finishClose}
            context={
              <LineContextList
                eyebrow={runEyebrow(drawerRun.entry)}
                summary={runSummary(drawerRun.entry)}
              >
                {drawerRun.rows.map((row) => (
                  <RunContextRow
                    key={row.id}
                    row={row}
                    current={row.id === drawerRow.id}
                    onSelect={chooseRow}
                  />
                ))}
              </LineContextList>
            }
          />
        ) : null
      }
    />
  );
}

/* ── Group head ─────────────────────────────────────────────────────────── */

/**
 * One entry above its rows: avatar, name, draw words, and on the right the
 * run's record and how it ended — or "No matches yet". The first sits 14px
 * under the header rule, later ones 24px under the row above.
 */
function EntryHead({
  entry,
  rosterPlayerIds,
  first,
  canEdit,
}: {
  entry: EventEntry;
  rosterPlayerIds: Record<string, string>;
  first: boolean;
  canEdit: boolean;
}) {
  const record = runRecord(entry.matches);
  const finish = runFinish(entry);

  return (
    <div
      className={`flex items-center gap-2.5 pb-1.5 ${first ? "pt-3.5" : "pt-6"}`}
    >
      {entry.playerLabels.length > 0 ? (
        <span className="flex shrink-0 gap-0.5">
          {entry.playerLabels.map((name, index) => (
            <PersonAvatar
              key={`${name}-${index}`}
              initials={getInitials(name)}
              photoUrl={null}
              className="size-6 text-[9px]"
            />
          ))}
        </span>
      ) : null}

      <span className="min-w-0 truncate text-[13px] leading-none font-medium text-[var(--ink-900)]">
        {entry.playerLabels.length === 0
          ? "Unnamed entry"
          : entry.playerLabels.map((name, index) => {
              const profileId =
                rosterPlayerIds[entry.playerUserIds[index] ?? ""] ?? null;
              return (
                <Fragment key={`${name}-${index}`}>
                  {index > 0 ? " / " : null}
                  {profileId ? (
                    <Link
                      href={`/dashboard/team/roster/${profileId}`}
                      className="rounded-[4px] outline-none hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)]"
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </Fragment>
              );
            })}
      </span>

      <span
        className="shrink-0 text-[11px] leading-none"
        style={{ color: "var(--ink-500)" }}
      >
        {drawWords(entry)}
      </span>

      <span className="flex-1" />

      {entry.matches.length === 0 ? (
        <>
          <span
            className="shrink-0 text-[11px] leading-none"
            style={{ color: "var(--ink-500)" }}
          >
            No matches yet
          </span>
          {/* Nothing played means no row, so no drawer to hold this entry's
              first result — the head carries it. The score flow needs the
              entry named to land on this player, not the first one waiting. */}
          {canEdit && entry.playerLabels.length > 0 ? (
            <Link
              href={scoreHref(entry.eventId, entry.id, nextRound(entry))}
              className="shrink-0 rounded-[4px] text-[11px] leading-none font-medium text-[var(--blue)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
            >
              Add first result
            </Link>
          ) : null}
        </>
      ) : (
        <>
          <span
            className="tabular shrink-0 text-[12px] leading-none"
            style={{ color: "var(--ink-900)" }}
          >
            {record.won}–{record.lost}
          </span>
          {finish ? (
            <span
              className="shrink-0 text-[11px] leading-none"
              style={{ color: "var(--ink-500)" }}
            >
              {finish}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

function MatchTableRow({
  row,
  selected,
  onToggle,
}: {
  row: TournamentRow;
  selected: boolean;
  onToggle: (id: string, viaKeyboard: boolean) => void;
}) {
  const { entry, match, round } = row;
  // This round's exact result: a schedule outcome takes precedence over a
  // match, and a sibling round never leaks into this row.
  const result = resolveEntryResult(entry, round);
  const played = result.kind === "played" ? result.match : null;
  const won = resultWon(result);
  const outcome =
    result.kind === "non-played"
      ? (LINE_STATUS[resultState(result)] ?? null)
      : null;
  const sets = played ? scoreSetsFrom(played.score) : [];
  const stopped = played ? endingMark(played.ending) : null;
  const theirs =
    match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");
  const label = round ?? "—";

  return (
    <EventRow
      id={row.id}
      grid={GRID}
      selected={selected}
      onToggle={onToggle}
      label={`${label} · ${entryLabel(entry) || "Unnamed entry"} vs ${theirs || "no opponent yet"}`}
    >
      {/* One element per cell — `EmptyMark` is a fragment whose sr-only
          sibling would otherwise become a grid item of its own. */}
      <span
        className="flex min-w-0 truncate text-[12px] whitespace-nowrap"
        style={{ color: "var(--ink-700)" }}
      >
        {match?.date ? (
          formatEventShortDay(match.date)
        ) : (
          // An outcome-only round has no match, so no date of its own.
          <EmptyMark label="No date" />
        )}
      </span>

      <span className="mono text-[11px]" style={{ color: "var(--ink-500)" }}>
        {label}
      </span>

      <span
        className="flex min-w-0 text-[13px]"
        style={{ color: "var(--ink-700)" }}
      >
        {theirs ? (
          <span className="truncate">{theirs}</span>
        ) : (
          <EmptyMark label="No opponent yet" />
        )}
      </span>

      <span className="flex">
        {won === null ? (
          <EmptyMark label="No result yet" />
        ) : (
          <ResultMark won={won} />
        )}
      </span>

      <span className="flex min-w-0 items-center gap-1.5">
        {outcome ? (
          // A non-played round carries its outcome, never an invented score.
          <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip>
        ) : sets.length > 0 ? (
          <>
            <ScoreLine
              sets={sets}
              className="tabular text-[13px] whitespace-nowrap"
              style={{ color: "var(--ink-900)" }}
            />
            {stopped ? (
              <span className="text-[11px] whitespace-nowrap text-[var(--ink-500)]">
                {stopped}
              </span>
            ) : null}
          </>
        ) : (
          <EmptyMark label="No score yet" />
        )}
      </span>

      <span className="flex min-w-0">
        {entry.discipline === "doubles" && played ? (
          <span
            className="text-[11px] leading-none"
            style={{ color: "var(--ink-500)" }}
          >
            Score only
          </span>
        ) : played ? (
          <RowLifecycle
            analysis={{ status: played.status, providerId: null }}
            label={`${label} match`}
          />
        ) : (
          <EmptyMark label="No analysis" />
        )}
      </span>
    </EventRow>
  );
}

/* ── Drawer context ─────────────────────────────────────────────────────── */

/** "Lee's run", "Brooks / Reid's run" — the frame's surname eyebrow. */
function runEyebrow(entry: EventEntry): string {
  const names = entry.playerLabels.map(surname).join(" / ");
  return names ? `${names}'s run` : "This run";
}

/**
 * "Seed 3 · 1–0". The record is `runRecord`, the group head's figure, so it
 * counts matches only — an outcome-only round has no score behind it. The
 * seed prints whatever the draw: inside one player's run there is no other
 * entry's seed to compare it against.
 */
function runSummary(entry: EventEntry): string {
  const record = runRecord(entry.matches);
  return [
    entry.seed ? `Seed ${entry.seed}` : null,
    `${record.won}–${record.lost}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One round in the drawer's run: round, opponent, the score — or the
 * outcome's words, never an invented score — and the mark.
 */
function RunContextRow({
  row,
  current,
  onSelect,
}: {
  row: TournamentRow;
  current: boolean;
  onSelect: (id: string) => void;
}) {
  const result = resolveEntryResult(row.entry, row.round);
  const played = result.kind === "played" ? result.match : null;
  const outcome =
    result.kind === "non-played"
      ? (LINE_STATUS[resultState(result)] ?? null)
      : null;
  const sets = played ? scoreSetsFrom(played.score) : [];
  const theirs =
    row.match?.opponentLabels.join(" / ") ||
    row.entry.opponentLabels.join(" / ");

  return (
    <LineContextRow
      label={row.round ?? "—"}
      name={theirs ? drawerSideName(theirs) : "No opponent yet"}
      won={resultWon(result)}
      current={current}
      onSelect={() => onSelect(row.id)}
      score={
        outcome ? (
          <span className="text-[var(--ink-500)]">{outcome.label}</span>
        ) : sets.length > 0 ? (
          <ScoreLine sets={sets} />
        ) : (
          <EmptyMark label="No score yet" />
        )
      }
    />
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/**
 * A tournament run's rows, including schedule-only outcomes, in ladder order.
 *
 * `groupByDraw` deliberately answers a match-only domain question used by the
 * run summary. This adapter is narrower: it exists only for the event table,
 * where an outcome without a `matches` row still needs a row of its own.
 *
 * Match rounds are seeded first so the existing row survives unchanged when
 * an inconsistent legacy payload contains both a match and an outcome at the
 * same round; the row then applies the domain's outcome precedence while
 * keeping that match's opponent. Outcome-only rounds append to the same
 * ladder and the stable rank sort restores the loader's tournament order.
 * Each row's draw is read from its round, falling back to the entry's own
 * draw only when the round says nothing.
 */
export function tournamentRows(entry: EventEntry): TournamentRow[] {
  const rows: (TournamentRow & { order: number })[] = entry.matches.map(
    (match, index) => ({
      id: match.id,
      entry,
      round: match.round,
      match,
      draw: "",
      order: index,
    }),
  );

  for (const outcome of entry.outcomes ?? []) {
    if (rows.some((row) => row.round === outcome.round)) continue;
    rows.push({
      id: outcome.id,
      entry,
      round: outcome.round,
      match: null,
      draw: "",
      order: rows.length,
    });
  }

  rows.sort(
    (a, b) => roundRank(a.round) - roundRank(b.round) || a.order - b.order,
  );

  const home = homeDraw(entry);
  return rows.map((row) => ({
    id: row.id,
    entry: row.entry,
    round: row.round,
    match: row.match,
    draw: drawOfRound(row.round) ?? home,
  }));
}

/** Where the entry started, in the pill's words. A flight label stays as typed. */
function homeDraw(entry: EventEntry): string {
  const draw = (entry.draw ?? "").trim();
  if (!draw || draw.toLowerCase() === "main") return "Main draw";
  if (draw.toLowerCase().includes("qualif")) return "Qualifying";
  return draw;
}

/**
 * "Main draw · Seed 3", "Qualifying" — the head's draw words. A qualifying
 * seed is a different number from a main-draw seed, and printing it beside
 * main-draw entries invites the two to be compared, so it is left off.
 */
function drawWords(entry: EventEntry): string {
  const draw = homeDraw(entry);
  return draw !== "Qualifying" && entry.seed
    ? `${draw} · Seed ${entry.seed}`
    : draw;
}

function pillKeeps(pill: Pill, row: TournamentRow): boolean {
  if (pill === "main") return row.draw === "Main draw";
  if (pill === "qualifying") return row.draw === "Qualifying";
  if (pill === "needs-video") {
    // A scored singles round nothing was sent for — the one a coach can film.
    return (
      row.match !== null &&
      supportsVideo(row.entry, row.round) &&
      matchState(row.match) === "no-video"
    );
  }
  return true;
}

/** The Result filter's answer for one round; undecided rounds match neither. */
function rowCut(row: TournamentRow): ResultCut | null {
  const won = resultWon(resolveEntryResult(row.entry, row.round));
  return won === null ? null : won ? "won" : "lost";
}

/**
 * The furthest main-draw or qualifying round any entry reached, and whose it
 * was ("R16", "Brooks, Reid"). Consolation rounds sit after the final in
 * `ROUND_ORDER` but are not a deeper run, so they never count. Null when no
 * recognised round has been played.
 */
function deepestRun(
  entries: EventEntry[],
): { round: string; names: string[] } | null {
  let best = Number.MAX_SAFE_INTEGER;
  let round: string | null = null;
  const furthest = new Map<string, number>();

  for (const entry of entries) {
    for (const match of entry.matches) {
      const rank = roundRank(match.round);
      if (rank === Number.MAX_SAFE_INTEGER) continue;
      if (drawOfRound(match.round) === "Consolation") continue;
      if (rank > (furthest.get(entry.id) ?? -1)) furthest.set(entry.id, rank);
      if (round === null || rank > best) {
        best = rank;
        round = match.round;
      }
    }
  }
  if (round === null) return null;

  const names = entries
    .filter((entry) => furthest.get(entry.id) === best)
    .map(
      (entry) => entry.playerLabels.map(surname).join(" / ") || "Unnamed entry",
    );
  return { round: round.toUpperCase(), names };
}

function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function entryLabel(entry: EventEntry): string {
  return entry.playerLabels.join(" / ");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "Best of 3 sets, ad scoring" — sentence case for the line under a table,
 * where `formatLabel`'s Title Case capsule would shout. A null ad-scoring
 * prints nothing rather than a guess.
 */
function formatFooter(format: EventFormat): string {
  const sets =
    format.bestOf === 1 ? "One set" : `Best of ${format.bestOf} sets`;
  if (format.adScoring === null) return sets;
  return `${sets}, ${format.adScoring ? "ad" : "no-ad"} scoring`;
}
