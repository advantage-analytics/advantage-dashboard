import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { VizLightboxShell } from "@/components/dashboard/matches/match-detail/shots/viz-lightbox-shell";
import {
  EMPTY_VIZ_FILTERS,
  computeViz,
  computeVizStats,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { statPickDotIds } from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { ASYMMETRIC_SERVES } from "./viz-serve-points";

/**
 * `VizLightboxShell` alone, as a season page would mount it: plain props, no
 * MatchDataProvider, MatchReportProvider, MatchFiltersProvider,
 * VizStateProvider or VizBandsProvider anywhere above it. The data is
 * computed here from fixture serves; the shell never sees the points — no
 * Points column, no footer, no You | Opponent switch.
 */
function Season() {
  const [filters, setFilters] = useState<VizFilters>(EMPTY_VIZ_FILTERS);
  const [closed, setClosed] = useState(false);
  const result = useMemo(
    () => computeViz(ASYMMETRIC_SERVES, "serve", filters, true),
    [filters],
  );
  const stats = useMemo(
    () =>
      computeVizStats(
        ASYMMETRIC_SERVES,
        "serve",
        filters,
        true,
        result,
        DEFAULT_BANDS,
        "ft",
      ),
    [filters, result],
  );
  const statRowDots = useMemo(
    () => (pick: Parameters<typeof statPickDotIds>[6]) =>
      statPickDotIds(
        ASYMMETRIC_SERVES,
        "serve",
        filters,
        true,
        undefined,
        result.dots,
        pick,
        DEFAULT_BANDS,
      ),
    [filters, result],
  );
  if (closed) return <output data-testid="closed">closed</output>;
  const zoned = filters.zone.length > 0;
  return (
    <VizLightboxShell
      cut="serve"
      chart="scatter"
      filters={filters}
      result={result}
      stats={stats}
      subjectName="Avery Kim"
      unit="ft"
      bandZones={null}
      hasFilters={zoned}
      statRowDots={statRowDots}
      title="Serve placement"
      subtitle={`Serve placement · Season · ${result.count} serves`}
      filterPhrases={zoned ? ["Zone"] : []}
      panelActive={zoned}
      onClose={() => setClosed(true)}
      onClearFilters={() => setFilters(EMPTY_VIZ_FILTERS)}
      filterPanel={{
        onChange: setFilters,
        sets: [1, 2],
        errorSplitJudged: false,
        countWith: (patch) =>
          computeViz(ASYMMETRIC_SERVES, "serve", { ...filters, ...patch }, true)
            .count,
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Season />);
