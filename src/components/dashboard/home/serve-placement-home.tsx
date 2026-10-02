import type { HomeServeData } from "@/lib/data/home-serve-data";
import { computeZoneStats } from "@/lib/data/serve-zones";
import { ServePlacementQuietStrip } from "./serve-placement-quiet-strip";

export default function ServePlacementHome({
  initialData,
}: {
  initialData: HomeServeData;
}) {
  const zoneStats = computeZoneStats(initialData.dots);
  return (
    <div>
      <ServePlacementQuietStrip
        framed={false}
        zoneStats={zoneStats}
        matchCount={initialData.matchCount}
        awaitingReport={initialData.matchCount > 0}
      />
    </div>
  );
}
