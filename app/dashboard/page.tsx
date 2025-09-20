import { redirect } from "next/navigation";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { PerformanceDashboard } from "@/components/dashboard/performance-dashboard";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  // Performance Dashboard Data
  const performanceData = {
    serveRating: "256.5",
    returnRating: "256.5", 
    underPressureRating: "256.5",
    firstServeInPercentage: "78.5%",
    breakPointsSaved: "65.2%"
  };

  const matchHistoryData = {
    totalMatches: 24,
    wins: 18,
    losses: 6,
    winPercentage: "75%",
    currentStreak: 4
  };

  const goalsProgressData = {
    seasonGoal: 20,
    currentProgress: 15,
    remainingMatches: 8,
    targetRanking: 15,
    confidenceLevel: "85%"
  };

  const tournamentData = {
    tournamentsPlayed: 6,
    bestFinish: 2,
    totalPrizeMoney: "$12,500",
    rankingPoints: 450,
    nextTournament: "Spring Championships"
  };

  return (
    <div className="flex-1 w-full p-6">
      {/* Filler Data for now */}
      <WelcomeBanner
        name="Clajerson Gimena"
        school="University of California, Los Angeles"
        classYear="Senior"
        itaRanking={26}
        winStreak={4}
        matchesClinched={1}
      />
      
      <PerformanceDashboard 
        performanceData={performanceData}
        matchHistoryData={matchHistoryData}
        goalsProgressData={goalsProgressData}
        tournamentData={tournamentData}
      />
      
      <LogoutButton/>
    </div>
  );
}
