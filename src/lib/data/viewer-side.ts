/**
 * Which SEAT of a match a player occupies — player one, player two, or neither
 * — decided from the id columns alone.
 *
 * A seat is where the recorder put the player, not a fact about the player: the
 * same person is entered as player one in one match and player two in the next.
 * So the only evidence for a seat is a player id actually sitting in that
 * column. Seat two is NEVER inferred from an empty seat one — `player2_id` is
 * null in bulk (team schedule rows, doubles, scrubbed uploads), so "not seat
 * one" is not "seat two", it is "no evidence either way".
 *
 * This is the two-id half of `viewerSide` below, pulled out so a caller that
 * has no viewer to speak of — a loader assembling one player's own history —
 * can ask only the seat question without tripping the uploader fallback, which
 * would hand a both-null row back as "player1".
 */
export function playerSeat(
  match: { player1_id: string | null; player2_id?: string | null },
  playerIds: readonly string[]
): "player1" | "player2" | null {
  if (match.player1_id && playerIds.includes(match.player1_id)) return "player1";
  if (match.player2_id && playerIds.includes(match.player2_id)) return "player2";
  return null;
}

/**
 * Which side of a match a viewer is on — the three-state resolution every
 * caller must use before treating a match row as "mine".
 *
 * Extracted out of `performance-server.ts` (a `*-server.ts` file, which
 * imports `@/lib/supabase/server` and therefore pulls `next/headers` into any
 * client bundle that touches it) into its own dependency-free module so a
 * `"use client"` caller can use it too — `recent-activity.tsx` needs exactly
 * this question and cannot import the server file to get it. Same reasoning
 * that already consolidated `STATUS_MAP`/`resolveAnalysisStatus` into
 * `match-analysis.ts` for a server loader and a client realtime hook.
 *
 * Two states, not three, is the bug this exists to prevent: a caller that
 * only checks "is this player1" and falls back to "assume player2" silently
 * misattributes a match where the viewer is neither — a stranger's name,
 * score orientation and win/loss rendered as the viewer's own, with nothing
 * on screen to say so.
 *
 * The seat is decided by `playerSeat` first; only a row with NEITHER id set
 * falls through to the uploader clause, which reads an unassigned personal
 * upload as the uploader's own.
 */
export function viewerSide(
  match: { player1_id: string | null; player2_id?: string | null },
  playerIds: readonly string[],
  viewerId: string,
  createdBy?: string | null
): "player1" | "player2" | null {
  const seat = playerSeat(match, playerIds);
  if (seat) return seat;
  if (!match.player1_id && !match.player2_id && (createdBy ?? viewerId) === viewerId) {
    return "player1";
  }
  return null;
}
