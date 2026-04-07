import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
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
      const opponentMap = new Map<string, { hand: string | null; backhand: string | null }>();

      if (opponentIds.length > 0) {
        const { data: opponents } = await supabase
          .from("users")
          .select("id, hand, backhand")
          .in("id", opponentIds);
        if (opponents) {
          for (const o of opponents) {
            opponentMap.set(o.id, { hand: o.hand, backhand: o.backhand });
          }
        }
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
          return display;
        })
        .filter((m): m is DisplayMatch => m !== null);
    }
  }

  return (
    <div className="flex-1 w-full bg-white">
      <div className="px-8 py-10">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
              {matches.length} {matches.length === 1 ? "MATCH" : "MATCHES"} RECORDED
            </p>
            <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px]">
              Matches
            </h1>
          </div>
          <CreateMatchButton variant="blue" />
        </div>

        <div className="mt-10">
          <Suspense fallback={<MatchesSkeleton />}>
            <MatchesPageContent matches={matches} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
