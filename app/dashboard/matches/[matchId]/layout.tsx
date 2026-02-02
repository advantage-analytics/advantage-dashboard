import { notFound } from "next/navigation";

import mockData from "@/lib/data/mock.json";
import type { EventMatch, RecentEvent } from "@/lib/data/types";
import { MatchEventHeader } from "@/components/dashboard/matches/match-event-header";
import { MatchNavigationTabs } from "@/components/dashboard/matches/match-navigation-tabs";
import { MatchScoreDisplay } from "@/components/dashboard/matches/match-score-display";

interface MockDataShape {
  recentEvents: RecentEvent[];
}

type EnrichedMatch = EventMatch & {
  tournamentName: string;
  date: string;
  matchType: string;
  courtType?: string;
  verificationStatus?: string;
};

interface MatchLayoutProps {
  children: React.ReactNode;
  params: Promise<{ matchId: string }>;
}

function findMatchById(
  events: RecentEvent[],
  matchId: string
): EnrichedMatch | undefined {
  for (const event of events) {
    const match = event.matches.find((m) => m.id === matchId);
    if (match) {
      return {
        ...match,
        tournamentName: event.tournamentName,
        date: event.date,
        matchType: event.matchType,
        courtType: event.courtType,
        verificationStatus: event.verificationStatus,
      };
    }
  }
  return undefined;
}

export default async function MatchLayout({
  children,
  params,
}: MatchLayoutProps): Promise<React.JSX.Element> {
  const { matchId } = await params;
  const typedMockData = mockData as MockDataShape;
  const match = findMatchById(typedMockData.recentEvents, matchId);

  if (!match) {
    notFound();
  }

  return (
    <div className="flex-1 w-full bg-white">
      <div className="relative z-10 pt-[88px] px-8">
        <div className="flex flex-row py-6 gap-8">
          <div className="flex-1 min-w-0 flex flex-col gap-10">
            <MatchEventHeader
              tournamentName={match.tournamentName}
              date={match.date}
              matchType={match.matchType}
              courtType={match.courtType}
              verificationStatus={match.verificationStatus}
            />
            <MatchNavigationTabs matchId={matchId} />
            <div className="flex flex-col gap-10 min-w-0">{children}</div>
          </div>

          <div className="sticky top-8 w-[320px] flex-shrink-0 self-start h-fit flex flex-col gap-5">
            <MatchScoreDisplay match={match} />
          </div>
        </div>
      </div>
    </div>
  );
}
