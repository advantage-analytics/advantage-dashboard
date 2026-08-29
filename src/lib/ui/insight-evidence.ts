import type { KpiCardData } from "@/lib/data/performance-server";

/**
 * The Focus card's evidence line, composed from real computed stats.
 *
 * SKILL.md's `InsightCard` spec: "evidence at 12px ink-700 with tabular
 * numerals — **computed, never invented**". That rules out letting the model
 * write the figures. It reads them off a prompt today, which looks fine until
 * it transposes a digit and the card states a number the database never held —
 * with nothing on screen, and no test, able to tell.
 *
 * So the split is: the model writes the claim (a judgement — what a model is
 * legitimately for), and this writes the evidence (arithmetic — what the data
 * layer is for). The numbers on screen are the same objects the KPI strip
 * renders, not a paraphrase of them.
 *
 * ── Deltas are preferred, levels are the fallback ────────────────────────────
 * The design's own evidence line states levels and a relationship ("you win
 * 71% of points behind the first serve and 39% behind the second"), not only
 * period-over-period movement. So a player with one match — no prior period,
 * every delta zero — still has real numbers worth stating; what they do not
 * have is a *trend*. Keying this off movement alone would blank the card for
 * them, and claiming momentum from that sample is what produced the "100% win
 * rate" reading this replaces. Levels without deltas say the true thing.
 *
 * Returns `null` only when there is genuinely nothing computed to state —
 * "Renders nothing without real numbers" is the spec's own line, and a Focus
 * card that always finds something to say is one nobody believes when it
 * matters.
 */

export interface EvidencePart {
  text: string;
  /** Numerals get `tabular-nums` — anything compared to another number does. */
  tabular?: boolean;
}

function signed(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}

/**
 * Mid-sentence, so the label loses its title case — "1st serve won sits at
 * 71%", not "1st Serve Won sits at 71%".
 */
function inSentence(label: string): string {
  return label.toLowerCase();
}

/** A card carrying a value we can actually print. */
function isReportable(card: KpiCardData): boolean {
  return card.value !== "—" && card.value.trim() !== "";
}

export function buildInsightEvidence(
  kpiCards: KpiCardData[],
  matchCount: number
): EvidencePart[] | null {
  if (matchCount === 0) return null;

  const reportable = kpiCards.filter(isReportable);
  if (reportable.length === 0) return null;

  // Movement first, by size. Absent any, the largest-magnitude levels — still
  // ordered so the two most substantial numbers lead.
  const movers = reportable
    .filter((c) => c.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const withDeltas = movers.length > 0;
  const [first, second] = withDeltas ? movers : reportable;

  const parts: EvidencePart[] = [
    { text: "Across " },
    { text: String(matchCount), tabular: true },
    { text: matchCount === 1 ? " match, " : " matches, " },
    { text: inSentence(first.label) },
    { text: " sits at " },
    { text: first.value, tabular: true },
  ];

  if (withDeltas) {
    parts.push(
      { text: " (" },
      { text: signed(first.change), tabular: true },
      { text: ` ${first.changeLabel})` }
    );
  }

  if (second) {
    parts.push(
      { text: " and " },
      { text: inSentence(second.label) },
      { text: " at " },
      { text: second.value, tabular: true }
    );
    if (withDeltas) {
      parts.push(
        { text: " (" },
        { text: signed(second.change), tabular: true },
        { text: ")" }
      );
    }
  }

  parts.push({ text: "." });
  return parts;
}
