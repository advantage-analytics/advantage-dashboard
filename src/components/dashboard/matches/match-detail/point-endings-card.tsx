"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import {
  sideCut,
  watchableSegmentProps,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { LegendMark } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { EmptyMark } from "@/components/ui/empty-mark";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
import {
  countsAsWinner,
  errorMadeBy,
  isUnreturnedServe,
  winnerHitBy,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { MatchPoint } from "@/lib/data/match-points-server";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The Statistics tab's "How points ended" card (artboard 46a, lines 550–556).
 *
 * One 100% stacked bar per player over that player's OWN decisive shots:
 * winners, aces, unforced errors, double faults. The bars are not compared
 * against each other by length — each is its own composition — so the hover
 * carries the cross-reference count instead.
 *
 * The viewer's bar is first (`useMatchSides()`, guardrails §4), never
 * player1's.
 *
 * BUCKETING follows `calculate_match_stats`, which reads all four of these
 * exclusively off the free-text `points.result_type`:
 *   aces           `result_type = 'Ace'`
 *   double faults  `result_type = 'Double Fault'`
 *   winners        `result_type LIKE '%Winner%'` less 'Service Winner'
 *                  (`countsAsWinner`), as the published card counts them
 *   unforced errs  `result_type LIKE '%Unforced Error%'`
 * UNTIL THE ERRORS ARE JUDGED (`MatchFilterContext.errorSplitJudged`, read
 * off the filter context) the third segment is every error instead — forced
 * and unforced, any `result_type` ending in "error" — and reads "Errors"
 * (`outcomesFor`), since its "unforced" figure would be every error anyway.
 * Aces and double faults belong to the server structurally. Winners are
 * credited by `winnerHitBy` and unforced errors by `errorMadeBy`: the rules
 * the Result filters a segment opens read.
 *
 * A SERVICE WINNER IS NONE OF THE FOUR, unless a derived match reads it as an
 * ace: product decision (2026-10-30), it does not count as a winner. So that
 * point is on neither player's bar.
 *
 * ACES ON A DERIVED MATCH. The derivation never emits 'Ace' (see
 * `services/splitstep/derivation/result-type.ts`): every unreturned serve is
 * a 'Service Winner', as is a return struck and missed. Product decision
 * (2026-09-29): on these matches an unreturned serve the server won IS an
 * ace (`isUnreturnedServe`), as the head-to-head Aces row counts it.
 *
 * Whole match, always: the tally is taken over every point in
 * `useMatchData().points`, the same read every point-derived card on this tab
 * makes (rally-length-card.tsx takes the identical dependency). The match
 * filters live on the Video tab only.
 *
 * With a playable video each segment opens its points in the Video tab
 * (`outcomeCut`) on click or Enter — hovering only reads. Without one the
 * markup is exactly the read-only card.
 *
 * On touch a tap selects a segment and its readout stays until a tap lands
 * outside the card; with a video, a second tap on the selected segment opens
 * it. The 10px bar takes taps 17px above and below it, so a finger reaches it.
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

export type OutcomeKey = "winners" | "aces" | "unforcedErrors" | "doubleFaults";

interface OutcomeMeta {
  key: OutcomeKey;
  label: string;
  /** Shorter legend text — the 6px-swatch row has no room for "errors". */
  legendLabel?: string;
  /** Fill for the viewer's bar. */
  you: string;
  /** Fill for the opponent's bar. */
  opp: string;
}

/** The judged split: the third segment is the unforced errors alone. */
const OUTCOMES: OutcomeMeta[] = [
  {
    key: "winners",
    label: "Winners",
    you: "var(--viz-you-deep)",
    opp: "var(--viz-opp-deep)",
  },
  { key: "aces", label: "Aces", you: "var(--viz-you)", opp: "var(--viz-opp)" },
  {
    key: "unforcedErrors",
    label: "Unforced errors",
    legendLabel: "Unforced",
    you: "var(--viz-you-mid)",
    opp: "var(--viz-opp-mid)",
  },
  {
    key: "doubleFaults",
    label: "Double faults",
    you: "var(--viz-you-light)",
    opp: "var(--viz-opp-light)",
  },
];

/**
 * The unjudged match's third segment: every error, forced and unforced. Same
 * key and fills, only the words change — the bar still has four segments.
 */
const ERRORS_OUTCOME: OutcomeMeta = {
  key: "unforcedErrors",
  label: "Errors",
  legendLabel: "Errors",
  you: "var(--viz-you-mid)",
  opp: "var(--viz-opp-mid)",
};

/** The card's four outcomes, with the errors segment set to the match's split. */
export function outcomesFor(errorSplitJudged: boolean): OutcomeMeta[] {
  return errorSplitJudged
    ? OUTCOMES
    : OUTCOMES.map((o) => (o.key === "unforcedErrors" ? ERRORS_OUTCOME : o));
}

/** The errors segment's base cut while the split is not judged: every error. */
const ERRORS_BASE_CUT: FilmCut = { resultEnding: ["error"], ending: "error" };

/**
 * Each outcome's base cut, before a side is laid over it by `sideCut` — the
 * shared filters' Result › Ending, narrowed by a Film-only `ending` where
 * Ending alone would admit points this card counts in another segment (see
 * `FilmCutEnding`); aces are Serve › Result "Ace", exact on its own. The four
 * are exclusive, like the tally below: a double fault is Error + Serve, which
 * no unforced error is.
 */
const OUTCOME_BASE_CUT: Record<OutcomeKey, FilmCut> = {
  winners: { resultEnding: ["winner"], ending: "winner" },
  unforcedErrors: { resultEnding: ["error"], ending: "unforced-error" },
  doubleFaults: { resultEnding: ["error"], resultShot: ["Serve"] },
  aces: { serveResult: ["ace"] },
};

/**
 * The film cut behind one segment of one side's bar. Aces are the SERVER's
 * (Serve › Player); the other three are Result › Hit by, the point of view
 * Ending reads — whoever hit the winner or made the error, the server for a
 * double fault. That is exactly the line `head-to-head-card.tsx`'s `sideCut`
 * draws for the same four rows, so this delegates to it rather than
 * re-deriving it here. `you`/`opp` are relative, resolved through the filter
 * context's `youIsPlayer1` inside the film tab (guardrails §4); nothing here
 * reads player order.
 */
export function outcomeCut(
  key: OutcomeKey,
  side: "you" | "opp",
  errorSplitJudged = true,
): FilmCut {
  return sideCut(
    !errorSplitJudged && key === "unforcedErrors"
      ? ERRORS_BASE_CUT
      : OUTCOME_BASE_CUT[key],
    side,
    key === "aces" ? "server" : "player",
  );
}

type Tally = Record<OutcomeKey, number>;

function emptyTally(): Tally {
  return { winners: 0, aces: 0, unforcedErrors: 0, doubleFaults: 0 };
}

/**
 * One pass, one bucket per point. The chain is exclusive on purpose: a point
 * counted in two segments would make the bar's own total disagree with the
 * counts in its segment hovers. With `errorSplitJudged` false the errors
 * bucket takes every error (a `result_type` ending in "error"), forced ones
 * included; a double fault is caught earlier in the chain either way.
 */
export function outcomeTally(
  points: MatchPoint[],
  isPlayer1: boolean,
  isDerived: boolean,
  errorSplitJudged = true,
): Tally {
  const t = emptyTally();

  for (const p of points) {
    const result = (p.resultType ?? "").toLowerCase();
    const iServed = p.serverIsPlayer1 === isPlayer1;

    if (isDerived ? isUnreturnedServe(p) : result === "ace") {
      if (iServed) t.aces += 1;
    } else if (result === "double fault") {
      if (iServed) t.doubleFaults += 1;
    } else if (countsAsWinner(p)) {
      if (winnerHitBy(p) === isPlayer1) t.winners += 1;
    } else if (
      errorSplitJudged
        ? result.includes("unforced error")
        : result.trim().endsWith("error")
    ) {
      if (errorMadeBy(p) === isPlayer1) t.unforcedErrors += 1;
    }
  }

  return t;
}

interface PointEndingsCardProps {
  /** Video-derived match — aces are its unreturned serves (`outcomeTally`). */
  isDerived: boolean;
}

export function PointEndingsCard({ isDerived }: PointEndingsCardProps) {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { points } = useMatchData();
  // Whether the errors are split forced/unforced — the filter context's
  // reading, never re-derived here. Unjudged, the third segment is "Errors".
  const errorSplitJudged = useMatchFilters().context.errorSplitJudged === true;
  const outcomes = outcomesFor(errorSplitJudged);
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const cardRef = useTouchReadout<HTMLElement>(hovered !== null, () =>
    setHovered(null),
  );
  const fingerTap = useFingerTap();

  const youIsPlayer1 = sides.you.isPlayer1;

  const { youTally, oppTally } = useMemo(
    () => ({
      youTally: outcomeTally(points, youIsPlayer1, isDerived, errorSplitJudged),
      oppTally: outcomeTally(
        points,
        !youIsPlayer1,
        isDerived,
        errorSplitJudged,
      ),
    }),
    [points, youIsPlayer1, isDerived, errorSplitJudged],
  );

  const youTotal = outcomes.reduce((sum, o) => sum + youTally[o.key], 0);
  const oppTotal = outcomes.reduce((sum, o) => sum + oppTally[o.key], 0);

  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  // No point on this match records how it ended — two filled bars would read
  // as "nobody hit a winner or made an error". The anatomy stays: both names,
  // a dash for each total, an empty track, the legend, and one sentence.
  if (youTotal === 0 && oppTotal === 0) {
    return (
      <section
        aria-labelledby="point-endings-heading"
        className="surface-card flex flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="point-endings-empty"
      >
        <div className="flex items-baseline gap-2">
          <span id="point-endings-heading" className="eyebrow">
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

        <p className="text-micro pt-0.5" style={{ color: "var(--ink-500)" }}>
          No point on this match records how it ended.
        </p>
      </section>
    );
  }
  const rows: {
    id: "you" | "opp";
    name: string;
    otherName: string;
    own: Tally;
    other: Tally;
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
      aria-labelledby="point-endings-heading"
      className="surface-card flex flex-col gap-3"
      style={{ padding: "16px 20px 14px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id="point-endings-heading" className="eyebrow">
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
                // Only with a playable video does the segment take a click;
                // every attribute below is `undefined` otherwise, so the
                // read-only markup is unchanged. Focus is `focus.css`'s ring.
                const watch = meta.hasPlayableVideo
                  ? () =>
                      actions.watchCut(
                        outcomeCut(o.key, row.id, errorSplitJudged),
                        `${o.label} · ${row.name}`,
                      )
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
    </section>
  );
}

function SegmentTooltip({
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
