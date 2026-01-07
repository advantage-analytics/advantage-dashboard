export interface Player {
  name: string;
  school: string;
  // No logo field - will use placeholder divs in UI
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

export interface MockData {
  recentMatches: Match[];
  upcomingMatches: UpcomingMatch[];
}
