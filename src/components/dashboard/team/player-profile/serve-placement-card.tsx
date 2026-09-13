import { ServePlacementQuietStrip } from "@/components/dashboard/home/serve-placement-quiet-strip";
import type { PlayerProfile } from "@/lib/data/player-profile-server";

/**
 * Where this player's serves land — Home's quiet strip, scoped to one
 * program player and read on the server.
 *
 * The strip already IS the frame's card: claim-led, T / Body / Wide bars per
 * court, a legend-and-count row, and the drawn court as its empty state —
 * all of it Home's own now (round splitstep-integration's Pa2 pass). The one
 * thing a coach's page needs that Home's own copy does not supply is the
 * third person: "Their serve map…", not "Your serve map…".
 */
export function ServePlacementCard({
  serve,
  matchesPlayed,
  isSelf,
}: {
  serve: PlayerProfile["serve"];
  matchesPlayed: number;
  isSelf: boolean;
}) {
  return (
    <ServePlacementQuietStrip
      zoneStats={serve.zoneStats}
      matchCount={serve.matchCount}
      awaitingReport={matchesPlayed > 0}
      statisticsHref="/dashboard/team/statistics"
      emptyCopy={
        isSelf
          ? undefined
          : {
              awaiting: "Their serve map fills in when the first report lands.",
              first: "Where their first serves land, after their first match.",
            }
      }
    />
  );
}
