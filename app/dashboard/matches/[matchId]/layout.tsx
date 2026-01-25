import { notFound } from "next/navigation";
import mockData from "@/lib/data/mock.json";
import type { Match } from "@/lib/data/types";
import { MatchEventHeader } from "@/components/dashboard/matches/match-event-header";
import { MatchScoreDisplay } from "@/components/dashboard/matches/match-score-display";
import { MatchNavigationTabs } from "@/components/dashboard/matches/match-navigation-tabs";

interface MatchLayoutProps {
  children: React.ReactNode;
  params: Promise<{ matchId: string }>;
}

export default async function MatchLayout({
  children,
  params,
}: MatchLayoutProps) {
  const { matchId } = await params;

  // Flatten mock data to find the match
  const allMatches: (Match & {
    tournamentName: string;
    date: string;
    matchType: string;
    courtType?: string;
    verificationStatus?: string;
  })[] = (mockData as any).recentEvents.flatMap((event: any) =>
    event.matches.map((match: any) => ({
      ...match,
      tournamentName: event.tournamentName,
      date: event.date,
      matchType: event.matchType,
      courtType: event.courtType,
      verificationStatus: event.verificationStatus,
    }))
  );

  const match = allMatches.find((m) => m.id === matchId);

  if (!match) {
    notFound();
  }

  return (
    <div className="flex-1 w-full bg-white">
      {/* Main Content - Positioned above background */}
      <div className="relative z-10 pt-[88px]">
        {/* Two Column Layout */}
        <div className="flex flex-row px-8 py-6 gap-8">
          {/* Left Column - Flexible width, expands when sidebar toggles */}
          <div className="flex-1 flex flex-col gap-10">
            {/* Header Section */}
            <MatchEventHeader
              tournamentName={match.tournamentName}
              date={match.date}
              matchType={match.matchType}
              courtType={match.courtType}
              verificationStatus={match.verificationStatus}
            />

            {/* Navigation Tabs */}
            <MatchNavigationTabs matchId={matchId} />

            {/* Tab Content */}
            <div className="flex flex-col gap-10">{children}</div>
          </div>

          {/* Right Column - Fixed 320px widget */}
          <div className="sticky top-8 w-[320px] flex-shrink-0 self-start h-fit flex flex-col gap-5">
            {/* Score Display Widget */}
            <MatchScoreDisplay match={match} />
          </div>
        </div>
      </div>
    </div>
  );
}
