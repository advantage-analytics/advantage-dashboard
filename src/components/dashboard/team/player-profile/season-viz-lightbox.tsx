"use client";

import { useMemo } from "react";

import { SeasonLightboxPending } from "@/components/dashboard/loading/season-lightbox-pending";
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
 * ── Two clocks ──────────────────────────────────────────────────────────────
 * `state` is the store's optimistic value and `data` is the server's last
 * answer, and between a click and the round trip they disagree. A filter
 * tick is left optimistic on purpose: the ticked option reads as ticked at
 * once and the court follows a moment later, the same court under the same
 * title. The cut (and the chart) is different — the shell draws `data`'s
 * court and words, and `state`'s cut is what the reader asked for, so while
 * they differ the shell would show the LAST card under the next card's
 * filters (close the serve card, click Errors: the serve court with error
 * filters), or nothing at all on the first open, when there is no `data`
 * yet. So whenever `data` is missing or names another cut or chart than
 * `state`, this draws `SeasonLightboxPending` — the shell's frame with a
 * loading status — until the server's answer matches the ask.
 *
 * Closing drops the dialog at once: `state.cut` goes null before the
 * server's answer removes `data`, and the wall gets back its own player
 * (`wallPlayer`), which a You | Opponent switch inside the card never
 * touched.
 */
export function SeasonVizLightbox({
  data,
  wallPlayer,
}: {
  /** The server's answer for the URL it last rendered; `null` on the wall
   *  and until the first answer for an opened card lands. */
  data: SeasonLightboxData | null;
  /** The wall's own You | Opponent, which closing restores — a player
   *  switched inside the lightbox does not leak onto the wall. */
  wallPlayer: PlayerFilter;
}) {
  const { state, setState } = useVizState();
  const mounted = useMounted();

  const statRowDotIds = data?.statRowDotIds ?? null;
  const statRowDots = useMemo(() => {
    const sets = new Map(
      Object.entries(statRowDotIds ?? {}).map(([key, ids]) => [
        key,
        new Set(ids),
      ]),
    );
    return (pick: StatPick): Set<string> | null =>
      sets.get(statPickKey(pick)) ?? null;
  }, [statRowDotIds]);

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

  // The server has not answered for THIS card yet (see "Two clocks").
  if (data === null || data.cut !== state.cut || data.chart !== state.chart) {
    return <SeasonLightboxPending cut={state.cut} onClose={close} />;
  }
  const court = data;

  const countWith = (patch: Partial<VizFilters>): number =>
    court.optionCounts[optionCountKey(patch)] ?? 0;

  function clearFilters() {
    setState((prev) => ({
      ...prev,
      filters: court.clearFilters,
      viewId: null,
    }));
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
      cut={court.cut}
      chart={court.chart}
      filters={state.filters}
      result={court.result}
      stats={court.stats}
      subjectName={court.subjectName}
      unit={court.unit}
      bandZones={court.bandZones}
      hasFilters={court.hasFilters}
      statRowDots={statRowDots}
      title={court.title}
      subtitle={court.subtitle}
      filterPhrases={court.filterPhrases}
      panelActive={court.panelActive}
      onClose={close}
      onClearFilters={clearFilters}
      player={{ value: state.filters.player, onChange: choosePlayer }}
      filterPanel={{
        onChange: setFilters,
        sets: court.sets,
        errorSplitJudged: court.errorSplitJudged,
        countWith,
      }}
    />
  );
}
