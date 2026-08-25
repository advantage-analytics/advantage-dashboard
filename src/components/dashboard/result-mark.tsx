import { CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Won or lost, as a glyph.
 *
 * Round 44: "one outcome vocabulary per row shape, never both". A dense result
 * row carries either the word (which needs a labelled Result column to be read
 * against) or this mark — never a badge and a glyph in the same row.
 *
 * The word does not disappear, it stops being drawn: `circle-check` /
 * `circle-x` at 14px, 1.5 stroke, with "Won" / "Lost" carried as the accessible
 * name. A screen reader hears exactly what the badge used to say.
 *
 * Match outcomes only. Checklist and job-state surfaces have their own
 * vocabulary (`StatusChip`, a plain `check`) — an outcome glyph there would
 * claim a match was won.
 */
export function ResultMark({
  won,
  className,
}: {
  won: boolean;
  className?: string;
}): React.JSX.Element {
  const Icon = won ? CircleCheck : CircleX;

  return (
    <span className={cn("inline-flex items-center", className)}>
      <Icon
        className="size-3.5 shrink-0"
        strokeWidth={1.5}
        /* Tokens, not the `--viz-*` ramp: green is winning, red is losing, and
           both have a dark-scope value the literal hexes do not. */
        style={{ color: won ? "var(--success)" : "var(--danger)" }}
        aria-hidden="true"
      />
      <span className="sr-only">{won ? "Won" : "Lost"}</span>
    </span>
  );
}
