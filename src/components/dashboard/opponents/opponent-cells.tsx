"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  UNKNOWN_OPPONENT_NAME,
  type PersonalOpponent,
} from "@/lib/data/personal-opponents";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { playedSets } from "@/lib/ui/score-format";
import { opponentMatchesHref } from "./opponent-drawer-shared";
import type { OpponentFormBar } from "./opponent-form-links";
import { opponentPlaysLabel } from "./opponent-style";

/**
 * The merged cells of the Opponents tables — the name, Plays, Record and Last
 * match — each one grid cell holding what the eight-column table spread over
 * two or three tracks.
 *
 * Shared, not private to either table: the team table draws them in its six
 * columns and the personal table in its four, and a cell drawn twice drifts
 * by a pixel within a week. Every absence is the one `EmptyMark`, on the same x as the column's
 * real values. No cell carries a `title`: clipped text truncates bare and the
 * drawer, one click away, states it in full (`reference/chrome.md`).
 *
 * The row peeks; the links inside it travel. Each stops its click at the link,
 * and each hugs its content, so the slack in a track still opens the drawer.
 * `prefetch={false}` because a table of these would prefetch up to seven pages
 * a row the moment it scrolled into view.
 */

/** How many ticks the Form strip holds — the grouping's own five-match window. */
export const OPPONENT_FORM_SLOTS = 5;

/**
 * Opponent — the name a reader scans for, ink at rest and blue on hover, the
 * way the name reads on Matches and Roster. It opens Matches searched for this
 * opponent, where the drawer's "View matches" goes: there is no opponent page.
 * A group nobody named has nothing to search for, so it stays plain text.
 */
export function OpponentNameCell({ name }: { name: string }) {
  if (name === UNKNOWN_OPPONENT_NAME) {
    return (
      <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
        {name}
      </span>
    );
  }
  return (
    <Link
      href={opponentMatchesHref(name)}
      prefetch={false}
      onClick={(event) => event.stopPropagation()}
      className="w-fit max-w-full min-w-0 truncate rounded-[var(--radius-cell)] text-[13px] font-medium text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
    >
      {name}
    </Link>
  );
}

/** Plays — "Right · Two-handed"; the noun is the header's, the cell qualifies. */
export function OpponentPlaysCell({
  hand,
  backhand,
}: Pick<PersonalOpponent, "hand" | "backhand">) {
  const plays = opponentPlaysLabel(hand, backhand);
  return (
    <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
      {plays ?? <EmptyMark label="Hand and backhand not recorded" />}
    </span>
  );
}

/**
 * Record — wins then losses, with the last five meetings beside the figure
 * they explain. An undecided meeting is in neither figure, which is why the
 * two need not sum to `played`. The figure holds a 26px floor so the ticks
 * start on one x down the column for any record up to "10-9".
 */
export function OpponentRecordCell({
  wins,
  losses,
  bars,
}: Pick<PersonalOpponent, "wins" | "losses"> & {
  bars: readonly OpponentFormBar[];
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="tabular min-w-[26px] text-[13px] whitespace-nowrap text-[var(--ink-900)]">
        <span aria-hidden="true">
          {wins}-{losses}
        </span>
        <span className="sr-only">
          {wins} won, {losses} lost
        </span>
      </span>
      <OpponentFormStrip bars={bars} />
    </span>
  );
}

const BAR = "w-[2.5px] rounded-[1px]";
const BAR_SLOT = "flex h-7 w-[5.5px] items-center justify-center";

function barColor(result: OpponentFormBar["result"]): string {
  if (result === "win") return "var(--viz-good)";
  if (result === "loss") return "var(--viz-bad)";
  return "var(--ink-300)";
}

function barLabel(bar: OpponentFormBar): string {
  const outcome =
    bar.result === "win"
      ? "Won"
      : bar.result === "loss"
        ? "Lost"
        : "No result yet";
  const date = bar.match?.date
    ? formatMatchDayShortYear(bar.match.date)
    : "no date";
  return `${outcome}, ${date}`;
}

/**
 * `FormTicks`' strip with each bar a link to its match. The bar keeps its
 * geometry; the 5.5px slot around it is the bar plus its 3px gap, so the strip
 * has no dead gaps to fall through, and the -1.5px margin keeps the bars on the
 * shipped x. A hovered bar grows and its siblings fade, and it opens the dark
 * readout the DS gives a hovered chart mark (`reference/components.md`).
 *
 * Bars not yet played take no hover and no click, so the row gets those.
 *
 * Two inputs get the drawer instead. A finger cannot hit 5.5px, so on touch the
 * bars let taps through to the row, and for a keyboard they are not tab stops,
 * which would add five to every row. The drawer lists these same matches, and
 * the screen-reader summary still states the strip.
 */
function OpponentFormStrip({ bars }: { bars: readonly OpponentFormBar[] }) {
  const ghosts = Math.max(0, OPPONENT_FORM_SLOTS - bars.length);
  return (
    <>
      <span className="sr-only">
        {bars.length === 0
          ? "No form yet"
          : `Last ${bars.length}: ${bars
              .map(({ result }) =>
                result === "win" ? "W" : result === "loss" ? "L" : "Pending",
              )
              .join(" ")}`}
      </span>
      {/* One provider, so sliding along the strip swaps readouts at once. */}
      <TooltipProvider delayDuration={0} disableHoverableContent>
        <span className="group/form -mx-[1.5px] flex items-center">
          {bars.map((bar, index) =>
            bar.match ? (
              <Tooltip key={bar.match.id}>
                <TooltipTrigger asChild>
                  <Link
                    href={`/dashboard/matches/${bar.match.id}`}
                    prefetch={false}
                    tabIndex={-1}
                    aria-label={barLabel(bar)}
                    data-own-hover
                    onClick={(event) => event.stopPropagation()}
                    className={`group/bar touch:pointer-events-none ${BAR_SLOT}`}
                  >
                    <span
                      className={`${BAR} h-3 transition-[opacity,height] duration-[var(--duration-hover)] group-hover/bar:h-4 group-hover/bar:!opacity-100 group-hover/form:opacity-40`}
                      style={{ background: barColor(bar.result) }}
                    />
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  showArrow={false}
                  className="flex flex-col items-start gap-0.5 rounded-[12px] border-0 px-3 py-2.5"
                >
                  <FormBarReadout match={bar.match} />
                </TooltipContent>
              </Tooltip>
            ) : (
              <span key={`plain-${index}`} aria-hidden className={BAR_SLOT}>
                <span
                  className={`${BAR} h-3`}
                  style={{ background: barColor(bar.result) }}
                />
              </span>
            ),
          )}
          {Array.from({ length: ghosts }, (_, index) => (
            <span key={`ghost-${index}`} aria-hidden className={BAR_SLOT}>
              <span className={`${BAR} h-3 bg-[var(--ink-100)]`} />
            </span>
          ))}
        </span>
      </TooltipProvider>
    </>
  );
}

/** Score over date and event; the team table adds who played it. */
function FormBarReadout({
  match,
}: {
  match: NonNullable<OpponentFormBar["match"]>;
}) {
  const sets = playedSets(match.sets);
  const when = [
    match.date ? formatMatchDayShortYear(match.date) : null,
    match.event,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {sets.length > 0 ? (
        <ScoreLine
          sets={sets}
          className="text-[12px] font-medium whitespace-nowrap"
        />
      ) : (
        <span className="text-[12px] font-medium whitespace-nowrap">
          No score
        </span>
      )}
      {when ? (
        <span className="text-[11px] font-normal whitespace-nowrap text-white/64">
          {when}
        </span>
      ) : null}
      {match.player ? (
        <span className="text-[11px] font-normal whitespace-nowrap text-white/64">
          {match.player}
        </span>
      ) : null}
    </>
  );
}

/**
 * Last match — the date, the result and the score on one line, which is how
 * the drawer already writes a match, as one link to its report.
 *
 * The date holds a 52px floor ("Sep 27") so the result glyph sits on one x for
 * every match of the current year; a date carrying its year is wider and
 * pushes its own row's glyph along rather than being clipped. The score is the
 * one part that may truncate.
 *
 * The trailing chevron is the DS's mark for a record that travels
 * (`reference/tables.md` law 3), and it is what tells this cell from the row:
 * the row opens the drawer, this leaves the page. It fades in with the row and
 * goes from ink-300 to ink-900 on the link, and it always holds its width, so
 * nothing shifts. No hover on touch, so there it simply stays.
 *
 * `ResultMark`'s own null means a level dual, which a singles match cannot be,
 * so an undecided result draws the dash and null never reaches it.
 */
export function OpponentLastMatchCell({
  lastMatch,
}: Pick<PersonalOpponent, "lastMatch">) {
  const sets = playedSets(lastMatch.sets);
  return (
    <Link
      href={`/dashboard/matches/${lastMatch.id}`}
      prefetch={false}
      onClick={(event) => event.stopPropagation()}
      className="group/last flex w-fit max-w-full min-w-0 items-center gap-2.5 rounded-[var(--radius-cell)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
    >
      <span className="sr-only">Open last match:</span>
      <span className="tabular min-w-[52px] shrink-0 text-[12px] whitespace-nowrap text-[var(--ink-700)]">
        {lastMatch.date ? (
          formatMatchDayShortYear(lastMatch.date)
        ) : (
          <EmptyMark label="No date" />
        )}
      </span>
      <span className="flex w-3.5 shrink-0 items-center">
        {lastMatch.won === null ? (
          <EmptyMark label="No result yet" />
        ) : (
          <ResultMark won={lastMatch.won} />
        )}
      </span>
      {sets.length > 0 ? (
        <ScoreLine
          sets={sets}
          className="min-w-0 truncate text-[13px] text-[var(--ink-900)]"
        />
      ) : (
        <span>
          <EmptyMark label="No score" />
        </span>
      )}
      <ChevronRight
        aria-hidden
        strokeWidth={1.5}
        className="-ml-1 size-[13px] shrink-0 text-[var(--ink-300)] opacity-0 transition-[opacity,color] duration-[var(--duration-hover)] group-hover/last:text-[var(--ink-900)] group-hover/row:opacity-100 group-focus-visible/last:text-[var(--ink-900)] group-focus-visible/last:opacity-100 group-focus-visible/row:opacity-100 touch:opacity-100"
      />
    </Link>
  );
}
