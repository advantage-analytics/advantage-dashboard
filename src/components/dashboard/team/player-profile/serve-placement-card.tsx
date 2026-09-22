import {
  ServePlacementGhost,
  ServePlacementQuietStrip,
} from "@/components/dashboard/home/serve-placement-quiet-strip";
import {
  CardEmpty,
  type CardSubject,
} from "@/components/dashboard/shared/card-empty";
import type { PlayerProfile } from "@/lib/data/player-profile-server";

/**
 * Where this player's serves land — Home's quiet strip, scoped to one
 * program player and read on the server.
 *
 * The strip already IS the frame's card once there are serves to draw:
 * claim-led, T / Body / Wide bars per court, a legend-and-count row — all of
 * it Home's own (Platform Audit Pa2). What a coach's page needs that Home's
 * does not is the card-level day zero the rest of this page speaks: the
 * strip's own shape in grey under `CardEmpty`, then a band naming what fills
 * it, in the third person when the page is not about the reader.
 *
 * No action in the band: it would repeat the header's New match, which is
 * the same step one row above (the "one action, not two" rule).
 */
export function ServePlacementCard({
  serve,
  subject,
}: {
  serve: PlayerProfile["serve"];
  subject: CardSubject;
}) {
  if (serve.zoneStats !== null) {
    return (
      <ServePlacementQuietStrip
        zoneStats={serve.zoneStats}
        matchCount={serve.matchCount}
        statisticsHref="/dashboard/team/statistics"
      />
    );
  }

  return (
    <section
      aria-label="Serve placement"
      className="surface-card flex flex-col gap-3"
      style={{ padding: "var(--pad-card)" }}
    >
      <span className="eyebrow">Serve placement</span>
      <CardEmpty
        description="No report yet: this card shows where first serves land on each court, T, body and wide."
        className="flex flex-col gap-3"
        band={{
          title: subject.isSelf
            ? "Your serve map lands here"
            : `${subject.firstName}'s serve map lands here`,
          body: "Where first serves go on each court, once the first report lands.",
        }}
      >
        <ServePlacementGhost />
      </CardEmpty>
    </section>
  );
}
