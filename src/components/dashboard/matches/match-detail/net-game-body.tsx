"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { watchableSegmentProps } from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  segmentMotion,
  SegmentTooltip,
} from "@/components/dashboard/matches/match-detail/point-endings-body";
import { LegendMark } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { hatch } from "@/components/dashboard/matches/match-detail/chart-fills";
import type {
  NetEnding,
  NetEntry,
  NetGameTally,
} from "@/components/dashboard/matches/match-detail/match-filters/net-game";
import { EmptyMark } from "@/components/ui/empty-mark";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";

/**
 * The "Net game" card as a presentational surface, built on the How points
 * ended body's model: the same section chrome, per-player name and total,
 * 10px stacked bar with 2px gaps and 4px outer corners, hatched related
 * segments, 8px legend marks and the dark segment readout.
 *
 * Per side, over the points THAT side came to the net on (`netGameTally`,
 * `match-filters/net-game.ts`):
 *
 * - the endings bar — won by a Winner or an Opponent error, lost to an Own
 *   error, being Passed or being Lobbed. Lobbed needs every point's lobs to
 *   be known (`hasLobs`); without them those points are Passed, the segment
 *   reads "Passed or lobbed" and Lobbed leaves the bar and the legend, rather
 *   than reading as a measured zero.
 * - under it a 4px "came in by" bar — Approach, Serve and volley, Drawn in —
 *   with its counts as one line of text.
 *
 * It draws exactly two things, from two callers:
 *
 * - the match report's `NetGameCard` (`net-game-card.tsx`), which tallies the
 *   match's points and, with a playable video, hands it `watch` so every
 *   segment opens its points in the Video tab;
 * - the team player profile's `SeasonNetGameCard`, which hands it a season's
 *   summed tallies (`seasonNetGame`, `lib/data/player-season.ts`) and no
 *   `watch` — a season segment is many matches, with no one film to open.
 *
 * Which side is "you" is the caller's to decide (guardrails §4): the body
 * takes `youName`/`oppName` and tallies already taken from each side, and
 * nothing here reads `player1`/`player2`. Shade 5 has no light-mode token
 * (the viz ramp stops at four steps a side), so it is written as a hex: the
 * value `--viz-you-light` / `--viz-opp-light` takes in the dark scope.
 *
 * Empty (neither side came to the net): the card's anatomy with a dash for
 * each total, empty tracks, the legend and one sentence (`emptySentence`) —
 * never a skeleton and never a zero (`reference/empty-and-loading.md`).
 */

interface SegmentMeta<K extends string> {
  key: K;
  label: string;
  /**
   * Shorter legend text, so the four (or five) keys fit one row in a 390px
   * card. The segment's readout and its Video title keep `label`.
   */
  legendLabel?: string;
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
    legendLabel: "Their error",
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

/**
 * "Passed" when lobs are known; without them a lob over the net player is
 * counted there too, so the segment says so rather than claiming every one
 * was a pass.
 */
export const PASSED_OR_LOBBED = "Passed or lobbed";

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

/**
 * Opens one segment's points — the report's `watchCut` behind the body.
 * `title` is the segment named for the Video tab's banner, "Approach · Rivera".
 */
export type NetSegmentWatch = (
  side: "you" | "opp",
  by: { netEnding: NetEnding } | { netEntry: NetEntry },
  title: string,
) => void;

/** The report's own empty sentence; a caller over another scope passes its own. */
const REPORT_EMPTY_SENTENCE = "Neither player came to the net in this match.";

export interface NetGameBodyProps {
  /** The first row's tally — the viewer's side, or the player profiled. */
  youTally: NetGameTally;
  /** The second row's — the opponent, or every opponent over a season. */
  oppTally: NetGameTally;
  youName: string;
  oppName: string;
  /** Lobs are known for every point counted: Lobbed is its own segment. */
  hasLobs: boolean;
  /** Opens a segment's points in Video; absent, nothing here takes a click. */
  watch?: NetSegmentWatch;
  /** The heading's id, for the section's `aria-labelledby`. */
  headingId?: string;
  /** The one sentence under the empty tracks. */
  emptySentence?: string;
}

export function NetGameBody({
  youTally,
  oppTally,
  youName,
  oppName,
  hasLobs,
  watch: onWatch,
  headingId = "net-game-heading",
  emptySentence = REPORT_EMPTY_SENTENCE,
}: NetGameBodyProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const cardRef = useTouchReadout<HTMLElement>(hovered !== null, () =>
    setHovered(null),
  );
  const fingerTap = useFingerTap();

  const shown = netEndingsFor(hasLobs);
  const endings = ENDINGS.filter((e) => shown.includes(e.key)).map((e) =>
    !hasLobs && e.key === "passed" ? { ...e, label: PASSED_OR_LOBBED } : e,
  );
  const empty = youTally.total === 0 && oppTally.total === 0;

  const header = (
    <div className="flex items-baseline gap-2">
      <span id={headingId} className="eyebrow">
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

  // One flat row in bar order, as the Point endings card keys its bar
  // (design canvas "Match page refinements", board 6, option B). Which
  // endings are won and which lost, the words already say.
  const legend = (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5"
    >
      {endings.map((e) => (
        <span key={e.key} className="inline-flex items-center gap-1.5">
          <LegendMark color={e.you} />
          <span className="text-micro whitespace-nowrap">
            {e.legendLabel ?? e.label}
          </span>
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
        aria-labelledby={headingId}
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
              className="h-3.5 w-full rounded-[var(--radius-cell)]"
              style={{ background: "var(--ink-100)" }}
            />
          </div>
        ))}
        {legend}
        <p className="text-micro" style={{ color: "var(--ink-500)" }}>
          {emptySentence}
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
      // The 14px bar takes taps 17px above and below; the 6px bar 8px, so it
      // never reaches over the endings bar above it.
      className={`relative touch:before:absolute touch:before:inset-x-0 touch:before:content-[''] ${tall ? "touch:before:-inset-y-[17px]" : "touch:before:-inset-y-[8px]"} ${watch ? "cursor-pointer" : "cursor-default"}`}
      style={{
        background: fill,
        borderTopLeftRadius: isFirst ? "var(--radius-cell)" : undefined,
        borderBottomLeftRadius: isFirst ? "var(--radius-cell)" : undefined,
        borderTopRightRadius: isLast ? "var(--radius-cell)" : undefined,
        borderBottomRightRadius: isLast ? "var(--radius-cell)" : undefined,
      }}
      {...segmentMotion(
        share,
        hovered !== null && hovered !== id,
        shouldReduceMotion,
      )}
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
      aria-labelledby={headingId}
      // `flex-1`: the card shares the chart column's spare height with Rally
      // length; `justify-between` spreads its share between the rows.
      className="surface-card flex flex-1 flex-col justify-between gap-3"
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
          onWatch
            ? () => onWatch(row.id, by, `${label} · ${row.name}`)
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
                className="h-3.5 w-full rounded-[var(--radius-cell)]"
                style={{ background: "var(--ink-100)" }}
              />
            ) : (
              <>
                <div className="flex h-3.5 w-full gap-0.5">
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
                <div className="flex h-1.5 w-full gap-0.5">
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
