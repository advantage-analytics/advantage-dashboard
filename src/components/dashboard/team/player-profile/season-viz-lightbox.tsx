"use client";

import { useMemo } from "react";

import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";
import { VizLightboxShell } from "@/components/dashboard/matches/match-detail/shots/viz-lightbox-shell";
import {
  EMPTY_VIZ_FILTERS,
  type PlayerFilter,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { courtFor } from "@/components/dashboard/matches/match-detail/shots/viz-url";
import type { StatPick } from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import {
  optionCountKey,
  statPickKey,
  type SeasonLightboxData,
} from "@/lib/data/player-season-viz";
import { useMounted } from "@/lib/ui/use-mounted";

/**
 * The season's opened card: `VizLightboxShell` over data the page computed
 * on the server (`buildSeasonLightbox`, `lib/data/player-season-viz.ts`).
 *
 * This container owns nothing but the hand-off. It turns the server's two
 * lookups into the functions the shell wants — `statRowDots` from the
 * per-row mark ids, `countWith` from the per-option counts — and every
 * change the reader makes (a filter, "Clear filter", You | Opponent, close)
 * goes to the URL through the tab's one store (`useVizState`, `viz-url.ts`),
 * so the page's Server Component recomputes and hands new props back. It
 * never sees a point and never re-derives a figure.
 *
 * Read-only by decision (2026-11-08): no Points column, no footer (nothing
 * to watch or save), no band editor, no draft — the shell draws court,
 * legend filter, Filters and Statistics alone.
 *
 * `filters` is the store's optimistic value, so a ticked option reads as
 * ticked while the server answers; the court and the words follow a round
 * trip later. Closing drops the shell at once (`state.cut` goes null before
 * the server's answer removes `data`).
 */
export function SeasonVizLightbox({
  data,
  wallPlayer,
}: {
  data: SeasonLightboxData;
  /** The wall's own You | Opponent, which closing restores. */
  wallPlayer: PlayerFilter;
}) {
  const { state, setState } = useVizState();
  const mounted = useMounted();

  const statRowDots = useMemo(() => {
    const sets = new Map(
      Object.entries(data.statRowDotIds).map(([key, ids]) => [
        key,
        new Set(ids),
      ]),
    );
    return (pick: StatPick): Set<string> | null =>
      sets.get(statPickKey(pick)) ?? null;
  }, [data.statRowDotIds]);

  const countWith = (patch: Partial<VizFilters>): number =>
    data.optionCounts[optionCountKey(patch)] ?? 0;

  // A client-only portal, as the report's: never in the server HTML. Gone
  // the moment the reader closes, before the server's answer lands.
  if (!mounted || state.cut === null) return null;

  function close() {
    setState({
      cut: null,
      chart: "scatter",
      filters: { ...EMPTY_VIZ_FILTERS, player: wallPlayer },
      viewId: null,
    });
  }

  function clearFilters() {
    setState((prev) => ({ ...prev, filters: data.clearFilters, viewId: null }));
  }

  function setFilters(next: VizFilters) {
    setState((prev) => ({ ...prev, filters: next, viewId: null }));
  }

  function choosePlayer(player: PlayerFilter) {
    setState((prev) => ({
      ...prev,
      filters: courtFor(prev, player),
      viewId: null,
    }));
  }

  return (
    <VizLightboxShell
      cut={data.cut}
      chart={data.chart}
      filters={state.filters}
      result={data.result}
      stats={data.stats}
      subjectName={data.subjectName}
      unit={data.unit}
      bandZones={data.bandZones}
      hasFilters={data.hasFilters}
      statRowDots={statRowDots}
      title={data.title}
      subtitle={data.subtitle}
      filterPhrases={data.filterPhrases}
      panelActive={data.panelActive}
      onClose={close}
      onClearFilters={clearFilters}
      player={{ value: state.filters.player, onChange: choosePlayer }}
      filterPanel={{
        onChange: setFilters,
        sets: data.sets,
        errorSplitJudged: data.errorSplitJudged,
        countWith,
      }}
    />
  );
}
