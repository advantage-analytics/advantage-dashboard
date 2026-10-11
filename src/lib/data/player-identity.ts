/**
 * The pure half of `player-identity-server.ts`: given the ids that mean "me"
 * (`getMyPlayerIds()` there), which side of a match is the viewer's.
 *
 * Split out only so pure modules and offline specs can import it — that file
 * pulls in the cookie Supabase client. The rule itself is unchanged and that
 * file's header is still its documentation.
 */

/**
 * Does this match belong to the viewer, and were they player one?
 *
 * Returns `null` for a match that is not theirs, so a caller cannot mistake
 * "not mine" for "mine, and I was player two" — which is exactly the bug this
 * shape exists to prevent. The original: treating an unknown `player1_id` as
 * proof the viewer was player 2 inverted every such row, and a match our side
 * won was counted as a loss.
 *
 * The last clause is legacy personal matches: uploaded before player ids were
 * populated at all, where the uploader is the only evidence of whose match it
 * is. It is deliberately last — an id, when there is one, always wins.
 */
export function playerSide(
  match: {
    player1_id: string | null;
    player2_id: string | null;
    created_by: string | null;
  },
  myPlayerIds: readonly string[],
  viewerId: string,
): "player1" | "player2" | null {
  if (match.player1_id && myPlayerIds.includes(match.player1_id)) {
    return "player1";
  }
  if (match.player2_id && myPlayerIds.includes(match.player2_id)) {
    return "player2";
  }
  if (!match.player1_id && !match.player2_id && match.created_by === viewerId) {
    return "player1";
  }
  return null;
}

/** Whether a player id names the viewer. */
export function isMe(
  playerId: string | null,
  myPlayerIds: readonly string[],
): boolean {
  return Boolean(playerId) && myPlayerIds.includes(playerId as string);
}
