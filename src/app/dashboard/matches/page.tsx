import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  type DbMatch,
  type DisplayMatch,
  transformDbMatch,
} from "@/lib/data/matches-list-types";
import { MatchesPageContent } from "@/components/dashboard/matches/matches-page-content";

export default async function MatchesPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let matches: DisplayMatch[] = [];

  if (user) {
    const { data: rows } = await supabase
      .from("matches")
      .select(
        "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration"
      )
      .eq("created_by", user.id)
      .order("date", { ascending: false });

    if (rows) {
      matches = (rows as DbMatch[])
        .map((row) => transformDbMatch(row, user.id))
        .filter((m): m is DisplayMatch => m !== null);
    }
  }

  return (
    <div className="flex-1 w-full bg-white min-h-[140vh]">
      <div className="relative z-10 px-8 py-12 pt-[104px]">
        <div className="max-w-[1200px] mx-auto">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link
              href="/dashboard/matches"
              className="text-xs font-normal text-[#999999] hover:text-[#666666] transition-colors"
            >
              Matches /
            </Link>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-medium text-[#0D0D0D] mb-2">
              Matches
            </h1>
            <p className="text-base font-normal text-[#999999]">
              View and manage all your tennis matches. Click on any match to see
              detailed statistics and insights.
            </p>
          </div>

          <MatchesPageContent matches={matches} />
        </div>
      </div>
    </div>
  );
}
