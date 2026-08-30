import { ChevronRight } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import {
  dualScore,
  entryPlayed,
  entryState,
  lineWon,
  matchState,
} from "@/lib/schedule/entry-state";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import {
  formatEventDay,
  formatEventSpanWithYear,
  siteTitle,
} from "@/lib/schedule/format";
import type {
  Discipline,
  EntryMatch,
  EventDetail,
  EventEntry,
} from "@/lib/schedule/types";

/**
 * 4c's right-hand pane -- one dual, as a widget.
 *
 * The compact, READ-ONLY sibling of `dual-detail.tsx`: team score, S/D line
 * indicators, one row per line, and a per-line path to each report. Score
 * entry and lineup edits stay on the `[eventId]` page; nothing here writes,
 * so nothing here asks who may edit.
 *
 * Every member of the program sees the same data -- the membership-only RLS
 * policy hands every member the program's matches.
 */
export function EventDetailPane({
  detail,
}: {
  detail: EventDetail;
}) {
  if (detail.event.kind === "tournament") {
    return <TournamentSummary detail={detail} />;
  }
  return <DualPane detail={detail} />;
}

/** Design 4c's row grid: slot . glyph . us . them . score . affordance . chevron. */
const COLUMNS =
  "grid-cols-[26px_14px_minmax(112px,1.2fr)_minmax(104px,1fr)_106px_128px_13px]";

function DualPane({
  detail,
}: {
  detail: EventDetail;
}) {
  const { event, entries } = detail;

  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");

  const score = dualScore(entries);
  const anyPlayed = score.us > 0 || score.them > 0;

  const played = entries.filter(entryPlayed).length;

  return (
    <div>
      <span className="eyebrow-sm">
        {formatEventDay(event.startsOn)} · {siteTitle(event.site)} ·{" "}
        {event.surface ?? "—"}
      </span>

      <div className="mt-1.5 flex items-end gap-5">
        <h2 className="text-title-lg min-w-0">vs {event.name}</h2>
        <div className="flex-1" />
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className="text-score"
            // ink-300 until a point is actually on the board -- a 0-0 in full
            // ink reads as a result rather than as an absence of one. Inline
            // style because the DS class is unlayered and owns the colour.
            style={{
              lineHeight: 1,
              color: anyPlayed ? undefined : "var(--ink-300)",
            }}
          >
            {score.us}–{score.them}
          </span>
          <div className="flex items-center gap-2.5">
            <DotStrip discipline="singles" entries={singles} />
            <span
              aria-hidden="true"
              className="h-2.5 w-px bg-[var(--border-medium)]"
            />
            <DotStrip discipline="doubles" entries={doubles} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col border-t border-[var(--border-hairline)]">
        <SectionHeading>Singles</SectionHeading>
        {singles.map((entry, index) => (
          <PaneRow
            key={entry.id}
            entry={entry}
            label={entry.slot ?? `S${index + 1}`}
          />
        ))}

        <SectionHeading>Doubles</SectionHeading>
        {doubles.map((entry, index) => (
          <PaneRow
            key={entry.id}
            entry={entry}
            label={entry.slot ?? `D${index + 1}`}
          />
        ))}
      </div>

      <div className="mt-3 flex items-baseline gap-4">
        {/* "matches", and a forfeited line counts among them — the author's
            ruling, kept here because a reviewer has already flagged it once and
            `dual-detail.tsx` argues the opposite for its own neighbouring
            figure ("'lines', not 'matches'"). The two are not in conflict:
            that one counts a card nobody has played yet, where "matches"
            would promise nine things to read; this one counts what is settled,
            and a forfeit settles a line as surely as a scoreline does. Do not
            "fix" this to "lines" without re-opening the ruling. */}
        <span className="text-micro">
          <span className="tabular">{played}</span> of{" "}
          <span className="tabular">{entries.length}</span> matches ·{" "}
          <span className="tabular">{singles.length}</span> singles,{" "}
          <span className="tabular">{doubles.length}</span> doubles
        </span>

        <div className="flex-1" />

        <RowAction
          href={`/dashboard/team/schedule/${event.id}`}
          ariaLabel={`View event vs ${event.name}`}
        >
          View event
        </RowAction>
      </div>
    </div>
  );
}

/**
 * One dot per line -- won, lost, or neutral while unplayed.
 *
 * `--success` / `--danger`, not the `--viz-*` ramp the frame draws with:
 * `colors.css` fences that ramp to charts, and this is chrome beside a score --
 * the `run-strip.tsx` precedent.
 */
function DotStrip({
  discipline,
  entries,
}: {
  discipline: Discipline;
  entries: EventEntry[];
}) {
  const outcomes = entries.map((entry) =>
    entryPlayed(entry) ? lineWon(entry) : null
  );
  const won = outcomes.filter((outcome) => outcome === true).length;
  const lost = outcomes.filter((outcome) => outcome === false).length;
  const unplayed = outcomes.length - won - lost;

  return (
    <div className="flex items-center gap-[5px]">
      <span className="eyebrow-sm" aria-hidden="true">
        {discipline === "singles" ? "S" : "D"}
      </span>
      <div
        role="img"
        aria-label={`${discipline === "singles" ? "Singles" : "Doubles"} lines: ${won} won, ${lost} lost, ${unplayed} unplayed`}
        className="flex items-center gap-[3px]"
      >
        {outcomes.map((outcome, index) => (
          <span
            key={index}
            className="h-3 w-[2.5px] rounded-[1px]"
            style={{
              background:
                outcome === null
                  ? "var(--ink-200)"
                  : outcome
                    ? "var(--success)"
                    : "var(--danger)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="eyebrow-sm pt-3.5 pb-1.5">{children}</h3>;
}

function PaneRow({
  entry,
  label,
}: {
  entry: EventEntry;
  /** 'S1'...'D3'. */
  label: string;
}) {
  const match = entry.matches[0] ?? null;
  // Word-for-word what `line-row.tsx` renders for the same line. The pane and
  // the event page draw one dual between them, and a forfeited line reading
  // "— no available player" on one screen and a bare em dash on the other is
  // the same row telling two stories.
  const ourLabel =
    entry.forfeit !== null && entry.playerLabels.length === 0
      ? "— no available player"
      : entry.playerLabels.join(" / ");
  const theirLabel =
    match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");
  const won = lineWon(entry, match);

  return (
    <div className={`grid ${COLUMNS} items-center gap-3 py-[11px]`}>
      <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
        {label}
      </span>

      <span>{won === null ? null : <ResultMark won={won} />}</span>

      <span
        className="min-w-0 truncate text-[13px] font-medium"
        style={{ color: "var(--ink-900)" }}
      >
        {ourLabel || "—"}
      </span>

      <span
        className="min-w-0 truncate text-[12px]"
        style={{ color: "var(--ink-600)" }}
      >
        vs {theirLabel || "—"}
      </span>

      <ScoreLine
        sets={match ? scoreSetsFrom(match.score) : []}
        className="text-scoreboard-sm tabular"
      />

      <span className="flex items-center">
        <Trailing
          entry={entry}
          match={match}
          slotLabel={label}
          ourLabel={ourLabel}
          theirLabel={theirLabel}
        />
      </span>

      <ChevronRight
        aria-hidden="true"
        className="h-[13px] w-[13px]"
        strokeWidth={1.5}
        style={{ color: "var(--ink-300)" }}
      />
    </div>
  );
}

/**
 * The row's trailing affordance, driven by the line's REAL state.
 *
 * The waiting states and their words come from `LINE_STATUS` -- the one answer
 * to what a state is called -- exactly as the event page and Team Home read
 * them. Nothing is invented for an unplayed line: this pane cannot write, so
 * it offers no "Add score" and no "Add video".
 */
function Trailing({
  entry,
  match,
  slotLabel,
  ourLabel,
  theirLabel,
}: {
  entry: EventEntry;
  match: EntryMatch | null;
  slotLabel: string;
  ourLabel: string;
  theirLabel: string;
}) {
  const state = match ? matchState(match) : entryState(entry);

  const status = LINE_STATUS[state];
  if (status) {
    return (
      <StatusChip tone={status.tone} live={status.live}>
        {status.label}
      </StatusChip>
    );
  }

  if (state === "ready" && match && entry.discipline === "singles") {
    return (
      <RowAction
        href={`/dashboard/matches/${match.id}`}
        ariaLabel={`View report for ${slotLabel}, ${ourLabel} vs ${theirLabel}`}
      >
        View report
      </RowAction>
    );
  }

  if (entry.discipline === "doubles" && entryPlayed(entry)) {
    return (
      <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
        Coming soon
      </span>
    );
  }

  return null;
}

/**
 * A tournament in the pane -- an honest compact summary, not the dual widget.
 */
function TournamentSummary({ detail }: { detail: EventDetail }) {
  const { event, entries } = detail;

  return (
    <div>
      <span className="eyebrow-sm">
        Tournament · {formatEventSpanWithYear(event.startsOn, event.endsOn)} ·{" "}
        {siteTitle(event.site)}
      </span>

      <h2 className="text-title-lg mt-1.5 min-w-0">{event.name}</h2>

      <p className="text-micro mt-3">
        <span className="tabular">{entries.length}</span>{" "}
        {entries.length === 1 ? "entry" : "entries"} · reads as runs on its own
        page
      </p>

      <div className="mt-4">
        <RowAction
          href={`/dashboard/team/schedule/${event.id}`}
          ariaLabel={`View tournament ${event.name}`}
        >
          View tournament
        </RowAction>
      </div>
    </div>
  );
}
