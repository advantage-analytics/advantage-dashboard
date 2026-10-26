import type {
  TeamOpponent,
  TeamOpponentFacedBy,
  TeamOpponentRecentMatch,
} from "@/lib/data/team-opponents";
import type { PersonalOpponentMeasure } from "@/lib/data/personal-opponents";
import { divisionLabel } from "@/lib/data/programs-server";

/**
 * What the team opponent drawer shows for the scope its "Faced by" control is
 * on — the whole team ("All") or one roster player — and every sentence that
 * names that scope.
 *
 * No JSX: the drawer draws, this decides. A scope is never computed in the
 * component, because the loader already did the arithmetic — a `facedBy`
 * entry is `groupPersonalOpponents` over that player's matches alone
 * (`lib/data/team-opponents.ts`), so narrowing is choosing which of two
 * finished records to read, never re-deriving one from the other.
 */

/**
 * The most roster players the drawer draws as chips. Past four the chips wrap
 * onto a third line in a 296px column and push the stats down, so the one
 * menu trigger takes over (design: "Profile chips, six ways", A → F).
 */
export const FACED_BY_CHIP_LIMIT = 4;

/** Chips up to the limit, the menu beyond it. */
export function facedByControl(count: number): "chips" | "menu" {
  return count > FACED_BY_CHIP_LIMIT ? "menu" : "chips";
}

/** "5-3" — wins first, as every Record figure on the page reads. */
export function recordLabel(record: { wins: number; losses: number }): string {
  return `${record.wins}-${record.losses}`;
}

/** One reading of an opponent: the team's, or one roster player's. */
export interface OpponentScope {
  /** The chosen roster player's id; null for the whole team. */
  playerId: string | null;
  /** The chosen player's first name; null for the whole team. */
  firstName: string | null;
  wins: number;
  losses: number;
  /** Meetings in this scope — the figure "All N" prints. */
  played: number;
  analyzed: number;
  /** Newest first, at most six. */
  recent: TeamOpponentRecentMatch[];
  measures: PersonalOpponentMeasure[];
}

/**
 * The scope the drawer reads. An id that names nobody in `facedBy` — a stale
 * choice carried over from the opponent the drawer was on a moment ago — is
 * the whole team, which is also what the drawer opens on.
 */
export function opponentScope(
  opponent: Pick<
    TeamOpponent,
    "wins" | "losses" | "played" | "analyzed" | "recent" | "measures"
  > & { facedBy: readonly TeamOpponentFacedBy[] },
  playerId: string | null,
): OpponentScope {
  const entry =
    playerId === null
      ? undefined
      : opponent.facedBy.find((faced) => faced.playerId === playerId);
  const source = entry ?? opponent;
  return {
    playerId: entry?.playerId ?? null,
    firstName: entry?.firstName ?? null,
    wins: source.wins,
    losses: source.losses,
    played: source.played,
    analyzed: source.analyzed,
    recent: source.recent,
    measures: source.measures,
  };
}

/**
 * Is there a figure to show at all? Not "has matches" — a scope whose only
 * meeting is still in analysis has a recent row and no numbers, and a chart
 * with four live pills over nothing is worse than no chart (`tables.md` →
 * Peek Drawer, Player body).
 */
export function scopeHasStats(scope: Pick<OpponentScope, "measures">): boolean {
  return scope.measures.some((measure) => measure.value !== null);
}

/** "Total points won · Ben" — the stat header names whose figure it is. */
export function scopeStatLabel(
  measureLabel: string,
  scope: Pick<OpponentScope, "firstName">,
): string {
  return scope.firstName
    ? `${measureLabel} · ${scope.firstName}`
    : measureLabel;
}

/** "Recent matches · Ben", or bare for the whole team. */
export function scopeRecentLabel(scope: Pick<OpponentScope, "firstName">) {
  return scope.firstName
    ? `Recent matches · ${scope.firstName}`
    : "Recent matches";
}

/**
 * The one sentence that stands in for the stat block when the scope has no
 * measured figure — it names whose numbers are missing, so choosing a player
 * whose match is still in analysis does not read as the whole team's gap.
 */
export function scopePlaceholder(
  scope: Pick<OpponentScope, "firstName">,
  opponentFirstName: string,
): string {
  return scope.firstName
    ? `${scope.firstName}’s numbers against ${opponentFirstName} appear here once one of ${scope.firstName}’s matches against them is analyzed.`
    : `The team’s numbers against ${opponentFirstName} appear here once a match against them is analyzed.`;
}

/** Where the opponent plays, as the drawer's identity block draws it. */
export type OpponentTeamLine =
  | {
      kind: "program";
      name: string;
      shortCode: string | null;
      crestUrl: string | null;
      /**
       * "D-I · Big West" — division first, as the team picker's rows read —
       * either half alone, or null for neither.
       */
      detail: string | null;
    }
  /** A school somebody typed, not in the directory: a team all the same. */
  | { kind: "school"; name: string }
  /** Nobody has said where they play. */
  | { kind: "none" };

export function opponentTeamLine(
  opponent: Pick<TeamOpponent, "program" | "school">,
): OpponentTeamLine {
  const { program, school } = opponent;
  if (program) {
    const detail = [
      divisionLabel(program.division?.trim() || null),
      program.conference,
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" · ");
    return {
      kind: "program",
      name: program.schoolName,
      shortCode: program.shortCode,
      crestUrl: program.crestUrl,
      detail: detail || null,
    };
  }
  if (school) return { kind: "school", name: school };
  return { kind: "none" };
}
