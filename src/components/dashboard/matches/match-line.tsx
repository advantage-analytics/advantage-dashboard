import { ScoreLine } from "@/components/dashboard/score-line";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The title of a stepper page — the upload wizard's final screen and the
 * match page's analysis column. One constant so the two titles cannot drift,
 * and so the off-scale 24px lives in one place (design-drift counts copies).
 */
export const PAGE_STEPPER_TITLE =
  "text-[24px] leading-[1.2] font-light tracking-[-0.3px] text-[var(--ink-900)]";

export interface MatchLineProps {
  player: string;
  opponent: string;
  /** Null when the score decides nobody — a stopped or unfinished match. */
  won: boolean | null;
  /** Played sets only, oriented to `player`. */
  sets: ScoreLineSet[];
}

/**
 * The one line under a task screen's title that says which match it is about:
 * "{player} vs {opponent} · Won 6-4, 6-3". Drawn by the upload wizard's final
 * screen and the match page's analysis column, so the two read the same.
 */
export function MatchLine({ player, opponent, won, sets }: MatchLineProps) {
  const result = won === null ? null : won ? "Won" : "Lost";
  return (
    <p className="text-[13px] text-[var(--ink-600)]">
      {player} vs {opponent}
      {sets.length > 0 && (
        <>
          {" · "}
          {result && `${result} `}
          <ScoreLine sets={sets} />
        </>
      )}
    </p>
  );
}
