import { ServePlacementQuietStrip } from "@/components/dashboard/home/serve-placement-quiet-strip";
import type { PlayerProfile } from "@/lib/data/player-profile-server";

/**
 * Where this player's serves land — Home's quiet strip, scoped to one
 * program player and read on the server.
 *
 * The strip already IS the frame's card: T / Body / Wide bars per court with
 * the dominant-zone claim above them, and the drawn court as its empty
 * state. What the profile adds is the legend row and the "Season · N serves"
 * count, both optional props. The frame's closing sentence ("Wide is the
 * third option on both sides…") is not drawn — the one claim the data backs
 * is the strip's own.
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
      contextLabel={`last ${serve.matchCount} ${serve.matchCount === 1 ? "match" : "matches"}`}
      awaitingReport={matchesPlayed > 0}
      statisticsHref="/dashboard/team/statistics"
      legend
      footerLabel={`Season · ${serve.serves} ${serve.serves === 1 ? "serve" : "serves"}`}
      emptyCopy={
        isSelf
          ? undefined
          : {
              awaiting: "Their serve map fills in when the first report lands.",
              first: "Their first serves, plotted after their first match.",
            }
      }
    />
  );
}
