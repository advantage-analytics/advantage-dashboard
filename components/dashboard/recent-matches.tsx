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
        <a
          href="#"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          View All
        </a>
      </CardHeader>
      <CardContent className="space-y-0">
        {matches.map((match, index) => (
          <div key={match.id} >
            <div className="py-8 m-4 flex-col gap-8">
              <div className="text-xs text-gray-500 mb-2">
                Final Score | {match.matchType}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center justify-between gap-4">
                  <div className="bg-gray-300 w-8 h-8"/>
                  <p>
                    Player1 Name
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p>0</p>
                  <p>0</p>
                  <p>0</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center justify-between gap-4">
                  <div className="bg-gray-300 w-8 h-8"/>
                  <p>
                    Player2 Name
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p>0</p>
                  <p>0</p>
                  <p>0</p>
                </div>
              </div>
            </div>
            {index < matches.length - 1 && <Separator />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
