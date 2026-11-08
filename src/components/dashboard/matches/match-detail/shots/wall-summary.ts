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
 */

import type { BandRow } from "@/lib/data/viz-bands";
import type { Cut, StatRow, VizResult, VizStats } from "./viz-model";

export interface WallSegment {
  key: string;
  label: string;
  count: number;
  won: number;
  /** Won of `count`, rounded — `null` when `count` is 0. On the errors card
   *  it is the segment's share of every error instead (`StatRow.share`). */
  pct: number | null;
}

export interface WallSummary {
  /** The footer's count, with its unit: "27 of 31 in", "64 in", "14 total". */
  countLabel: string;
  /** What the split bar adds up to — `count` in "count of total in". */
  count: number;
  /** The cut's whole drawable pool (`VizResult.count`). */
  total: number;
  /** The key's lead word: Landed / Went / Missed. */
  keyLead: string;
  /** The readout's noun for one segment: "12 in play", "22 returns". */
  unit: string;
  /** `true` on the errors card: `pct` is a share, not a win rate. */
  share: boolean;
  segments: WallSegment[];
  /** Won of every segment together, rounded — the readout's "Average N%".
   *  `null` on the errors card and when nothing landed in. */
  averagePct: number | null;
}

const SERVE_ZONES: { key: "t" | "body" | "wide"; label: string }[] = [
  { key: "t", label: "T" },
  { key: "body", label: "Body" },
  { key: "wide", label: "Wide" },
];

const DIRECTION_ORDER = ["crosscourt", "middle", "dtl"];
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
 * The wall card's footer for one of the four default cuts. `depthRows` is
 * `depthBandRows(bands, unit)` — the workspace's own band order (deep to
 * short), used only to order the rally card's segments.
 */
export function wallSummaryFor(
  cut: Cut,
  result: Pick<VizResult, "count">,
  stats: VizStats,
  depthRows: BandRow[],
): WallSummary {
  const total = result.count;
  let segments: WallSegment[];
  let keyLead: string;
  let unit: string;
  let share = false;

  if (cut === "serve") {
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

  let countLabel: string;
  // The errors card counts what its bar draws: every Miss row's errors
  // (Net, Long, Wide, and Landed in when any read in), so "N total" and the
  // segments can never disagree.
  if (cut === "errors") countLabel = `${count} total`;
  else if (count === total) countLabel = `${count} in`;
  else countLabel = `${count} of ${total} in`;

  return {
    countLabel,
    count,
    total,
    keyLead,
    unit,
    share,
    segments,
    averagePct: share ? null : pct(won, count),
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
 * won among them ("0 of 4 in" alone when nothing landed in). The errors card says its count alone ("14 total"); a cut
 * with no wall card (return contact, rally position) counts its Depth rows,
 * which hold every mark: "40 returns, 22 won".
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
  const rows = groupRows(stats, "depth");
  const won = rows.reduce((n, r) => n + r.won, 0);
  return `${result.count} ${result.noun}, ${won} won`;
}
