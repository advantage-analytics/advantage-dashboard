import type {
  ZoneKey,
  ZoneStats,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";

/**
 * The one sentence under Home's serve-placement strip — a reading of the two
 * bars above it, in words, computed from the same counts the bars draw.
 *
 * Platform Audit Pa2 closes the card with "Deuce is one address; the ad court
 * spreads — a quarter of those first serves go wide." That is a sentence about
 * a *shape* (one court concentrated, the other not), not a number, which is
 * why it earns its place under bars that already show every percentage. So
 * the generator is a small table of shapes: both courts concentrated, one,
 * neither. Every branch is deterministic and every figure in it is the bars'
 * own — nothing here is generated or estimated.
 *
 * "Address" is the tennis word for where a serve is aimed, and the threshold
 * for "one address" is 60% — the share at which a stacked bar reads as one
 * colour with a remainder, rather than as a split.
 */

export type Zone = "T" | "Body" | "Wide";

export interface CourtRead {
  total: number;
  /** Each zone's share of this court, in bar order: T · Body · Wide. */
  pcts: [number, number, number];
  /** The zone holding the most serves, and its share. */
  top: Zone;
  topPct: number;
  /**
   * The runner-up, and its share — the evidence that a court "spreads".
   *
   * The tail (the least-used zone) was tried here first, because Pa2's
   * sample sentence happens to quantify it: its ad court runs 41/33/26 and
   * the frame says "a quarter of those first serves go wide". But the tail
   * can be negligible — a court at 55/40/5 spreads across two zones and
   * would have read "spreads — 5% of those first serves go wide", evidence
   * that argues against the claim it is offered for. The runner-up cannot:
   * with the top zone under 60% the remainder splits at least 20/20, so the
   * second share is always material enough to name.
   */
  second: Zone;
  secondPct: number;
}

export interface ServeCaptionInput {
  deuce: CourtRead;
  ad: CourtRead;
}

const ZONES: readonly Zone[] = ["T", "Body", "Wide"];

/** A court's counts, T · Body · Wide, in the order the bar draws them. */
export function readCourt(counts: [t: number, body: number, wide: number]): CourtRead {
  const total = counts[0] + counts[1] + counts[2];
  const pct = counts.map((c) => (total > 0 ? Math.round((c / total) * 100) : 0));
  // Stable on ties: the earlier zone wins, which is the bar's own order.
  const order = [0, 1, 2].sort((a, b) => pct[b] - pct[a] || a - b);
  return {
    total,
    // In bar order (T · Body · Wide), so the sentence and the bar above it
    // round one number once. Two roundings of one count is how a caption
    // comes to disagree with the bar it claims to be reading.
    pcts: [pct[0], pct[1], pct[2]],
    top: ZONES[order[0]],
    topPct: pct[order[0]],
    second: ZONES[order[1]],
    secondPct: pct[order[1]],
  };
}

export function serveCaptionInput(zoneStats: Record<ZoneKey, ZoneStats>): ServeCaptionInput {
  return {
    deuce: readCourt([
      zoneStats["deuce-t"].count,
      zoneStats["deuce-body"].count,
      zoneStats["deuce-wide"].count,
    ]),
    ad: readCourt([zoneStats["ad-t"].count, zoneStats["ad-body"].count, zoneStats["ad-wide"].count]),
  };
}

/**
 * A share as a reader says it. 25 → "a quarter", 33 → "a third", 50 →
 * "half", 67 → "two thirds", 75 → "three quarters"; outside those bands the
 * percentage itself, because "nine tenths" is not how anyone talks.
 */
export function shareInWords(pct: number): string {
  if (pct >= 80) return `${pct}%`;
  if (pct >= 70) return "three quarters";
  if (pct >= 60) return "two thirds";
  if (pct >= 45) return "half";
  if (pct >= 30) return "a third";
  if (pct >= 20) return "a quarter";
  return `${pct}%`;
}

/** The zone as a direction — "go to the T", "go wide". */
function zoneWord(zone: Zone): string {
  if (zone === "T") return "to the T";
  if (zone === "Body") return "into the body";
  return "wide";
}

/** The zone as a thing — "the T leads", "wide leads". */
function zoneNoun(zone: Zone): string {
  if (zone === "T") return "the T";
  if (zone === "Body") return "the body";
  return "wide";
}

/** Below this share, a court has no single address. */
const ADDRESS_PCT = 60;
/** Below this many serves a court's shape is noise, and the caption stays off. */
const MIN_SERVES = 3;
/** A difference in concentration this large is worth a sentence. */
const LEAN_GAP = 15;

/** One sentence, or `null` when either court is too thin to read. */
export function servePlacementCaption({ deuce, ad }: ServeCaptionInput): string | null {
  if (deuce.total < MIN_SERVES || ad.total < MIN_SERVES) return null;

  const deuceFixed = deuce.topPct >= ADDRESS_PCT;
  const adFixed = ad.topPct >= ADDRESS_PCT;

  if (deuceFixed && adFixed) {
    if (deuce.top === ad.top) {
      const floor = Math.min(deuce.topPct, ad.topPct);
      return `Both courts go ${zoneWord(deuce.top)}: ${shareInWords(floor)} of first serves or more.`;
    }
    return `Deuce goes ${zoneWord(deuce.top)}, ad goes ${zoneWord(ad.top)} — one address each.`;
  }

  if (deuceFixed !== adFixed) {
    const [fixedName, spreadName, spread] = deuceFixed
      ? (["Deuce", "ad", ad] as const)
      : (["Ad", "deuce", deuce] as const);
    return `${fixedName} is one address; the ${spreadName} court spreads — ${shareInWords(spread.secondPct)} of those first serves go ${zoneWord(spread.second)}.`;
  }

  const gap = deuce.topPct - ad.topPct;
  if (Math.abs(gap) >= LEAN_GAP) {
    const [higherName, lowerName, higher] =
      gap > 0 ? (["Deuce", "ad", deuce] as const) : (["Ad", "deuce", ad] as const);
    return `${higherName} leans ${zoneWord(higher.top)} at ${higher.topPct}%; the ${lowerName} court is closer to even.`;
  }

  // The next multiple of five ABOVE the larger share — never the share
  // itself. `Math.ceil(45/5)*5` is 45, which would have the sentence say
  // "both under 45%" about a court sitting at exactly 45%.
  const ceiling = Math.floor(Math.max(deuce.topPct, ad.topPct) / 5) * 5 + 5;
  if (deuce.top === ad.top) {
    return `Neither court has a fixed address — ${zoneNoun(deuce.top)} leads both, under ${ceiling}%.`;
  }
  return `Neither court has a fixed address — ${zoneNoun(deuce.top)} leads deuce, ${zoneNoun(ad.top)} leads ad, both under ${ceiling}%.`;
}
