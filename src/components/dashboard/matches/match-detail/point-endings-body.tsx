"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { watchableSegmentProps } from "@/components/dashboard/matches/match-detail/film-cut-context";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { LegendMark } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { hatch } from "@/components/dashboard/matches/match-detail/chart-fills";
import { EmptyMark } from "@/components/ui/empty-mark";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
import type {
  OutcomeKey,
  OutcomeTally,
} from "@/components/dashboard/matches/match-detail/point-endings-tally";

/**
 * The "How points ended" card as a presentational surface (artboard 46a,
 * lines 550–556): the card, its eyebrow and "Own outcomes" micro, then per
 * side a name, a total and a 100% stacked bar over that side's OWN decisive
 * shots — winners, aces, service winners, unforced errors, forced errors,
 * double faults — and the legend under both. Each bar is its own
 * composition, never compared against the other by length, so the hover
 * carries the cross-reference count instead.
 *
 * It draws exactly two things, from two callers:
 *
 * - the match report's `PointEndingsCard` (`point-endings-card.tsx`), which
 *   tallies the match's points and, with a playable video, hands it `watch`
 *   so every segment opens its points in the Video tab;
 * - the team player profile's `SeasonPointEndingsCard`, which hands it a
 *   season's summed tallies (`lib/data/player-season.ts`) and no `watch` —
 *   a season segment is many matches, with no one film to open.
 *
 * Which side is "you" is the caller's to decide (guardrails §4): the body
 * takes `youName`/`oppName` and tallies already taken from each side, and
 * nothing here reads `player1`/`player2` to pick a row.
 *
 * A SERVICE WINNER IS ITS OWN SEGMENT, not a winner (product decision,
 * 2026-10-30, as the head-to-head Winners row counts them). It and the
 * forced errors wear the fill of the segment they sit beside, hatched
 * (`hatch`): the viz ramp has four steps per side, and six solid shades would
 * not tell apart. UNTIL THE ERRORS ARE JUDGED (`errorSplitJudged` false)
 * there is no forced segment: the errors segment is every error and reads
 * "Errors" (`outcomesFor`), since nobody has called them either way — the
 * tally behind it (`point-endings-tally.ts`) already holds every error in
 * `unforcedErrors` then.
 *
 * With `watch` each segment opens its points on click or Enter — hovering
 * only reads. Without it the markup is exactly the read-only card: every
 * interactive attribute is `undefined` (`watchableSegmentProps`).
 *
 * On touch a tap selects a segment and its readout stays until a tap lands
 * outside the card; with `watch`, a second tap on the selected segment opens
 * it. The 10px bar takes taps 17px above and below it, so a finger reaches it.
 *
 * Empty (no outcome on either side): the anatomy stays — both names, a dash
 * for each total, an empty track and one sentence (`emptySentence`), with the
 * legend too where the caller asks for it (`emptyLegend`) — never a skeleton
 * and never a zero (`reference/empty-and-loading.md`).
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

export interface OutcomeMeta {
  key: OutcomeKey;
  label: string;
  /** Shorter legend text — the 6px-swatch row has no room for "errors". */
  legendLabel?: string;
  /** Fill for the viewer's bar. */
  you: string;
  /** Fill for the opponent's bar. */
  opp: string;
}

/** The judged split: unforced and forced errors are two segments. */
const OUTCOMES: OutcomeMeta[] = [
  {
    key: "winners",
    label: "Winners",
    you: "var(--viz-you-deep)",
    opp: "var(--viz-opp-deep)",
  },
  { key: "aces", label: "Aces", you: "var(--viz-you)", opp: "var(--viz-opp)" },
  {
    key: "serviceWinners",
    label: "Service winners",
    you: hatch("var(--viz-you)"),
    opp: hatch("var(--viz-opp)"),
  },
  {
    key: "unforcedErrors",
    label: "Unforced errors",
    legendLabel: "Unforced",
    you: "var(--viz-you-mid)",
    opp: "var(--viz-opp-mid)",
  },
  {
    key: "forcedErrors",
    label: "Forced errors",
    legendLabel: "Forced",
    you: hatch("var(--viz-you-mid)"),
    opp: hatch("var(--viz-opp-mid)"),
  },
  {
    key: "doubleFaults",
    label: "Double faults",
    you: "var(--viz-you-light)",
    opp: "var(--viz-opp-light)",
  },
];

/**
 * The unjudged match's errors segment: every error, forced and unforced. Same
 * key and fills as the unforced segment, only the words change; the forced
 * segment is dropped, since this one already holds its points.
 */
const ERRORS_OUTCOME: OutcomeMeta = {
  key: "unforcedErrors",
  label: "Errors",
  legendLabel: "Errors",
  you: "var(--viz-you-mid)",
  opp: "var(--viz-opp-mid)",
};

/** The card's outcomes, with the errors segment set to the match's split. */
export function outcomesFor(errorSplitJudged: boolean): OutcomeMeta[] {
  return errorSplitJudged
    ? OUTCOMES
    : OUTCOMES.filter((o) => o.key !== "forcedErrors").map((o) =>
        o.key === "unforcedErrors" ? ERRORS_OUTCOME : o,
      );
}

export type OutcomeSide = "you" | "opp";

/**
 * Opens one segment's points — the report's `watchCut` behind the body.
 * `title` is the segment named for the Video tab's banner, "Winners · Rivera".
 */
export type SegmentWatch = (
  key: OutcomeKey,
  side: OutcomeSide,
  title: string,
) => void;

/** The report's own empty sentence; a caller over another scope passes its own. */
const REPORT_EMPTY_SENTENCE = "No point on this match records how it ended.";

export interface PointEndingsBodyProps {
  /** The first row's tally — the viewer's side, or the player profiled. */
  youTally: OutcomeTally;
  /** The second row's — the opponent, or every opponent over a season. */
  oppTally: OutcomeTally;
  youName: string;
  oppName: string;
  /** The split the tallies were taken with: Unforced + Forced, or one Errors. */
  errorSplitJudged: boolean;
  /** Opens a segment's points in Video; absent, nothing here takes a click. */
  watch?: SegmentWatch;
  /** The heading's id, for the section's `aria-labelledby`. */
  headingId?: string;
  /** The one sentence under the empty tracks. */
  emptySentence?: string;
  /** Draw the legend under the empty tracks too (the season card). */
  emptyLegend?: boolean;
}

export function PointEndingsBody({
  youTally,
  oppTally,
  youName,
  oppName,
  errorSplitJudged,
  watch: onWatch,
  headingId = "point-endings-heading",
  emptySentence = REPORT_EMPTY_SENTENCE,
  emptyLegend = false,
}: PointEndingsBodyProps) {
  const outcomes = outcomesFor(errorSplitJudged);
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const cardRef = useTouchReadout<HTMLElement>(hovered !== null, () =>
    setHovered(null),
  );
  const fingerTap = useFingerTap();

  const youTotal = outcomes.reduce((sum, o) => sum + youTally[o.key], 0);
  const oppTotal = outcomes.reduce((sum, o) => sum + oppTally[o.key], 0);

  const legend = (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 pt-0.5">
      {/* `LegendMark`, not `LegendSwatch`: these labels sit a step lighter
          (ink-400) than that component's text-micro. */}
      {outcomes.map((o) => (
        <span key={o.key} className="inline-flex items-center gap-1.5">
          <LegendMark color={o.you} />
          <span
            className="text-micro whitespace-nowrap"
            style={{ color: "var(--ink-400)" }}
          >
            {o.legendLabel ?? o.label}
          </span>
        </span>
      ))}
    </div>
  );

  // No point records how it ended — two filled bars would read as "nobody hit
  // a winner or made an error". The anatomy stays: both names, a dash for
  // each total, an empty track, and one sentence.
  if (youTotal === 0 && oppTotal === 0) {
    return (
      <section
        aria-labelledby={headingId}
        className="surface-card flex flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="point-endings-empty"
      >
        <div className="flex items-baseline gap-2">
          <span id={headingId} className="eyebrow">
            How points ended
          </span>
          <div className="flex-1" />
          <span
            className="text-micro whitespace-nowrap"
            style={{ color: "var(--ink-400)" }}
          >
            Own outcomes
          </span>
        </div>

        {[youName, oppName].map((name, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {name}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px]">
                <EmptyMark
                  label="No outcomes recorded"
                  className="text-[10px]"
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

        {emptyLegend && legend}

        <p className="text-micro pt-0.5" style={{ color: "var(--ink-500)" }}>
          {emptySentence}
        </p>
      </section>
    );
  }

  const rows: {
    id: OutcomeSide;
    name: string;
    otherName: string;
    own: OutcomeTally;
    other: OutcomeTally;
    total: number;
    fill: (o: OutcomeMeta) => string;
  }[] = [
    {
      id: "you",
      name: youName,
      otherName: oppName,
      own: youTally,
      other: oppTally,
      total: youTotal,
      fill: (o: OutcomeMeta) => o.you,
    },
    {
      id: "opp",
      name: oppName,
      otherName: youName,
      own: oppTally,
      other: youTally,
      total: oppTotal,
      fill: (o: OutcomeMeta) => o.opp,
    },
  ];

  return (
    <section
      ref={cardRef}
      aria-labelledby={headingId}
      className="surface-card flex flex-col gap-3"
      style={{ padding: "16px 20px 14px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id={headingId} className="eyebrow">
          How points ended
        </span>
        <div className="flex-1" />
        <span
          className="text-micro whitespace-nowrap"
          style={{ color: "var(--ink-400)" }}
        >
          Own outcomes
        </span>
      </div>

      {rows.map((row) => {
        const segments = outcomes.filter((o) => row.own[o.key] > 0);

        return (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                {row.total}
              </span>
            </div>

            <div className="flex h-2.5 w-full gap-0.5">
              {segments.map((o, i) => {
                const id = `${row.id}-${o.key}`;
                const share =
                  row.total > 0 ? (row.own[o.key] / row.total) * 100 : 0;
                const isFirst = i === 0;
                const isLast = i === segments.length - 1;
                const label = `${o.label}. ${row.name} ${row.own[o.key]}, ${row.otherName} ${row.other[o.key]}.`;
                // Only a caller with somewhere to open a segment hands in
                // `watch`; every attribute below is `undefined` otherwise,
                // so the read-only markup is unchanged. Focus is
                // `focus.css`'s ring.
                const watch = onWatch
                  ? () => onWatch(o.key, row.id, `${o.label} · ${row.name}`)
                  : undefined;

                return (
                  <motion.div
                    key={o.key}
                    // On touch the 10px bar takes taps 17px above and below.
                    className={`relative touch:before:absolute touch:before:inset-x-0 touch:before:-inset-y-[17px] touch:before:content-[''] ${watch ? "cursor-pointer" : "cursor-default"}`}
                    style={{
                      background: row.fill(o),
                      borderTopLeftRadius: isFirst
                        ? "var(--radius-cell)"
                        : undefined,
                      borderBottomLeftRadius: isFirst
                        ? "var(--radius-cell)"
                        : undefined,
                      borderTopRightRadius: isLast
                        ? "var(--radius-cell)"
                        : undefined,
                      borderBottomRightRadius: isLast
                        ? "var(--radius-cell)"
                        : undefined,
                    }}
                    initial={
                      shouldReduceMotion
                        ? { width: `${share}%`, opacity: 0 }
                        : { width: "0%" }
                    }
                    animate={
                      shouldReduceMotion
                        ? { width: `${share}%`, opacity: 1 }
                        : { width: `${share}%` }
                    }
                    transition={{
                      duration: shouldReduceMotion ? 0.2 : 0.5,
                      ease: EASE_CHART,
                    }}
                    tabIndex={0}
                    {...watchableSegmentProps(watch, label)}
                    onPointerDown={(e) => {
                      if (fingerTap.press(e, hovered === id)) setHovered(id);
                    }}
                    onClick={() =>
                      fingerTap.click(watch, () => setHovered(null))
                    }
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(id)}
                    onBlur={() => setHovered(null)}
                  >
                    <SegmentTooltip
                      open={hovered === id}
                      label={o.label}
                      detail={`${row.name} ${row.own[o.key]} · ${row.otherName} ${row.other[o.key]}`}
                      align={isFirst ? "start" : isLast ? "end" : "center"}
                      watchable={Boolean(watch)}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}

      {legend}
    </section>
  );
}

export function SegmentTooltip({
  open,
  label,
  detail,
  align,
  watchable,
}: {
  open: boolean;
  label: string;
  detail: string;
  align: "start" | "center" | "end";
  /** The segment opens its points in the Video tab. */
  watchable: boolean;
}) {
  const coarse = useCoarsePointer();
  return (
    <ChartTooltip
      open={open}
      align={align}
      offset={6}
      className="gap-0.5 px-2.5 py-2"
    >
      <span className="text-[12px] font-medium text-white">{label}</span>
      <span className="tabular text-[11px] text-white/[0.64]">{detail}</span>
      {watchable && (
        <span className="text-[10px] text-white/[0.64]">
          {coarse ? "Tap again to watch in Video" : "Click to watch in Video"}
        </span>
      )}
    </ChartTooltip>
  );
}
