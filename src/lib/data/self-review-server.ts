import { createClient } from "@/lib/supabase/server";
import {
  NO_SELF_REVIEW,
  selfReviewStateFrom,
  type SelfReviewState,
} from "@/lib/data/self-review";

/**
 * The match's self review for this viewer (`self_review_state`, run as the
 * signed-in user): whether they may fix points, and every point a self
 * review changed. Anyone who can see the match reads the edits, so staff and
 * team players see "Edited by Coach …"; only `canFix` differs.
 *
 * Never fatal: a failed read is a report with no "Edited by" line and no Fix
 * points, never a broken page.
 */
export async function getSelfReviewState(
  matchId: string,
): Promise<SelfReviewState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("self_review_state", {
    p_match_id: matchId,
  });
  if (error) {
    console.error("[self-review] could not read the state", {
      matchId,
      error: error.message,
    });
    return NO_SELF_REVIEW;
  }
  return selfReviewStateFrom(data);
}
