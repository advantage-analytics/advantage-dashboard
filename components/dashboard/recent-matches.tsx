import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface MatchResult {
  id: string;
  opponent: string;
  opponentSchool: string;
  opponentLogo: string;
  playerScore: string;
  opponentScore: string;
  matchType: string;
  timestamp: string;
  won: boolean;
}

interface RecentMatchesProps {
  matches: MatchResult[];
}

export function RecentMatches({ matches }: RecentMatchesProps) {
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl font-bold">Recent Matches</CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            Your Last 5 Matches With Highlights
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-0">
        {matches.map((match, index) => (
          <div key={match.id}>
            {/* Thin grey dividing line above each match (except first) */}
            {<Separator className="bg-gray-200" />}
            
            <div className="py-8 m-4 flex-col gap-8">
              {/* Updated top line with time aligned right */}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>Final Score | {match.matchType}</span>
                <span>{match.timestamp}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center justify-between gap-4">
                  <div className="bg-gray-300 w-8 h-8" />
                  <p>Player1 Name</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p>0</p>
                  <p>0</p>
                  <p>0</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center justify-between gap-4">
                  <div className="bg-gray-300 w-8 h-8" />
                  <p>Player2 Name</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p>0</p>
                  <p>0</p>
                  <p>0</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* View All moved to bottom center */}
        <div className="flex justify-center mt-6">
          <a
            href="#"
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            View All
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
