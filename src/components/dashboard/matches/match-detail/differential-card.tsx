"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { watchableSegmentProps } from "@/components/dashboard/matches/match-detail/film-cut-context";
import { outcomeCut } from "@/components/dashboard/matches/match-detail/point-endings-card";
import { outcomeTally } from "@/components/dashboard/matches/match-detail/point-endings-tally";
import {
  HOVER_DIMMED,
  segmentMotion,
  SegmentTooltip,
} from "@/components/dashboard/matches/match-detail/point-endings-body";
import { LegendMark } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { EmptyMark } from "@/components/ui/empty-mark";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The Statistics tab's "Differential" card (design canvas "Match page
 * refinements", board 3b): winners minus unforced errors, per player, as a
 * signed figure over one bar split at zero — errors grow left in the side's
 * light tint, winners grow right in its full colour — so the bar shows why
 * the number is what it is. A positive differential is the good one.
 *
 * It sits under the head to head, whose Points group ends on the Winners and
 * Unforced errors rows this is computed from.
 *
 * THE COUNTS are the Point endings card's own (`outcomeTally`): winners by
 * `winnerHitBy` (a service winner and an ace are not winners), errors by
 * `errorMadeBy`. Until the match's errors are judged forced/unforced
 * (`errorSplitJudged`) nobody has called an error unforced, so the card
 * subtracts every error and says "errors" — the same reading the head to
 * head's Errors row and the Point endings segment take.
 *
 * Both players' bars share one scale (the largest of the four counts), so a
 * bar's length compares across the card.
 *
 * The viewer's row is first (`useMatchSides()`, guardrails §4), never
 * player1's. With a playable video each half opens its points in Video
 * (`outcomeCut`) on click or Enter; hovering only reads, and fades the other
 * halves as the Visualizations bars do.
 */

/** "+6", "−3" (a true minus), "0". */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

type Side = "you" | "opp";
type Half = "winners" | "unforcedErrors";

/**
 * One player's name, then whatever sits at the row's right edge — the signed
 * figure, or a dash on the empty card — so both states draw the same line.
 */
function NameRow({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="truncate text-[11px] text-[var(--ink-600)]">{name}</span>
      <div className="flex-1" />
      {children}
    </div>
  );
}

/** The card's hover/focus easing, as the head to head's figures use. */
const EASE = "duration-200 ease-[var(--ease-primary)]";

/** "1 winner", "18 winners". */
function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Whether one half of one player's bar (and its count) fades while `hovered`
 * is the target under the cursor: another half (`you-winners`), a figure
 * (`fig-you`, which keeps its own row lit) or a legend key (`key-winners`,
 * which keeps that kind lit for both players). Nothing hovered, nothing
 * fades.
 */
export function isDimmed(
  hovered: string | null,
  side: Side,
  half: Half,
): boolean {
  if (hovered === null) return false;
  if (hovered.startsWith("key-")) return hovered !== `key-${half}`;
  if (hovered.startsWith("fig-")) return hovered !== `fig-${side}`;
  return hovered !== `${side}-${half}`;
}

export function DifferentialCard({ isDerived }: { isDerived: boolean }) {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { points } = useMatchData();
  const errorSplitJudged = useMatchFilters().context.errorSplitJudged === true;
  const youIsPlayer1 = sides.you.isPlayer1;
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const cardRef = useTouchReadout<HTMLElement>(hovered !== null, () =>
    setHovered(null),
  );
  const fingerTap = useFingerTap();

  /**
   * Hover, focus and tap wiring for a target that only reads — a figure or a
   * legend key. A finger's tap selects it and the readout stays until a tap
   * lands outside the card (`useTouchReadout`), as the bars' do.
   */
  const hoverTarget = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (fingerTap.press(e, hovered === id)) setHovered(id);
    },
    onClick: () => fingerTap.click(undefined, () => setHovered(null)),
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(id),
    onBlur: () => setHovered(null),
  });

  const { you, opp } = useMemo(
    () => ({
      you: outcomeTally(points, youIsPlayer1, isDerived, errorSplitJudged),
      opp: outcomeTally(points, !youIsPlayer1, isDerived, errorSplitJudged),
    }),
    [points, youIsPlayer1, isDerived, errorSplitJudged],
  );

  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);
  const errorNoun = errorSplitJudged ? "unforced error" : "error";
  const errorLabel = errorSplitJudged ? "Unforced errors" : "Errors";

  const rows: {
    id: Side;
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
      name: youName,
      otherName: oppName,
      winners: you.winners,
      errors: you.unforcedErrors,
      otherWinners: opp.winners,
      otherErrors: opp.unforcedErrors,
      winnersFill: "var(--viz-you)",
      errorsFill: "var(--viz-you-light)",
    },
    {
      id: "opp",
      name: oppName,
      otherName: youName,
      winners: opp.winners,
      errors: opp.unforcedErrors,
      otherWinners: you.winners,
      otherErrors: you.unforcedErrors,
      winnersFill: "var(--viz-opp)",
      errorsFill: "var(--viz-opp-light)",
    },
  ];

  const scale = Math.max(...rows.flatMap((r) => [r.winners, r.errors]));
  const empty = scale === 0;
  const youDiff = rows[0].winners - rows[0].errors;
  const oppDiff = rows[1].winners - rows[1].errors;

  const header = (
    <div className="flex items-baseline gap-2">
      <span id="differential-heading" className="eyebrow">
        Differential
      </span>
      <div className="flex-1" />
      <span
        className="text-micro whitespace-nowrap"
        style={{ color: "var(--ink-400)" }}
      >
        Winners minus {errorNoun}s
      </span>
    </div>
  );

  // No winner and no error on either side: a bar would claim a balance that
  // was never measured. The anatomy stays — names, a dash for each figure,
  // empty tracks and one sentence.
  if (empty) {
    return (
      <section
        aria-labelledby="differential-heading"
        className="surface-card flex flex-1 flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="differential-empty"
      >
        {header}
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-1.5">
            <NameRow name={row.name}>
              <span className="tabular text-[13px]">
                <EmptyMark
                  label="No winners or errors recorded"
                  className="text-[13px]"
                />
              </span>
            </NameRow>
            <div
              aria-hidden="true"
              className="h-2.5 w-full rounded-[var(--radius-cell)]"
              style={{ background: "var(--ink-100)" }}
            />
          </div>
        ))}
        <p className="text-micro pt-0.5" style={{ color: "var(--ink-500)" }}>
          No point on this match records a winner or an error.
        </p>
      </section>
    );
  }

  /** One half of one player's bar: errors (left of zero) or winners (right). */
  const half = (
    row: (typeof rows)[number],
    key: Half,
    count: number,
    otherCount: number,
    fill: string,
    label: string,
  ) => {
    const id = `${row.id}-${key}`;
    const left = key === "unforcedErrors";
    const share = (count / scale) * 100;
    const watch =
      meta.hasPlayableVideo && count > 0
        ? () =>
            actions.watchCut(
              outcomeCut(key, row.id, errorSplitJudged),
              `${label} · ${row.name}`,
              "differential",
            )
        : undefined;
    const dimmed = isDimmed(hovered, row.id, key);

    return (
      <div className={`flex min-w-0 flex-1 ${left ? "justify-end" : ""}`}>
        {count > 0 && (
          <motion.div
            // On touch the 10px bar takes taps 17px above and below.
            className={`relative h-full touch:before:absolute touch:before:inset-x-0 touch:before:-inset-y-[17px] touch:before:content-[''] ${watch ? "cursor-pointer" : "cursor-default"}`}
            style={{
              background: fill,
              borderRadius: left
                ? "var(--radius-cell) 0 0 var(--radius-cell)"
                : "0 var(--radius-cell) var(--radius-cell) 0",
            }}
            {...segmentMotion(share, dimmed, shouldReduceMotion)}
            tabIndex={0}
            {...watchableSegmentProps(
              watch,
              `${label}. ${row.name} ${count}, ${row.otherName} ${otherCount}.`,
            )}
            {...hoverTarget(id)}
            onClick={() => fingerTap.click(watch, () => setHovered(null))}
          >
            <SegmentTooltip
              open={hovered === id}
              label={label}
              detail={`${row.name} ${count} · ${row.otherName} ${otherCount}`}
              align={left ? "end" : "start"}
              watchable={Boolean(watch)}
            />
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <section
      ref={cardRef}
      aria-labelledby="differential-heading"
      // `flex-1 justify-between`: when the chart column is the taller one the
      // card takes the head-to-head column's slack, spread between its rows,
      // so both columns end on one line. With no slack it is its own height.
      className="surface-card flex flex-1 flex-col justify-between gap-3"
      style={{ padding: "16px 20px 14px" }}
      data-testid="differential-card"
    >
      {header}

      {rows.map((row) => {
        const diff = row.winners - row.errors;
        const other = row.id === "you" ? oppDiff : youDiff;
        const leads = diff > other;

        return (
          <div key={row.id} className="flex flex-col gap-1.5">
            <NameRow name={row.name}>
              {/* The figure is a target of its own: its readout spells the
                  sum out. A button with nothing to click, as the head to
                  head's figures are (`aria-disabled` keeps it in the Tab
                  order); its own row stays lit, the other fades. */}
              <span className="relative">
                <button
                  type="button"
                  aria-disabled="true"
                  aria-label={`Differential, ${row.name}: ${counted(row.winners, "winner")} minus ${counted(row.errors, errorNoun)}, ${signed(diff)}.`}
                  className={`tabular -mx-1.5 cursor-default rounded-[var(--radius-cell)] border-0 px-1.5 text-[13px] transition-colors ${EASE}`}
                  style={{
                    fontWeight: leads ? 500 : 400,
                    color: leads ? "var(--ink-900)" : "var(--ink-500)",
                    backgroundColor:
                      hovered === `fig-${row.id}`
                        ? "var(--surface-subtle)"
                        : "transparent",
                  }}
                  {...hoverTarget(`fig-${row.id}`)}
                >
                  {signed(diff)}
                </button>
                <ChartTooltip
                  open={hovered === `fig-${row.id}`}
                  align="end"
                  offset={6}
                  className="gap-0.5 px-2.5 py-2"
                >
                  <span className="text-[12px] font-medium text-white">
                    Differential · {row.name}
                  </span>
                  <span className="tabular text-[11px] text-white/[0.64]">
                    {counted(row.winners, "winner")} −{" "}
                    {counted(row.errors, errorNoun)} = {signed(diff)}
                  </span>
                  <span className="text-[10px] text-white/[0.64]">
                    {diff > 0
                      ? `More winners than ${errorNoun}s`
                      : diff < 0
                        ? `More ${errorNoun}s than winners`
                        : `As many winners as ${errorNoun}s`}
                  </span>
                </ChartTooltip>
              </span>
            </NameRow>

            <div className="flex h-2.5 w-full gap-0.5">
              {half(
                row,
                "unforcedErrors",
                row.errors,
                row.otherErrors,
                row.errorsFill,
                errorLabel,
              )}
              {half(
                row,
                "winners",
                row.winners,
                row.otherWinners,
                row.winnersFill,
                "Winners",
              )}
            </div>

            {/* The counts, each on its own side of the zero line. What
                each side is, the legend under both rows says once. */}
            <div
              className="tabular flex gap-0.5 text-[11px]"
              style={{ color: "var(--ink-500)" }}
            >
              <span
                className={`min-w-0 flex-1 pr-1.5 text-right transition-opacity ${EASE}`}
                style={{
                  opacity: isDimmed(hovered, row.id, "unforcedErrors")
                    ? HOVER_DIMMED
                    : 1,
                }}
              >
                {row.errors}
              </span>
              <span
                className={`min-w-0 flex-1 pl-1.5 transition-opacity ${EASE}`}
                style={{
                  opacity: isDimmed(hovered, row.id, "winners")
                    ? HOVER_DIMMED
                    : 1,
                }}
              >
                {row.winners}
              </span>
            </div>
          </div>
        );
      })}

      {/* The chart cards' own key: a square and a word, bottom left (design
          canvas "Match page refinements", board 5, option C). Each key is a
          target too (board 11): it lights its kind for both players and
          fades the other. */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-0.5">
        {(
          [
            ["winners", "var(--viz-you)", "Winners"],
            ["unforcedErrors", "var(--viz-you-light)", errorLabel],
          ] as const
        ).map(([kind, color, label]) => (
          <button
            key={kind}
            type="button"
            aria-disabled="true"
            aria-label={`Highlight ${label.toLowerCase()} for both players`}
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
