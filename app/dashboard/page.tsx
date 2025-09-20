import { redirect } from "next/navigation";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { PerformanceDashboard } from "@/components/dashboard/performance-dashboard";
import { RecentMatches } from "@/components/dashboard/recent-matches";
import { UpcomingMatches } from "@/components/dashboard/upcoming-matches";
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

  // Recent Matches Data
  const recentMatchesData = [
    {
      id: "1",
      opponent: "Timo Legout",
      opponentSchool: "Texas Longhorns",
      opponentLogo: "🤠",
      playerScore: "5 2",
      opponentScore: "7 6",
      matchType: "NCAA Team Quarter-finals",
      timestamp: "1:34",
      won: false
    },
    {
      id: "2",
      opponent: "Peter Makk",
      opponentSchool: "USC Trojans",
      opponentLogo: "🔴",
      playerScore: "7 3 3",
      opponentScore: "6 6 3",
      matchType: "NCAA Team Quarter-finals",
      timestamp: "2:46",
      won: true
    },
    {
      id: "3",
      opponent: "Carl Emil Overbeck",
      opponentSchool: "Cal Golden Bears",
      opponentLogo: "🐻",
      playerScore: "7 5 3",
      opponentScore: "5 7 6",
      matchType: "NCAA Team Quarter-finals",
      timestamp: "2:12",
      won: false
    },
    {
      id: "4",
      opponent: "Gianluca Brunkow",
      opponentSchool: "UC Davis Aggies",
      opponentLogo: "🐂",
      playerScore: "5 6 0",
      opponentScore: "7 2 1",
      matchType: "NCAA Team Quarter-finals",
      timestamp: "1:45",
      won: false
    },
    {
      id: "5",
      opponent: "Aidan Kim",
      opponentSchool: "Ohio State Buckeyes",
      opponentLogo: "🌰",
      playerScore: "6 2",
      opponentScore: "7 6",
      matchType: "NCAA Team Quarter-finals",
      timestamp: "1:23",
      won: false
    }
  ];

  // Upcoming Matches Data
  const upcomingMatchesData = [
    {
      id: "1",
      opponent: "Nicholas Godsick",
      opponentSchool: "Stanford University",
      opponentLogo: "🌲",
      date: "March 14, 2025",
      time: "2:00 PM"
    },
    {
      id: "2",
      opponent: "Peter Makk",
      opponentSchool: "University of Southern California",
      opponentLogo: "🔴",
      date: "March 14, 2025",
      time: "2:00 PM"
    },
    {
      id: "3",
      opponent: "Jay Friend",
      opponentSchool: "University of Arizona",
      opponentLogo: "🐱",
      date: "March 14, 2025",
      time: "2:00 PM"
    },
    {
      id: "4",
      opponent: "Theo Dean",
      opponentSchool: "University of California, Berkeley",
      opponentLogo: "🐻",
      date: "March 14, 2025",
      time: "2:00 PM"
    },
    {
      id: "5",
      opponent: "Timo Legout",
      opponentSchool: "University of California, Berkeley",
      opponentLogo: "🤠",
      date: "March 14, 2025",
      time: "2:00 PM"
    }
  ];

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
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <RecentMatches matches={recentMatchesData} />
        <UpcomingMatches matches={upcomingMatchesData} />
      </div>
      
      <LogoutButton/>
    </div>
  );
}
