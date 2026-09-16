/**
 * Splitting an Advantage Intelligence summary into the report's claim-first
 * insight card (F2): a large claim sentence up top, the evidence underneath in
 * smaller type. Nothing is invented and no figure is picked out for emphasis
 * (spec decisions #4) — the split is purely where one sentence ends and the
 * next begins.
 *
 * ── The boundary ─────────────────────────────────────────────────────────
 * A `[.!?]` followed by whitespace and then a capital letter. The whitespace
 * requirement is what keeps a decimal like "1.5 shots" from splitting on the
 * point in "1.5" — nothing follows that period but a digit. The
 * capital-letter lookahead is what keeps an abbreviation like "e.g. the
 * rally" from splitting on its period — the next word is lowercase, so it
 * reads as a continuation rather than a new sentence. Neither guard is a
 * general prose parser; it is the one rule the real F2 text needs, and it is
 * taken from that text.
 */

export interface SplitInsight {
  /** The first sentence — the card's large claim line. */
  claim: string;
  /** Everything after the claim, or `null` for a one-sentence summary. */
  evidence: string | null;
}

/** First sentence-ending punctuation followed by whitespace then a capital. */
const SENTENCE_BOUNDARY = /[.!?]\s+(?=[A-Z])/;

export function splitInsight(summary: string): SplitInsight {
  const boundary = SENTENCE_BOUNDARY.exec(summary);
  if (!boundary) return { claim: summary, evidence: null };

  // The punctuation stays on the claim; the whitespace between the two
  // sentences belongs to neither.
  const claim = summary.slice(0, boundary.index + 1);
  const evidence = summary.slice(boundary.index + boundary[0].length);
  return { claim, evidence: evidence.length > 0 ? evidence : null };
}
