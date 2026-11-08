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
import { LegendMark } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { hatch } from "@/components/dashboard/matches/match-detail/chart-fills";
import { useStatisticsLobKeys } from "@/components/dashboard/matches/match-detail/statistics-lob-keys";
import {
  netGameTally,
  type NetEnding,
  type NetEntry,
  type NetGameTally,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";
import { EmptyMark } from "@/components/ui/empty-mark";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The Statistics tab's "Net game" card, built on `PointEndingsCard`'s model:
 * the same section chrome, per-player name and total, 10px stacked bar with
 * 2px gaps and 4px outer corners, hatched related segments, 8px legend marks
 * and the dark segment readout.
 *
 * Per player, over the points THAT player came to the net on (`cameToNet`):
 *
 * - the endings bar (`netEndingOf`, from that player's view) — won by a
 *   Winner or an Opponent error, lost to an Own error, being Passed or being
 *   Lobbed. Lobbed needs the ball-paths file's lobs (`useStatisticsLobKeys`);
 *   without them those points are Passed and Lobbed leaves the bar and the
 *   legend, rather than reading as a measured zero.
 * - under it a 4px "came in by" bar (`netEntryOf`) — Approach, Serve and
 *   volley, Drawn in — with its counts as one line of text.
 *
 * Both bars are counted with the classifiers the Video tab's `netEnding` /
 * `netEntry` cut extras run, so a segment's count is exactly what its click
 * opens. "Estimated from movement": a player is seen at the net only when
 * they strike the ball there.
 *
 * The viewer's bar is first (`useMatchSides()`, guardrails §4). Shade 5 has
 * no light-mode token (the viz ramp stops at four steps a side), so it is
 * written as a hex: the value `--viz-you-light` / `--viz-opp-light` takes in
 * the dark scope.
 *
 * Empty (nobody came to the net): the card's anatomy with a dash for each
 * total, empty tracks, the legend and one sentence — never a skeleton
 * (`reference/empty-and-loading.md`). No points at all: nothing, like
 * `PointEndingsCard` (the Statistics view draws its own zero then).
 */

const EASE_CHART = [0.2, 0, 0.4, 1] as const;

interface SegmentMeta<K extends string> {
  key: K;
  label: string;
  you: string;
  opp: string;
}

const YOU_5 = "#BFDBFE";
const OPP_5 = "#E2E8F0";

const ENDINGS: SegmentMeta<NetEnding>[] = [
  {
    key: "winner",
    label: "Winner",
    you: "var(--viz-you-deep)",
    opp: "var(--viz-opp-deep)",
  },
  {
    key: "opponent-error",
    label: "Opponent error",
    you: hatch("var(--viz-you)"),
    opp: hatch("var(--viz-opp)"),
  },
  {
    key: "own-error",
    label: "Own error",
    you: hatch("var(--viz-you-mid)"),
    opp: hatch("var(--viz-opp-mid)"),
  },
  {
    key: "passed",
    label: "Passed",
    you: "var(--viz-you-light)",
    opp: "var(--viz-opp-light)",
  },
  { key: "lobbed", label: "Lobbed", you: YOU_5, opp: OPP_5 },
];

const WON_ENDINGS: NetEnding[] = ["winner", "opponent-error"];

const ENTRIES: SegmentMeta<NetEntry>[] = [
  {
    key: "approach",
    label: "Approach",
    you: "var(--viz-you-deep)",
    opp: "var(--viz-opp-deep)",
  },
  {
    key: "serve-volley",
    label: "Serve and volley",
    you: "var(--viz-you-mid)",
    opp: "var(--viz-opp-mid)",
  },
  { key: "drawn-in", label: "Drawn in", you: YOU_5, opp: OPP_5 },
];

/** The endings the card draws: Lobbed only when lobs are known. */
export function netEndingsFor(hasLobs: boolean): NetEnding[] {
  return ENDINGS.map((e) => e.key).filter((k) => hasLobs || k !== "lobbed");
}

/** "Came in by · Approach 14 · Serve and volley 3" — zero parts omitted. */
export function cameInByLine(entries: Record<NetEntry, number>): string {
  const parts = ENTRIES.filter((e) => entries[e.key] > 0).map(
    (e) => `${e.label} ${entries[e.key]}`,
  );
  return ["Came in by", ...parts].join(" · ");
}

/** A segment's cut: that side's net points, by ending or by entry. */
export function netGameCut(
  side: "you" | "opp",
  by: { netEnding: NetEnding } | { netEntry: NetEntry },
): FilmCut {
  return sideCut(by, side, "net");
}

export function NetGameCard() {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { points } = useMatchData();
  const lobKeys = useStatisticsLobKeys();
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const cardRef = useTouchReadout<HTMLElement>(hovered !== null, () =>
    setHovered(null),
  );
  const fingerTap = useFingerTap();

  const youIsPlayer1 = sides.you.isPlayer1;
  const { youTally, oppTally } = useMemo(
    () => ({
      youTally: netGameTally(points, youIsPlayer1, lobKeys),
      oppTally: netGameTally(points, !youIsPlayer1, lobKeys),
    }),
    [points, youIsPlayer1, lobKeys],
  );
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  if (points.length === 0) return null;

  const endings = ENDINGS.filter((e) =>
    netEndingsFor(!!lobKeys).includes(e.key),
  );
  const empty = youTally.total === 0 && oppTally.total === 0;

  const header = (
    <div className="flex items-baseline gap-2">
      <span id="net-game-heading" className="eyebrow">
        Net game
      </span>
      <div className="flex-1" />
      <span
        className="text-micro whitespace-nowrap"
        style={{ color: "var(--ink-400)" }}
      >
        Estimated from movement
      </span>
    </div>
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-0.5">
      {(
        [
          ["Won", endings.filter((e) => WON_ENDINGS.includes(e.key))],
          ["Lost", endings.filter((e) => !WON_ENDINGS.includes(e.key))],
        ] as const
      ).map(([group, items]) => (
        <span
          key={group}
          className="inline-flex flex-wrap items-center gap-x-3.5 gap-y-1.5"
        >
          <span
            className="text-micro whitespace-nowrap"
            style={{ color: "var(--ink-600)" }}
          >
            {group}
          </span>
          {items.map((e) => (
            <span key={e.key} className="inline-flex items-center gap-1.5">
              <LegendMark color={e.you} />
              <span
                className="text-micro whitespace-nowrap"
                style={{ color: "var(--ink-400)" }}
              >
                {e.label}
              </span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );

  // Nobody came to the net — two filled bars would claim a split that does not
  // exist. The anatomy stays: names, a dash for each total, empty tracks, the
  // legend and one sentence.
  if (empty) {
    return (
      <section
        aria-labelledby="net-game-heading"
        className="surface-card flex flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="net-game-empty"
      >
        {header}
        {[youName, oppName].map((name, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {name}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px]">
                <EmptyMark label="No net points" className="text-[10px]" />
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-2.5 w-full rounded-[var(--radius-cell)]"
              style={{ background: "var(--ink-100)" }}
            />
          </div>
        ))}
        {legend}
        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          Neither player came to the net in this match.
        </p>
      </section>
    );
  }

  const rows: {
    id: "you" | "opp";
    name: string;
    otherName: string;
    own: NetGameTally;
    other: NetGameTally;
  }[] = [
    {
      id: "you",
      name: youName,
      otherName: oppName,
      own: youTally,
      other: oppTally,
    },
    {
      id: "opp",
      name: oppName,
      otherName: youName,
      own: oppTally,
      other: youTally,
    },
  ];

  /** One clickable, hoverable segment of either bar. */
  const segment = ({
    id,
    label,
    fill,
    share,
    isFirst,
    isLast,
    detail,
    watch,
    tall,
  }: {
    id: string;
    label: string;
    fill: string;
    share: number;
    isFirst: boolean;
    isLast: boolean;
    detail: string;
    watch: (() => void) | undefined;
    tall: boolean;
  }) => (
    <motion.div
      key={id}
      // The 10px bar takes taps 17px above and below; the 4px bar 8px, so it
      // never reaches over the endings bar above it.
      className={`relative touch:before:absolute touch:before:inset-x-0 touch:before:content-[''] ${tall ? "touch:before:-inset-y-[17px]" : "touch:before:-inset-y-[8px]"} ${watch ? "cursor-pointer" : "cursor-default"}`}
      style={{
        background: fill,
        borderTopLeftRadius: isFirst ? "var(--radius-cell)" : undefined,
        borderBottomLeftRadius: isFirst ? "var(--radius-cell)" : undefined,
        borderTopRightRadius: isLast ? "var(--radius-cell)" : undefined,
        borderBottomRightRadius: isLast ? "var(--radius-cell)" : undefined,
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
      {...watchableSegmentProps(watch, `${label}. ${detail}.`)}
      onPointerDown={(e) => {
        if (fingerTap.press(e, hovered === id)) setHovered(id);
      }}
      onClick={() => fingerTap.click(watch, () => setHovered(null))}
      onMouseEnter={() => setHovered(id)}
      onMouseLeave={() => setHovered(null)}
      onFocus={() => setHovered(id)}
      onBlur={() => setHovered(null)}
    >
      <SegmentTooltip
        open={hovered === id}
        label={label}
        detail={detail}
        align={isFirst ? "start" : isLast ? "end" : "center"}
        watchable={Boolean(watch)}
      />
    </motion.div>
  );

  return (
    <section
      ref={cardRef}
      aria-labelledby="net-game-heading"
      className="surface-card flex flex-col gap-3"
      style={{ padding: "16px 20px 14px" }}
      data-testid="net-game-card"
    >
      {header}

      {rows.map((row) => {
        const fillOf = (m: SegmentMeta<string>) =>
          row.id === "you" ? m.you : m.opp;
        const watchFor = (
          by: { netEnding: NetEnding } | { netEntry: NetEntry },
          label: string,
        ) =>
          meta.hasPlayableVideo
            ? () =>
                actions.watchCut(
                  netGameCut(row.id, by),
                  `${label} · ${row.name}`,
                )
            : undefined;
        const endingSegs = endings.filter((e) => row.own.endings[e.key] > 0);
        const entrySegs = ENTRIES.filter((e) => row.own.entries[e.key] > 0);
        const entryTotal = entrySegs.reduce(
          (sum, e) => sum + row.own.entries[e.key],
          0,
        );

        return (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px] text-[var(--ink-400)]">
                {row.own.total}
              </span>
            </div>

            {row.own.total === 0 ? (
              // This player never came in, the other did: an empty track,
              // not a bar that reads as zero of something.
              <div
                aria-hidden="true"
                className="h-2.5 w-full rounded-[var(--radius-cell)]"
                style={{ background: "var(--ink-100)" }}
              />
            ) : (
              <>
                <div className="flex h-2.5 w-full gap-0.5">
                  {endingSegs.map((e, i) =>
                    segment({
                      id: `${row.id}-ending-${e.key}`,
                      label: e.label,
                      fill: fillOf(e),
                      share: (row.own.endings[e.key] / row.own.total) * 100,
                      isFirst: i === 0,
                      isLast: i === endingSegs.length - 1,
                      detail: `${row.name} ${row.own.endings[e.key]} · ${row.otherName} ${row.other.endings[e.key]}`,
                      watch: watchFor({ netEnding: e.key }, e.label),
                      tall: true,
                    }),
                  )}
                </div>
                <div className="flex h-1 w-full gap-0.5">
                  {entrySegs.map((e, i) =>
                    segment({
                      id: `${row.id}-entry-${e.key}`,
                      label: e.label,
                      fill: fillOf(e),
                      share:
                        entryTotal > 0
                          ? (row.own.entries[e.key] / entryTotal) * 100
                          : 0,
                      isFirst: i === 0,
                      isLast: i === entrySegs.length - 1,
                      detail: `${row.name} ${row.own.entries[e.key]} · ${row.otherName} ${row.other.entries[e.key]}`,
                      watch: watchFor({ netEntry: e.key }, e.label),
                      tall: false,
                    }),
                  )}
                </div>
                <span
                  className="tabular text-[11px]"
                  style={{ color: "var(--ink-500)" }}
                >
                  {cameInByLine(row.own.entries)}
                </span>
              </>
            )}
          </div>
        );
      })}

      {legend}
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
