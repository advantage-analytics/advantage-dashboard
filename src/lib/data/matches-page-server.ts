import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileBeforePageRead } from "@/lib/services/splitstep/reconcile";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";
import {
  type DbMatch,
  type DisplayMatch,
  transformDbMatch,
} from "@/lib/data/matches-list-types";

export async function enrichMatches(
  supabase: SupabaseClient,
  data: (DbMatch & { player2_id: string | null })[],
  user: { id: string },
): Promise<DisplayMatch[]> {
  // Collect unique opponent user IDs to fetch hand/backhand
  const opponentIds = [
    ...new Set(
      data.map((r) => r.player2_id).filter((id): id is string => id != null),
    ),
  ];

  // Both follow-ups key off the ids in `data` and neither reads the other's
  // output, so they overlap rather than stack. Analysis state is keyed by
  // match id, so feeding it every row — including any that transformDbMatch
  // later drops — costs nothing but an unread map entry.
  const [{ data: opponents }, jobs] = await Promise.all([
    opponentIds.length > 0
      ? supabase
          .from("users")
          .select("id, hand, backhand")
          .in("id", opponentIds)
      : Promise.resolve({ data: null }),
    (async () => {
      // Vendor-status reconciliation, sequenced before the analysis read
      // so what the poll learns is what this list renders. Never fatal.
      // Lives here and on the match detail page, not in
      // loadMatchAnalysis — client components import that module, and the
      // reconciler's admin/Azure dependencies must never enter a client
      // module graph.
      await reconcileBeforePageRead(
        data.map((r) => r.id),
        "matches",
      );
      return loadMatchAnalysis(
        supabase,
        data.map((r) => r.id),
        { reap: true },
      );
    })(),
  ]);

  const opponentMap = new Map<
    string,
    { hand: string | null; backhand: string | null }
  >();
  for (const o of opponents ?? []) {
    opponentMap.set(o.id, { hand: o.hand, backhand: o.backhand });
  }

  return (data as (DbMatch & { player2_id: string | null })[])
    .map((row) => {
      // `transformDbMatch` ignores the viewer — it decides the winner from
      // the score, player1 against player2, not relative to whoever is
      // looking. That is what makes one row safe to show a coach and the
      // player alike, and why a team scope needs no second transform.
      const display = transformDbMatch(row, user.id);
      if (!display) return null;
      const opp = row.player2_id ? opponentMap.get(row.player2_id) : undefined;
      if (opp) {
        display.player2Hand = opp.hand ?? undefined;
        display.player2Backhand = opp.backhand ?? undefined;
      }
      // Matches with no job row resolve to `imported` or `manual` here.
      display.analysis = analysisFor(jobs, display);
      return display;
    })
    .filter((m): m is DisplayMatch => m !== null);
}
