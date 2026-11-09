"use client";

import { lazy, Suspense, useMemo, useState } from "react";

import { LightboxChunkPending } from "@/components/dashboard/loading/lightbox-pending";
import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";
import { CUT_LABEL } from "@/components/dashboard/matches/match-detail/shots/viz-labels";
import {
  EMPTY_VIZ_FILTERS,
  type Chart,
  type Cut,
  type PlayerFilter,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { courtFor } from "@/components/dashboard/matches/match-detail/shots/viz-url";
import type { StatPick } from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import {
  cutNoun,
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
 * `state`, the shell is rendered `pending` — its own frame with a loading
 * status in place of the words and the court — over an empty court, until
 * the server's answer matches the ask. The SAME shell: one dialog per
 * opening (`key` is the card), so the opener it recorded when the card was
 * clicked is the one focus returns to, and the scrim never fades twice.
 *
 * A season with nothing analyzed has nothing to open: the server answers
 * `null` for any `?cut=` there, for good, so a stale link draws no frame.
 *
 * Closing drops the dialog at once: `state.cut` goes null before the
 * server's answer removes `data`, and the wall gets back its own player
 * (`wallPlayer`), which a You | Opponent switch inside the card never
 * touched.
 *
 * ── The shell's chunk ───────────────────────────────────────────────────────
 * The shell — Radix Dialog, the pan/zoom court, the filters, the Statistics
 * column — is loaded on the first open, as `shots-tab.tsx` loads the
 * report's, so a profile load ships none of it. `React.lazy` rather than
 * `next/dynamic`: the frame drawn while the chunk loads needs the cut and
 * close, which `dynamic`'s `loading` slot is handed neither of; the
 * `mounted` gate below is its `ssr: false`. That frame
 * (`LightboxChunkPending`) takes no focus and does not fade in, and the
 * shell that replaces it skips its own fade (`appear`), so the one time per
 * session this happens is still.
 */

let shellLoaded = false;
const VizLightboxShell = lazy(() =>
  import("@/components/dashboard/matches/match-detail/shots/viz-lightbox-shell").then(
    (m) => {
      shellLoaded = true;
      return { default: m.VizLightboxShell };
    },
  ),
);

const noDots = (): Set<string> | null => null;

/**
 * What the shell is handed while the server's answer is on its way: the
 * cut and chart asked for, the store's filters, the cut's name, and nothing
 * drawn — the shell is `pending` and reads none of it.
 */
function emptyCourt(
  cut: Cut,
  chart: Chart,
  filters: VizFilters,
  last: SeasonLightboxData | null,
): SeasonLightboxData {
  const label = CUT_LABEL[cut];
  return {
    cut,
    chart,
    filters,
    result: {
      dots: [],
      count: 0,
      total: 0,
      noun: cutNoun(cut),
      zoneStats: null,
    },
    stats: { title: label, subtitle: "", groups: [], sentence: null, total: 0 },
    bandZones: null,
    subjectName: "",
    unit: last?.unit ?? "ft",
    hasFilters: false,
    title: label,
    subtitle: "",
    filterPhrases: [],
    panelActive: false,
    clearFilters: { ...EMPTY_VIZ_FILTERS, player: filters.player },
    sets: [],
    errorSplitJudged: last?.errorSplitJudged ?? true,
    statRowDotIds: {},
    optionCounts: {},
  };
}

export function SeasonVizLightbox({
  data,
  wallPlayer,
  analyzed,
}: {
  /** The server's answer for the URL it last rendered; `null` on the wall
   *  and until the first answer for an opened card lands. */
  data: SeasonLightboxData | null;
  /** The wall's own You | Opponent, which closing restores — a player
   *  switched inside the lightbox does not leak onto the wall. */
  wallPlayer: PlayerFilter;
  /** Analyzed matches, the season's size. `0`: nothing can open, whatever
   *  the URL says. */
  analyzed: number;
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

  // Whether the shell's chunk was already here when this opening began. It
  // was not on the first open of a session: the chunk frame showed first,
  // and the shell replacing it must not fade in again. Fixed on the
  // closed → open edge, a render-phase update as `shots-tab.tsx` keeps its
  // own opening; no effect.
  const isOpen = state.cut !== null;
  const [opening, setOpening] = useState(() => ({
    open: isOpen,
    shellReady: shellLoaded,
  }));
  if (opening.open !== isOpen) {
    setOpening({ open: isOpen, shellReady: shellLoaded });
  }

  // A client-only portal, as the report's: never in the server HTML. Gone
  // the moment the reader closes, before the server's answer lands. Never
  // there on a season with nothing to open.
  if (!mounted || state.cut === null || analyzed === 0) return null;
  const cut = state.cut;

  function close() {
    setState({
      cut: null,
      chart: "scatter",
      filters: { ...EMPTY_VIZ_FILTERS, player: wallPlayer },
      viewId: null,
    });
  }

  // The server's answer for THIS card, or the empty court while it is on
  // its way (see "Two clocks").
  const court: SeasonLightboxData =
    data !== null && data.cut === cut && data.chart === state.chart
      ? data
      : emptyCourt(cut, state.chart, state.filters, data);
  const pending = court !== data;

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
    <Suspense
      fallback={<LightboxChunkPending label={CUT_LABEL[cut]} onClose={close} />}
    >
      <VizLightboxShell
        // One dialog per card: the same mount from pending to landed, a new
        // one for another card.
        key={`${cut}:${state.chart}`}
        pending={pending}
        appear={opening.shellReady}
        cut={court.cut}
        chart={court.chart}
        filters={state.filters}
        result={court.result}
        stats={court.stats}
        subjectName={court.subjectName}
        unit={court.unit}
        bandZones={court.bandZones}
        hasFilters={court.hasFilters}
        statRowDots={pending ? noDots : statRowDots}
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
    </Suspense>
  );
}
