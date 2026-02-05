export interface Player {
  name: string;
  school: string;
}

export interface SetScore {
  player1: number;
  player2: number;
  tiebreak?: boolean;
}

export interface MatchScore {
  sets: SetScore[];
  winner: "player1" | "player2";
  finalScore: string;
}

export interface Match {
  id: string;
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
  round?: string;
  matchContext?: string;
  duration?: string;
  player1: Player;
  player2: Player;
  score: MatchScore;
  won: boolean;
}

export interface UpcomingMatch {
  id: string;
  opponent: string;
  opponentSchool: string;
  date: string;
  time: string;
  tournamentName: string;
  matchType: string;
}

export interface PerformanceRatingData {
  label: string;
  value: number;
  barColor: string;
}

export interface RecentPerformanceData {
  label: string;
  value: number;
  change: number;
}

export interface OverallPerformanceData {
  wins: number;
  losses: number;
  performanceRatings: PerformanceRatingData[];
  recentPerformance: RecentPerformanceData[];
}

export interface MockData {
  recentMatches: Match[];
  upcomingMatches: UpcomingMatch[];
  overallPerformance: OverallPerformanceData;
}

// Match Statistics Types
export interface MatchSummaryStats {
  totalPoints: number;
  durationMinutes: number;
  longestRally: number;
}

export interface PlayerStatistics {
  aces: number;
  doubleFaults: number;
  firstServeInPct: number;
  firstServeWinPct: number;
  secondServeWinPct: number;
  breakpointsWon: number;
  tiebreaksWon: number;
  servicePointsWon: number;
  serviceGamesWon: number;
  returnPointsWon: number;
  returnGamesWon: number;
}

export interface MatchDetailedStats {
  summary: MatchSummaryStats;
  player1Stats: PlayerStatistics;
  player2Stats: PlayerStatistics;
}

export interface MatchWithStats extends Match {
  statistics?: MatchDetailedStats;
}

export interface EventMatch {
  id: string;
  round?: string;
  matchContext?: string;
  duration?: string;
  player1: Player;
  player2: Player;
  score: MatchScore;
  won: boolean;
  statistics?: MatchDetailedStats;
}

export interface RecentEvent {
  id: string;
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
  matches: EventMatch[];
}
