"use client";

import Link from "next/link";
import { ScoreLine } from "@/components/dashboard/score-line";
import {
  FORM_TICK,
  formTickColor,
  formTicksSummary,
} from "@/components/dashboard/shared/form-ticks";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { FormBar, FormBarMatch, FormResult } from "@/lib/data/form-bar";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { playedSets } from "@/lib/ui/score-format";

const BAR_SLOT = "flex h-7 w-[5.5px] items-center justify-center";

const BAR_HIT_BASE = `group/bar pointer-events-auto ${BAR_SLOT}`;

const BAR_HIT = `${BAR_HIT_BASE} touch:pointer-events-none`;

/**
 * `touchTaps`: on touch the slot spreads to 14px — touch-only spacing, never a
 * bigger bar (chrome.md → Touch) — and an `::after` stretches its tap area to
 * 44px tall, so a finger can pick one match out of five.
 */
const TOUCH_SLOT = "touch:w-[14px]";
const BAR_HIT_TOUCH = `${BAR_HIT_BASE} relative ${TOUCH_SLOT} touch:after:absolute touch:after:inset-x-0 touch:after:-inset-y-2 touch:after:content-['']`;

const BAR = `${FORM_TICK} h-3 transition-[opacity,height] duration-[var(--duration-hover)] group-hover/bar:h-4 group-hover/bar:!opacity-100 group-hover/form:opacity-40`;

function FormBarMark({ result }: { result: FormResult }) {
  return <span className={BAR} style={{ background: formTickColor(result) }} />;
}

function barLabel(bar: FormBar): string {
  const outcome =
    bar.result === "win"
      ? "Won"
      : bar.result === "loss"
        ? "Lost"
        : "No result yet";
  const date = bar.match.date
    ? formatMatchDayShortYear(bar.match.date)
    : "no date";
  return `${outcome}, ${date}`;
}

/**
 * `FormTicks`' strip, on its own tick pieces, for a strip whose bars are
 * matches. The bar keeps its geometry; the 5.5px slot around it is the bar plus
 * its 3px gap, so the strip has no dead gaps to fall through, and the -1.5px
 * margin keeps the bars on the shipped x. The slot is 28px tall to be easy to
 * hit, and the -8px margin hands the host back the 12px a plain strip takes. A
 * hovered bar grows and its siblings fade, and it opens the dark readout the DS
 * gives a hovered chart mark (`reference/components.md`).
 *
 * Only a bar takes the pointer. A ghost, not yet played, takes no hover and no
 * click, so the row gets those.
 *
 * Each bar links to its match. `linked={false}` is for a strip inside a row that
 * is itself one link, where a second would nest: the bar keeps its hover and the
 * click stays the row's.
 *
 * Two inputs get the row instead. A finger cannot hit 5.5px, so on touch the
 * bars let taps through, and for a keyboard they are not tab stops, which would
 * add five to every row. The screen-reader summary still states the strip.
 * `touchTaps` opts a host out of the touch pass-through when its row has room
 * to space the bars — Team Home's Top movers, whose bars are the only way to a
 * match. A tap then opens the bar's match; a press-and-hold shows its readout.
 */
export function FormStrip({
  bars,
  slots,
  empty = <EmptyMark label="No form yet" />,
  linked = true,
  touchTaps = false,
}: {
  bars: readonly FormBar[];
  /** Pad to this many bars with ghosts, as `FormTicks`' `slots` does. */
  slots?: number;
  /** What to draw for no results at all. Ignored when `slots` is set. */
  empty?: React.ReactNode;
  linked?: boolean;
  /** Keep linked bars tappable on touch, spaced to 14px slots (≈70px for five). */
  touchTaps?: boolean;
}) {
  if (bars.length === 0 && slots === undefined) return <>{empty}</>;
  const ghosts = slots === undefined ? 0 : Math.max(0, slots - bars.length);
  const tappable = linked && touchTaps;
  const hit = tappable ? BAR_HIT_TOUCH : BAR_HIT;
  const ghostSlot = tappable ? `${BAR_SLOT} ${TOUCH_SLOT}` : BAR_SLOT;
  return (
    <>
      <span className="sr-only">
        {formTicksSummary(bars.map((bar) => bar.result))}
      </span>
      {/* One provider, so sliding along the strip swaps readouts at once. */}
      <TooltipProvider delayDuration={0} disableHoverableContent>
        <span className="group/form pointer-events-none -mx-[1.5px] -my-2 flex items-center">
          {bars.map((bar) => (
            <Tooltip key={bar.match.id}>
              <TooltipTrigger asChild>
                {linked ? (
                  <Link
                    href={`/dashboard/matches/${bar.match.id}`}
                    prefetch={false}
                    tabIndex={-1}
                    aria-label={barLabel(bar)}
                    data-own-hover
                    onClick={(event) => event.stopPropagation()}
                    className={hit}
                  >
                    <FormBarMark result={bar.result} />
                  </Link>
                ) : (
                  <span aria-hidden className={BAR_HIT}>
                    <FormBarMark result={bar.result} />
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent
                side="top"
                showArrow={false}
                className="flex flex-col items-start gap-0.5 rounded-[12px] border-0 px-3 py-2.5"
              >
                <FormBarReadout match={bar.match} />
              </TooltipContent>
            </Tooltip>
          ))}
          {Array.from({ length: ghosts }, (_, index) => (
            <span key={`ghost-${index}`} aria-hidden className={ghostSlot}>
              <span className={`${FORM_TICK} h-3 bg-[var(--ink-100)]`} />
            </span>
          ))}
        </span>
      </TooltipProvider>
    </>
  );
}

/** Score over date and event, then the name the row does not already say. */
function FormBarReadout({ match }: { match: FormBarMatch }) {
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
      {match.person ? (
        <span className="text-[11px] font-normal whitespace-nowrap text-white/64">
          {match.person}
        </span>
      ) : null}
    </>
  );
}
