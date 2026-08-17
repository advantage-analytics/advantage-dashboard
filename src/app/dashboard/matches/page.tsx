import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { analysisFor, loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import {
  type DbMatch,
  type DisplayMatch,
  transformDbMatch,
} from "@/lib/data/matches-list-types";
import { MatchesPageContent } from "@/components/dashboard/matches/matches-page-content";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";
import { MatchesSkeleton } from "@/components/dashboard/matches/matches-skeleton";

export default async function MatchesPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let matches: DisplayMatch[] = [];

  if (user) {
    const { data } = await supabase
      .from("matches")
      .select(
        "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, source_provider, player2_id"
      )
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    if (data) {
      // Collect unique opponent user IDs to fetch hand/backhand
      const opponentIds = [...new Set(
        data.map((r) => r.player2_id).filter((id): id is string => id != null)
      )];

      // Both follow-ups key off the ids in `data` and neither reads the other's
      // output, so they overlap rather than stack. Analysis state is keyed by
      // match id, so feeding it every row — including any that transformDbMatch
      // later drops — costs nothing but an unread map entry.
      const [{ data: opponents }, jobs] = await Promise.all([
        opponentIds.length > 0
          ? supabase.from("users").select("id, hand, backhand").in("id", opponentIds)
          : Promise.resolve({ data: null }),
        loadMatchAnalysis(supabase, data.map((r) => r.id), { reap: true }),
      ]);

      const opponentMap = new Map<string, { hand: string | null; backhand: string | null }>();
      for (const o of opponents ?? []) {
        opponentMap.set(o.id, { hand: o.hand, backhand: o.backhand });
      }

      matches = (data as (DbMatch & { player2_id: string | null })[])
        .map((row) => {
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
  }

  return (
    <div className="flex-1 w-full bg-white">
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 py-8 sm:py-10">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-3">
            {matches.length > 0 && (
              <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                {matches.length} {matches.length === 1 ? "MATCH" : "MATCHES"} RECORDED
              </p>
            )}
            <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px]">
              Matches
            </h1>
          </div>
          {matches.length > 0 && <CreateMatchButton variant="blue" />}
        </div>

        <div className="mt-10">
          <Suspense fallback={<MatchesSkeleton />}>
            {/* userId drives the realtime subscription's server-side filter, so
                a busy account never receives other people's job rows. */}
            <MatchesPageContent matches={matches} userId={user?.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
