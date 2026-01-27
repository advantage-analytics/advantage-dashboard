import { redirect } from "next/navigation";
import { Calendars } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import MatchesTable from "@/components/dashboard/matches/matches-table";

export default async function MatchesPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  // Fetch matches where user is either player1_id or player2_id
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select(
      "id, date, tournament_name, player1_name, player2_name, result, status",
    )
    .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
    .order("date", { ascending: false });

  if (matchesError) {
    // eslint-disable-next-line no-console
    console.error("Error fetching matches:", matchesError);
  }

  // Fetch associated files
  const { data: files, error: filesError } = await supabase
    .from("match_files")
    .select("match_id, file_name, storage_path");

  if (filesError) {
    // eslint-disable-next-line no-console
    console.error("Error fetching match_files:", filesError);
  }

  const matchesWithFiles =
    matches?.map((m) => ({
      ...m,
      files: (files || []).filter((f) => f.match_id === m.id),
    })) ?? [];

  return (
    <div className="flex-1 w-full bg-white">
      <div className="px-8 py-12 pt-[136px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Calendars className="h-5 w-5 text-gray-500" />
          </div>
          <div>
            <h1 className="font-medium text-2xl text-[#0D0D0D]">Matches</h1>
            <p className="font-normal text-xs text-[#9CA3AF]">
              View your matches and generate reports from uploaded data.
            </p>
          </div>
        </div>

        <MatchesTable userId={user.id} matches={matchesWithFiles} />
      </div>
    </div>
  );
}
