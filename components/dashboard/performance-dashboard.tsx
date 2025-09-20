"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Trophy, Target, Calendar } from "lucide-react"

interface PerformanceMetrics {
  serveRating: number | string;
  returnRating: number | string;
  underPressureRating: number | string;
  firstServeInPercentage: number | string;
  breakPointsSaved: number | string;
}

interface MatchHistoryMetrics {
  totalMatches: number | string;
  wins: number | string;
  losses: number | string;
  winPercentage: number | string;
  currentStreak: number | string;
}

interface GoalsProgressMetrics {
  seasonGoal: number | string;
  currentProgress: number | string;
  remainingMatches: number | string;
  targetRanking: number | string;
  confidenceLevel: number | string;
}

interface TournamentMetrics {
  tournamentsPlayed: number | string;
  bestFinish: number | string;
  totalPrizeMoney: number | string;
  rankingPoints: number | string;
  nextTournament: string;
}

interface PerformanceDashboardProps {
  performanceData: PerformanceMetrics;
  matchHistoryData: MatchHistoryMetrics;
  goalsProgressData: GoalsProgressMetrics;
  tournamentData: TournamentMetrics;
}

export function PerformanceDashboard({
  performanceData,
  matchHistoryData,
  goalsProgressData,
  tournamentData
}: PerformanceDashboardProps) {
  return (
    <div className="w-full">
      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="match-history" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Match History
          </TabsTrigger>
          <TabsTrigger value="goals-progress" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Goals & Progress
          </TabsTrigger>
          <TabsTrigger value="tournaments" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Tournaments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Serve Rating</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{performanceData.serveRating}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Return Rating</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{performanceData.returnRating}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Under Pressure Rating</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{performanceData.underPressureRating}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">First Serve In Percentage</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{performanceData.firstServeInPercentage}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Break Points Saved</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{performanceData.breakPointsSaved}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="match-history" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Total Matches</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{matchHistoryData.totalMatches}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Wins</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-3xl font-bold text-green-400">{matchHistoryData.wins}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Losses</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-3xl font-bold text-red-400">{matchHistoryData.losses}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Win Percentage</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{matchHistoryData.winPercentage}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Current Streak</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-3xl font-bold text-yellow-400">{matchHistoryData.currentStreak}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="goals-progress" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Season Goal</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{goalsProgressData.seasonGoal}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Current Progress</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-3xl font-bold text-blue-400">{goalsProgressData.currentProgress}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Remaining Matches</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{goalsProgressData.remainingMatches}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Target Ranking</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">#{goalsProgressData.targetRanking}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Confidence Level</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-3xl font-bold text-green-400">{goalsProgressData.confidenceLevel}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tournaments" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Tournaments Played</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{tournamentData.tournamentsPlayed}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Best Finish</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-3xl font-bold text-yellow-400">#{tournamentData.bestFinish}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Total Prize Money</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-3xl font-bold text-green-400">{tournamentData.totalPrizeMoney}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Ranking Points</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-2xl font-bold">{tournamentData.rankingPoints}</div>
              </CardContent>
            </Card>
            
            <Card className="bg-black text-white border-gray-800 w-60 h-30 flex flex-col justify-center">
              <CardHeader className="pb-1 px-4 pt-4">
                <CardTitle className="text-sm font-medium text-gray-300">Next Tournament</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-0 pb-4">
                <div className="text-lg font-bold">{tournamentData.nextTournament}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
