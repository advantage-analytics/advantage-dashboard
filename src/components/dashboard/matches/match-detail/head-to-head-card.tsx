"use client";

import { useMemo, useState } from "react";
import { CirclePlay } from "lucide-react";

import { ChartTooltip } from "@/components/dashboard/matches/match-detail/chart-tooltip";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  applyFilmCut,
  sideCut,
  type CutSide,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  buildStatRows,
  groupsFor,
  tallySide,
  withLobAvailability,
  withPointRows,
  type H2HRow,
  type H2HValue,
} from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import {
  EASE,
  HeadToHeadTable,
  LABEL_SLOT,
  RowLabel,
  STRETCHED,
  type FigureTarget,
  type RowInteraction,
  type TargetHandlers,
} from "@/components/dashboard/matches/match-detail/head-to-head-table";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { useStatisticsLobKeys } from "@/components/dashboard/matches/match-detail/statistics-lob-keys";
import { useFingerTap, useTouchReadout } from "@/hooks/use-touch-readout";
import { surnameLabels } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";

/**
 * The Statistics pane's head-to-head table (artboard 47f).
 *
 * A plain two-column table: the statistic on the left, both players' numbers
 * on the right, and nothing between them. The 46a card drew mirrored values
 * around a centred label with a share bar under each row and a fraction beside
 * each number; at fifteen rows that is three visual channels saying the same
 * thing, so the bar and the sub-figure are gone and the fraction moved into
 * the row's hover tooltip.
 *
 * Which side is "you" comes exclusively from `useMatchSides()` (guardrails §4).
 * Nothing in this file reads `player1`/`player2` to decide which column a
 * number belongs in — the row builder (`head-to-head-rows.ts`) takes `you` and
 * `opp` statistics as arguments precisely so the orientation is decided once,
 * at the call site that holds `sides`.
 *
 * The drawing — card, column header, groups, rows, the leader's emphasis and
 * the em dash — is `HeadToHeadTable` (`head-to-head-table.tsx`), shared with
 * the team player profile's season card. What stays here is the match's own:
 * the rows' data, and per row the readouts (`figureReadout`, `rowReadout`)
 * and the click-throughs into Video, handed to the table as `interaction`.
 */

// The rows as data — configuration, published values, leader rule and the
// point-derived tallies — live in `head-to-head-rows.ts`, a pure module the
// team player profile's season fold also runs on the server. Re-exported here
// so every existing import of this module keeps working.
export {
  DERIVED_H2H_GROUPS,
  DERIVED_SERVE_ROWS,
  H2H_GROUPS,
  NO_LOB_DATA_NOTE,
  NO_PASS_DATA_NOTE,
  POINT_ROWS,
  RETURN_ROWS,
  SERVE_ROWS,
  buildStatRows,
  h2hGroups,
  rowLeader,
  rowValue,
  statDisplay,
  tallySide,
  withErrorSplit,
  withLobAvailability,
  withPointRows,
} from "@/components/dashboard/matches/match-detail/head-to-head-rows";
export type {
  H2HRow,
  H2HRowConfig,
  H2HStatKey,
  H2HStats,
  H2HValue,
} from "@/components/dashboard/matches/match-detail/head-to-head-rows";

// `CutSide`/`sideCut` — one value cell's cut, the row's cut with the cell's
// side laid over it — now live in `film-cut-context.tsx` beside `FilmCut`
// itself, since `point-endings-card.tsx` composes a cut the same way.
// Re-exported here so this module's own call sites are unchanged.
export type { CutSide };
export { sideCut };

/* ── Readouts ───────────────────────────────────────────────────────────── */

/**
 * What the cursor (or keyboard focus) is on. The label is the "both players"
 * target and each number is one player's, so the hover says which of the two
 * a click will open before it happens. One hover state at a time: the label
 * washes the row, a number washes only itself — never both at once.
 */
type Zone = "row" | "you" | "opp";

interface HoverTarget {
  row: string;
  zone: Zone;
}

/**
 * A value's fraction in words: `9/12` → `9 of 12`, and a count published with
 * an `of N` detail (total points won) → `68 of 148`. `null` when the value has
 * no fraction behind it.
 */
export function fractionWords(value: H2HValue): string | null {
  const { detail, display } = value;
  if (!detail || !display) return null;
  if (detail.startsWith("of ")) return `${display} ${detail}`;
  const [made, attempts] = detail.split("/");
  return attempts === undefined ? detail : `${made} of ${attempts}`;
}

/** The click-through a readout offers: the scope's point count, in Video. */
export function watchLine(count: number): string {
  // "Watch all 1" reads as a miscount; one point is just "it".
  return count === 1 ? "Watch it in Video" : `Watch all ${count} in Video`;
}

/**
 * What the Video tab's banner names a label click by. The label opens every
 * point the row is about, won or not, so "Net points won · 16 of 87" would read
 * as 16 won: it says "Net points" instead. A figure's click keeps the row's own
 * name, because it does open the points that side won.
 */
export function rowCutLabel(row: Pick<H2HRow, "label" | "sideWon">): string {
  return row.sideWon ? row.label.replace(/ won$/, "") : row.label;
}

/** The same click, for a screen reader, which has no readout title to lean on. */
export function watchLabel(count: number, noun: string): string {
  return count === 1
    ? "Watch it in Video"
    : `Watch all ${count} ${noun} in Video`;
}

interface ReadoutLine {
  name: string;
  value: string;
  /** The opponent recedes, as it does in the Rally length readout. */
  muted?: boolean;
}

/**
 * What a click on the target would do. `watch` opens `count` points in Video;
 * `no-video` holds the same slot on a match with no playable video, so a
 * statistic reads the same with or without one — only the action is gone.
 */
type ReadoutFooter = { kind: "watch"; count: number } | { kind: "no-video" };

const NO_VIDEO_LINE = "No video attached";

/** Everything one readout says. */
interface ReadoutContent {
  title: string;
  lines: ReadoutLine[];
  note?: string;
  footer?: ReadoutFooter;
}

/**
 * Whether a readout has anything to say. A title alone repeats the label the
 * cursor is already on — "Aces" over "Aces" — so it does not count.
 */
export function hasReadout(
  content: ReadoutContent | null,
): content is ReadoutContent {
  if (!content) return false;
  return content.lines.length > 0 || Boolean(content.note || content.footer);
}

const IN_SCOPE = "in this match";

/** A measured zero count. Only a count: 0% of 3 break points is not "none". */
function isZeroCount(value: H2HValue): boolean {
  return value.display === "0";
}

/** A figure's fraction in words with its verb: `11 of 25 won`, or null. */
function fractionPhrase(row: H2HRow, value: H2HValue): string | null {
  const fraction = fractionWords(value);
  return fraction ? [fraction, row.verb].filter(Boolean).join(" ") : null;
}

/** One side's figure in words: `44%, 11 of 25 won`, `68 of 148 won`, `3`. */
function figureWords(row: H2HRow, side: "you" | "opp"): string {
  const value = row[side];
  const inWords = fractionPhrase(row, value);
  // "74 of 138 won" already carries the figure; "44%" does not.
  if (!inWords) return value.display;
  return value.detail?.startsWith("of ")
    ? inWords
    : `${value.display}, ${inWords}`;
}

interface ReadoutScope {
  /** The match has a playable video, so its cuts can be opened. */
  hasVideo: boolean;
  /** How many points the target's cut opens (0 without video). */
  count: number;
  /**
   * Whether "No video attached" is true to say. False on a read-only share
   * link (`meta.readOnly`), which never shows video even when the match has
   * one — the readout carries its evidence alone there.
   */
  noVideoLine: boolean;
}

/**
 * One figure's readout, or `null` for an em dash (which keeps its own "No
 * data" tooltip). The same shape with or without video: the evidence (its
 * fraction, or "No aces in this match" for a zero) is always there, and the
 * footer is the watch line when the cut has points, "No video attached" when
 * it would have had a watch line but the match has no video (never on a
 * read-only share link), and nothing on a statistic with no cut.
 */
export function figureReadout(
  row: H2HRow,
  side: "you" | "opp",
  name: string,
  { hasVideo, count, noVideoLine }: ReadoutScope,
): ReadoutContent | null {
  const value = row[side];
  if (!value.display) return null;
  const title = `${row.label} · ${name}`;
  const phrase = fractionPhrase(row, value);
  const lines: ReadoutLine[] = phrase ? [{ name: phrase, value: "" }] : [];

  if (hasVideo && row.cut && count > 0) {
    return { title, lines, footer: { kind: "watch", count } };
  }
  const note =
    isZeroCount(value) && row.noun ? `No ${row.noun} ${IN_SCOPE}` : undefined;
  // A zero has nothing to watch with or without a video, so it says so and
  // nothing more.
  const footer: ReadoutFooter | undefined =
    noVideoLine && row.cut && !note ? { kind: "no-video" } : undefined;
  return { title, lines, note, footer };
}

/**
 * The label's readout — "both players". The per-side fractions, then the same
 * footer rule a figure follows, over the row's own sideless cut.
 */
export function rowReadout(
  row: H2HRow,
  youName: string,
  oppName: string,
  { hasVideo, count, noVideoLine }: ReadoutScope,
): ReadoutContent {
  const title = row.label;
  const hasFigure = Boolean(row.you.display || row.opp.display);
  const youFraction = fractionWords(row.you);
  const oppFraction = fractionWords(row.opp);
  const lines: ReadoutLine[] =
    youFraction || oppFraction
      ? [
          { name: youName, value: youFraction ?? "—" },
          { name: oppName, value: oppFraction ?? "—", muted: true },
        ]
      : [];

  if (hasVideo && row.cut && count > 0 && hasFigure) {
    return { title, lines, note: row.note, footer: { kind: "watch", count } };
  }
  // Both players at a measured zero: the label answers the way each zero
  // does, rather than going silent between them.
  const bothZero =
    Boolean(row.noun) && isZeroCount(row.you) && isZeroCount(row.opp);
  const note = bothZero ? `No ${row.noun} ${IN_SCOPE}` : row.note;
  const footer: ReadoutFooter | undefined =
    noVideoLine && row.cut && hasFigure && !bothZero
      ? { kind: "no-video" }
      : undefined;
  return { title, lines, note, footer };
}

/** A readout's note and no-video line as a sentence (the lines excluded). */
function tailWords(content: ReadoutContent): string {
  return [
    content.note,
    content.footer?.kind === "no-video" ? NO_VIDEO_LINE : undefined,
  ]
    .filter(Boolean)
    .join(". ");
}

/** A readout as one sentence, for a target that has no click to name. */
function readoutWords(content: ReadoutContent): string {
  return [
    content.lines
      .map((line) => [line.name, line.value].filter(Boolean).join(" "))
      .join("; "),
    tailWords(content),
  ]
    .filter(Boolean)
    .join(". ");
}

/**
 * The dark readout, in three tiers: which statistic (title), the evidence
 * behind the figures (a name/value line per player, in the card's column
 * order), then what a click opens, set off by a hairline so it reads as a
 * consequence rather than more data. Inter tabular throughout — a fraction is
 * a statistic, and Roboto Mono is for machine values.
 *
 * It opens ABOVE its anchor, never over the numbers: for the label it starts at
 * the label's left edge, for a number it ends at that number's right edge. The
 * 168 px floor is the Data Tooltip spec's compact width, and keeps the box
 * from changing size as the cursor crosses from the label to a number.
 */
function Readout({
  open,
  align,
  content,
}: {
  open: boolean;
  align: "start" | "end";
  content: ReadoutContent | null;
}) {
  // A readout with nothing past its title does not open (`hasReadout`).
  if (!hasReadout(content)) return null;
  const { title, lines, note, footer } = content;
  const hasEvidence = lines.length > 0 || Boolean(note);
  return (
    <ChartTooltip
      open={open}
      align={align}
      offset={6}
      className="min-w-[168px] gap-1 px-3 py-2.5 text-left"
    >
      <span className="text-[12px] leading-4 font-medium text-white">
        {title}
      </span>
      {lines.length > 0 && (
        <span className="flex flex-col gap-px">
          {lines.map((line) => (
            <span
              key={line.name}
              className={cn(
                "tabular flex justify-between gap-6 text-[11px] leading-[15px]",
                line.muted ? "text-white/[0.78]" : "text-white",
              )}
            >
              <span>{line.name}</span>
              <span>{line.value}</span>
            </span>
          ))}
        </span>
      )}
      {note && (
        <span className="text-[11px] leading-[15px] text-white/[0.64]">
          {note}
        </span>
      )}
      {footer && (
        <span
          className={cn(
            "tabular flex items-center gap-1.5 text-[11px] leading-[15px]",
            footer.kind === "watch" ? "text-white/[0.86]" : "text-white/[0.64]",
            // The hairline divides evidence from the action; with no evidence
            // (a count row) there is nothing to divide it from.
            hasEvidence && "mt-[5px] border-t border-white/10 pt-[7px]",
          )}
        >
          {footer.kind === "watch" ? (
            <>
              <CirclePlay
                aria-hidden="true"
                className="h-3 w-3 shrink-0"
                strokeWidth={1.5}
              />
              {watchLine(footer.count)}
            </>
          ) : (
            NO_VIDEO_LINE
          )}
        </span>
      )}
    </ChartTooltip>
  );
}

/** How many points each of a row's three targets opens. */
interface RowCounts {
  both: number;
  you: number;
  opp: number;
}

export function HeadToHeadCard() {
  const { match, points } = useMatchData();
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  // Only the filter CONTEXT (you/opp seat and hands), never the applied
  // filters: it is what the Video tab resolves a cut with, so the counts
  // below say what the tab will list. The card itself is always the whole
  // match — the match filters live on the Video tab alone.
  const { context: sharedContext } = useMatchFilters();
  // The ball-paths file's lobs (`StatisticsLobKeysProvider`), laid into the
  // context the counts below run on, so the Lob row's "Watch all N" and the
  // Video tab it lands in read the same lobs.
  const lobKeys = useStatisticsLobKeys();
  const context = useMemo(
    () => (lobKeys ? { ...sharedContext, lobKeys } : sharedContext),
    [sharedContext, lobKeys],
  );
  const [hover, setHover] = useState<HoverTarget | null>(null);
  // Touch: a tap selects a target and its readout stays until a tap lands
  // outside the card; a second tap on it opens its cut in Video.
  const cardRef = useTouchReadout<HTMLElement>(hover !== null, () =>
    setHover(null),
  );
  const fingerTap = useFingerTap();

  const youStats = sides.you.stats;
  const oppStats = sides.opp.stats;
  const youIsPlayer1 = sides.you.isPlayer1;
  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  // An Advantage Intelligence match counts its aces from the points
  // (`DERIVED_H2H_GROUPS`). `meta.isDerived` is set by the dashboard and by
  // the /m/[token] share page alike. The table and the counts below iterate
  // the SAME configs, so a cell's "Watch all N" and its click open one cut.
  const isDerived = meta.isDerived;
  // One "Errors" row until the match's errors are judged forced/unforced,
  // then Unforced + Forced (`withErrorSplit`) — read off the filter context,
  // never re-derived here.
  const errorSplitJudged = context.errorSplitJudged === true;
  const groups = useMemo(
    () =>
      withLobAvailability(groupsFor(isDerived, errorSplitJudged), !!lobKeys),
    [isDerived, errorSplitJudged, lobKeys],
  );

  const sections = useMemo(() => {
    if (!youStats || !oppStats) return [];
    // Tallied whole-match too: the statistics only the points carry (return
    // winners) have no published figure to fall back on.
    const youDerived = tallySide(points, youIsPlayer1, lobKeys);
    const oppDerived = tallySide(points, !youIsPlayer1, lobKeys);

    return groups.map((group) => {
      const published = buildStatRows(group.configs, youStats, oppStats);
      return {
        title: group.title,
        rows: withPointRows(group.configs, published, youDerived, oppDerived),
      };
    });
  }, [groups, youStats, oppStats, youIsPlayer1, points, lobKeys]);

  // The exact points each target opens, counted with the Video tab's own
  // predicate — `applyFilmCut` over EVERY point of the match, the same whole
  // match the card's figures describe — so the readout's "Watch all 12" is
  // the cut's own size. On a video-derived match that can differ from the
  // published figure, and the readout says the true count rather than
  // borrowing the statistic's. Each of `both`/`you`/`opp` is its own count —
  // see the comment below on why `both` is not simply `you + opp`.
  const counts = useMemo(() => {
    const byRow = new Map<string, RowCounts>();
    if (!meta.hasPlayableVideo) return byRow;
    const count = (cut: FilmCut) =>
      applyFilmCut(points, points, cut, context).length;
    const configs = groups.flatMap((group) => group.configs);
    for (const config of configs) {
      if (!config.cut) continue;
      // `both` is counted, not summed: a row's own cut carries no side, so
      // it also admits what neither side's does — the rare two-shot "winner"
      // the server won on Return winners, every point a won-row's sides did
      // not win — and the readout must say what the tab will actually list.
      byRow.set(config.label, {
        both: count(config.cut),
        you: count(sideCut(config.cut, "you", config.sideBy, config.sideWon)),
        opp: count(sideCut(config.cut, "opp", config.sideBy, config.sideWon)),
      });
    }
    return byRow;
  }, [meta.hasPlayableVideo, groups, points, context]);

  if (sections.length === 0) return null;

  const handlersFor = (
    row: string,
    zone: Zone,
    watch?: () => void,
  ): TargetHandlers => ({
    onMouseEnter: () => setHover({ row, zone }),
    // Leaving a number hands the hover back to its row, which the cursor is
    // still inside; leaving the label is the row's own mouseleave.
    onMouseLeave: () =>
      zone === "row"
        ? undefined
        : setHover((current) =>
            current?.row === row ? { row, zone: "row" } : current,
          ),
    onFocus: () => setHover({ row, zone }),
    onBlur: () =>
      setHover((current) =>
        current?.row === row && current.zone === zone ? null : current,
      ),
    onPointerDown: (e) => {
      if (fingerTap.press(e, hover?.row === row && hover.zone === zone)) {
        setHover({ row, zone });
      }
    },
    onClick: () => fingerTap.click(watch, () => setHover(null)),
  });

  /**
   * One row's readouts and click-throughs, for the table to lay over its
   * static row. Every figure with something to say hovers the same way; only
   * a cut with points behind it on a match with a playable video clicks
   * through.
   */
  const interaction = (row: H2HRow): RowInteraction => {
    const rowCounts = row.cut ? counts.get(row.label) : undefined;
    const noun = row.noun ?? "points";
    const names = { you: youName, opp: oppName };
    const hasVideo = meta.hasPlayableVideo;
    const noVideoLine = !hasVideo && !meta.readOnly;

    // One figure's readout and target.
    const cell = (side: "you" | "opp") => {
      const name = names[side];
      const content = figureReadout(row, side, name, {
        hasVideo,
        noVideoLine,
        count: rowCounts?.[side] ?? 0,
      });
      if (!hasReadout(content)) {
        return { content: null, target: undefined };
      }
      const figure = `${row.label}, ${name}: ${figureWords(row, side)}`;
      const { footer } = content;
      const watch = () =>
        actions.watchCut(
          sideCut(row.cut!, side, row.sideBy, row.sideWon),
          `${row.label} · ${name}`,
          "head_to_head",
        );
      const target: FigureTarget =
        footer?.kind === "watch"
          ? {
              onClick: watch,
              label: `${figure}. ${watchLabel(footer.count, noun)}`,
              handlers: handlersFor(row.label, side, watch),
            }
          : {
              label: [figure, tailWords(content)].filter(Boolean).join(". "),
              handlers: handlersFor(row.label, side),
            };
      return { content, target };
    };
    const you = cell("you");
    const opp = cell("opp");

    const rowContent = rowReadout(row, youName, oppName, {
      hasVideo,
      noVideoLine,
      count: rowCounts?.both ?? 0,
    });
    const rowHasReadout = hasReadout(rowContent);
    const rowFooter = rowContent.footer;
    const rowWatchable = rowFooter?.kind === "watch";

    const active = hover?.row === row.label ? hover.zone : null;
    // One hover at a time: the label (and any part of the row that is not a
    // figure) washes the row; a figure washes itself alone. A row with
    // nothing to say does not wash.
    const rowLit = active === "row" && rowHasReadout;
    const readout = (
      <Readout open={active === "row"} align="start" content={rowContent} />
    );
    // The label's target is stretched over the whole row by its `::after`,
    // so the hit area is exactly the row's wash; the figures sit above it
    // (`z-[1]`) with their own. The target itself stays unpositioned so the
    // `::after` resolves against the row, and the readout anchors to the
    // label text instead (`RowLabel`). The ring moves onto the `::after` too,
    // so focus draws the same box the wash does.
    const label = (
      <RowLabel label={row.label}>
        {rowWatchable && (
          <CirclePlay
            aria-hidden="true"
            strokeWidth={1.5}
            className={cn(
              "h-3 w-3 shrink-0 text-[var(--ink-900)] transition-[opacity,transform] motion-reduce:transform-none",
              EASE,
              rowLit ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
            )}
          />
        )}
        {readout}
      </RowLabel>
    );

    return {
      lit: rowLit,
      onMouseEnter: () =>
        setHover((current) =>
          current?.row === row.label
            ? current
            : { row: row.label, zone: "row" },
        ),
      onMouseLeave: () =>
        setHover((current) => (current?.row === row.label ? null : current)),
      label: rowWatchable ? (
        <button
          type="button"
          aria-label={`${row.label}, both players. ${watchLabel(rowFooter.count, noun)}`}
          data-focus-ring="none"
          {...handlersFor(row.label, "row", () =>
            actions.watchCut(row.cut!, rowCutLabel(row), "head_to_head"),
          )}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center self-stretch border-0 bg-transparent p-0 pr-3 text-left text-[12px] transition-colors",
            EASE,
            STRETCHED,
            rowLit ? "text-[var(--ink-900)]" : "text-[var(--ink-600)]",
          )}
        >
          {label}
        </button>
      ) : (
        <span
          // Focusable only when it has something to say, so a keyboard gets
          // the same readout a hover does.
          {...(rowHasReadout && {
            tabIndex: 0,
            role: "note",
            "aria-label": `${row.label}. ${readoutWords(rowContent)}`,
            "data-focus-ring": "none",
            ...handlersFor(row.label, "row"),
          })}
          className={cn(LABEL_SLOT, rowHasReadout && STRETCHED)}
        >
          {label}
        </span>
      ),
      you: {
        washed: active === "you",
        target: you.target,
        readout: (
          <Readout open={active === "you"} align="end" content={you.content} />
        ),
      },
      opp: {
        washed: active === "opp",
        target: opp.target,
        readout: (
          <Readout open={active === "opp"} align="end" content={opp.content} />
        ),
      },
    };
  };

  return (
    <HeadToHeadTable
      sectionRef={cardRef}
      tour="head-to-head"
      groups={sections}
      youName={youName}
      oppName={oppName}
      caption={`Whole match · ${points.length} points`}
      interaction={interaction}
    />
  );
}
