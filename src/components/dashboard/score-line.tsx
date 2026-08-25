import { Fragment } from "react";
import {
  GAME_SEPARATOR,
  SET_JOINER,
  tiebreakOf,
  type ScoreLineSet,
} from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";

/**
 * A match score, in the one spelling the product uses — "4-6, 6-7³".
 *
 * The spelling itself, and the rule for which side holds the tiebreak digit,
 * live in `@/lib/ui/score-format`. This file is only their markup form: the
 * superscript that a plain string cannot carry, and the accessible reading of
 * it. Surfaces that draw their own scoreboard (`match-summary-row.tsx`) import
 * `tiebreakOf` from there instead of this component — the rule is shared, the
 * layout is not.
 *
 * ── What a caller owes it ───────────────────────────────────────────────────
 * Resolved, pre-oriented sets. This component never fetches, never asks who is
 * looking, and never decides which side is "us": `player1` is whichever side
 * the row is about. `scoreSetsFrom()` is the adapter callers use to get there
 * from the raw `matches.score` JSON — it is a caller-side helper, not something
 * `<ScoreLine>` reaches for.
 */

/**
 * 0.6em, raised, offset 0.5px — round 44's numbers, set explicitly rather than
 * left to `<sup>`, whose raise comes from a UA/preflight rule this file does
 * not control. `lineHeight: 0` keeps the digit from growing the row's line box.
 */
const TIEBREAK_STYLE: React.CSSProperties = {
  fontSize: "0.6em",
  verticalAlign: "super",
  position: "relative",
  top: "-0.5px",
  lineHeight: 0,
};

export function ScoreLine({
  sets,
  className,
  style,
}: {
  sets: ScoreLineSet[];
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  /* Always one span, even with nothing in it. Every caller puts this in a grid
     cell, and returning null there collapses the column for that row. */
  return (
    <span className={cn("tabular-nums", className)} style={style}>
      {sets.map((set, index) => {
        const tiebreak = tiebreakOf(set);
        return (
          <Fragment key={index}>
            {index > 0 ? SET_JOINER : null}
            {set.player1}
            {GAME_SEPARATOR}
            {set.player2}
            {tiebreak !== null ? (
              <>
                {/* The digit is hidden from assistive tech and spoken as a
                    phrase instead: read literally, a raised numeral runs into
                    the games either side of it and "6-7³" becomes "six seven
                    three". */}
                <span aria-hidden="true" style={TIEBREAK_STYLE}>
                  {tiebreak}
                </span>
                <span className="sr-only"> tiebreak {tiebreak}</span>
              </>
            ) : null}
          </Fragment>
        );
      })}
    </span>
  );
}
