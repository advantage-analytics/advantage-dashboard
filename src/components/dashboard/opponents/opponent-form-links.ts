import type {
  PersonalOpponentForm,
  PersonalOpponentRecentMatch,
} from "@/lib/data/personal-opponents";
import type { ScoreLineSet } from "@/lib/ui/score-format";

/** What one form bar opens and what its readout says. */
export interface OpponentFormMatch {
  id: string;
  date: string | null;
  sets: ScoreLineSet[];
  event: string | null;
  /** Team tables only: who on the roster played it. */
  player: string | null;
}

export interface OpponentFormBar {
  result: PersonalOpponentForm;
  match: OpponentFormMatch;
}

/**
 * Pair each form bar with its match, so a bar needs no read of its own.
 *
 * `form` is the last five results oldest first and `recent` the last six
 * matches newest first, both from one sorted list (`groupPersonalOpponents`),
 * so bar `i` is `recent[form.length - 1 - i]`, and every bar has its match.
 */
export function opponentFormBars<M extends PersonalOpponentRecentMatch>(
  form: readonly PersonalOpponentForm[],
  recent: readonly M[],
  playerOf?: (match: M) => string | null,
): OpponentFormBar[] {
  return form.flatMap((result, i) => {
    const match = recent[form.length - 1 - i];
    return match
      ? [
          {
            result,
            match: {
              id: match.id,
              date: match.date,
              sets: match.sets,
              event: match.event,
              player: playerOf?.(match) ?? null,
            },
          },
        ]
      : [];
  });
}
