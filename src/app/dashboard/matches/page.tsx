import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  type DbMatch,
  type DisplayMatch,
  transformDbMatch,
} from "@/lib/data/matches-list-types";
import { MatchesPageContent } from "@/components/dashboard/matches/matches-page-content";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";

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
        "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, source_provider"
      )
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    if (data) {
      matches = (data as DbMatch[])
        .map((row) => transformDbMatch(row, user.id))
        .filter((m): m is DisplayMatch => m !== null);
    }
  }

  return (
    <main className="flex-1 w-full bg-white min-h-screen">
      <div className="relative z-10 px-8 py-12 pt-[104px]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#0D0D0D] mb-1.5">
              Matches
            </h1>
            <p className="text-sm text-[#999999]">
              Your match history, scores, and performance over time.
            </p>
          </div>
          <CreateMatchButton />
        </div>

        <Suspense fallback={null}>
          <MatchesPageContent matches={matches} />
        </Suspense>
      </div>
    </main>
  );
}
