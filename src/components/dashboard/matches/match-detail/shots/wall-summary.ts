/**
 * What a wall card's footer says (canvas "Wall variations", W5 + card D3):
 * the count with its unit ("27 of 31 in", "64 in", "14 total") and the
 * split bar under it — one segment per `StatRow` of the card's own
 * statistics group, so the segments always add up to the card's count.
 *
 * Pure TypeScript, no React. Every number here is read off `computeViz`'s
 * `VizResult` and `computeVizStats`' `VizStats` for the SAME points, cut and
 * filters the card's court draws — nothing is re-filtered or re-classified.
 * The one combination is serve's: `VizStats` splits serves into six zones
 * (deuce/ad × T/body/wide), and the card shows three (T, Body, Wide), so the
 * deuce and ad rows of each zone are summed. That is the same set of points
 * the existing Zone filter (`VizFilters.zone`) selects — pinned by
 * `tests/wall-summary.spec.ts`.
 *
 * The approaches card counts differently: every approach counts, drawn or
 * not (the statistics are about the approach, not its landing), so its count
 * is the cut's whole pool and the segments — the wing each approach went to —
 * hold only the ones with a placement. The rest are named on a note under the
 * count ("2 not drawn: no landing recorded") rather than letting the court
 * disagree with the number beside it. Its wings ("To backhand", "To
 * forehand") rest on the opponent's hand; where a drawn approach had to
 * assume it, the card says so (`handNote`, `HAND_ASSUMED_NOTE`) — the same
 * rule and wording as the opened court's legend line.
 */

import type { BandRow } from "@/lib/data/viz-bands";
import {
  HAND_ASSUMED_NOTE,
  type Cut,
  type StatRow,
  type VizResult,
  type VizStats,
} from "./viz-model";

export interface WallSegment {
  key: string;
  label: string;
  count: number;
  won: number;
  /** Won of `count`, rounded — `null` when `count` is 0. On the errors card
   *  it is the segment's share of every error instead (`StatRow.share`). */
  pct: number | null;
}

/**
 * The card footer's count, with its unit — one wording for the summary and
 * for the card's own count while it counts to a new value.
 */
export function wallCountLabel(
  cut: Cut,
  count: number,
  total: number,
  /** "N in" rather than "N of M in". The card counting to new values passes
   *  the FINAL summary's answer, so the wording never flips mid-count. */
  allIn: boolean = count === total,
): string {
  // The errors card counts what its bar draws: every Miss row's errors
  // (Net, Long, Wide, and Landed in when any read in), so "N total" and the
  // segments can never disagree.
  if (cut === "errors") return `${count} total`;
  // Every approach counts, drawn or not: the whole pool, never "in".
  if (cut === "approaches")
    return `${total} ${total === 1 ? "approach" : "approaches"}`;
  // Every return has a contact point, in or not: a count, never "in".
  if (cut === "returnContact")
    return `${count} ${count === 1 ? "return" : "returns"}`;
  if (allIn) return `${count} in`;
  return `${count} of ${total} in`;
}

/**
 * The sentence naming approaches that count but draw no mark — "2 not drawn:
 * no landing recorded" — or `null` when every one is drawn. One wording for
 * the wall card's note under its count and for the opened court's line
 * (`viz-lightbox-shell.tsx`), so the two never describe the same approaches
 * differently.
 */
export function notDrawnNote(notDrawn: number): string | null {
  return notDrawn > 0 ? `${notDrawn} not drawn: no landing recorded` : null;
}

export interface WallSummary {
  /** The footer's count, with its unit: "27 of 31 in", "64 in", "14 total". */
  countLabel: string;
  /** What the split bar adds up to — `count` in "count of total in". */
  count: number;
  /** The cut's whole drawable pool (`VizResult.count`). */
  total: number;
  /** The key's lead word: Landed / Went / Missed — or the approaches card's
   *  "Won x of n". */
  keyLead: string;
  /** The readout's noun for one segment: "12 in play", "22 returns". */
  unit: string;
  /** `true` on the errors card: `pct` is a share, not a win rate. */
  share: boolean;
  /** Empty on an approaches card whose approaches all lack a landing
   *  (`notDrawn === total > 0`): no wing is known, so the card draws no bar
   *  and no wing keys rather than three zeroes. */
  segments: WallSegment[];
  /** Won of every segment together, rounded — the readout's "Average N%".
   *  `null` on the errors card and when nothing landed in. */
  averagePct: number | null;
  /** The approaches card's points with no placement: counted in `total`,
   *  in no segment, drawn nowhere. `0` on every other card. */
  notDrawn: number;
  /** The line under the count that names them — "2 not drawn: no landing
   *  recorded" — or `null` when every point is drawn. */
  countNote: string | null;
  /** The approaches card's caveat on its wings — `HAND_ASSUMED_NOTE`
   *  ("assumes right-handed") when any drawn approach's wing was worked out
   *  from an assumed hand (`VizDot.meta.handAssumed`), the opened court's
   *  own rule. `null` when every hand is known, when nothing is drawn (no
   *  wings named), and on every other card. */
  handNote: string | null;
}

const SERVE_ZONES: { key: "t" | "body" | "wide"; label: string }[] = [
  { key: "t", label: "T" },
  { key: "body", label: "Body" },
  { key: "wide", label: "Wide" },
];

const DIRECTION_ORDER = ["crosscourt", "middle", "dtl"];

/** The approaches card's segments: the opponent's wing, left to right as the
 *  design reads them, with the card's own wording. */
const APPROACH_WINGS: { key: string; label: string }[] = [
  { key: "backhand", label: "To backhand" },
  { key: "middle", label: "Middle" },
  { key: "forehand", label: "To forehand" },
];
const MISS_ORDER = ["net", "long", "wide", "in"];

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

function segmentOf(row: StatRow): WallSegment {
  return {
    key: row.key,
    label: row.label,
    count: row.count,
    won: row.won,
    pct: row.winPct,
  };
}

/** `contactBandRows`' keys, inside the baseline to furthest behind it. */
const CONTACT_ORDER = ["inside", "near", "far"];

function inOrder(rows: StatRow[], order: string[]): StatRow[] {
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return [...rows].sort((a, b) => rank(a.key) - rank(b.key));
}

function groupRows(stats: VizStats, key: string): StatRow[] {
  return stats.groups.find((g) => g.key === key)?.rows ?? [];
}

/**
 * The wall card's footer for one of the six default cuts. `depthRows` is
 * `depthBandRows(bands, unit)` — the workspace's own band order (deep to
 * short), used only to order the rally card's segments.
 *
 * `result.dots` is what the card draws; the approaches card reads each dot's
 * `meta.handAssumed` for `handNote`. Every wall card's caller (the Default
 * wall, a saved view, a season card) passes its whole `VizResult`; a call
 * without dots says no hand note.
 */
export function wallSummaryFor(
  cut: Cut,
  result: Pick<VizResult, "count"> & Partial<Pick<VizResult, "dots">>,
  stats: VizStats,
  depthRows: BandRow[],
): WallSummary {
  const total = result.count;
  let segments: WallSegment[];
  let keyLead: string;
  let unit: string;
  let share = false;

  if (cut === "approaches") {
    // The Approach to group: one row per wing, only approaches with a
    // placement (a wing needs a landing), so the bar draws what the court
    // does. The lead is the KPI's own won-of-shown — every approach, drawn
    // or not — falling back to the drawn ones where no KPI travels (a
    // merged season).
    const wings = groupRows(stats, "approach-to");
    segments = APPROACH_WINGS.map(({ key, label }) => {
      const row = wings.find((r) => r.key === key);
      const count = row?.count ?? 0;
      const won = row?.won ?? 0;
      return { key, label, count, won, pct: pct(won, count) };
    });
    const drawnCount = segments.reduce((n, s) => n + s.count, 0);
    const drawnWon = segments.reduce((n, s) => n + s.won, 0);
    const notDrawn = Math.max(0, total - drawnCount);
    const wonAll = stats.kpi?.won ?? drawnWon;
    // Approaches counted but none drawn (no landing anywhere): a wing is
    // only known from a landing, so there are no wings to name — three
    // "0"s beside "7 approaches" would read as "you hit none". No
    // segments; the note says why. A card with no approaches at all
    // (`total === 0`) keeps its three zero wings.
    const noWings = drawnCount === 0 && total > 0;
    // A wing named from a hand the match does not hold: said on the card,
    // as the opened court says it. No wing drawn, no caveat.
    const handAssumed =
      !noWings && (result.dots ?? []).some((d) => d.meta?.handAssumed === true);
    return {
      countLabel: wallCountLabel(cut, drawnCount, total),
      count: drawnCount,
      total,
      keyLead: `Won ${wonAll} of ${total}`,
      unit: "approaches",
      share: false,
      segments: noWings ? [] : segments,
      averagePct: pct(drawnWon, drawnCount),
      notDrawn,
      countNote: notDrawnNote(notDrawn),
      handNote: handAssumed ? HAND_ASSUMED_NOTE : null,
    };
  } else if (cut === "serve") {
    const zones = groupRows(stats, "serve-zones");
    segments = SERVE_ZONES.map(({ key, label }) => {
      const rows = zones.filter((r) => r.key.endsWith(`-${key}`));
      const count = rows.reduce((n, r) => n + r.count, 0);
      const won = rows.reduce((n, r) => n + r.won, 0);
      return { key, label, count, won, pct: pct(won, count) };
    });
    keyLead = "Landed";
    unit = "in play";
  } else if (cut === "returnPlacement") {
    segments = inOrder(groupRows(stats, "direction"), DIRECTION_ORDER).map(
      segmentOf,
    );
    keyLead = "Went";
    unit = "returns";
  } else if (cut === "returnContact") {
    // Where the returner struck it: the contact bands, inside the baseline
    // to furthest behind it, in that order (`contactBandRows`' fixed keys).
    segments = inOrder(groupRows(stats, "depth"), CONTACT_ORDER).map(segmentOf);
    keyLead = "Struck";
    unit = "returns";
  } else if (cut === "errors") {
    segments = inOrder(groupRows(stats, "miss"), MISS_ORDER).map(segmentOf);
    keyLead = "Missed";
    unit = "errors";
    share = true;
  } else {
    // rallyPlacement (and any other cut handed in): the Depth group.
    segments = inOrder(
      groupRows(stats, "depth"),
      depthRows.map((r) => r.key),
    ).map(segmentOf);
    keyLead = "Landed";
    unit = "shots";
  }

  const count = segments.reduce((n, s) => n + s.count, 0);
  const won = segments.reduce((n, s) => n + s.won, 0);

  return {
    countLabel: wallCountLabel(cut, count, total),
    count,
    total,
    keyLead,
    unit,
    share,
    segments,
    averagePct: share ? null : pct(won, count),
    notDrawn: 0,
    countNote: null,
    handNote: null,
  };
}

/** The dark readout over one split-bar segment, three lines. */
export function wallSegmentReadout(
  summary: WallSummary,
  segment: WallSegment,
  possessive: string,
  errorNoun: string,
): { title: string; line1: string; line2: string | null } {
  const title = `${segment.label} · ${segment.count} ${summary.unit}`;
  if (summary.share) {
    return {
      title,
      line1:
        segment.pct === null
          ? `None of ${possessive} ${errorNoun}`
          : `${segment.pct}% of ${possessive} ${errorNoun}`,
      line2: null,
    };
  }
  return {
    title,
    line1:
      segment.pct === null
        ? "No points"
        : `${segment.won} won · ${segment.pct}%`,
    line2:
      summary.averagePct === null
        ? null
        : `Average ${summary.averagePct}% across all ${summary.count}`,
  };
}

/**
 * The lightbox header's count clause, after "Serve placement · You · ":
 * "27 of 31 in, 17 of those 27 won" — the card's own count, then the points
 * won among them ("0 of 4 in" alone when nothing landed in). The errors card
 * says its count alone ("14 total"); a cut with no wall card (return contact,
 * rally position) counts its Depth rows, which hold every mark: "40 returns,
 * 22 won".
 */
export function lightboxCountLine(
  cut: Cut,
  result: Pick<VizResult, "count" | "noun">,
  stats: VizStats,
  depthRows: BandRow[],
): string {
  if (
    cut === "serve" ||
    cut === "returnPlacement" ||
    cut === "rallyPlacement" ||
    cut === "errors"
  ) {
    const summary = wallSummaryFor(cut, result, stats, depthRows);
    if (summary.share) return summary.countLabel;
    // Nothing landed in: no "0 of those 0 won" to say.
    if (summary.count === 0) return summary.countLabel;
    const won = summary.segments.reduce((n, s) => n + s.won, 0);
    return `${summary.countLabel}, ${won} of those ${summary.count} won`;
  }
  // Approaches has no Depth group: its KPI holds the won count, over every
  // approach shown, drawn or not.
  const won =
    cut === "approaches"
      ? (stats.kpi?.won ?? 0)
      : groupRows(stats, "depth").reduce((n, r) => n + r.won, 0);
  return `${result.count} ${result.noun}, ${won} won`;
}
