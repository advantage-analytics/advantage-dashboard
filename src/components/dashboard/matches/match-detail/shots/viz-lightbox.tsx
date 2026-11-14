"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { advButton } from "@/lib/ui/adv-button";
import { MAX_POINT_SET } from "@/lib/match-video/point-set";
import { depthBandRows } from "@/lib/data/viz-bands";
import { canManageSavedView } from "@/lib/data/saved-views-logic";

import { ChartMenu } from "./chart-menu";
import { CutMenu } from "./cut-menu";
import { defaultCutsFor } from "./default-cuts";
import { isPlayable, pointsBehind } from "./lightbox-points";
import { LightboxPointList } from "./lightbox-point-list";
import { SaveAsViewButton } from "./save-as-view-button";
import {
  SavedViewTitleMenu,
  type SavedViewAction,
} from "./saved-view-title-menu";
import { shotsWriteAccess } from "./shots-write-access";
import { serveRowDotIds, statPickDotIds, type StatPick } from "./stat-cut";
import { useVizState } from "./use-viz-state";
import { useVizView } from "./use-viz-view";
import { useVizBands } from "./viz-bands-context";
import { CUT_LABEL } from "./viz-labels";
import { useMatchPlayerChipLabels } from "./use-match-player-chip-labels";
import { VizLightboxShell } from "./viz-lightbox-shell";
import {
  EMPTY_VIZ_FILTERS,
  collapseErrorFilter,
  computeViz,
  errorsJudgedIn,
  filterKeysFor,
  type PlayerFilter,
  type VizDot,
  type VizFilters,
} from "./viz-model";
import { activeFilterEntries, courtFor, sameFilterValue } from "./viz-url";
import {
  useErrorSplitJudged,
  useFiltersPanelData,
  useMatchFilters,
} from "../match-filters/provider";
import { lightboxCountLine } from "./wall-summary";

/** A saved view's filter group, named when the reader loosens it to "any". */
const LOOSENED_LABEL: Partial<Record<keyof VizFilters, string>> = {
  ball: "Serve",
  court: "Court",
  set: "Set",
  zone: "Zone",
  result: "Result",
  pressure: "Score",
  rally: "Rally",
  game: "Game",
  error: "Error type",
  match: "Advanced filters",
};

/** Opens the Video tab on the points the lightbox shows, by point number,
 *  named by `label` in its strip. */
export type WatchPoints = (pointNumbers: number[], label: string) => void;

/**
 * The match report's lightbox (canvas "Final flow" / "Flow states"
 * S03–S17): the opened card over the wall. `shots-tab.tsx` mounts it
 * whenever `state.cut` is set, so `?cut=…` opens it over the wall and
 * dropping `cut` closes it.
 *
 * This is the container: it reads the match (`useVizView` — one
 * `computeViz`, one `computeVizStats`, one resolved subject, guardrails §4),
 * the URL store, the report and the bands, works out the title, the strip's
 * sentence and "Clear filter"'s target against the card's or saved view's
 * baseline, and hands all of it to `VizLightboxShell`, which draws it and
 * keeps the reading state (zoom, selection, picks, pane, Esc). The footer's
 * N is `pointsBehind()` over the same marks the court draws.
 */
export function VizLightbox({
  wallPlayer,
  onWatchPoints,
  allowSaveView = true,
  onViewAction,
  viewActionFailure = null,
}: {
  /** The wall's own You | Opponent, which closing restores — a player
   *  switched inside the lightbox does not leak onto the wall. */
  wallPlayer: PlayerFilter;
  /** "Watch these N points". Omitted, there is no Watch button. */
  onWatchPoints?: WatchPoints;
  /** "Save as view". `false` leaves it out whatever the viewer may write;
   *  `true` (default) still needs `shotsWriteAccess(meta).canSaveViews`. */
  allowSaveView?: boolean;
  /** The open saved view's ⋯ (rename, duplicate, share, delete), run by the
   *  Saved wall's band. Omitted, there is no ⋯ beside the name. */
  onViewAction?: (action: SavedViewAction) => void;
  /** The last `onViewAction` the server refused (numbered per ask). */
  viewActionFailure?: { n: number; message: string } | null;
}) {
  const { state, setState } = useVizState();
  const { meta } = useMatchReport();
  const { context: matchCtx } = useMatchFilters();
  const {
    cut,
    result,
    stats,
    subjectName,
    subjectIsPlayer1,
    you,
    opp,
    points,
    hasFilters,
    isDraft,
    bands,
    bandZones,
    unit,
  } = useVizView();
  const { receipt, canEdit, applyBands } = useVizBands();
  // The player switch's two words, and the same two wherever this card
  // names a side (the subtitle, a mark's "… serving" line).
  const chipLabels = useMatchPlayerChipLabels();
  const canSaveViews = allowSaveView && shotsWriteAccess(meta).canSaveViews;
  const cutMenuTriggerRef = useRef<HTMLButtonElement>(null);
  // A rename from the title's ⋯: the Saved wall's band saves it, and the
  // name shows here at once, until the refreshed view carries it.
  const [renamed, setRenamed] = useState<{ id: string; name: string } | null>(
    null,
  );
  // A refusal that arrived since this lightbox last asked for something:
  // said under the title (the wall's own line is behind the scrim), and a
  // rename it refused is taken back. Render-phase, as the wall's player is.
  const [failureSeen, setFailureSeen] = useState(viewActionFailure?.n ?? 0);
  const [failureShown, setFailureShown] = useState<string | null>(null);
  if (viewActionFailure && viewActionFailure.n !== failureSeen) {
    setFailureSeen(viewActionFailure.n);
    setFailureShown(viewActionFailure.message);
    setRenamed(null);
  }

  const errorSplitJudged = useErrorSplitJudged();
  // The court's filters as the URL would read them: a store pick (a saved
  // view from the menu or the band) keeps a view's raw Error type, while a
  // parse collapses it on a match whose errors are not judged. Every
  // comparison against the baseline reads this, so the same view never
  // reads as an edit of itself by the path it came in on.
  const liveFilters: VizFilters = {
    ...state.filters,
    error: collapseErrorFilter(state.filters.error, errorSplitJudged),
  };

  // A Statistics row's marks, by the stats' own rules (`stat-cut.ts`). The
  // serve rows' marks are read all six at once, the first time a serve row
  // is asked for, so hovering across them reads a set rather than running a
  // zone's `computeViz` per hover. Rebuilt when the filters change.
  const statRowDots = useMemo(() => {
    let serveRows: Map<string, Set<string>> | null = null;
    return (pick: StatPick): Set<string> | null => {
      if (result === null || cut === null) return null;
      if (cut === "serve") {
        serveRows ??= serveRowDotIds(
          points,
          state.filters,
          subjectIsPlayer1,
          matchCtx,
          bands,
        );
        const cached = serveRows.get(pick.row);
        if (cached) return cached;
      }
      return statPickDotIds(
        points,
        cut,
        state.filters,
        subjectIsPlayer1,
        matchCtx,
        result.dots,
        pick,
        bands,
      );
    };
  }, [points, cut, state.filters, subjectIsPlayer1, matchCtx, result, bands]);

  // The readout's last line, read off the point the way the Video tab's
  // point list prints its game headers: set, game, and who served.
  const pointById = useMemo(
    () => new Map(points.map((p) => [p.id, p])),
    [points],
  );
  const youIsPlayer1 = you.isPlayer1;
  const whereFor = useCallback(
    (pointId: string): string | null => {
      const point = pointById.get(pointId);
      if (!point) return null;
      const parts: string[] = [];
      if (point.setNumber > 0) parts.push(`Set ${point.setNumber}`);
      if (point.gameNumber > 0) parts.push(`Game ${point.gameNumber}`);
      if (typeof point.serverIsPlayer1 === "boolean")
        parts.push(
          `${point.serverIsPlayer1 === youIsPlayer1 ? chipLabels.you : chipLabels.opponent} serving`,
        );
      return parts.length > 0 ? parts.join(" · ") : null;
    },
    [pointById, youIsPlayer1, chipLabels.you, chipLabels.opponent],
  );

  // The second click on a mark or its row: that one point in the Video tab,
  // by the same hand-off as "Watch these N points" (`watchPointSet`), when
  // the match has a video to play and the point a clip in it.
  const canWatchFilm = meta.hasPlayableVideo && onWatchPoints !== undefined;
  const canWatchDot = useCallback(
    (dot: VizDot) => {
      if (!canWatchFilm || !dot.meta?.pointId) return false;
      const point = pointById.get(dot.meta.pointId);
      return point !== undefined && isPlayable(point);
    },
    [canWatchFilm, pointById],
  );

  const savedView =
    state.viewId !== null
      ? (meta.savedViews.find((v) => v.id === state.viewId) ?? null)
      : null;
  // The saved view the court is, or was edited from (`?vfrom=`, which the
  // store moves on every save, pick and new cut — `applyVizUpdate`). In the
  // URL, so a remount (Watch → Video → Back) or a reload keeps it.
  const baseViewId = state.viewId ?? state.editedFrom ?? null;
  const baseView =
    baseViewId !== null
      ? (meta.savedViews.find((v) => v.id === baseViewId) ?? null)
      : null;
  const defaultCut = defaultCutsFor(errorsJudgedIn(matchCtx)).find(
    (c) => c.cut === state.cut,
  );
  // The court's baseline: a saved view's own filters, else the wall card's
  // ("First serves" is first serves), always for the player on court. While
  // the court still holds them the view's or card's name is the title and
  // they are not repeated in the strip or counted as applied; loosen one
  // (Serve: Any) and the title falls back to the cut's own name, so title,
  // strip and Watch label always describe the live filters.
  const baseline: {
    name: string;
    filters: VizFilters;
    keys: (keyof VizFilters)[];
    view: { id: string; player: VizFilters["player"] } | null;
  } | null =
    baseView !== null && baseView.cut === state.cut
      ? (() => {
          // Read as the URL reads it: on a match whose errors are not
          // judged, a stored Unforced (or Forced) is every error
          // (`parseVizState`'s `collapseErrorFilter`), so a hard-loaded
          // view is not mistaken for an edit of itself.
          const filters: VizFilters = {
            ...EMPTY_VIZ_FILTERS,
            ...baseView.filters,
            error: collapseErrorFilter(
              baseView.filters.error ?? EMPTY_VIZ_FILTERS.error,
              errorSplitJudged,
            ),
            player: state.filters.player,
          };
          return {
            name: baseView.name,
            filters,
            keys: (
              Object.keys(EMPTY_VIZ_FILTERS) as (keyof VizFilters)[]
            ).filter(
              (key) =>
                key !== "player" &&
                !sameFilterValue(key, filters, EMPTY_VIZ_FILTERS),
            ),
            view: {
              id: baseView.id,
              player: baseView.filters.player ?? EMPTY_VIZ_FILTERS.player,
            },
          };
        })()
      : defaultCut && baseView === null
        ? {
            name: defaultCut.name,
            filters: {
              ...EMPTY_VIZ_FILTERS,
              ...defaultCut.filters,
              player: state.filters.player,
            },
            keys: Object.keys(defaultCut.filters) as (keyof VizFilters)[],
            view: null,
          }
        : null;
  const cardFilters: VizFilters | null = baseline?.filters ?? null;
  const cardKeys = baseline?.keys ?? [];
  const onCard =
    cardFilters !== null &&
    cardKeys.every((key) => sameFilterValue(key, liveFilters, cardFilters));
  // The list's denominator. On the baseline it is the view's or card's own
  // points (an unfiltered "First serves" reads 40 / 40, the strip naming
  // anything narrower); off it — a loosened card, a link — it is the widest
  // set, the cut for this player with no filters, and the strip names every
  // filter in force. Either way N never passes M.
  const denominatorFilters: VizFilters =
    onCard && cardFilters !== null
      ? cardFilters
      : { ...EMPTY_VIZ_FILTERS, player: state.filters.player };
  const allPointsBehind = useMemo(() => {
    if (cut === null) return [];
    const all = computeViz(
      points,
      cut,
      denominatorFilters,
      subjectIsPlayer1,
      "scatter",
      matchCtx,
    );
    return pointsBehind(cut, all.dots, points);
    // `denominatorFilters` is rebuilt every render; its content is keyed by
    // these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    points,
    cut,
    onCard,
    baseView,
    state.filters.player,
    subjectIsPlayer1,
    matchCtx,
  ]);

  // The Filters panel's "Advanced filters": the Video tab's options over
  // this match (short names, as its strip words them), counted on this court.
  const panelData = useFiltersPanelData();
  const countAdvanced = useCallback(
    (filters: VizFilters) =>
      cut === null
        ? 0
        : computeViz(
            points,
            cut,
            filters,
            subjectIsPlayer1,
            "scatter",
            matchCtx,
          ).count,
    [points, cut, subjectIsPlayer1, matchCtx],
  );
  const advanced = useMemo(
    () => ({
      availability: panelData.availability,
      youName: panelData.youName,
      oppName: panelData.oppName,
      count: countAdvanced,
    }),
    [
      panelData.availability,
      panelData.youName,
      panelData.oppName,
      countAdvanced,
    ],
  );

  const sets = useMemo(
    () =>
      [...new Set(points.map((p) => p.setNumber))]
        .filter((n) => n > 0)
        .sort((a, b) => a - b),
    [points],
  );

  if (cut === null || result === null || stats === null) return null;

  /** The Video tab strip's words for a hand-off: the card, whose points
   *  they are when not the viewer's own, then the strip's sentence. */
  function watchLabel(sentence: string[]): string {
    return [
      title,
      ...(state.filters.player === "you" ? [] : [opp.shortName]),
      ...sentence,
    ]
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" · ");
  }

  // Back to the wall: no cut, no filters, the wall's own player. The wall
  // never unmounted, so its scroll is where it was.
  function close() {
    setState({
      cut: null,
      chart: "scatter",
      filters: { ...EMPTY_VIZ_FILTERS, player: wallPlayer },
      viewId: null,
    });
  }

  const nameOf = (view: { id: string; name: string }) =>
    renamed !== null && renamed.id === view.id ? renamed.name : view.name;
  const canManageOpenView =
    savedView !== null &&
    onViewAction !== undefined &&
    canSaveViews &&
    canManageSavedView(savedView, meta.workspaceRole);

  function handleViewAction(action: SavedViewAction) {
    setFailureShown(null);
    if (action.kind === "rename")
      setRenamed({ id: action.id, name: action.name });
    // The view is gone: back to the wall, where its Undo line shows.
    if (action.kind === "delete") close();
    onViewAction?.(action);
  }

  const title = isDraft
    ? "New view"
    : baseline !== null && (onCard || baseline.view !== null)
      ? // A saved view keeps its name while edited: the strip names every
        // change from it, and Clear goes back to it.
        baseline.view !== null
        ? nameOf({ id: baseline.view.id, name: baseline.name })
        : baseline.name
      : savedView !== null
        ? nameOf(savedView)
        : CUT_LABEL[cut];
  const subjectWord =
    state.filters.player === "you" ? chipLabels.you : chipLabels.opponent;
  const subtitle = isDraft
    ? "Pick a chart and filters, then save it to reuse on any match."
    : `${CUT_LABEL[cut]} · ${subjectWord} · ${lightboxCountLine(
        cut,
        result,
        stats,
        depthBandRows(bands, unit),
      )}`;

  function choosePlayer(player: PlayerFilter) {
    setState((prev) => ({
      ...prev,
      filters: courtFor(prev, player),
      viewId: null,
    }));
  }

  // What "Clear filter" leaves: a saved view's own filters, always — Clear
  // goes back to the view; the card's while the title still names the card;
  // otherwise nothing but the player. Exactly the filters the strip names
  // are removed.
  const clearTarget: VizFilters =
    baseline !== null && (onCard || baseline.view !== null)
      ? baseline.filters
      : { ...EMPTY_VIZ_FILTERS, player: state.filters.player };
  // Back on the view's filters for the view's own player, the court IS the
  // view again: keep its id, so its title, Saved highlight and link return.
  const clearViewId =
    baseline?.view != null && baseline.view.player === state.filters.player
      ? baseline.view.id
      : null;

  // The shell lets go of the legend's and a Statistics row's picks first.
  function clearFilters() {
    setState((prev) => ({
      ...prev,
      // Back to a saved view is back to its chart too, but only when the
      // court IS the view again (its id comes back, so the title, Saved
      // highlight and menu name it). For the other player it is not, and
      // the chart the reader chose stays.
      ...(clearViewId !== null && baseView !== null
        ? { chart: baseView.chart }
        : {}),
      filters: clearTarget,
      viewId: clearViewId,
    }));
  }

  function setFilters(next: VizFilters) {
    setState((prev) => ({ ...prev, filters: next, viewId: null }));
  }

  // Any filter the court is under beyond what "Clear filter" leaves —
  // including the advanced (`match`), Result, Rally and Game groups a saved
  // view or a `?f=` link can carry, which the panel does not edit.
  const panelActive = filterKeysFor(cut).some(
    (key) =>
      key !== "player" && !sameFilterValue(key, liveFilters, clearTarget),
  );
  // The strip's sentence: exactly what "Clear filter" removes. On a card
  // the card's own filters are left out while it holds them, and every
  // filter is named once it is loosened. On a saved view, every change from
  // the view: a filter added, a view filter changed (its new value), or a
  // view filter loosened to nothing ("Serve: any"). Then the legend's pick
  // and a Statistics row — so nothing narrows or widens the court unseen.
  const names = { you: you.shortName, opponent: opp.shortName };
  const onView = baseline !== null && baseline.view !== null;
  const unchangedBaseKey = (key: keyof VizFilters) =>
    cardFilters !== null &&
    cardKeys.includes(key) &&
    (onView ? sameFilterValue(key, liveFilters, cardFilters) : onCard);
  const phrases = activeFilterEntries(state, names, { errorSplitJudged })
    .filter((e) => e.key !== "player" && !unchangedBaseKey(e.key))
    .map((e) => e.label);
  if (onView)
    for (const key of cardKeys)
      if (
        !unchangedBaseKey(key) &&
        sameFilterValue(key, liveFilters, EMPTY_VIZ_FILTERS)
      )
        phrases.push(`${LOOSENED_LABEL[key] ?? "Filter"}: any`);

  return (
    <VizLightboxShell
      cut={cut}
      chart={state.chart}
      filters={state.filters}
      result={result}
      stats={stats}
      subjectName={subjectName}
      unit={unit}
      bandZones={bandZones}
      hasFilters={hasFilters}
      statRowDots={statRowDots}
      whereFor={whereFor}
      watch={{
        canWatch: canWatchDot,
        onWatch: (dot, sentence) => {
          const point = dot.meta?.pointId
            ? pointById.get(dot.meta.pointId)
            : undefined;
          if (point && onWatchPoints)
            onWatchPoints([point.pointNumber], watchLabel(sentence));
        },
      }}
      title={title}
      notice={failureShown ?? undefined}
      headerAction={
        canManageOpenView && savedView !== null
          ? ({ onTooltipEscape }) => (
              <SavedViewTitleMenu
                onTooltipEscape={onTooltipEscape}
                view={savedView}
                name={nameOf(savedView)}
                savedViews={meta.savedViews}
                workspaceKind={meta.workspaceKind}
                workspaceRole={meta.workspaceRole}
                onAction={handleViewAction}
              />
            )
          : undefined
      }
      subtitle={subtitle}
      filterPhrases={phrases}
      panelActive={panelActive}
      onClose={close}
      onClearFilters={clearFilters}
      player={{
        value: state.filters.player,
        onChange: choosePlayer,
        labels: chipLabels,
      }}
      filterPanel={{
        onChange: setFilters,
        sets,
        errorSplitJudged: matchCtx.errorSplitJudged === true,
        countWith: (patch) =>
          computeViz(
            points,
            cut,
            { ...state.filters, ...patch },
            subjectIsPlayer1,
            "scatter",
            matchCtx,
          ).count,
        advanced,
      }}
      controls={({ enterBandEdit }) => (
        <>
          {isDraft && (
            <CutMenu
              savedViews={meta.savedViews}
              triggerRef={cutMenuTriggerRef}
            />
          )}
          <ChartMenu
            showBands={!isDraft}
            onEditBands={meta.readOnly ? undefined : enterBandEdit}
          />
        </>
      )}
      bandEditor={{ canEdit, bands, applyBands, receipt }}
      pointList={{
        all: points,
        total: allPointsBehind.length,
        render: (list) => <LightboxPointList {...list} allPoints={points} />,
      }}
      footer={({ matched, phrases: sentence }) => {
        const canWatch = meta.hasPlayableVideo && onWatchPoints !== undefined;
        if (!canSaveViews && !canWatch) return null;
        // The points to watch: the matched ones with a clip, as many as one
        // Video tab point set holds (`MAX_POINT_SET`), so the button never
        // promises more than the list will show.
        const playable = matched.filter(isPlayable).slice(0, MAX_POINT_SET);
        return {
          // One group, right: the secondary beside the primary.
          end: (
            <>
              {canSaveViews && (
                <SaveAsViewButton
                  cut={cut}
                  chart={state.chart}
                  filters={state.filters}
                  savedViews={meta.savedViews}
                  workspaceKind={meta.workspaceKind}
                  workspaceName={meta.workspaceName}
                  onSaved={(view) =>
                    setState((prev) => ({ ...prev, viewId: view.id }))
                  }
                />
              )}
              {canWatch && onWatchPoints && (
                <button
                  type="button"
                  disabled={playable.length === 0}
                  onClick={() =>
                    onWatchPoints(
                      playable.map((p) => p.pointNumber),
                      // The Video tab's strip names the set in the lightbox's
                      // own words (`watchLabel`).
                      watchLabel(sentence),
                    )
                  }
                  className={advButton("primary", "sm")}
                >
                  {playable.length === 0
                    ? "Watch points"
                    : `Watch these ${playable.length} ${playable.length === 1 ? "point" : "points"}`}
                </button>
              )}
            </>
          ),
        };
      }}
      draft={
        isDraft
          ? {
              readOnly: meta.readOnly,
              onChooseView: () => cutMenuTriggerRef.current?.click(),
            }
          : undefined
      }
    />
  );
}
