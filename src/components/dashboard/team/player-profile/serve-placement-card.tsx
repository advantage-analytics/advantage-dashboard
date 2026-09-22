import { ServePlacementQuietStrip } from "@/components/dashboard/home/serve-placement-quiet-strip";
import {
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
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
 * it Home's own (Platform Audit Pa2). Before a report exists, this card
 * speaks the page's own card-level day zero instead of the strip's: the
 * strip's shape in grey rules under `CardEmpty`, then a band naming what
 * fills it, in the third person when the page is not about the reader.
 *
 * ── Why not the strip's own empty branch ────────────────────────────────────
 * Home's empty strip keeps its court labels, "— serves" counts and the
 * coloured legend, because on Home it sits under the page-wide fade and the
 * labels are the payload. Inside a card band, at 0.32, that text and colour
 * read as a washed-out populated widget beside three siblings that dim only
 * grey rules. So this ghost draws the siblings' grammar — a rule where each
 * word or number goes, the empty 14px tracks, nothing else — and the band
 * carries the words at full strength.
 *
 * No action in the band: it would repeat the header's New match, which is
 * the same step one row above (the "one action, not two" rule).
 */
const COURTS = ["Deuce court", "Ad court"] as const;

/**
 * Three pieces stepping down the product's ghost ladder, as the table cards'
 * rows do (`GhostRows`): the claim's rule at full strength, then the deuce
 * court, then the ad court — so the ghost fades toward the band the way its
 * siblings' rows fade toward theirs.
 */
function ServeGhost() {
  const [claim, ...courts] = GHOST_OPACITY;
  return (
    <div className="flex flex-col gap-4">
      {/* The claim's line — the name-column rule, as on the match row. */}
      <div style={{ opacity: claim }}>
        <GhostRule width="60%" tone="200" shape="tall" />
      </div>
      {COURTS.map((court, i) => (
        <div
          key={court}
          className="flex flex-col gap-[5px]"
          style={{ opacity: courts[i] }}
        >
          <div className="flex items-center">
            <GhostRule width="72px" />
            <div className="flex-1" />
            <GhostRule width="48px" />
          </div>
          <div className="h-3.5 rounded-[var(--radius-cell)] bg-[var(--ink-100)]" />
        </div>
      ))}
    </div>
  );
}

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
      className="surface-card flex flex-col"
      style={{ padding: "var(--pad-card)" }}
    >
      <span className="eyebrow">Serve placement</span>
      <CardEmpty
        description="No report yet: this card shows where first serves land on each court, T, body and wide."
        className="mt-3.5"
        band={{
          title: subject.isSelf
            ? "Your serve map lands here"
            : `${subject.firstName}'s serve map lands here`,
          body: "Where first serves go on each court, once the first report lands.",
        }}
      >
        <ServeGhost />
      </CardEmpty>
    </section>
  );
}
