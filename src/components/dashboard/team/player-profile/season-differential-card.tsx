"use client";

import { motion, useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import {
  isDimmed,
  useDifferentialHover,
} from "@/components/dashboard/matches/match-detail/differential-hover";
import { LegendMark } from "@/components/dashboard/matches/match-detail/legend-swatch";
import {
  HOVER_DIMMED,
  type OutcomeSide,
  segmentMotion,
  SegmentTooltip,
} from "@/components/dashboard/matches/match-detail/point-endings-body";
import { SEASON_OPPONENTS_LABEL } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { EmptyMark } from "@/components/ui/empty-mark";
import { surname } from "@/lib/data/match-utils";
import type { SeasonOutcomes } from "@/lib/data/player-season";

/**
 * The team player profile's season "Differential" (design canvas "Match page
 * refinements", board 9), under the season Head to head as the match
 * report's sits under its own (`differential-card.tsx`): winners minus
 * errors, per match, for the player and for their opponents — a signed
 * figure over one bar split at zero, errors growing left in the side's light
 * tint, winners right in its full colour.
 *
 * THE COUNTS are How points ended's (`seasonOutcomes`: the report's
 * `outcomeTally` run per match with that match's own seat, then summed), so
 * the two cards cannot disagree: winners by `winnerHitBy` (a service winner
 * and an ace are not winners), errors by `errorMadeBy`. Unforced errors only
 * when every analyzed match has its errors judged
 * (`SeasonOutcomes.errorSplitJudged`), every error otherwise — the season
 * Head to head's Errors row reads the same way. Each figure is the season sum
 * over the analyzed matches, so the differential is the per-match average.
 *
 * Both bars share one scale (the largest of the four averages), so a bar's
 * length compares across the card.
 *
 * HOVER reads as the report's card does: a bar half, a figure or a legend key
 * lights its target, fades the rest to `HOVER_DIMMED` and raises the dark
 * readout; a finger's tap holds it until a tap lands outside the card. Nothing
 * clicks — a season half is many matches, with no one film to open.
 *
 * Empty (nothing analyzed, or no winner or error recorded): the anatomy —
 * both names, a dash for each figure, empty tracks — and one sentence.
 */

const HEADING_ID = "season-differential-heading";

/** The card's hover/focus easing, as the report's card uses. */
const EASE = "duration-200 ease-[var(--ease-primary)]";

type Half = "winners" | "errors";

/** "+3.3", "−1.2" (a true minus), "0.0" — one decimal, as a count row. */
export function signedPerMatch(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  if (fixed === "0.0") return "0.0";
  return value > 0 ? `+${fixed}` : `−${fixed}`;
}

/** Both sides' per-match winners and errors, from the season's outcomes. */
export function seasonDifferential(outcomes: SeasonOutcomes, analyzed: number) {
  const per = (n: number) => (analyzed > 0 ? n / analyzed : 0);
  return {
    you: {
      winners: per(outcomes.you.winners),
      errors: per(outcomes.you.unforcedErrors),
    },
    opp: {
      winners: per(outcomes.opp.winners),
      errors: per(outcomes.opp.unforcedErrors),
    },
  };
}

export function SeasonDifferentialCard({
  playerName,
  analyzed,
  outcomes,
}: {
  /** The player's full name; the first row shows their surname. */
  playerName: string;
  /** Matches with points — what `outcomes` was summed over. */
  analyzed: number;
  /** `seasonOutcomes()` — the same tallies How points ended draws. */
  outcomes: SeasonOutcomes;
}) {
  const { you, opp } = seasonDifferential(outcomes, analyzed);
  const errorNoun = outcomes.errorSplitJudged ? "unforced errors" : "errors";
  const errorLabel = outcomes.errorSplitJudged ? "Unforced errors" : "Errors";
  const name = surname(playerName);
  const shouldReduceMotion = useReducedMotion();
  const { hovered, cardRef, hoverTarget } = useDifferentialHover();

  const rows: {
    id: OutcomeSide;
    name: string;
    otherName: string;
    winners: number;
    errors: number;
    otherWinners: number;
    otherErrors: number;
    winnersFill: string;
    errorsFill: string;
  }[] = [
    {
      id: "you",
      name,
      otherName: SEASON_OPPONENTS_LABEL,
      ...you,
      otherWinners: opp.winners,
      otherErrors: opp.errors,
      winnersFill: "var(--viz-you)",
      errorsFill: "var(--viz-you-light)",
    },
    {
      id: "opp",
      name: SEASON_OPPONENTS_LABEL,
      otherName: name,
      ...opp,
      otherWinners: you.winners,
      otherErrors: you.errors,
      winnersFill: "var(--viz-opp)",
      errorsFill: "var(--viz-opp-light)",
    },
  ];
  const scale = Math.max(...rows.flatMap((r) => [r.winners, r.errors]));
  const empty = analyzed === 0 || scale === 0;
  const youDiff = you.winners - you.errors;
  const oppDiff = opp.winners - opp.errors;

  const header = (
    <div className="flex items-baseline gap-2">
      <span id={HEADING_ID} className="eyebrow">
        Differential
      </span>
      <div className="flex-1" />
      <span
        className="text-micro whitespace-nowrap"
        style={{ color: "var(--ink-400)" }}
      >
        Winners minus {errorNoun}, per match
      </span>
    </div>
  );

  if (empty) {
    return (
      <section
        aria-labelledby={HEADING_ID}
        className="surface-card flex flex-1 flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="season-differential-empty"
      >
        {header}
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              <span className="tabular text-[13px]">
                <EmptyMark
                  label="No winners or errors recorded"
                  className="text-[13px]"
                />
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-2.5 w-full rounded-[var(--radius-cell)]"
              style={{ background: "var(--ink-100)" }}
            />
          </div>
        ))}
        <p className="text-micro pt-0.5" style={{ color: "var(--ink-500)" }}>
          {analyzed === 0
            ? `Winners and errors add up here once one of ${name}'s matches is analyzed.`
            : "No point in these matches records a winner or an error."}
        </p>
      </section>
    );
  }

  /** One half of one row's bar: errors (left of zero) or winners (right). */
  const half = (row: (typeof rows)[number], key: Half) => {
    const id = `${row.id}-${key}`;
    const left = key === "errors";
    const value = left ? row.errors : row.winners;
    const otherValue = left ? row.otherErrors : row.otherWinners;
    const fill = left ? row.errorsFill : row.winnersFill;
    const label = left ? errorLabel : "Winners";
    const share = (value / scale) * 100;
    return (
      <div className={`flex min-w-0 flex-1 ${left ? "justify-end" : ""}`}>
        {value > 0 && (
          <motion.div
            // On touch the 10px bar takes taps 17px above and below.
            className="relative h-full cursor-default touch:before:absolute touch:before:inset-x-0 touch:before:-inset-y-[17px] touch:before:content-['']"
            style={{
              background: fill,
              borderRadius: left
                ? "var(--radius-cell) 0 0 var(--radius-cell)"
                : "0 var(--radius-cell) var(--radius-cell) 0",
            }}
            {...segmentMotion(
              share,
              isDimmed(hovered, row.id, key),
              shouldReduceMotion,
            )}
            tabIndex={0}
            // A button with nothing to click, as the figures and keys are:
            // without a role a screen reader drops the label.
            role="button"
            aria-disabled="true"
            aria-label={`${label} per match. ${row.name} ${value.toFixed(1)}, ${row.otherName} ${otherValue.toFixed(1)}.`}
            {...hoverTarget(id)}
          >
            <SegmentTooltip
              open={hovered === id}
              label={`${label} per match`}
              detail={`${row.name} ${value.toFixed(1)} · ${row.otherName} ${otherValue.toFixed(1)}`}
              align={left ? "end" : "start"}
              watchable={false}
            />
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <section
      ref={cardRef}
      aria-labelledby={HEADING_ID}
      // `flex-1 justify-between`: when the chart column is the taller one the
      // card takes the head-to-head column's slack, spread between its rows,
      // so both columns end on one line — the report's card does the same.
      className="surface-card flex flex-1 flex-col justify-between gap-3"
      style={{ padding: "16px 20px 14px" }}
      data-testid="season-differential"
    >
      {header}

      {rows.map((row) => {
        const diff = row.winners - row.errors;
        const leads = diff > (row.id === "you" ? oppDiff : youDiff);
        const figId = `fig-${row.id}`;
        const figHovered = hovered === figId;
        return (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              {/* The figure is a target of its own: its readout spells the
                  sum out. A button with nothing to click (`aria-disabled`
                  keeps it in the Tab order); its own row stays lit. */}
              <span className="relative">
                <button
                  type="button"
                  aria-disabled="true"
                  aria-label={`Differential per match, ${row.name}: ${row.winners.toFixed(1)} winners minus ${row.errors.toFixed(1)} ${errorNoun}, ${signedPerMatch(diff)}.`}
                  className={`tabular -mx-1.5 cursor-default rounded-[var(--radius-cell)] border-0 px-1.5 text-[13px] transition-colors ${EASE}`}
                  style={{
                    fontWeight: leads ? 500 : 400,
                    color: leads ? "var(--ink-900)" : "var(--ink-500)",
                    backgroundColor: figHovered
                      ? "var(--surface-subtle)"
                      : "transparent",
                  }}
                  {...hoverTarget(figId)}
                >
                  {signedPerMatch(diff)}
                </button>
                <ChartTooltip
                  open={figHovered}
                  align="end"
                  offset={6}
                  className="gap-0.5 px-2.5 py-2"
                >
                  <span className="text-[12px] font-medium text-white">
                    Differential · {row.name}
                  </span>
                  <span className="tabular text-[11px] text-white/[0.64]">
                    {row.winners.toFixed(1)} winners − {row.errors.toFixed(1)}{" "}
                    {errorNoun} = {signedPerMatch(diff)}
                  </span>
                  <span className="text-[10px] text-white/[0.64]">
                    Per match, over {analyzed}{" "}
                    {analyzed === 1 ? "match" : "matches"}
                  </span>
                </ChartTooltip>
              </span>
            </div>

            <div className="flex h-2.5 w-full gap-0.5">
              {half(row, "errors")}
              {half(row, "winners")}
            </div>

            <div
              aria-hidden="true"
              className="tabular flex gap-0.5 text-[11px]"
              style={{ color: "var(--ink-500)" }}
            >
              <span
                className={`min-w-0 flex-1 pr-1.5 text-right transition-opacity ${EASE}`}
                style={{
                  opacity: isDimmed(hovered, row.id, "errors")
                    ? HOVER_DIMMED
                    : 1,
                }}
              >
                {row.errors.toFixed(1)}
              </span>
              <span
                className={`min-w-0 flex-1 pl-1.5 transition-opacity ${EASE}`}
                style={{
                  opacity: isDimmed(hovered, row.id, "winners")
                    ? HOVER_DIMMED
                    : 1,
                }}
              >
                {row.winners.toFixed(1)}
              </span>
            </div>
          </div>
        );
      })}

      {/* The legend keys are targets too: each lights its kind on both rows
          and fades the other, as the report's do. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-0.5">
        {(
          [
            ["winners", "var(--viz-you)", "Winners"],
            ["errors", "var(--viz-you-light)", errorLabel],
          ] as const
        ).map(([kind, color, label]) => (
          <button
            key={kind}
            type="button"
            aria-disabled="true"
            aria-label={`Highlight ${label.toLowerCase()} for both rows`}
            className={`-mx-1 inline-flex cursor-default items-center gap-1.5 rounded-[var(--radius-cell)] border-0 bg-transparent px-1 transition-opacity ${EASE}`}
            style={{
              opacity:
                hovered?.startsWith("key-") && hovered !== `key-${kind}`
                  ? HOVER_DIMMED
                  : 1,
            }}
            {...hoverTarget(`key-${kind}`)}
          >
            <LegendMark color={color} />
            <span className="text-micro whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
