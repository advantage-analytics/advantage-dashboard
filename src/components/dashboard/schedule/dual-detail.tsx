"use client";

/*
 * LIVE — do not mistake this for part of the dormant tree.
 * `app/dashboard/team/schedule/[eventId]/page.tsx` renders it. The schedule
 * page's rail, `static/event-drawer.tsx`, summarises the same dual in 340px;
 * this is the DB-wired event page, drawn as a line table in the Matches
 * page's grammar (`event-table.tsx`).
 *
 * See `./README.md` for the full live/dormant map.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info, ListOrdered } from "lucide-react";
import { DOUBLES_SLOTS, SINGLES_SLOTS } from "@/lib/schedule/courts";
import { DualTicks } from "@/components/dashboard/schedule/dual-ticks";
import {
  EventGroupHead,
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
import { useRowSelection } from "@/components/dashboard/schedule/use-row-selection";
import {
  EventLineDrawer,
  LineContextList,
  LineContextRow,
} from "@/components/dashboard/schedule/event-line-drawer";
import { drawerSideName } from "@/components/dashboard/matches/drawer-sections";
import { EventMark } from "@/components/dashboard/schedule/static/event-mark";
import { RowLifecycle } from "@/components/dashboard/matches/row-state";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { EmptyMark } from "@/components/ui/empty-mark";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { StatusChip } from "@/components/ui/status-chip";
import { getInitials } from "@/lib/data/match-utils";
import { isAnalysisReady } from "@/lib/data/match-analysis";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import { advButton } from "@/lib/ui/adv-button";
import {
  dualScore,
  endingMark,
  entryPlayed,
  lineWon,
  resolveEntryResult,
  resultState,
  resultWon,
} from "@/lib/schedule/entry-state";
import { lineupForfeitSide } from "@/lib/schedule/entry-plan";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import { dualPrimaryAction } from "@/lib/schedule/dual-primary-action";
import {
  formatEventDatesLong,
  formatEventTime,
  lineFormat,
  siteTitle,
  surfaceTitle,
} from "@/lib/schedule/format";
import type {
  EventDetail,
  EventEntry,
  EventFormat,
} from "@/lib/schedule/types";

/**
 * The signed-in person, so their own line shows their photo — the roster's
 * rule: our only photo is the viewer's, everyone else is initials. `ids`
 * covers both id spaces a line's player can carry (auth uid and the claimed
 * `program_players.id`). Plain data: the server page hands it across the
 * client boundary.
 */
export interface DualViewer {
  ids: string[];
  avatarUrl: string | null;
  initials: string;
}

/**
 * Line · Player · Opponent · Result · Score · Analysis (`Main.dc.html`). The
 * names take bounded tracks so the Result glyph and the score start on one x
 * on every row; Analysis takes what is left.
 */
const GRID =
  "grid-cols-[28px_minmax(170px,250px)_minmax(140px,220px)_52px_120px_minmax(96px,1fr)]";
const COLUMNS = [
  "Line",
  "Player",
  "Opponent",
  "Result",
  "Score",
  "Analysis",
] as const;

const TOTAL_LINES = SINGLES_SLOTS.length + DOUBLES_SLOTS.length;

type Pill = "all" | "singles" | "doubles" | "needs-result";
const PILLS: readonly ToolbarOption<Pill>[] = [
  { value: "all", label: "All lines" },
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
  { value: "needs-result", label: "Needs a result" },
];

type ResultCut = "won" | "lost" | "undecided";
type Sort = "line" | "player";
const SORTS: readonly ToolbarOption<Sort>[] = [
  { value: "line", label: "Line order" },
  { value: "player", label: "Player" },
];

/**
 * A dual's event page: the header (mark, "vs <school>", one subline of facts,
 * Edit dual + the one primary `dualPrimaryAction` names), a three-cell summary
 * strip, and the nine lines as a table grouped Singles then Doubles.
 *
 * Rows peek, never navigate: a click selects the line (`aria-current`,
 * `?line=<entry id>`) and opens `EventLineDrawer` beside the table. The row
 * actions that used to sit at the end of each line (Add result, Edit result,
 * View report, Add video) live in that drawer, off `lineAction`
 * (`src/lib/schedule/line-action.ts`), and its "This dual" list steps
 * between all nine lines.
 *
 * Every member of the program sees the same data — the membership-only RLS
 * policy hands every member the program's matches.
 */
export function DualDetail({
  detail,
  canEdit,
  conference = null,
  viewer = null,
  initialLineId = null,
}: {
  detail: EventDetail;
  canEdit: boolean;
  /** The opponent program's conference, where the dual resolved one. */
  conference?: string | null;
  viewer?: DualViewer | null;
  /** `?line=` as the server read it — ignored unless it names a line. */
  initialLineId?: string | null;
}) {
  const { event, entries } = detail;

  const [pill, setPill] = useState<Pill>("all");
  const [resultCut, setResultCut] = useState<ResultCut | null>(null);
  const [sort, setSort] = useState<Sort>("line");

  const singles = useMemo(
    () => bySlot(SINGLES_SLOTS, entries, "singles"),
    [entries],
  );
  const doubles = useMemo(
    () => bySlot(DOUBLES_SLOTS, entries, "doubles"),
    [entries],
  );

  // The toolbar's cut: pill, then the Result filter, then the order. The
  // selection's ↑/↓ walk this list, so it is the rows on screen, in order.
  const visible = useMemo(() => {
    const keep = (entry: EventEntry) =>
      pillKeeps(pill, entry) &&
      (resultCut === null || lineCut(entry) === resultCut);
    const order = (group: EventEntry[]) =>
      sort === "line"
        ? group
        : [...group].sort((a, b) =>
            ourLabel(a).localeCompare(ourLabel(b), undefined, {
              sensitivity: "base",
            }),
          );
    return {
      singles: order(singles.filter(keep)),
      doubles: order(doubles.filter(keep)),
    };
  }, [singles, doubles, pill, resultCut, sort]);

  const visibleIds = useMemo(
    () => [...visible.singles, ...visible.doubles].map((entry) => entry.id),
    [visible],
  );
  const selection = useRowSelection({
    ids: visibleIds,
    initialId: initialLineId,
    param: "line",
  });

  const score = dualScore(entries);
  const decided = entries.filter(entryPlayed).length;
  const linesWon = entries.filter((entry) => lineWon(entry) === true).length;
  const singlesWithStats = singles.filter((entry) => {
    const result = resolveEntryResult(entry, null);
    return result.kind === "played" && isAnalysisReady(result.match.status);
  }).length;
  const primary = canEdit ? dualPrimaryAction(entries, event.id) : null;

  const row = (entry: EventEntry) => (
    <LineTableRow
      key={entry.id}
      entry={entry}
      viewer={viewer}
      selected={selection.selectedId === entry.id}
      onToggle={selection.toggle}
    />
  );

  const rowCount = visibleIds.length;

  const drawerEntry = selection.drawerId
    ? (entries.find((entry) => entry.id === selection.drawerId) ?? null)
    : null;
  // The context list names every line, whatever the toolbar hides. Choosing
  // one the cut hides lifts the cut first, so the selection is not cleared
  // the moment it lands on a row that is not listed.
  const chooseLine = (id: string) => {
    if (!visibleIds.includes(id)) {
      setPill("all");
      setResultCut(null);
    }
    selection.select(id, false);
  };

  return (
    <EventPageLayout
      header={
        <EventHeader
          mark={<EventMark kind={event.kind} name={event.name} size={40} />}
          title={<EventTitle vs name={event.name} />}
          subline={[
            `${formatEventDatesLong(event.startsOn, event.endsOn)}${
              event.startsAtTime
                ? ` · ${formatEventTime(event.startsAtTime)}`
                : ""
            }`,
            siteTitle(event.site),
            event.surface ? surfaceTitle(event.surface) : null,
            conference,
          ]}
          actions={
            canEdit ? (
              <>
                <Link
                  href={`/dashboard/team/schedule/${event.id}/edit`}
                  className={advButton("ghost", "md")}
                >
                  Edit dual
                </Link>
                {primary ? (
                  <Link
                    href={primary.href}
                    className={advButton("primary", "md")}
                  >
                    {primary.label}
                  </Link>
                ) : null}
              </>
            ) : null
          }
        />
      }
      strip={
        <SummaryStrip>
          <SummaryCell
            label="Result"
            value={<DualResult score={score} />}
            trailing={
              score.decided ? "Final" : `${decided} of ${TOTAL_LINES} decided`
            }
          />
          <SummaryCell
            label="Lines"
            value={<DualTicks singles={singles} doubles={doubles} size="md" />}
            trailing={`${linesWon} of ${TOTAL_LINES} won`}
          />
          <SummaryCell
            label="Analysis"
            value={`${singlesWithStats} of ${SINGLES_SLOTS.length}`}
            trailing="singles have stats"
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
                      { value: "undecided", label: "Undecided" },
                    ],
                  },
                ],
              },
            ],
            value: () => resultCut,
            onSelect: (_key, value) => setResultCut(value as ResultCut | null),
            onClear: () => setResultCut(null),
            hasActive: resultCut !== null,
            resultCount: rowCount,
            totalCount: singles.length + doubles.length,
            label: "Filter lines",
            noun: { singular: "line", plural: "lines" },
          }}
          sort={{ options: SORTS, value: sort, onChange: setSort }}
        />
      }
      table={
        <EventTable
          grid={GRID}
          columns={COLUMNS}
          rowCount={rowCount}
          empty={
            entries.length === 0 ? (
              // A dual saves with all nine lines, so this is a lineup that
              // failed to load its lines, not a stage of a dual's life.
              <TableEmptyBody
                icon={ListOrdered}
                title="No lines on this dual"
              />
            ) : (
              <TableEmptyBody
                icon={ListOrdered}
                title="No lines in this view"
                action={{
                  label: "Show all lines",
                  onClick: () => {
                    setPill("all");
                    setResultCut(null);
                  },
                }}
              />
            )
          }
        >
          {visible.singles.length > 0 ? (
            <>
              <EventGroupHead label="Singles" value={tally(singles)} first />
              {visible.singles.map(row)}
            </>
          ) : null}
          {visible.doubles.length > 0 ? (
            <>
              <EventGroupHead
                label="Doubles"
                value={tally(doubles)}
                trailing={teamPointNote(doubles)}
                first={visible.singles.length === 0}
              />
              {visible.doubles.map(row)}
            </>
          ) : null}
        </EventTable>
      }
      footer={
        <EventTableFooter
          start={formatFooter(event.format)}
          end={
            <>
              <Info
                className="size-3"
                strokeWidth={1.5}
                style={{ color: "var(--ink-400)" }}
                aria-hidden="true"
              />
              Doubles lines record a score only.
            </>
          }
        />
      }
      drawer={
        drawerEntry ? (
          <EventLineDrawer
            kind="Line"
            event={event}
            entry={drawerEntry}
            lineLabel={drawerEntry.slot ?? "—"}
            eventLabel={`vs ${event.name}`}
            canEdit={canEdit}
            index={selection.index}
            total={selection.total}
            canPrev={selection.canPrev}
            canNext={selection.canNext}
            closing={selection.closing}
            autoFocus={selection.openedByKeyboard}
            onPrev={() => selection.step(-1)}
            onNext={() => selection.step(1)}
            onClose={() => selection.close(drawerEntry.id)}
            onClosed={selection.finishClose}
            context={
              <LineContextList
                eyebrow="This dual"
                summary={dualResultWords(score)}
              >
                {[...singles, ...doubles].map((entry) => (
                  <DualContextRow
                    key={entry.id}
                    entry={entry}
                    current={entry.id === drawerEntry.id}
                    onSelect={chooseLine}
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

/* ── Summary ────────────────────────────────────────────────────────────── */

/**
 * "Won 4–3" with the outcome glyph once the dual is decided; "In progress"
 * until then. `dualScore` is the ITA count — six singles points and one for
 * the doubles — so the figure is never stored and never disagrees with the
 * rows under it. A level dual (possible only on a short card) is "Tied".
 */
function DualResult({
  score,
}: {
  score: { us: number; them: number; decided: boolean };
}) {
  if (!score.decided) return <span>In progress</span>;
  const won = score.us === score.them ? null : score.us > score.them;
  const word = won === null ? "Tied" : won ? "Won" : "Lost";
  return (
    <>
      {/* The word beside it is what a screen reader hears. */}
      <span aria-hidden="true" className="flex">
        <ResultMark won={won} />
      </span>
      <span>
        {word} {score.us}–{score.them}
      </span>
    </>
  );
}

/** The same answer as `DualResult`, as words for the drawer's "This dual". */
function dualResultWords(score: {
  us: number;
  them: number;
  decided: boolean;
}): string {
  if (!score.decided) return "In progress";
  const word =
    score.us === score.them ? "Tied" : score.us > score.them ? "Won" : "Lost";
  return `${word} ${score.us}–${score.them}`;
}

/**
 * "Singles best of 3, no-ad · Doubles one set to 6" — sentence case for the
 * line under a table, where `formatLabel`'s Title Case capsule would shout.
 * Each half comes off `lineFormat`, the one place the singles/doubles split
 * is decided, and a null ad-scoring prints nothing rather than a guess.
 */
function formatFooter(format: EventFormat): string {
  const singles = lineFormat(format, "singles");
  const doubles = lineFormat(format, "doubles");
  const scoring = (ad: boolean | null) =>
    ad === null ? "" : ad ? ", ad" : ", no-ad";
  const singlesWords =
    singles.bestOf === 1 ? "one set" : `best of ${singles.bestOf}`;
  const doublesWords =
    doubles.gamesTo === 8 ? "8-game pro-set" : "one set to 6";
  return `Singles ${singlesWords}${scoring(singles.adScoring)} · Doubles ${doublesWords}${scoring(doubles.adScoring)}`;
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

function LineTableRow({
  entry,
  viewer,
  selected,
  onToggle,
}: {
  entry: EventEntry;
  viewer: DualViewer | null;
  selected: boolean;
  onToggle: (id: string, viaKeyboard: boolean) => void;
}) {
  const slot = entry.slot ?? "—";
  const result = resolveEntryResult(entry, null);
  const played = result.kind === "played" ? result.match : null;
  const won = resultWon(result);
  const state = resultState(result);
  const outcome =
    result.kind === "non-played" ? (LINE_STATUS[state] ?? null) : null;
  const sets = played ? scoreSetsFrom(played.score) : [];
  const stopped = played ? endingMark(played.ending) : null;

  const noPlayer = entry.playerLabels.length === 0;
  const forfeitSide = lineupForfeitSide(entry);
  const theirs =
    played?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");
  const ours = noPlayer ? "No player" : ourLabel(entry) || "—";

  return (
    <EventRow
      id={entry.id}
      grid={GRID}
      selected={selected}
      onToggle={onToggle}
      label={`${slot} · ${ours} vs ${theirs || "no opponent yet"}`}
    >
      <span className="mono text-[11px]" style={{ color: "var(--ink-500)" }}>
        {slot}
      </span>

      <span className="flex min-w-0 items-center gap-2.5">
        <PlayerAvatars
          labels={entry.playerLabels}
          userIds={entry.playerUserIds}
          viewer={viewer}
        />
        {/* Plain text, not a profile link: a lineup's ids can be auth uids,
            which the roster route does not resolve. */}
        <span
          className={
            noPlayer
              ? "truncate text-[13px] text-[var(--ink-500)]"
              : "truncate text-[13px] font-medium text-[var(--ink-900)]"
          }
        >
          {ours}
        </span>
      </span>

      <span
        className="flex min-w-0 text-[13px]"
        style={{ color: "var(--ink-700)" }}
      >
        {theirs ? (
          <span className="truncate">{theirs}</span>
        ) : forfeitSide === "theirs" ? (
          <span className="truncate text-[var(--ink-500)]">
            No player · we win by forfeit
          </span>
        ) : noPlayer ? (
          // The lineup's own words for our forfeit, so the two screens agree.
          <span className="truncate text-[var(--ink-500)]">
            They win by forfeit
          </span>
        ) : (
          <span>
            <EmptyMark label="No opponent yet" />
          </span>
        )}
      </span>

      {/* One element per cell — `EmptyMark` is a fragment whose sr-only
          sibling would otherwise become a grid item of its own. */}
      <span className="flex">
        {won === null ? (
          <EmptyMark label="No result yet" />
        ) : (
          <ResultMark won={won} />
        )}
      </span>

      <span className="flex min-w-0 items-center gap-1.5">
        {outcome ? (
          // A non-played line carries its outcome, never an invented score.
          <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip>
        ) : sets.length > 0 ? (
          <>
            <ScoreLine
              sets={sets}
              className="tabular text-[13px] whitespace-nowrap"
              style={{ color: "var(--ink-900)" }}
            />
            {stopped ? (
              // How a stopped match ended rides on its score.
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
        {entry.discipline === "doubles" ? (
          <span
            className="text-[11px] leading-none"
            style={{ color: "var(--ink-500)" }}
          >
            Score only
          </span>
        ) : played ? (
          <RowLifecycle
            analysis={{ status: played.status, providerId: null }}
            label={`line ${slot}`}
          />
        ) : (
          <EmptyMark label="No analysis" />
        )}
      </span>
    </EventRow>
  );
}

/**
 * One line in the drawer's "This dual" list: slot, our side abbreviated, the
 * score — or the outcome's words, never an invented score — and the mark.
 */
function DualContextRow({
  entry,
  current,
  onSelect,
}: {
  entry: EventEntry;
  current: boolean;
  onSelect: (id: string) => void;
}) {
  const result = resolveEntryResult(entry, null);
  const played = result.kind === "played" ? result.match : null;
  const state = resultState(result);
  const outcome =
    result.kind === "non-played" ? (LINE_STATUS[state] ?? null) : null;
  const sets = played ? scoreSetsFrom(played.score) : [];
  const name =
    entry.playerLabels.length === 0
      ? "No player"
      : entry.playerLabels.map((label) => drawerSideName(label)).join(" / ");

  return (
    <LineContextRow
      label={entry.slot ?? "—"}
      name={name}
      won={resultWon(result)}
      current={current}
      onSelect={() => onSelect(entry.id)}
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

/**
 * One 24px avatar per player. A doubles pair sits side by side 2px apart
 * (`Main.dc.html`), not overlapped: both partners stay readable at a glance.
 */
function PlayerAvatars({
  labels,
  userIds,
  viewer,
}: {
  labels: string[];
  userIds: string[];
  viewer: DualViewer | null;
}) {
  if (labels.length === 0) return null;
  return (
    <span className="flex shrink-0 gap-0.5">
      {labels.map((name, index) => {
        const isViewer =
          viewer !== null && viewer.ids.includes(userIds[index] ?? "");
        return (
          <PersonAvatar
            key={`${name}-${index}`}
            initials={isViewer ? viewer.initials : getInitials(name)}
            photoUrl={isViewer ? viewer.avatarUrl : null}
            className="size-6 text-[9px]"
          />
        );
      })}
    </span>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function ourLabel(entry: EventEntry): string {
  return entry.playerLabels.join(" / ");
}

/**
 * A group's entries in slot order, then any without a recognised slot, so no
 * line is ever dropped. A slot the lineup has no entry for is skipped — a
 * dual saves with all nine lines set.
 */
function bySlot(
  slots: readonly string[],
  entries: EventEntry[],
  discipline: EventEntry["discipline"],
): EventEntry[] {
  const group = entries.filter((entry) => entry.discipline === discipline);
  const map = new Map(group.map((entry) => [entry.slot, entry]));
  return [
    ...slots.flatMap((slot) => {
      const entry = map.get(slot);
      return entry ? [entry] : [];
    }),
    ...group.filter((entry) => !entry.slot || !slots.includes(entry.slot)),
  ];
}

function pillKeeps(pill: Pill, entry: EventEntry): boolean {
  if (pill === "singles") return entry.discipline === "singles";
  if (pill === "doubles") return entry.discipline === "doubles";
  if (pill === "needs-result") return !entryPlayed(entry);
  return true;
}

/** The Result filter's three answers — the same rule the group tallies use. */
function lineCut(entry: EventEntry): ResultCut {
  if (!entryPlayed(entry)) return "undecided";
  return lineWon(entry) === true ? "won" : "lost";
}

/** Lines won and lost in a group — played and not won is lost. */
function groupRecord(entries: EventEntry[]): { won: number; lost: number } {
  const won = entries.filter((entry) => lineWon(entry) === true).length;
  // Played AND not won — `lineWon` alone answers `false` for a court nobody
  // has played.
  const lost = entries.filter(
    (entry) => entryPlayed(entry) && lineWon(entry) !== true,
  ).length;
  return { won, lost };
}

/** "4–2" beside a group's heading. Always the whole group, never the cut. */
function tally(entries: EventEntry[]): string {
  const { won, lost } = groupRecord(entries);
  return `${won}–${lost}`;
}

/**
 * Who the ONE doubles point went to. Two of three courts takes it — the ITA
 * rule `dualScore` applies — and it is said beside the Doubles tally because
 * three courts do not add up to one point without it.
 */
function teamPointNote(entries: EventEntry[]): string | undefined {
  const { won, lost } = groupRecord(entries);
  if (won >= 2) return "point ours";
  if (lost >= 2) return "point theirs";
  return undefined;
}
