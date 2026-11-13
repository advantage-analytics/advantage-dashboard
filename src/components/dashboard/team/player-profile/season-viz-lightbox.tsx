"use client";

import type { PlayerChipLabels } from "@/components/dashboard/matches/match-detail/shots/player-chip-labels";
import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type LazyExoticComponent,
} from "react";
import { useRouter } from "next/navigation";

import { LightboxChunkPending } from "@/components/dashboard/loading/lightbox-pending";
import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";
import { CUT_LABEL } from "@/components/dashboard/matches/match-detail/shots/viz-labels";
import {
  EMPTY_VIZ_FILTERS,
  type Chart,
  type Cut,
  type PlayerFilter,
  type VizDot,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  courtFor,
  normalizeSeasonFilters,
  withoutSeasonFilters,
  type SeasonFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { ChartMenu } from "@/components/dashboard/matches/match-detail/shots/chart-menu";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import { canManageSavedView } from "@/lib/data/saved-views-logic";
import type { ProgramRole } from "@/lib/workspace/types";
import type { SeasonSavedViewActions } from "./use-season-saved-views";
import type { LightboxSeasonFilters } from "@/components/dashboard/matches/match-detail/shots/lightbox-filters";
import type { StatPick } from "@/components/dashboard/matches/match-detail/shots/stat-cut";
import {
  advancedAvailability,
  courtSignature,
  cutNoun,
  decodeStatRowDots,
  optionCountKey,
  seasonAdvancedOptions,
  statPickKey,
  type SeasonDotPoint,
  type SeasonLightboxData,
} from "@/lib/data/player-season-viz";
import { useMounted } from "@/lib/ui/use-mounted";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { formatMatchDayShort } from "@/lib/data/match-day";
import { pointSetQuery } from "@/lib/match-video/point-set";

/**
 * The season's opened card: `VizLightboxShell` over data the page computed
 * on the server (`buildSeasonLightbox`, `lib/data/player-season-viz.ts`).
 *
 * This container owns nothing but the hand-off. It turns the server's two
 * lookups into the functions the shell wants — `statRowDots` from the
 * per-row mark positions, `countWith` from the per-option counts — and every
 * change the reader makes (a filter, "Clear filter", You | Opponent, close)
 * goes to the URL through the tab's one store (`useVizState`, `viz-url.ts`),
 * so the page's Server Component recomputes and hands new props back. It
 * never sees a point and never re-derives a figure.
 *
 * Read-only by decision (2026-11-08): no Points column, no band editor, no
 * draft — the shell draws court, legend filter, Filters and Statistics. The
 * one write is the footer's "Save as view" (user ask, 2026-11-10, `saveView`):
 * a reader on a default card keeps its cut, chart and filters as a saved view
 * of the workspace, which then shows under Saved here and on every match
 * report. The season's own "Opponent plays" and "Matches" are not part of a
 * saved view (`saved_views.filters` holds the match report's filters only). The chart menu (Scatter ·
 * Heat · Zones, `ChartMenu` without its band rows) writes `?chart=`, and
 * the server folds the season under it; the Filters panel adds the
 * season's own "Opponent plays" and "Matches" (`VizState.season`,
 * `?vopp=` / `?vm=`), which the match report never draws.
 *
 * Each mark knows its match (`dotPoints`, `matches`): the readout names it
 * ("vs Lee · Nov 3") and says where in it the point was, and the second
 * click on a selected mark opens that match's Video tab on that one point
 * (`?tab=film&pn=…`, `point-set.ts`) with `router.push`, so Back comes back
 * to this card. A match with nothing to play offers the focus alone.
 *
 * ── Two clocks ──────────────────────────────────────────────────────────────
 * `state` is the store's optimistic value and `data` is the server's last
 * answer, and between a click and the round trip they disagree. The shell
 * draws `data`'s court and words, so `data` is shown only when it answers
 * something THIS opening asked for: every court the store has named since
 * the card opened — cut, chart and filters, serialised as the URL carries
 * them (`courtSignature`) — is remembered (`opening.asked`), and `data`
 * must echo one of them. A filter tick inside the card is therefore left
 * optimistic on purpose: the ticked option reads as ticked at once and the
 * court follows a moment later, the same court under the same title, since
 * the court before the tick was asked for too. What is never shown is an
 * answer from before this opening — the LAST card under the next card's
 * filters (close the serve card, click Errors: the serve court with error
 * filters), or the serve card closed with a filter on and reopened before
 * the close landed (the filtered court and title as the card's default) —
 * nor nothing at all on the first open, when there is no `data` yet. In
 * those the shell is rendered `pending` — its own frame with a loading
 * status in place of the words and the court — over an empty court, until
 * the server's answer is one that was asked for. The SAME shell: one
 * dialog per opening (`key` is the card), so the opener it recorded when
 * the card was clicked is the one focus returns to, and the scrim never
 * fades twice.
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
 * (`LightboxChunkPending`) holds focus for the moment and gives it back to
 * the card as it leaves, so the shell records the card as its opener; it
 * does not fade in, and neither does the shell that replaces it.
 *
 * A chunk that fails to load (a deploy between page and click, a dropped
 * connection) throws to the page's `WidgetBoundary`, whose Try again
 * refreshes the page and mounts this again. `React.lazy` remembers a
 * rejection for the life of its component, so the failure also drops the
 * cached import and makes a fresh lazy component (`loadShell`): the retry
 * asks for the chunk again instead of re-throwing until a full reload.
 */

/**
 * "Save as view" — the Save popover and the server action it calls — loads
 * with the opened card, not with the profile: the shell itself is
 * `React.lazy` for the same reason (below), and a profile load ships none
 * of either.
 */
const LazySaveAsViewButton = lazy(() =>
  import("@/components/dashboard/matches/match-detail/shots/save-as-view-button").then(
    (m) => ({ default: m.SaveAsViewButton }),
  ),
);

/** The footer's "Save as view" while its chunk loads: the same outline
 *  button, inert, so the footer does not shift when the real one lands. */
function SaveAsViewPending() {
  return (
    <span
      aria-hidden="true"
      className={cn(advButton("outline", "sm"), "opacity-60")}
    >
      Save as view
    </span>
  );
}

/** What the opened card's "Save as view" needs: the workspace's views (the
 *  name check) and its name (the "Share with team" row). */
export interface SeasonSaveView {
  savedViews: SavedViewRow[];
  workspaceName: string;
  /** The viewer's role in the program: who may rename or delete a view. */
  workspaceRole: ProgramRole;
}

/** The open saved view's ⋯ beside the close, in its own chunk like "Save as
 *  view": a card that is not a saved view never asks for it. */
const LazySavedViewTitleMenu = lazy(() =>
  import("@/components/dashboard/matches/match-detail/shots/saved-view-title-menu").then(
    (m) => ({ default: m.SavedViewTitleMenu }),
  ),
);

type ShellModule =
  typeof import("@/components/dashboard/matches/match-detail/shots/viz-lightbox-shell");

let shellLoaded = false;
let shellChunk: Promise<{ default: ShellModule["VizLightboxShell"] }> | null =
  null;
let LazyShell: LazyExoticComponent<ShellModule["VizLightboxShell"]> =
  lazy(loadShell);

function loadShell(): Promise<{ default: ShellModule["VizLightboxShell"] }> {
  shellChunk ??=
    import("@/components/dashboard/matches/match-detail/shots/viz-lightbox-shell").then(
      (m) => {
        shellLoaded = true;
        return { default: m.VizLightboxShell };
      },
      (error: unknown) => {
        // Forget the failed import and the lazy component that remembers it,
        // so the next render — the boundary's retry — asks again.
        shellChunk = null;
        LazyShell = lazy(loadShell);
        throw error;
      },
    );
  return shellChunk;
}

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
    statRowDots: {},
    optionCounts: {},
    advancedOptions: NO_ADVANCED_OPTIONS,
    names: last?.names ?? { you: "", opponent: "" },
    matches: [],
    dotPoints: [],
    season: null,
    seasonOptions: {
      matches: [],
    },
  };
}

/** A match's Video tab on one point, named by `label` in its strip. */
function seasonWatchHref(
  matchId: string,
  pointNumber: number,
  label: string,
): string {
  const query = pointSetQuery(
    new URLSearchParams({ tab: "film" }),
    [pointNumber],
    label,
  );
  return `/dashboard/matches/${encodeURIComponent(matchId)}?${query}`;
}

/** No advanced options, for the court drawn while the answer is on its way. */
const NO_ADVANCED_OPTIONS = seasonAdvancedOptions([]);

export function SeasonVizLightbox({
  data,
  playerLabels,
  wallPlayer,
  analyzed,
  errorSplitJudged,
  saveView,
  manage,
}: {
  /** The server's answer for the URL it last rendered; `null` on the wall
   *  and until the first answer for an opened card lands. */
  data: SeasonLightboxData | null;
  /** The player switch's two words (`player-chips.tsx`). */
  playerLabels: PlayerChipLabels;
  /** The wall's own You | Opponent, which closing restores — a player
   *  switched inside the lightbox does not leak onto the wall. */
  wallPlayer: PlayerFilter;
  /** Analyzed matches, the season's size. `0`: nothing can open, whatever
   *  the URL says. */
  analyzed: number;
  /** The season's Error-type rule, as the server parses the URL with it —
   *  the court signatures are canonicalised by it (`courtSignature`). */
  errorSplitJudged: boolean;
  /** The footer's "Save as view"; absent draws no footer. */
  saveView?: SeasonSaveView;
  /** Rename, duplicate, share and delete for the open saved view. */
  manage?: SeasonSavedViewActions;
}) {
  const { state, setState } = useVizState();
  const mounted = useMounted();
  const router = useRouter();

  // Each mark's match and point, by mark id and by point id (a point id is
  // unique across matches, as a mark id is).
  const dotPoints = data?.dotPoints ?? null;
  const resultDots = data?.result.dots ?? null;
  const refs = useMemo(() => {
    const byDot = new Map<string, SeasonDotPoint>();
    const byPoint = new Map<string, SeasonDotPoint>();
    if (dotPoints !== null && resultDots !== null)
      resultDots.forEach((dot, i) => {
        const ref = dotPoints[i];
        if (!ref) return;
        byDot.set(dot.id, ref);
        if (dot.meta?.pointId) byPoint.set(dot.meta.pointId, ref);
      });
    return { byDot, byPoint };
  }, [dotPoints, resultDots]);
  const seasonMatches = data?.matches ?? null;
  // The readout's "Set 1 · Game 4 · Maya Chen serving", as the report's.
  const whereFor = useCallback(
    (pointId: string): string | null => {
      const ref = refs.byPoint.get(pointId);
      if (!ref) return null;
      const [m, , setNumber, gameNumber, server] = ref;
      const parts: string[] = [];
      if (setNumber > 0) parts.push(`Set ${setNumber}`);
      if (gameNumber > 0) parts.push(`Game ${gameNumber}`);
      if (server !== -1)
        parts.push(
          `${server === 1 ? playerLabels.you : (seasonMatches?.[m]?.opponentName ?? "Opponent")} serving`,
        );
      return parts.length > 0 ? parts.join(" · ") : null;
    },
    [refs, playerLabels.you, seasonMatches],
  );
  // "vs Lee · Nov 3" — the calendar day, read as one (`match-day.ts`).
  const matchFor = useCallback(
    (dot: VizDot): string | null => {
      const ref = refs.byDot.get(dot.id);
      const match = ref ? seasonMatches?.[ref[0]] : undefined;
      if (!match) return null;
      return [
        `vs ${match.opponentName}`,
        ...(match.date ? [formatMatchDayShort(match.date)] : []),
      ].join(" · ");
    },
    [refs, seasonMatches],
  );
  const canWatch = useCallback(
    (dot: VizDot): boolean => {
      const ref = refs.byDot.get(dot.id);
      if (!ref || ref[1] <= 0) return false;
      return seasonMatches?.[ref[0]]?.hasPlayableVideo === true;
    },
    [refs, seasonMatches],
  );
  const seasonTitle = data?.title ?? "";

  // Each row's positions in the court's marks, back into the id sets the
  // shell asks (`decodeStatRowDots`), once per server answer.
  const rowDots = data?.statRowDots ?? null;
  const courtDots = data?.result.dots ?? null;
  // "Advanced filters": the season's options, with no count (nothing to
  // count with here); a Show writes `filters.match` to the URL, and the
  // server applies it to each match.
  const advancedOptions = data?.advancedOptions ?? null;
  const names = data?.names ?? null;
  const advanced = useMemo(
    () =>
      advancedOptions === null || names === null
        ? undefined
        : {
            availability: advancedAvailability(advancedOptions),
            youName: names.you,
            oppName: names.opponent,
          },
    [advancedOptions, names],
  );
  const statRowDots = useMemo(() => {
    const sets = new Map(
      courtDots === null
        ? []
        : Object.entries(rowDots ?? {}).map(([key, indices]) => [
            key,
            decodeStatRowDots(courtDots, indices),
          ]),
    );
    return (pick: StatPick): Set<string> | null =>
      sets.get(statPickKey(pick)) ?? null;
  }, [rowDots, courtDots]);

  // This opening: whether the shell's chunk was already here when it began
  // (it was not on the first open of a session: the chunk frame showed
  // first, and the shell replacing it must not fade in again), and every
  // court the store has named since (see "Two clocks"). Reset on the
  // closed → open edge, grown as the store moves; render-phase updates as
  // `shots-tab.tsx` keeps its own opening, no effect.
  const isOpen = state.cut !== null;
  const asked =
    state.cut === null
      ? null
      : courtSignature(
          state.cut,
          state.chart,
          state.filters,
          errorSplitJudged,
          state.season,
        );
  const [opening, setOpening] = useState(() => ({
    // Which opening this is — the shell's `key`, so a chart or return-half
    // switch inside the card keeps the one dialog.
    id: 0,
    open: isOpen,
    asked: new Set(asked === null ? [] : [asked]),
  }));
  if (opening.open !== isOpen) {
    setOpening({
      id: opening.id + 1,
      open: isOpen,
      asked: new Set(asked === null ? [] : [asked]),
    });
  } else if (asked !== null && !opening.asked.has(asked)) {
    setOpening({ ...opening, asked: new Set([...opening.asked, asked]) });
  }
  const Shell = LazyShell;

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

  // The server's answer for a court THIS opening asked for, or the empty
  // court while it is on its way (see "Two clocks").
  const court: SeasonLightboxData =
    data !== null &&
    opening.asked.has(
      courtSignature(
        data.cut,
        data.chart,
        data.filters,
        errorSplitJudged,
        data.season,
      ),
    )
      ? data
      : emptyCourt(cut, state.chart, state.filters, data);
  const pending = court !== data;

  // The saved view the court IS (not one it was edited from), when the
  // viewer may manage it: it gets the ⋯ beside its name.
  const openView =
    state.viewId !== null && saveView && manage
      ? (saveView.savedViews.find(
          (v) =>
            v.id === state.viewId &&
            canManageSavedView(v, saveView.workspaceRole),
        ) ?? null)
      : null;

  const countWith = (patch: Partial<VizFilters>): number =>
    court.optionCounts[optionCountKey(patch)] ?? 0;

  function clearFilters() {
    setState((prev) => ({
      ...withoutSeasonFilters(prev),
      filters: court.clearFilters,
      viewId: null,
    }));
  }

  function setSeasonFilters(next: SeasonFilters | undefined) {
    setState((prev) => ({
      ...withoutSeasonFilters(prev),
      ...(next ? { season: next } : {}),
      viewId: null,
    }));
  }

  const seasonFilters: LightboxSeasonFilters = {
    value: state.season,
    onChange: setSeasonFilters,
    // The sheet's rows as the server computed them (`SeasonMatchOption`).
    matches: court.seasonOptions.matches,
  };

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
      <Shell
        // One dialog per opening: the same mount from pending to landed and
        // across a chart switch, a new one for another card.
        key={opening.id}
        pending={pending}
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
        whereFor={pending ? undefined : whereFor}
        matchFor={pending ? undefined : matchFor}
        watch={
          pending
            ? undefined
            : {
                canWatch,
                onWatch: (dot, phrases) => {
                  const ref = refs.byDot.get(dot.id);
                  const match = ref ? seasonMatches?.[ref[0]] : undefined;
                  if (!ref || !match || !canWatch(dot)) return;
                  router.push(
                    seasonWatchHref(
                      match.id,
                      ref[1],
                      [seasonTitle, ...phrases]
                        .filter((p) => p !== "")
                        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                        .join(" · "),
                    ),
                  );
                },
              }
        }
        title={
          openView !== null && manage?.names[openView.id] !== undefined
            ? manage.names[openView.id]
            : court.title
        }
        headerAction={
          openView !== null && manage && saveView
            ? ({ onTooltipEscape }) => (
                <Suspense fallback={null}>
                  <LazySavedViewTitleMenu
                    onTooltipEscape={onTooltipEscape}
                    view={openView}
                    name={manage.names[openView.id] ?? openView.name}
                    savedViews={saveView.savedViews}
                    workspaceKind="team"
                    workspaceRole={saveView.workspaceRole}
                    onAction={(action) => {
                      // The view is gone: back to the wall, where its Undo is.
                      if (action.kind === "delete") close();
                      manage.run(action, openView);
                    }}
                  />
                </Suspense>
              )
            : undefined
        }
        // A change to the open view the server refused: the wall's own line
        // is behind the scrim, so it is said here.
        notice={
          openView !== null && manage?.status?.failed
            ? manage.status.text
            : undefined
        }
        subtitle={court.subtitle}
        filterPhrases={court.filterPhrases}
        panelActive={court.panelActive}
        onClose={close}
        onClearFilters={clearFilters}
        player={{
          value: state.filters.player,
          onChange: choosePlayer,
          labels: playerLabels,
        }}
        filterPanel={{
          onChange: setFilters,
          sets: court.sets,
          errorSplitJudged: court.errorSplitJudged,
          countWith,
          advanced,
          season: seasonFilters,
        }}
        controls={() => <ChartMenu />}
        footer={
          saveView
            ? () => ({
                end: (
                  <Suspense fallback={<SaveAsViewPending />}>
                    <LazySaveAsViewButton
                      cut={court.cut}
                      chart={court.chart}
                      filters={state.filters}
                      savedViews={saveView.savedViews}
                      workspaceKind="team"
                      workspaceName={saveView.workspaceName}
                      onSaved={(view) =>
                        setState((prev) => ({ ...prev, viewId: view.id }))
                      }
                      // A view keeps the court's own filters; the season's
                      // match filters (Result, Opponent, Surface, ticked
                      // matches) are not part of one, so say so.
                      note={
                        normalizeSeasonFilters(state.season)
                          ? "The Matches filters are not part of a view."
                          : undefined
                      }
                    />
                  </Suspense>
                ),
              })
            : undefined
        }
      />
    </Suspense>
  );
}
