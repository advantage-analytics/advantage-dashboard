import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Which ids mean "me" when a match names a player.
 *
 * Before coach-managed profiles, this question had a one-word answer: a player
 * id was a `users.id`, so `player1_id === userId` was complete. It is not any
 * more. A coach can create a roster row before the athlete has a login, and
 * every match recorded against that row carries the PROFILE's id — including
 * the ones recorded before the athlete claimed it.
 *
 * ── Why the profile id does not move on claim ───────────────────────────────
 * Claiming binds an account to a profile; it does not rewrite history. The
 * alternative — re-pointing every match to the new user id — would split one
 * athlete's season across two ids at an arbitrary moment, and it would mutate
 * existing match data, which `docs/ui-revamp-guardrails.md` §2 forbids. So the
 * profile id stays, and this is the module that knows both are the same person.
 *
 * ── One rule, one place ─────────────────────────────────────────────────────
 * `my_player_ids()` in SQL is the authority: it backs the `matches` SELECT
 * policy and `visible_match_ids()`. This wraps the same function so TypeScript
 * asks the same question rather than answering it a second way. A rule restated
 * is a rule that can drift.
 */

/**
 * Every id that identifies the viewer as a player — their login, plus every
 * live profile they have claimed.
 *
 * `cache()`d because a dashboard render asks several times: the match page, the
 * activity tray and the stats baseline all need it, and it is one round trip.
 */
export const getMyPlayerIds = cache(async function getMyPlayerIds(): Promise<
  string[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_player_ids");

  if (error) {
    console.error("[identity] could not read player ids", {
      error: error.message,
    });
    return [];
  }

  // The RPC returns a set of uuids, which PostgREST hands over either as bare
  // strings or as `{ my_player_ids: uuid }` rows depending on how it resolves
  // the set-returning shape. Accept both rather than depending on which.
  return (data ?? [])
    .map((row: unknown) =>
      typeof row === "string"
        ? row
        : ((row as { my_player_ids?: string })?.my_player_ids ?? null)
    )
    .filter((id: string | null): id is string => Boolean(id));
});

/**
 * Does this match belong to the viewer, and were they player one?
 *
 * Returns `null` for a match that is not theirs, so a caller cannot mistake
 * "not mine" for "mine, and I was player two" — which is exactly the bug this
 * shape exists to prevent. `statistics-server.ts` documents the original:
 * treating an unknown `player1_id` as proof the viewer was player 2 inverted
 * every such row, and a match our side won was counted as a loss.
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
  viewerId: string
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
  myPlayerIds: readonly string[]
): boolean {
  return Boolean(playerId) && myPlayerIds.includes(playerId as string);
}
