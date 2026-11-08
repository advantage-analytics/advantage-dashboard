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

/** Sentence-ending punctuation followed by whitespace then a capital. */
const SENTENCE_BOUNDARY = /[.!?]\s+(?=[A-Z])/g;

/**
 * Words whose period is an abbreviation's, not a sentence's, when a capital
 * follows ("vs. Okafor", "St. Louis"). Compared lowercase without dots.
 */
const ABBREVIATIONS = new Set([
  "vs",
  "v",
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "jr",
  "sr",
  "approx",
  "etc",
]);

/**
 * Whether the period at `index` closes an abbreviation or an initial rather
 * than a sentence: the word before it is a single letter ("J. Smith"), a
 * dotted abbreviation ("U.S. Open"), or a known one ("vs. Okafor").
 */
function isAbbreviationPeriod(summary: string, index: number): boolean {
  if (summary[index] !== ".") return false;
  const word = /(\S+)$/.exec(summary.slice(0, index))?.[1] ?? "";
  const bare = word.replace(/^[("'“‘]+/, "");
  if (/^[A-Za-z]$/.test(bare)) return true;
  if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(bare)) return true;
  return ABBREVIATIONS.has(bare.toLowerCase().replace(/\./g, ""));
}

export function splitInsight(summary: string): SplitInsight {
  let boundary: RegExpExecArray | null = null;
  for (const candidate of summary.matchAll(SENTENCE_BOUNDARY)) {
    if (!isAbbreviationPeriod(summary, candidate.index)) {
      boundary = candidate as RegExpExecArray;
      break;
    }
  }
  if (!boundary) return { claim: summary, evidence: null };

  // The punctuation stays on the claim; the whitespace between the two
  // sentences belongs to neither.
  const claim = summary.slice(0, boundary.index + 1);
  const evidence = summary.slice(boundary.index + boundary[0].length);
  return { claim, evidence: evidence.length > 0 ? evidence : null };
}

/**
 * The question "Why this" puts in Ask's composer: the claim, quoted as the
 * report wrote it, so Ask checks that statement against the points instead
 * of guessing what "this" means. Ask never reads the summary itself (it is a
 * different model answering from the data), so the claim has to travel in
 * the question. A closing period is dropped inside the quotes; `?` and `!`
 * are kept.
 *
 * The wording was picked against live answers on 2026-11-07. "Why does my
 * report say …? Show me the points behind it." got the claim echoed back
 * with one figure; asking which stats support it and which contradict it
 * got the opponent's side and the counterweights (errors beside winners).
 * The points themselves are Ask's own "Show me these points" under the
 * answer, so the question does not ask for them.
 */
export function whyThisQuestion(claim: string): string {
  return `My report says "${quoteClaim(claim)}". Which stats from this match support that, and do any contradict it?`;
}

/**
 * The longest claim the question quotes. With the framing around it the
 * question stays inside `ASK_ENTRY_QUESTION_MAX` (300), so a long claim is
 * cut here, on a word, and the link never cuts the question's own ending.
 */
const WHY_THIS_CLAIM_MAX = 190;

function quoteClaim(claim: string): string {
  const flat = claim.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (flat.length <= WHY_THIS_CLAIM_MAX) return flat;
  const head = flat.slice(0, WHY_THIS_CLAIM_MAX - 1);
  const cut = head.lastIndexOf(" ");
  return `${(cut > WHY_THIS_CLAIM_MAX / 2 ? head.slice(0, cut) : head).replace(/[\s,;:—-]+$/, "")}…`;
}
