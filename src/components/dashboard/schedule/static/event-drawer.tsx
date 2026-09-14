"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusChip } from "@/components/ui/status-chip";
import {
  ChromeTooltip,
  CHROME_TOOLTIP_DELAY_MS,
} from "@/components/dashboard/shared/chrome-tooltip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { DualTicks } from "@/components/dashboard/schedule/dual-ticks";
import { EventGlyphRow } from "@/components/dashboard/schedule/event-glyph-row";
import { EventMark } from "@/components/dashboard/schedule/static/event-mark";
import { EventActionsMenu } from "@/components/dashboard/schedule/static/event-actions-menu";
import { advButton } from "@/lib/ui/adv-button";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import {
  dualScore,
  entryPlayed,
  lineWon,
  resolveEntryResult,
  resultState,
  resultWon,
} from "@/lib/schedule/entry-state";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import { roundRank } from "@/lib/schedule/format";
import { cn } from "@/lib/utils";
import type { OpponentProgram } from "@/lib/data/schedule-server";
import type { EntryMatch, EventDetail, EventEntry } from "@/lib/schedule/types";
import type { ScheduleCapabilities } from "@/lib/workspace/types";

/** The drawer's `role="dialog"` carries this so the window key handler can tell it from a modal. */
export const DRAWER_ATTR = "data-schedule-drawer";

/** The header's 28px square control — chevrons and the close. The roster's, verbatim. */
const ICON_BUTTON =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40";

/**
 * `Tc2` — the selected event's detail, as a dismissable right rail.
 *
 * Same shell as the Roster's drawer: 340px, the float shadow, a 44px header
 * with ‹ › event stepping, "Event n / N", the staff-only overflow menu, and
 * a close that also answers Esc. Body, top to bottom: program
 * mark and conference; one nowrap glyph row — date, venue, court surface; the
 * score row, where the nine ticks ARE the score (singles, then doubles) with
 * the figures confirming at the left, winner's number in ink-900; then every
 * line — played lines with their score, a line awaiting its result, a line
 * our side forfeited for want of a player; and "Enter results" full width while lines are
 * still open, stacked under the roster's full-width ghost "Open dual" or
 * "Open tournament", which every viewer gets. A player has no write menu.
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
 * entry — its latest recorded round in the slot column, with either the played
 * score or the saved non-played kind/side beside the name. The score row is a
 * dual's and is not drawn.
 *
 * ── Nothing here fetches ───────────────────────────────────────────────────
 * It renders the `EventDetail` the page already holds, so stepping through
 * the season with ‹ › is a state change and no round trip.
 *
 * ── Opening and closing (20f) ───────────────────────────────────────────────
 * The same shell as the roster's player drawer, and the same motion: the rail
 * slides in from the right edge over 200ms on `--ease-primary` and the table
 * reflows to the remaining width. It is the WIDTH that animates
 * (`roster-drawer-in` / `-out` in globals.css, shared with the roster) rather
 * than a transform: the reflow is the point, and a transform would slide a
 * panel over a table that had already jumped. The panel inside is a fixed
 * 340px, left-anchored, so what shows during the slide is its left edge
 * arriving.
 *
 * CSS, not Framer, and the resting class is `w-[340px]`: if the animation
 * never runs — reduced motion, a paused frame loop, a script that failed — the
 * rail is simply there at full width. The first cut animated an inline width
 * from 0 with Framer, and in exactly those conditions it stayed at 0 and the
 * rail never appeared.
 *
 * Closing is the reverse animation; `onClosed` fires when it ends and the page
 * unmounts this. Under reduced motion the animation is dropped and the page's
 * timeout does the unmounting.
 *
 * ── Sticky ─────────────────────────────────────────────────────────────────
 * The frame draws the rail filling the height beside the page. In the app the
 * page scrolls under a 44px sticky header, so the rail is `sticky` at
 * `top: 44px` with the viewport's remaining height — a long season scrolls
 * and the rail stays put, exactly as a fixed column would in the frame.
 *
 * ── Stepping ───────────────────────────────────────────────────────────────
 * ‹ › and ↑ ↓ walk the list on screen; the header holds still and the body
 * re-renders in place. Clicking the selected row again closes the rail.
 */
export function EventDrawer({
  detail,
  opponent,
  index,
  total,
  onStep,
  onClose,
  closing,
  autoFocus,
  onClosed,
  onDeleted,
  capabilities,
}: {
  detail: EventDetail;
  /** The opponent's program record, where the dual resolved one. */
  opponent: OpponentProgram | null;
  /** Position within the list on screen — "2 / 8" counts what the filters left. */
  index: number;
  total: number;
  onStep: (delta: -1 | 1) => void;
  onClose: () => void;
  /** Playing the slide-out; `onClosed` fires when it finishes. */
  closing: boolean;
  /** Opened from the keyboard — take focus so `Tab` continues inside. */
  autoFocus: boolean;
  onClosed: () => void;
  /** Remove the successful server deletion from selection and the visible list. */
  onDeleted: () => void;
  /** Named Schedule actions, derived once from the active workspace. */
  capabilities: ScheduleCapabilities;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { event, entries } = detail;
  const isDual = event.kind === "dual";
  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");
  const eventHref = `/dashboard/team/schedule/${event.id}`;

  // "While lines are open": a line with neither a decided played score nor a
  // non-played outcome. `entryPlayed` is the shared answer, so recording the
  // new outcome row closes a dual just as a legacy forfeit did, and clearing
  // it opens the line again. A tournament stays open — rounds get added as
  // they are played.
  // Has anything on this event been decided — a played score or a recorded
  // outcome? Nothing yet is the empty state, not a board of blanks.
  const anyDecided = entries.some((entry) => entryPlayed(entry));

  const linesOpen = isDual
    ? entries.some((entry) => !entryPlayed(entry))
    : true;

  const subline = isDual ? (opponent?.conference ?? null) : event.host;
  // The roster's footer: the ghost "open" link for every viewer, with the
  // primary stacked under it only while there is something to score.
  const canEnterResults = capabilities.canScore && linesOpen;

  useEffect(() => {
    if (autoFocus) panelRef.current?.focus({ preventScroll: true });
  }, [autoFocus, event.id]);

  return (
    <aside
      {...{ [DRAWER_ATTR]: "" }}
      onAnimationEnd={(animation) => {
        if (animation.animationName === "roster-drawer-out") onClosed();
      }}
      className={cn(
        "sticky top-11 z-[2] h-[calc(100vh-44px)] shrink-0 self-start overflow-hidden border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-dropdown)] motion-reduce:animate-none",
        closing
          ? "w-0 animate-[roster-drawer-out_200ms_var(--ease-primary)_both]"
          : "w-[340px] animate-[roster-drawer-in_200ms_var(--ease-primary)_both]",
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label={isDual ? `vs ${event.name}` : event.name}
        tabIndex={-1}
        className="flex h-full w-[340px] flex-col outline-none"
      >
        {/* 44px, inset 20px — the page header's own height and inset, so the
            two rules line up across the border. One provider over the
            cluster, as the app header does, so moving between the controls
            pays the reveal delay once. */}
        <TooltipProvider delayDuration={CHROME_TOOLTIP_DELAY_MS}>
          <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--border-hairline)] px-5">
            <ChromeTooltip label="Previous event" shortcut="↑">
              <button
                type="button"
                aria-label="Previous event"
                disabled={index <= 0}
                onClick={() => onStep(-1)}
                className={ICON_BUTTON}
              >
                <ChevronUp
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </ChromeTooltip>
            <ChromeTooltip label="Next event" shortcut="↓">
              <button
                type="button"
                aria-label="Next event"
                disabled={index >= total - 1}
                onClick={() => onStep(1)}
                className={ICON_BUTTON}
              >
                <ChevronDown
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </ChromeTooltip>

            <span className="ml-1 inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[12px]" style={{ color: "var(--ink-600)" }}>
                Event
              </span>
              <span
                className="mono tabular text-[11px]"
                style={{ color: "var(--ink-400)" }}
              >
                {index + 1} / {total}
              </span>
            </span>

            <div className="min-w-2 flex-1" />

            {capabilities.canEdit ? (
              <EventActionsMenu
                eventId={event.id}
                eventName={event.name}
                canDelete={capabilities.canDelete}
                onDeleted={onDeleted}
              />
            ) : null}

            <span
              aria-hidden="true"
              className="mx-0.5 h-3.5 w-px bg-[var(--border-medium)]"
            />

            <ChromeTooltip label="Close" shortcut="Esc">
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className={ICON_BUTTON}
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </ChromeTooltip>
          </div>
        </TooltipProvider>

        <div
          data-schedule-drawer-body=""
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6",
            "pb-4",
          )}
        >
          <div className="flex shrink-0 items-center gap-3.5">
            <EventMark kind={event.kind} name={event.name} size={48} />
            <div className="flex min-w-0 flex-col gap-1">
              {/* Two-line wrap: the drawer is 340px, so a long name wraps
                  instead of truncating, and the panel scrolls to fit. */}
              <div className="text-title-lg line-clamp-2 break-words">
                {event.name}
              </div>
              {subline ? (
                <span
                  className="truncate text-[12px]"
                  style={{ color: "var(--ink-600)" }}
                >
                  {subline}
                </span>
              ) : null}
            </div>
          </div>

          <EventGlyphRow event={event} className="-mt-2.5" />

          {/* Always drawn for a dual: nine slots, ghosts until decided, so
              the board's size reads before any line is played. */}
          {isDual ? <ScoreRow singles={singles} doubles={doubles} /> : null}
          {isDual ? (
            <>
              {/* A dual is saved with all nine lines set, so both groups are
                  always drawn — there is no half-built lineup to explain. */}
              <Section label="Singles">
                {singles.map((entry) => (
                  <DualLine key={entry.id} entry={entry} />
                ))}
              </Section>
              <Section label="Doubles">
                {doubles.map((entry) => (
                  <DualLine key={entry.id} entry={entry} />
                ))}
              </Section>
            </>
          ) : (
            <>
              {entries.length === 0 ? (
                <Section label="Entries">
                  <EmptyNote>
                    No entries yet. Each player&apos;s latest round appears here
                    once they are entered.
                  </EmptyNote>
                </Section>
              ) : !anyDecided ? (
                <EmptyNote>
                  No results yet. Each entry&apos;s latest round appears here
                  once one is played.
                </EmptyNote>
              ) : null}
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
            </>
          )}
        </div>

        <div
          data-schedule-drawer-footer=""
          className="flex shrink-0 flex-col gap-3 bg-[var(--surface-card)] px-[22px] pb-[22px]"
        >
          <Link
            href={eventHref}
            className={cn(advButton("ghost", "md"), "w-full")}
          >
            {isDual ? "Open dual" : "Open tournament"}
          </Link>
          {canEnterResults ? (
            // Straight into the score flow — the one place results are
            // written. The page sends anyone who may not score back to the
            // event, so this needs no second gate of its own.
            <Link
              href={`${eventHref}/score`}
              className={cn(advButton("primary", "md"), "w-full")}
            >
              Enter results
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

/**
 * The score row — figures at the left, the nine ticks at the right.
 *
 * Every tick and the two figures come off `lineWon()` / `dualScore()`, the
 * same answers the rows below draw, so the rail and the lines cannot disagree
 * about one court. A forfeit is a decided line and takes a colour; an
 * undecided or missing line is a Form Ticks ghost. The winner's figure sits in
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
      <span className="tabular text-[28px] leading-none font-light tracking-[-0.4px] whitespace-nowrap">
        <span style={{ color: usColor }}>{score.us}</span>
        <span className="mx-[3px]" style={{ color: "var(--ink-300)" }}>
          –
        </span>
        <span style={{ color: themColor }}>{score.them}</span>
      </span>
      <DualTicks singles={singles} doubles={doubles} />
    </div>
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
  "outline-none focus-visible:shadow-[var(--focus-ring)]",
);

/**
 * One line of a dual, in the state the data puts it in:
 *
 *   played      → score, outcome glyph, chevron; the row opens the match page
 *   awaiting    → players named, no result yet: "Awaiting result"
 *   non-played  → kind chip + side-derived result glyph, with no report link
 *   no player   → a forfeit our side recorded in the lineup: non-played, above
 *
 * Names join with the artboard's middle dot — "Lee · Chen" — rather than the
 * event page's slash. It is a drawn separator; the page's is the other one.
 */
function DualLine({ entry }: { entry: EventEntry }) {
  const name = entry.playerLabels.join(" · ");
  const result = resolveEntryResult(entry, null);

  if (result.kind === "non-played") {
    return <OutcomeLine slot={entry.slot} name={name} result={result} />;
  }

  if (result.kind === "played") {
    return (
      <PlayedLine
        slot={entry.slot}
        name={name}
        entry={entry}
        match={result.match}
      />
    );
  }

  return (
    <div className={ROW}>
      <Slot>{entry.slot}</Slot>
      <span
        className="truncate text-[12px]"
        style={{ color: "var(--ink-700)" }}
      >
        {name}
      </span>
      <AwaitingResult />
    </div>
  );
}

/**
 * One tournament entry: its latest recorded round in the slot column, whether
 * that result is a played match or a schedule-only outcome. An entry with no
 * result yet is awaiting its first one.
 */
function TournamentLine({ entry }: { entry: EventEntry }) {
  const latest = latestTournamentResult(entry);
  const name = entry.playerLabels.join(" · ");

  if (!latest) {
    return (
      <div className={ROW}>
        <Slot>—</Slot>
        <span
          className="truncate text-[12px]"
          style={{ color: "var(--ink-700)" }}
        >
          {name || "—"}
        </span>
        <AwaitingResult />
      </div>
    );
  }

  const result = resolveEntryResult(entry, latest.round);
  if (result.kind === "non-played") {
    return (
      <OutcomeLine slot={latest.round ?? "—"} name={name} result={result} />
    );
  }
  if (result.kind === "played") {
    return (
      <PlayedLine
        slot={latest.round ?? "—"}
        name={name}
        entry={entry}
        match={result.match}
      />
    );
  }

  // The candidate list and the shared resolver read the same entry. This is
  // only a defensive fallback for malformed input that changes between them.
  return null;
}

/**
 * The last result in the tournament ladder, not merely the last match row.
 * Outcomes seed rounds that have no `matches` record; a match seeds first at a
 * conflicting round so the row keeps its opponent context, while
 * `resolveEntryResult` still gives the schedule outcome presentation
 * precedence. This is the drawer-sized counterpart to the full detail page's
 * round grouping, using the same shared `roundRank` order.
 */
function latestTournamentResult(
  entry: EventEntry,
): { round: string | null; order: number } | null {
  const rows = entry.matches.map((match, index) => ({
    round: match.round,
    order: index,
  }));

  for (const outcome of entry.outcomes ?? []) {
    if (rows.some((row) => row.round === outcome.round)) continue;
    rows.push({ round: outcome.round, order: rows.length });
  }

  rows.sort(
    (a, b) => roundRank(a.round) - roundRank(b.round) || a.order - b.order,
  );
  return rows.at(-1) ?? null;
}

/** A decided result without a played match: kind in words, side in the mark. */
function OutcomeLine({
  slot,
  name,
  result,
}: {
  slot: string | null;
  name: string;
  result: Extract<
    ReturnType<typeof resolveEntryResult>,
    { kind: "non-played" }
  >;
}) {
  const state = resultState(result);
  const status = LINE_STATUS[state]!;
  const won = resultWon(result);

  return (
    <div className={ROW}>
      <Slot>{slot}</Slot>
      <span
        className="truncate text-[12px]"
        style={{ color: "var(--ink-900)" }}
      >
        {name || "—"}
      </span>
      <StatusChip tone={status.tone} className="justify-self-end">
        {status.label}
      </StatusChip>
      {won === null ? <span /> : <ResultMark won={won} />}
      <span />
    </div>
  );
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
      <span
        className="truncate text-[12px]"
        style={{ color: "var(--ink-900)" }}
      >
        {name || "—"}
      </span>
      <ScoreLine
        sets={scoreSetsFrom(match.score)}
        className="tabular text-right text-[11px]"
        style={{ color: "var(--ink-600)" }}
      />
      {won === null ? <span /> : <ResultMark won={won} />}
      <ChevronRight
        className="size-3"
        strokeWidth={1.5}
        style={{ color: "var(--ink-300)" }}
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * A line with players named and no result yet, as the roster's recent-match
 * row draws an unrecorded result: "No result" where the score lands, an en
 * dash where the mark lands, and no chevron — there is no match to open.
 */
function AwaitingResult() {
  return (
    <>
      <span
        className="text-right text-[11px]"
        style={{ color: "var(--ink-400)" }}
      >
        No result
      </span>
      {/* The roster's unrecorded-result mark: an en dash in the mark column. */}
      <span
        aria-hidden="true"
        className="text-center text-[11px]"
        style={{ color: "var(--ink-400)" }}
      >
        –
      </span>
      <span />
    </>
  );
}

/** The roster drawer's empty sentence: what will arrive, in one line. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="shrink-0 text-[12px] leading-[1.6] text-[var(--ink-500)]">
      {children}
    </p>
  );
}

function Slot({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[11px]" style={{ color: "var(--ink-500)" }}>
      {children}
    </span>
  );
}
