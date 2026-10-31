/**
 * Which team crest belongs to which seat of a match.
 *
 * A team match's own program is player one and `opponent_program_id` names the
 * team of player two — the rule `team-opponents.ts` states, checked live again
 * on 2026-10-31 (39/39 team matches hold a roster player in seat one). Crests
 * are handed out by seat and read through `useMatchSides()`, so whichever way
 * up the page draws the match, each crest stays beside its own player.
 *
 * A personal match has neither embed, and a program hidden from the reader by
 * RLS reads as no embed: that seat has no crest and keeps its initials.
 */

/** A to-one embed of `programs`, or the array an untyped client may hand back. */
type CrestEmbed =
  { crest_path: string | null } | { crest_path: string | null }[];

export interface MatchCrestEmbeds {
  program?: CrestEmbed | null;
  opponent_program?: CrestEmbed | null;
}

function crestPath(embed: CrestEmbed | null | undefined): string | null {
  return (Array.isArray(embed) ? embed[0] : embed)?.crest_path ?? null;
}

/** Each seat's crest URL, or null for a seat with none to draw. */
export function seatCrestUrls(
  row: MatchCrestEmbeds,
  publicUrl: (path: string) => string,
): { player1: string | null; player2: string | null } {
  const team = crestPath(row.program);
  const opponent = crestPath(row.opponent_program);
  return {
    player1: team ? publicUrl(team) : null,
    player2: opponent ? publicUrl(opponent) : null,
  };
}
