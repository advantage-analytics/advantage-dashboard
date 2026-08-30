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
  matchState,
  matchWon,
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
import type { ResultsScope } from "@/lib/data/results-visibility";
import {
  RESULTS_WITHHELD_LABEL,
  RESULTS_WITHHELD_SENTENCE,
} from "@/components/dashboard/team/roster-vocabulary";

/**
 * 4c's right-hand pane — one dual, as a widget.
 *
 * The compact, READ-ONLY sibling of `dual-detail.tsx`: team score, S/D line
 * indicators, one row per line, and a per-line path to each report. Score
 * entry and lineup edits stay on the `[eventId]` page; nothing here writes,
 * so nothing here asks who may edit.
 *
 * ── The scope gate ───────────────────────────────────────────────────────────
 * `scope` is `resultsScope()`'s answer for this viewer and this program
 * (`lib/data/results-visibility.ts`). Under a narrowed read a player receives
 * every LINE of a dual but at most their own MATCH, and nothing in the data
 * says the other eight results exist. The gate therefore splits by what a
 * number claims to be about:
 *
 * - The AGGREGATES — team score and dot strips — are withheld wholesale.
 *   `dualScore` over the surviving subset is a confident, wrong, low score,
 *   and a dot strip over it is the same wrong claim drawn six times; the pane
 *   says why with the Roster page's sentence instead. No partial team score
 *   is ever rendered.
 * - Each LINE's result is per-entry, `dual-sheet.tsx`'s `readable` rule: a
 *   match in hand is a match RLS let this viewer read — their own — so its
 *   glyph, score and report link still render. A line whose match did NOT
 *   come back withholds all three together and says "Coaches only", never
 *   "not played": under this read an empty line is a fact about the reader,
 *   not about the court.
 *
 * ── Doubles rows end in "Coming soon" ────────────────────────────────────────
 * Deliberately NOT `line-row.tsx`'s behaviour, which links a ready doubles
 * match to `/dashboard/matches/{id}`. There is no doubles aggregation yet, so
 * that report opens on nothing a doubles line can use — this pane promises the
 * report later instead of linking to an empty one now. The event page keeps
 * its own affordances because it can also WRITE; this pane cannot.
 */
export function EventDetailPane({
  detail,
  scope,
}: {
  detail: EventDetail;
  scope: ResultsScope;
}) {
  if (detail.event.kind === "tournament") {
    return <TournamentSummary detail={detail} />;
  }
  return <DualPane detail={detail} scope={scope} />;
}

/** Design 4c's row grid: slot · glyph · us · them · score · affordance · chevron. */
const COLUMNS =
  "grid-cols-[26px_14px_minmax(112px,1.2fr)_minmax(104px,1fr)_106px_128px_13px]";

function DualPane({
  detail,
  scope,
}: {
  detail: EventDetail;
  scope: ResultsScope;
}) {
  const { event, entries } = detail;

  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");

  // Withheld outright under a narrowed read rather than computed over the one
  // line that came back — see the doc comment above and `dualScore`'s own
  // warning in `lib/schedule/entry-state.ts`.
  const score = scope === "program" ? dualScore(entries) : null;
  const anyPlayed = score !== null && (score.us > 0 || score.them > 0);

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
        {score ? (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className="text-score"
              // ink-300 until a point is actually on the board — a 0–0 in full
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
        ) : (
          // The Roster page's sentence, word for word — one flag, one
          // explanation, wherever a program surface withholds rather than
          // reports. Same substitution `dual-detail.tsx` makes in its hero.
          <p className="text-micro max-w-[24ch] shrink-0 text-right">
            {RESULTS_WITHHELD_SENTENCE}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col border-t border-[var(--border-hairline)]">
        <SectionHeading>Singles</SectionHeading>
        {singles.map((entry, index) => (
          <PaneRow
            key={entry.id}
            entry={entry}
            label={entry.slot ?? `S${index + 1}`}
            scope={scope}
          />
        ))}

        <SectionHeading>Doubles</SectionHeading>
        {doubles.map((entry, index) => (
          <PaneRow
            key={entry.id}
            entry={entry}
            label={entry.slot ?? `D${index + 1}`}
            scope={scope}
          />
        ))}
      </div>

      {/* The played count is gated under `scope === "program"`, matching
          `dualTally` in `team-home-server.ts`: under a narrowed read the
          viewer sees at most their own match, so `played` would silently
          undercount and read as "only 1 of 9 finished" when 8 really did.
          The totals — entry count and discipline split — are structural
          facts from `program_event_entries`, visible to any member. */}
      <div className="mt-3 flex items-baseline gap-4">
        <span className="text-micro">
          {scope === "program" && (
            <>
              <span className="tabular">{played}</span> of{" "}
            </>
          )}
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
 * One dot per line — won, lost, or neutral while unplayed.
 *
 * `--success` / `--danger`, not the `--viz-*` ramp the frame draws with:
 * `colors.css` fences that ramp to charts, and this is chrome beside a score —
 * the `run-strip.tsx` precedent. Only ever rendered beside a computed team
 * score, so it inherits the scope gate rather than re-asking it.
 */
function DotStrip({
  discipline,
  entries,
}: {
  discipline: Discipline;
  entries: EventEntry[];
}) {
  // Same per-line claim as `dual-detail.tsx`'s countGroup: a line is green if
  // any of its matches was won, red if played and not won, neutral otherwise.
  const outcomes = entries.map((entry) =>
    entryPlayed(entry)
      ? entry.matches.some((match) => matchWon(match) === true)
      : null
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
  // h3, not a div: the pane's title is an h2, and Singles/Doubles are its two
  // sections — same outline reasoning as `dual-detail.tsx`'s headings.
  return <h3 className="eyebrow-sm pt-3.5 pb-1.5">{children}</h3>;
}

function PaneRow({
  entry,
  label,
  scope,
}: {
  entry: EventEntry;
  /** 'S1'…'D3'. */
  label: string;
  scope: ResultsScope;
}) {
  const match = entry.matches[0] ?? null;
  const ourLabel = entry.playerLabels.join(" / ");
  const theirLabel =
    match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / ");
  // `team-home-server.ts`'s `DualSheetLine.readable`, verbatim: a match in
  // hand is a match RLS let this viewer read — their own line still shows its
  // result. False only under a narrowed read on a line whose match did not
  // come back, where "nobody played it" and "not ours to see" are the same
  // empty row. The lineup itself is member-visible (`program_event_entries`),
  // so the slot and the names render either way; the glyph, score and
  // trailing affordance are results and are withheld together — never a
  // subset of them.
  const readable = scope === "program" || match !== null;
  const won = readable && match ? matchWon(match) : null;

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

      {/* Always a span, even empty — `<ScoreLine>` makes the same promise for
          the same reason: returning null collapses the grid column. */}
      {readable ? (
        <ScoreLine
          sets={match ? scoreSetsFrom(match.score) : []}
          className="text-scoreboard-sm tabular"
        />
      ) : (
        <span />
      )}

      <span className="flex items-center">
        {readable ? (
          <Trailing
            entry={entry}
            match={match}
            slotLabel={label}
            ourLabel={ourLabel}
            theirLabel={theirLabel}
          />
        ) : (
          // Withheld, not absent: an empty cell here would read exactly like
          // the genuinely-unplayed row above it, which is the one claim this
          // read cannot make. `dual-sheet.tsx`'s word for the same state.
          <StatusChip>{RESULTS_WITHHELD_LABEL}</StatusChip>
        )}
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
 * The waiting states and their words come from `LINE_STATUS` — the one answer
 * to what a state is called — exactly as the event page and Team Home read
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
  // This row's own match where one exists — `line-row.tsx`'s lesson: asking
  // the entry hands a row the loudest answer among its matches. A dual line
  // has at most one, so the distinction only matters for the matchless row.
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

  // Every played doubles line — ready included — ends here: no doubles
  // aggregation exists yet, so a report link would open on nothing. See the
  // component doc comment; `line-row.tsx` is explicitly not the precedent.
  if (entry.discipline === "doubles" && entryPlayed(entry)) {
    return (
      <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
        Coming soon
      </span>
    );
  }

  // Played singles with nothing sent, or an unplayed line: nothing to read,
  // nothing invented.
  return null;
}

/**
 * A tournament in the pane — an honest compact summary, not the dual widget.
 *
 * A tournament has no team score to print (`dualScore` is ITA dual arithmetic
 * and nothing else), and its entries are runs, not courts — the `[eventId]`
 * page is where they read properly. So: name, dates, entry count, and the way
 * there. The entry count is entry-derived and member-visible, so it needs no
 * scope gate.
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
