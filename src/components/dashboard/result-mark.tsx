import { Ban, CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";

/* Tokens, not the `--viz-*` ramp: green is winning, red is losing, and both
   have a dark-scope value the literal hexes do not. Level and no-result are
   ink-500 — a draw is a decided result, but not a coloured one. */
const OUTCOME = {
  won: { Icon: CircleCheck, label: "Won", color: "var(--success)" },
  lost: { Icon: CircleX, label: "Lost", color: "var(--danger)" },
  level: { Icon: CircleMinus, label: "Level", color: "var(--ink-500)" },
  none: { Icon: Ban, label: "No result", color: "var(--ink-500)" },
} as const;

/**
 * Won, lost or level — the product's ONE outcome register.
 *
 * `circle-check` / `circle-x` / `circle-minus` at 14px, stroke 1.5, in the
 * outcome colours (and a grey `ban` for a score that named no winner), with
 * the word carried as the accessible name. A screen reader hears exactly what
 * the retired badge used to say.
 *
 * ── Why this is the only register now ──────────────────────────────────────
 * The system used to run two: the WORD (`Badge` "Won"/"Lost") under a labelled
 * Result column, and this GLYPH in headerless dense rows — "never both in one
 * row". Two registers meant the same fact wore two faces depending on which
 * page you were on, and the split was invisible in code review: each table
 * looked right on its own. Matches drifted to the glyph, Schedule kept the
 * word, and the two lists a coach moves between stopped matching.
 *
 * One register, everywhere, labelled column or not. A circle also survives
 * translation where a tracked English word does not, and it holds its meaning
 * at a glance down a column in a way a 10px uppercase word never did.
 *
 * ── Alignment ──────────────────────────────────────────────────────────────
 * The mark takes no alignment of its own — it inherits its cell's, exactly as
 * `EmptyMark` does. That pairing is the point: a Result column shows this glyph
 * on a decided row and the em dash on an undecided one, and the two must sit on
 * the same x or the column zigzags. Flush left under a left-flush header
 * (Matches), flush right under a right-flush one (Schedule). **Never centred**
 * — an earlier cut centred the glyph "because it is fixed-width and raggeds
 * nothing", which put it 21px off the dash directly above it.
 *
 * Match outcomes only. Checklist and job-state surfaces have their own
 * vocabulary (`StatusChip`, a plain `check`) — an outcome glyph there would
 * claim a match was won.
 */
export function ResultMark({
  won,
  noResult = false,
  className,
}: {
  /**
   * The match was played and scored, and the score names no winner: a set
   * stopped at 4-4, a match halted at a set all. Draws the grey `ban` mark,
   * read out as "No result", whatever `won` says — a row's winner field is
   * only a default on such a score (`DisplayMatch.level`).
   *
   * Not the level mark and not `EmptyMark`: level is a decided draw (a dual
   * tied on lines), and the dash is for a cell with nothing to report yet.
   * This is a finished score that decided nothing.
   */
  noResult?: boolean;
  /**
   * `true` won · `false` lost · `null` **level** — a dual that finished level
   * on lines. Null is a decided draw, never "not yet decided": an undecided
   * cell draws `EmptyMark`, and a caller that cannot tell the two apart is
   * asking the wrong question. (The roster's Last-match cell branches on its
   * own `won === null` — "score unrecorded" — before it ever reaches here.)
   */
  won: boolean | null;
  className?: string;
}): React.JSX.Element {
  const { Icon, label, color } =
    OUTCOME[noResult ? "none" : won === null ? "level" : won ? "won" : "lost"];

  return (
    <span className={cn("inline-flex items-center", className)}>
      <Icon
        className="size-3.5 shrink-0"
        strokeWidth={1.5}
        style={{ color }}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
