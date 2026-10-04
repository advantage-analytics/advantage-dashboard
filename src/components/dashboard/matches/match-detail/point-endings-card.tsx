"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  sideCut,
  watchableSegmentProps,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { EmptyMark } from "@/components/ui/empty-mark";
import {
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
 *   winners        `result_type LIKE '%Winner%'`  (so 'Service Winner',
 *                  'Forehand Winner' … all land here, as they do in the
 *                  published card)
 *   unforced errs  `result_type LIKE '%Unforced Error%'`
 * Aces and double faults belong to the server structurally. Winners are
 * credited by `winnerHitBy` — a service winner to the SERVER, though its last
 * shot row is usually the returner's missed return — and unforced errors by
 * `errorMadeBy`: the rules the Result filters a segment opens read, and the
 * one `calculate_match_stats` publishes winners by.
 *
 * ACES ON A DERIVED MATCH. The derivation never emits 'Ace' (see
 * `services/splitstep/derivation/result-type.ts`): every unreturned serve is
 * a 'Service Winner'. Product decision (2026-09-29): on these matches an
 * unreturned serve the server won IS an ace (`isUnreturnedServe`), as the
 * head-to-head Aces row counts it. So the segment counts those, Winners
 * leaves them out, and Winners' cut narrows to `rally-winner` — the derived
 * head-to-head Winners row's own — so the two never open the same point.
 *
 * Whole match, always: the tally is taken over every point in
 * `useMatchData().points`, the same read every point-derived card on this tab
 * makes (rally-length-card.tsx takes the identical dependency). The match
 * filters live on the Video tab only.
 *
 * With a playable video each segment opens its points in the Video tab
 * (`outcomeCut`) on click or Enter — hovering only reads. Without one the
 * markup is exactly the read-only card.
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
  isDerived = false,
): FilmCut {
  return sideCut(
    isDerived && key === "winners"
      ? { resultEnding: ["winner"], ending: "rally-winner" }
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
 * counts in its segment hovers.
 */
export function outcomeTally(
  points: MatchPoint[],
  isPlayer1: boolean,
  isDerived: boolean,
): Tally {
  const t = emptyTally();

  for (const p of points) {
    const result = (p.resultType ?? "").toLowerCase();
    const iServed = p.serverIsPlayer1 === isPlayer1;

    if (isDerived ? isUnreturnedServe(p) : result === "ace") {
      if (iServed) t.aces += 1;
    } else if (result === "double fault") {
      if (iServed) t.doubleFaults += 1;
    } else if (result.includes("winner")) {
      if (winnerHitBy(p) === isPlayer1) t.winners += 1;
    } else if (result.includes("unforced error")) {
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
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  const youIsPlayer1 = sides.you.isPlayer1;

  const { youTally, oppTally } = useMemo(
    () => ({
      youTally: outcomeTally(points, youIsPlayer1, isDerived),
      oppTally: outcomeTally(points, !youIsPlayer1, isDerived),
    }),
    [points, youIsPlayer1, isDerived],
  );

  const youTotal = OUTCOMES.reduce((sum, o) => sum + youTally[o.key], 0);
  const oppTotal = OUTCOMES.reduce((sum, o) => sum + oppTally[o.key], 0);

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
        const segments = OUTCOMES.filter((o) => row.own[o.key] > 0);

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
                        outcomeCut(o.key, row.id, isDerived),
                        `${o.label} · ${row.name}`,
                      )
                  : undefined;

                return (
                  <motion.div
                    key={o.key}
                    className={
                      watch
                        ? "relative cursor-pointer"
                        : "relative cursor-default"
                    }
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
        {/* Local swatch, not the shared `LegendSwatch` — this legend runs at
            6px, smaller than that component's fixed 8px dot. */}
        {OUTCOMES.map((o) => (
          <span key={o.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
              style={{ background: o.you }}
            />
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
          Click to watch in Video
        </span>
      )}
    </ChartTooltip>
  );
}
