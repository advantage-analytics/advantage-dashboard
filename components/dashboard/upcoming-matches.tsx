import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Calendar, Clock } from "lucide-react"

interface UpcomingMatch {
  id: string;
  opponent: string;
  opponentSchool: string;
  opponentLogo: string;
  date: string;
  time: string;
}

interface UpcomingMatchesProps {
  matches: UpcomingMatch[];
}

export function UpcomingMatches({
  matches
}: UpcomingMatchesProps) {
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl font-bold">Upcoming Matches</CardTitle>
          <p className="text-sm text-gray-600 mt-1">Your Upcoming Matches With Anticipated Opponents</p>
        </div>
        <a href="#" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
          View All
        </a>
      </CardHeader>
      <CardContent className="space-y-0">
        {matches.map((match, index) => (
          <div key={match.id}>
            <div className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">{match.opponentLogo}</span>
                    <div>
                      <div className="font-medium text-sm">{match.opponent}</div>
                      <div className="text-xs text-gray-500">{match.opponentSchool}</div>
                      <div className="flex items-center space-x-1 text-xs text-gray-600 mt-1">
                        <Calendar className="h-3 w-3" />
                        <span>{match.date}</span>
                      </div>
                      <div className="flex items-center space-x-1 text-xs text-gray-600">
                        <Clock className="h-3 w-3" />
                        <span>{match.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400 text-xs">IMG</span>
                </div>
              </div>
            </div>
            {index < matches.length - 1 && <Separator />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
