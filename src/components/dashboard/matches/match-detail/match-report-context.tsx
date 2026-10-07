"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  parseReportView,
  reportViewQuery,
  type ReportView,
} from "@/components/dashboard/matches/match-detail/report-view";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import type { BandSettings } from "@/lib/data/viz-bands";
import type { ProgramRole, WorkspaceKind } from "@/lib/workspace/types";
import type { DistanceUnit } from "@/lib/format/distance";
import { FilmHeadProvider } from "@/components/dashboard/matches/match-detail/film-head-context";
import {
  FilmCutProvider,
  type FilmCut,
  type FilmCutIntent,
} from "@/components/dashboard/matches/match-detail/film-cut-context";

/**
 * The match report's one context: state, actions and meta (settled Statistics
 * page, design 04 F1–F8). Same shape as `new-match-wizard/UploadWizardProvider.tsx`
 * — React 19 `createContext` read with `use()`, rendered as `<Context value>`.
 *
 * This provider is the only thing that knows where the report's state lives:
 * the active view in the URL (`?tab=`, through `report-view.ts`) and the
 * insight's collapse in component state. The insight has no dismiss: it is the
 * report's own summary, so it can be folded away but not thrown out. Every `MatchReport` part reads the interface,
 * so none of them can drift from another about which view is showing.
 *
 * `meta` is what `page.tsx` already decided on the server and passes in as
 * props — it never changes on the client. `summary` is the viewer's own
 * insight, already `sides.pick`ed (guardrails §4); nothing below re-picks it.
 */

export type InsightStatus = "expanded" | "collapsed";

export interface MatchReportState {
  view: ReportView;
  insight: InsightStatus;
}

export interface MatchReportActions {
  /** One history entry per view, exactly as `match-tabs.tsx`'s `select`. */
  selectView(view: ReportView): void;
  /** Open a timed point in the Video view. */
  watchPoint(pointId: string): void;
  /**
   * Open the Video view on a statistic's cut: its `MatchFilters` keys land
   * in the shared match filters (the drawer's pills pressed), its Film-only
   * extras stay beside them named by `label` in the filter strip, and the
   * shell player starts on the first point the list admits. The film tab
   * consumes it once (`film-cut-context.tsx`, `landFilmCut`).
   * A no-op without a playable video — there is no Video view to open, and
   * `/m/[token]` never has one.
   */
  watchCut(cut: FilmCut, label: string): void;
  collapseInsight(): void;
  expandInsight(): void;
}

export interface MatchReportMeta {
  matchId: string;
  /** The viewer's insight, already `sides.pick`ed in `page.tsx`. */
  summary: string | null;
  /** `hasComparisonBaseline(kpiHistory)` — computed on the server. */
  canCompare: boolean;
  /** `sourceProvider === "splitstep"`. */
  isDerived: boolean;
  /** Both `match_stats` rows present. */
  statsPublished: boolean;
  /**
   * The analysis failed in a way that leaves the match viewable but with no
   * statistics at all — `recovery === "stats_unavailable"` on a failed job
   * (our derivation refused the vendor's data; retrying cannot change it).
   * `page.tsx` lets such a match past the short-circuit, and the Statistics
   * view draws one quiet note in place of every stat section. Defaults to
   * `false`; `/m/[token]` never sets it.
   */
  statsUnavailable: boolean;
  /**
   * The match's newest completed job recorded that the derived point
   * timeline could not be reconciled against the score entered
   * (`derivation_quality->fold.reconciled === false`, T13). Some points may
   * sit in the wrong game even though the score shown is the one entered.
   * Defaults to `false`; a job derived before T13 carries no `fold` key and
   * reads as `false` too — no backfill (guardrails §2). `/m/[token]` never
   * sets it.
   */
  foldUnreconciled: boolean;
  /** A playable match video was resolved on the server. */
  hasPlayableVideo: boolean;
  /**
   * Visualizations-tab saved views (Task 8), loaded once in `page.tsx` via
   * `getSavedViews(activeWorkspace.id)` and threaded down here rather than
   * prop-drilled through `MatchReportWhen`/`ShotsTab`'s dynamic import — this
   * is the one place `shots-tab.tsx` already reads other page-level meta
   * from. Empty on the awaiting-analysis short-circuit, which never renders
   * `ShotsTab`.
   */
  savedViews: SavedViewRow[];
  /** The active workspace's `Workspace.role` — `canManage(view)`'s other half. */
  workspaceRole: ProgramRole;
  /**
   * The active workspace's `Workspace.kind`/`Workspace.name` (Task 9) —
   * `save-view-dialog.tsx`'s "Share with team" row only exists in a team
   * workspace and its micro copy names it. `"personal"`/`""` when there is
   * no active workspace, same fallback `page.tsx` already uses for
   * `workspaceRole`.
   */
  workspaceKind: WorkspaceKind;
  workspaceName: string;
  /**
   * The active workspace's Visualizations-tab depth/contact bands (Phase 2B)
   * — one record per workspace, loaded once in `page.tsx` via
   * `getBandSettings(activeWorkspace.id)` beside `getSavedViews`, and
   * threaded down here for the same reason `savedViews` is: `use-viz-view.ts`
   * is the one data path behind both the focused court and the fullscreen
   * viewer, so reading it there is enough for `computeVizStats` to follow
   * the workspace's bands everywhere. `DEFAULT_BANDS` on the
   * awaiting-analysis short-circuit, which never renders `ShotsTab`.
   */
  bandSettings: BandSettings;
  /**
   * May this viewer change the workspace's bands? Personal workspaces are
   * always editable by their sole owner; a team workspace follows
   * `isProgramStaff` (owner/coach/staff) — a player sees the bands but can't
   * edit them, matching `viz_band_settings`'s own RLS write policy.
   */
  canEditBands: boolean;
  /**
   * The viewer's Units preference (Settings › Preferences, Stage 2C) —
   * loaded once in `page.tsx` via `getPreferences()` beside `getSavedViews`/
   * `getBandSettings`, and threaded down here for the same reason: every
   * distance-aware piece of the Visualizations tab reads it from here
   * instead of a prop drilled through `ShotsTab`. Never a per-chart toggle.
   * Band STORAGE stays feet regardless — this only affects display.
   */
  unit: DistanceUnit;
  /**
   * The public share page (`/m/[token]`): an anonymous reader with no
   * workspace, no session and nowhere else in the app to go. A part that
   * offers a way onward into the dashboard — the insight card's "Why this"
   * link, the empty Statistics view's "Open the Video tab" — draws nothing
   * instead, and so does every control that changes or hands out the match:
   * the More menu, Compare and Share each return `null` here, so a page may
   * mount them unconditionally. Everything else reads the same. The sample
   * match (`sample`) sets it too; `false` on every real match under
   * `/dashboard`.
   */
  readOnly: boolean;
  /**
   * The sample match (`/dashboard/matches/sample`): an anonymised, bundled
   * report a new player tours before their own exists. It always rides with
   * `readOnly` — nothing on it belongs to the viewer, so nothing on it may be
   * changed — and adds only what is true of the sample alone (the banner, the
   * tour). Defaults to `false`; `/m/[token]` and every real match leave it.
   */
  sample: boolean;
  /**
   * Where the Video view renews its short-lived playback credential, when that
   * is not the match's own `/api/matches/${matchId}/video` — the sample
   * match's clip is minted by `/api/sample-match/video`, since its placeholder
   * id names no row. `null` means the match's own route. Defaults to `null`.
   */
  playbackEndpoint: string | null;
}

export interface MatchReportContextValue {
  state: MatchReportState;
  actions: MatchReportActions;
  meta: MatchReportMeta;
}

const MatchReportContext = createContext<MatchReportContextValue | null>(null);

export function useMatchReport(): MatchReportContextValue {
  const value = use(MatchReportContext);
  if (!value) {
    throw new Error("useMatchReport must be used inside MatchReportProvider");
  }
  return value;
}

export interface MatchReportProviderProps extends Omit<
  MatchReportMeta,
  | "readOnly"
  | "sample"
  | "playbackEndpoint"
  | "statsUnavailable"
  | "foldUnreconciled"
> {
  /** See `MatchReportMeta.statsUnavailable`. Defaults to `false`. */
  statsUnavailable?: boolean;
  /** See `MatchReportMeta.foldUnreconciled`. Defaults to `false`. */
  foldUnreconciled?: boolean;
  /** See `MatchReportMeta.readOnly`. Defaults to `false`. */
  readOnly?: boolean;
  /** See `MatchReportMeta.sample`. Defaults to `false`. */
  sample?: boolean;
  /** See `MatchReportMeta.playbackEndpoint`. Defaults to `null`. */
  playbackEndpoint?: string | null;
  /**
   * The view a URL without `?tab=` opens at — the reader's "Match report opens
   * at" preference, resolved in `page.tsx`. An explicit `?tab=` still wins.
   */
  defaultView?: ReportView;
  children: ReactNode;
}

export function MatchReportProvider({
  matchId,
  summary,
  canCompare,
  isDerived,
  statsPublished,
  statsUnavailable = false,
  foldUnreconciled = false,
  hasPlayableVideo,
  savedViews,
  workspaceRole,
  workspaceKind,
  workspaceName,
  bandSettings,
  canEditBands,
  unit,
  readOnly = false,
  sample = false,
  playbackEndpoint = null,
  defaultView = "statistics",
  children,
}: MatchReportProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Anything that is not a known view reads as the default, never an error.
  const view = parseReportView(searchParams.get("tab"), defaultView);

  // Collapse is only this visit's state; every visit opens expanded.
  const [insight, setInsight] = useState<InsightStatus>("expanded");
  // The "watch this cut" intent, between `watchCut` and the film tab taking
  // it. Component state, not the URL: a statistic's cut is a one-off Film
  // lens, never part of the shared `?f=` filters.
  const [pendingCut, setPendingCut] = useState<FilmCutIntent | null>(null);
  const clearPendingCut = useCallback(() => setPendingCut(null), []);

  const actions = useMemo<MatchReportActions>(
    () => ({
      selectView(next) {
        if (next === view) return;
        // Native history rather than `router.push`: Next keeps
        // `useSearchParams`/`usePathname` in sync with it without fetching the
        // report again, and each push is its own entry, so Back restores the
        // previous view. `reportViewQuery` carries every other parameter
        // through.
        const query = reportViewQuery(searchParams, next, defaultView);
        window.history.pushState(
          null,
          "",
          query ? `${pathname}?${query}` : pathname,
        );
      },
      watchPoint(pointId) {
        const query = new URLSearchParams(window.location.search);
        query.set("tab", "film");
        query.set("point", pointId);
        query.delete("fullscreen");
        window.history.pushState(null, "", `${pathname}?${query.toString()}`);
      },
      watchCut(cut, label) {
        if (!hasPlayableVideo) return;
        setPendingCut({ cut, label });
        const query = new URLSearchParams(window.location.search);
        query.set("tab", "film");
        query.delete("fullscreen");
        window.history.pushState(null, "", `${pathname}?${query.toString()}`);
      },
      collapseInsight() {
        setInsight("collapsed");
      },
      expandInsight() {
        setInsight("expanded");
      },
    }),
    [view, searchParams, pathname, defaultView, hasPlayableVideo],
  );

  const meta = useMemo<MatchReportMeta>(
    () => ({
      matchId,
      summary,
      canCompare,
      isDerived,
      statsPublished,
      statsUnavailable,
      foldUnreconciled,
      hasPlayableVideo,
      savedViews,
      workspaceRole,
      workspaceKind,
      workspaceName,
      bandSettings,
      canEditBands,
      unit,
      readOnly,
      sample,
      playbackEndpoint,
    }),
    [
      matchId,
      summary,
      canCompare,
      isDerived,
      statsPublished,
      statsUnavailable,
      foldUnreconciled,
      hasPlayableVideo,
      savedViews,
      workspaceRole,
      workspaceKind,
      workspaceName,
      bandSettings,
      canEditBands,
      unit,
      readOnly,
      sample,
      playbackEndpoint,
    ],
  );

  const value = useMemo<MatchReportContextValue>(
    () => ({ state: { view, insight }, actions, meta }),
    [view, insight, actions, meta],
  );

  // The film head rides alongside, in its own context: it moves several times
  // a second and only the rail scoreboard reads it (`film-head-context.tsx`).
  // The pending cut likewise (`film-cut-context.tsx`): only the film tab reads
  // it, and the film subtree must not depend on this context.
  return (
    <MatchReportContext value={value}>
      <FilmCutProvider cut={pendingCut} onClear={clearPendingCut}>
        <FilmHeadProvider>{children}</FilmHeadProvider>
      </FilmCutProvider>
    </MatchReportContext>
  );
}
