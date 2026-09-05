"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusChip } from "@/components/ui/status-chip";
import {
  ChromeTooltip,
  CHROME_TOOLTIP_DELAY_MS,
} from "@/components/dashboard/shared/chrome-tooltip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { EventMark } from "@/components/dashboard/schedule/static/event-mark";
import { advButton } from "@/lib/ui/adv-button";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import { dualScore, lineWon, matchWon } from "@/lib/schedule/entry-state";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import {
  formatEventDatesLong,
  siteTitle,
  surfaceTitle,
} from "@/lib/schedule/format";
import { cn } from "@/lib/utils";
import type { OpponentProgram } from "@/lib/data/schedule-server";
import type { EntryMatch, EventDetail, EventEntry } from "@/lib/schedule/types";

/**
 * `Tc2` — the selected event's detail, as a dismissable right rail.
 *
 * Same shell as the Roster's drawer: 340px, the float shadow, a 44px header
 * with ‹ › event stepping, "Event n / N", "Open event ↗" as the peek-to-page
 * bridge, and a close that also answers Esc. Body, top to bottom: program
 * mark and conference; one nowrap glyph row — date, venue, court surface; the
 * score row, where the nine ticks ARE the score (singles, then doubles) with
 * the figures confirming at the left, winner's number in ink-900; then every
 * line — played lines with their score, a line awaiting its result, an unset
 * line as a blue "+ Set line"; and "Enter results" full width while lines are
 * still open.
 *
 * ── Row-click law, the other half ──────────────────────────────────────────
 * Lineup lines GAIN the chevron the event rows lost: each is a match and opens
 * the match page. A line without a match yet has nowhere to go and draws
 * none. Upload is never event-level — video attaches to a line — so nothing
 * here offers it.
 *
 * ── A tournament, which the artboard does not draw ─────────────────────────
 * The legend gives the tournament its mark (the DS glyph, "no program to
 * show") and nothing more. The body keeps the dual's shape: the host under
 * the name where the conference would be, the same glyph row, and one row per
 * entry — its last round in the slot column, the last match's score and
 * outcome beside the name. The score row is a dual's and is not drawn.
 *
 * ── Nothing here fetches ───────────────────────────────────────────────────
 * It renders the `EventDetail` the page already holds, so stepping through
 * the season with ‹ › is a state change and no round trip.
 */
export function EventDrawer({
  detail,
  opponent,
  index,
  total,
  onStep,
  onClose,
  canEdit,
}: {
  detail: EventDetail;
  /** The opponent's program record, where the dual resolved one. */
  opponent: OpponentProgram | null;
  /** Position within the list on screen — "2 / 8" counts what the filters left. */
  index: number;
  total: number;
  onStep: (delta: -1 | 1) => void;
  onClose: () => void;
  /** `isProgramStaff` upstream — gates every write the rail points at. */
  canEdit: boolean;
}) {
  const { event, entries } = detail;
  const isDual = event.kind === "dual";
  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");
  const eventHref = `/dashboard/team/schedule/${event.id}`;

  // "While lines are open": a line that is neither forfeited nor decided. A
  // tournament stays open — rounds get added as they are played.
  const linesOpen = isDual
    ? entries.some(
        (entry) =>
          entry.forfeit === null &&
          !entry.matches.some((match) => matchWon(match) !== null)
      )
    : true;

  const subline = isDual ? (opponent?.conference ?? null) : event.host;
  // The pin names where the event is. A dual's host is its venue when the
  // builder recorded one; otherwise the side of the trip is all we know.
  const venue = isDual ? (event.host ?? siteTitle(event.site)) : siteTitle(event.site);

  return (
    <div
      role="dialog"
      aria-label={isDual ? `vs ${event.name}` : event.name}
      className="relative z-[2] flex w-[340px] shrink-0 flex-col self-stretch border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)]"
    >
      {/* One provider over the header's cluster, as the app header does, so
          moving between the four controls pays the reveal delay once. */}
      <TooltipProvider delayDuration={CHROME_TOOLTIP_DELAY_MS}>
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--border-hairline)] px-5">
          <RailButton
            label="Previous event"
            onClick={() => onStep(-1)}
            disabled={index <= 0}
          >
            <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </RailButton>
          <RailButton
            label="Next event"
            onClick={() => onStep(1)}
            disabled={index >= total - 1}
          >
            <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </RailButton>

          <span className="ml-1 inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[12px]" style={{ color: "var(--ink-600)" }}>
              Event
            </span>
            <span className="mono tabular text-[11px]" style={{ color: "var(--ink-400)" }}>
              {index + 1} / {total}
            </span>
          </span>

          <div className="min-w-2 flex-1" />

          {/* The doc's own anchor rule — blue at rest, ink-900 on hover — with
              the wash the artboard gives every 28px control in this bar. */}
          <Link
            href={eventHref}
            className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-element)] px-2 text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
          >
            Open event
            <ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
          </Link>

          <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]" />

          <ChromeTooltip label="Close" shortcut="Esc" side="bottom">
            <RailButton label="Close" onClick={onClose}>
              <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </RailButton>
          </ChromeTooltip>
        </div>
      </TooltipProvider>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pb-[22px] pt-6">
        <div className="flex shrink-0 items-center gap-3.5">
          <EventMark kind={event.kind} name={event.name} size={48} />
          <div className="flex min-w-0 flex-col gap-1">
            <div
              className="text-[22px] font-light leading-[1.1] tracking-[-0.2px]"
              style={{ color: "var(--ink-900)" }}
            >
              {event.name}
            </div>
            {subline ? (
              <span className="text-[12px]" style={{ color: "var(--ink-600)" }}>
                {subline}
              </span>
            ) : null}
          </div>
        </div>

        <div className="-mt-2.5 flex shrink-0 flex-nowrap items-center gap-3 overflow-hidden">
          <span className="text-micro inline-flex items-center gap-[5px] whitespace-nowrap">
            <Calendar className="size-3" strokeWidth={1.5} style={{ color: "var(--ink-400)" }} aria-hidden="true" />
            <span className="tabular">{formatEventDatesLong(event.startsOn, event.endsOn)}</span>
          </span>
          <span className="text-micro inline-flex items-center gap-[5px] whitespace-nowrap">
            <MapPin className="size-3" strokeWidth={1.5} style={{ color: "var(--ink-400)" }} aria-hidden="true" />
            {venue}
          </span>
          {event.surface ? (
            <span className="text-micro inline-flex items-center gap-[5px] whitespace-nowrap">
              {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG in /public */}
              <img
                src="/icons/tennis-court-icon.svg"
                alt=""
                className="block size-3 opacity-90"
              />
              {surfaceTitle(event.surface)}
            </span>
          ) : null}
        </div>

        {isDual ? <ScoreRow singles={singles} doubles={doubles} /> : null}

        {isDual ? (
          <>
            <Section label="Singles">
              {singles.map((entry) => (
                <DualLine key={entry.id} entry={entry} eventHref={eventHref} canEdit={canEdit} />
              ))}
              {/* A dual with no lines at all: one row where the lineup would
                  start, pointing at the event page — the same shape as an
                  unset line, one level up. */}
              {entries.length === 0 ? (
                <SetLineRow slot="S1" eventHref={eventHref} canEdit={canEdit} label="Set lineup" />
              ) : null}
            </Section>
            {doubles.length > 0 ? (
              <Section label="Doubles">
                {doubles.map((entry) => (
                  <DualLine key={entry.id} entry={entry} eventHref={eventHref} canEdit={canEdit} />
                ))}
              </Section>
            ) : null}
          </>
        ) : (
          <>
            {singles.length > 0 ? (
              <Section label="Singles">
                {singles.map((entry) => (
                  <TournamentLine key={entry.id} entry={entry} />
                ))}
              </Section>
            ) : null}
            {doubles.length > 0 ? (
              <Section label="Doubles">
                {doubles.map((entry) => (
                  <TournamentLine key={entry.id} entry={entry} />
                ))}
              </Section>
            ) : null}
            {entries.length === 0 ? (
              <Section label="Entries">
                <div className={cn(ROW, "cursor-default")}>
                  <span className="mono text-[11px]" style={{ color: "var(--ink-500)" }}>
                    —
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--ink-700)" }}>
                    No entries yet
                  </span>
                </div>
              </Section>
            ) : null}
          </>
        )}

        <div className="min-h-0 flex-1" />

        {canEdit && linesOpen ? (
          <Link href={eventHref} className={cn(advButton("primary", "md"), "w-full shrink-0")}>
            Enter results
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** The header's 28px square control — chevrons and the close. */
function RailButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-element)] outline-none",
        "transition-colors duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)]",
        disabled ? "cursor-default" : "cursor-pointer hover:bg-[var(--surface-subtle)]"
      )}
      style={{ color: disabled ? "var(--ink-300)" : "var(--ink-500)" }}
    >
      {children}
    </button>
  );
}

/**
 * The score row — figures at the left, the nine ticks at the right.
 *
 * Every tick and the two figures come off `lineWon()` / `dualScore()`, the
 * same answers the rows below draw, so the rail and the lines cannot disagree
 * about one court. A forfeit is a decided line and takes a colour; an
 * undecided one keeps the artboard's grey. The winner's figure sits in
 * ink-900 and the other in ink-500; before anything is on the board both are
 * ink-300, because a 0–0 in full ink reads as a result.
 */
function ScoreRow({
  singles,
  doubles,
}: {
  singles: EventEntry[];
  doubles: EventEntry[];
}) {
  const score = dualScore([...singles, ...doubles]);
  const nothingYet = score.us === 0 && score.them === 0;
  const usColor = nothingYet
    ? "var(--ink-300)"
    : score.us >= score.them
      ? "var(--ink-900)"
      : "var(--ink-500)";
  const themColor = nothingYet
    ? "var(--ink-300)"
    : score.them > score.us
      ? "var(--ink-900)"
      : "var(--ink-500)";

  return (
    <div className="flex shrink-0 items-center justify-between gap-3.5 border-y border-[var(--border-hairline)] py-3.5">
      <span className="tabular whitespace-nowrap text-[28px] font-light leading-none tracking-[-0.4px]">
        <span style={{ color: usColor }}>{score.us}</span>
        <span className="mx-[3px]" style={{ color: "var(--ink-300)" }}>
          –
        </span>
        <span style={{ color: themColor }}>{score.them}</span>
      </span>
      <div className="flex items-center gap-1" aria-hidden="true">
        {singles.map((entry) => (
          <Tick key={entry.id} entry={entry} />
        ))}
        {singles.length > 0 && doubles.length > 0 ? <span className="w-2" /> : null}
        {doubles.map((entry) => (
          <Tick key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function Tick({ entry }: { entry: EventEntry }) {
  const won = lineWon(entry, entry.matches[0] ?? null);
  return (
    <span
      className="h-[18px] w-1 rounded-[1.5px]"
      style={{
        background:
          won === null
            ? "var(--ink-300)"
            : won
              ? "var(--success)"
              : "var(--danger)",
      }}
    />
  );
}

/** "Singles" / "Doubles" — the eyebrow and the 2px-gapped rows under it. */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <div className="flex items-center pb-1.5">
        <span className="eyebrow-sm flex-1">{label}</span>
      </div>
      {children}
    </div>
  );
}

/** The artboard's line grid: slot · name · score · outcome · chevron. */
const ROW =
  "-mx-2 grid h-9 grid-cols-[30px_minmax(0,1fr)_66px_14px_12px] items-center gap-2.5 rounded-[var(--radius-element)] px-2";

const ROW_LINK = cn(
  ROW,
  "cursor-pointer transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]",
  "outline-none focus-visible:shadow-[var(--focus-ring)]"
);

/**
 * One line of a dual, in the state the data puts it in:
 *
 *   played      → score, outcome glyph, chevron; the row opens the match page
 *   awaiting    → players named, no match yet: "Awaiting result"
 *   forfeited   → the shared vocabulary's chip, spanning the score columns
 *   unset       → nobody named: the blue "+ Set line", pointing at the event
 *
 * Names join with the artboard's middle dot — "Lee · Chen" — rather than the
 * event page's slash. It is a drawn separator; the page's is the other one.
 */
function DualLine({
  entry,
  eventHref,
  canEdit,
}: {
  entry: EventEntry;
  eventHref: string;
  canEdit: boolean;
}) {
  const match = entry.matches[0] ?? null;
  const name = entry.playerLabels.join(" · ");

  if (entry.forfeit !== null) {
    const status = LINE_STATUS.forfeited!;
    return (
      <div className={ROW}>
        <Slot>{entry.slot}</Slot>
        <span className="truncate text-[12px]" style={{ color: "var(--ink-700)" }}>
          {name || "—"}
        </span>
        <StatusChip tone={status.tone} className="col-span-3 justify-self-end">
          {status.label}
        </StatusChip>
      </div>
    );
  }

  if (match) {
    return <PlayedLine slot={entry.slot} name={name} entry={entry} match={match} />;
  }

  if (entry.playerLabels.length === 0) {
    return (
      <SetLineRow slot={entry.slot} eventHref={eventHref} canEdit={canEdit} label="Set line" />
    );
  }

  return (
    <div className={ROW}>
      <Slot>{entry.slot}</Slot>
      <span className="truncate text-[12px]" style={{ color: "var(--ink-700)" }}>
        {name}
      </span>
      <span
        className="text-micro col-span-3 whitespace-nowrap text-right"
        style={{ color: "var(--ink-600)" }}
      >
        <span className="mr-1.5 inline-block size-[5px] rounded-full bg-[var(--ink-300)]" />
        Awaiting result
      </span>
    </div>
  );
}

/**
 * One tournament entry: its last round in the slot column, the last match's
 * score and outcome beside the name. An entry with no match yet is awaiting
 * its first result.
 */
function TournamentLine({ entry }: { entry: EventEntry }) {
  const last = entry.matches[entry.matches.length - 1] ?? null;
  const name = entry.playerLabels.join(" · ");

  if (!last) {
    return (
      <div className={ROW}>
        <Slot>—</Slot>
        <span className="truncate text-[12px]" style={{ color: "var(--ink-700)" }}>
          {name || "—"}
        </span>
        <span
          className="text-micro col-span-3 whitespace-nowrap text-right"
          style={{ color: "var(--ink-600)" }}
        >
          <span className="mr-1.5 inline-block size-[5px] rounded-full bg-[var(--ink-300)]" />
          Awaiting result
        </span>
      </div>
    );
  }

  return <PlayedLine slot={last.round ?? "—"} name={name} entry={entry} match={last} />;
}

/** A line with a match under it — the one row shape that opens somewhere. */
function PlayedLine({
  slot,
  name,
  entry,
  match,
}: {
  slot: string | null;
  name: string;
  entry: EventEntry;
  match: EntryMatch;
}) {
  const won = lineWon(entry, match);
  return (
    <Link href={`/dashboard/matches/${match.id}`} className={ROW_LINK}>
      <Slot>{slot}</Slot>
      <span className="truncate text-[12px]" style={{ color: "var(--ink-900)" }}>
        {name || "—"}
      </span>
      <ScoreLine
        sets={scoreSetsFrom(match.score)}
        className="tabular text-right text-[11px]"
        style={{ color: "var(--ink-600)" }}
      />
      {won === null ? <span /> : <ResultMark won={won} />}
      <ChevronRight className="size-3" strokeWidth={1.5} style={{ color: "var(--ink-300)" }} aria-hidden="true" />
    </Link>
  );
}

/**
 * "+ Set line" — the blue row for a slot nobody is named on. Points at the
 * event page, where the line is edited; a reader who cannot edit sees the
 * slot standing empty instead of an action they are not allowed to take.
 */
function SetLineRow({
  slot,
  eventHref,
  canEdit,
  label,
}: {
  slot: string | null;
  eventHref: string;
  canEdit: boolean;
  label: string;
}) {
  const notSet = (
    <span
      className="text-micro col-span-3 whitespace-nowrap text-right"
      style={{ color: "var(--ink-400)" }}
    >
      Not set
    </span>
  );

  if (!canEdit) {
    return (
      <div className={ROW}>
        <Slot>{slot}</Slot>
        <span className="text-[12px]" style={{ color: "var(--ink-700)" }}>
          —
        </span>
        {notSet}
      </div>
    );
  }

  return (
    <Link href={eventHref} className={ROW_LINK}>
      <Slot>{slot}</Slot>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--blue)" }}>
        <Plus className="size-3" strokeWidth={1.5} aria-hidden="true" />
        {label}
      </span>
      {notSet}
    </Link>
  );
}

function Slot({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[11px]" style={{ color: "var(--ink-500)" }}>
      {children}
    </span>
  );
}
