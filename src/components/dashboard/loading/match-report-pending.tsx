"use client";

import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportRail,
  MatchReportRailFooter,
  MatchReportSpacer,
} from "@/components/dashboard/matches/match-detail/match-report";
import {
  MatchReportTitleActions,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import {
  REPORT_VIEWS,
  type ReportView,
} from "@/components/dashboard/matches/match-detail/report-view";
import {
  VIEW_ICONS,
  viewRowClass,
} from "@/components/dashboard/matches/match-detail/report-view-switcher";
import {
  VIZ_TILE_GRID_CLASS,
  VIZ_TILE_GRID_STYLE,
} from "@/components/dashboard/matches/match-detail/shots/viz-labels";
import { InsightMark } from "@/components/dashboard/matches/match-detail/insight-mark";
import { INSIGHT_SURFACE } from "@/components/dashboard/matches/match-detail/report-insight-card";
import { cn } from "@/lib/utils";
import { FilmFramePending } from "./film-frame-pending";
import { PendingBar, PendingRegion } from "./pending";

/**
 * The match report's skeletons (Carbon loading pattern: a skeleton for a
 * container that is about to fill, drawing the chrome the page already
 * knows — the view names, the eyebrows, the group labels — and bars only
 * where values will land).
 *
 * Three consumers, one set of parts:
 *
 *   `(detail)/loading.tsx`      → `MatchReportPending` (via `match-report-skeleton.tsx`),
 *                                 the whole page while `[matchId]/layout.tsx`
 *                                 awaits the match
 *   `[matchId]/page.tsx`        → `VisualizationsPanePending` / `FilmPanePending`
 *                                 as the two code-split views' `loading`
 *   `film/film-player.tsx`      → `FilmFramePending` (`film-frame-pending.tsx`)
 *                                 over the element while a credential is re-signed
 *
 * Every pane mirrors the loaded view's own row/column geometry
 * (`statistics-view.tsx`, `viz-wall.tsx`, `film-tab.tsx`) so nothing jumps
 * when the data lands. Conditional parts — the unpublished notice, the
 * saved-views band, the entry actions — are NOT drawn: a bar that then
 * vanishes is a layout shift, and the skeleton cannot know. The insight card
 * IS drawn: every match with points shows it, as a summary or as its empty.
 *
 * Nothing here reads a provider: `loading.tsx` sits outside the layout that
 * mounts `MatchDataProvider`, so the rail's scoreboard is bars, never names.
 * Passing empty names to the real `RailScoreboard` would draw its "untagged"
 * dashes — a statement about the match, not about the request.
 */

/* ── Rail ──────────────────────────────────────────────────────────────── */

/** `RailScoreboard`'s geometry: a label row, two 18px player rows, a caption. */
function ScoreboardPending() {
  return (
    <div className="px-3">
      <div
        className="flex flex-col gap-[14px] border-b border-[var(--border-hairline)]"
        style={{ padding: "18px 13px 20px" }}
      >
        <div className="flex h-[15px] items-center gap-2">
          <PendingBar className="h-2.5 w-10" />
          <div className="flex-1" />
          <PendingBar className="h-2.5 w-10" />
        </div>
        <div className="flex flex-col gap-[11px]">
          {[0, 1].map((row) => (
            <div key={row} className="flex h-[18px] items-center gap-[7px]">
              <PendingBar className="w-28" />
              <div className="flex-1" />
              <PendingBar className="w-12" />
            </div>
          ))}
        </div>
        <div className="flex h-[15px] items-center">
          <PendingBar className="h-2.5 w-40" />
        </div>
      </div>
    </div>
  );
}

/**
 * The switcher's three rows, drawn as plain `div`s: real labels and icons
 * (known chrome), the incoming view's row washed active, nothing focusable
 * and nothing announced — the page is not interactive yet.
 */
function SwitcherPending({ active }: { active: ReportView }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 pt-2.5" aria-hidden="true">
      {REPORT_VIEWS.map((view) => {
        const Icon = VIEW_ICONS[view.value];
        return (
          <div
            key={view.value}
            className={cn(
              viewRowClass(view.value === active),
              "cursor-default",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center">
              <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {view.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Pane: title row ───────────────────────────────────────────────────── */

/**
 * The real `<h1>` — the view's name is known before the match is — over a
 * facts line of three bars, with the one action every match has (the more
 * menu) as a 28px square on the right. Compare is per-match, so not drawn.
 */
function TitleRowPending({ view }: { view: ReportView }) {
  const label =
    REPORT_VIEWS.find((v) => v.value === view)?.label ?? REPORT_VIEWS[0].label;
  return (
    <MatchReportTitleRow>
      <div className="min-w-0">
        <h1
          className="text-title-lg whitespace-nowrap"
          style={{ letterSpacing: "-0.3px" }}
        >
          {label}
        </h1>
        <div className="mt-[9px] flex h-[18px] items-center gap-2.5">
          <PendingBar className="w-24" />
          <PendingBar className="w-16" />
          <PendingBar className="w-32" />
        </div>
      </div>
      <MatchReportTitleActions>
        <PendingBar className="size-7 rounded-[var(--radius-element)]" />
      </MatchReportTitleActions>
    </MatchReportTitleRow>
  );
}

/* ── Pane: Statistics ──────────────────────────────────────────────────── */

/** The three `H2H_GROUPS` titles; kept inline so this chunk does not pull in the card. */
const H2H_GROUP_TITLES = ["Serve", "Return", "Points"] as const;

function HeadToHeadPending() {
  return (
    <section
      aria-label="Head to head"
      className="surface-card flex flex-col"
      style={{ padding: "18px 20px 14px" }}
    >
      <div className="flex items-baseline gap-3 pb-[14px]">
        <span className="eyebrow">Head to head</span>
        <div className="flex-1" />
        <PendingBar className="h-2.5 w-24" />
      </div>
      <div className="flex items-center border-b border-[var(--border-hairline)] pb-[11px]">
        <span className="min-w-0 flex-1" />
        <span className="flex h-[18px] w-[64px] shrink-0 items-center justify-end">
          <PendingBar className="w-12" />
        </span>
        <span className="flex h-[18px] w-[64px] shrink-0 items-center justify-end">
          <PendingBar className="w-12" />
        </span>
      </div>
      {H2H_GROUP_TITLES.map((title) => (
        <div key={title} className="flex flex-col">
          <div className="flex items-baseline pt-3 pb-0.5">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              {title}
            </span>
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex min-h-[30px] items-center">
              <span className="min-w-0 flex-1">
                <PendingBar className={row % 2 ? "w-28" : "w-36"} />
              </span>
              <span className="flex w-[64px] shrink-0 justify-end">
                <PendingBar className="w-8" />
              </span>
              <span className="flex w-[64px] shrink-0 justify-end">
                <PendingBar className="w-8" />
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function ChartCardPending({
  eyebrow,
  padding,
  gap,
  children,
}: {
  eyebrow: string;
  padding: string;
  /** The loaded card's own column gap — they differ (`gap-2.5` vs `gap-3`). */
  gap: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={eyebrow}
      className={cn("surface-card flex flex-col", gap)}
      style={{ padding }}
    >
      <div className="flex h-4 items-center gap-2">
        <span className="eyebrow">{eyebrow}</span>
        <div className="flex-1" />
        <PendingBar className="h-2.5 w-20" />
      </div>
      {children}
    </section>
  );
}

/**
 * The Advantage Intelligence card's expanded anatomy (`report-insight-card.tsx`):
 * the engine's mark and name render — that chrome is known before the match
 * is — and the claim, the evidence line and the fold toggle pulse.
 */
function InsightPending() {
  return (
    <section
      aria-label="Advantage Intelligence summary"
      className={INSIGHT_SURFACE}
    >
      <div className="flex flex-col gap-2 p-[16px_20px_12px]">
        <div className="flex h-5 items-center">
          <PendingBar className="h-3.5 w-[72%]" />
        </div>
        <div className="flex h-[18px] items-center">
          <PendingBar className="h-2.5 w-[86%]" />
        </div>
        <div className="mt-1 flex h-6 items-center gap-[7px] border-t border-[var(--border-hairline)] pt-2.5">
          <InsightMark />
          <span className="text-micro">Advantage Intelligence</span>
          <div className="flex-1" />
          <PendingBar className="size-6 rounded-[var(--radius-element)]" />
        </div>
      </div>
    </section>
  );
}

/**
 * `statistics-view.tsx`: the insight card, then the widgets row —
 * head-to-head beside the 416px chart column.
 */
export function StatisticsPanePending() {
  return (
    <PendingRegion
      label="statistics"
      className="shrink-0"
      innerClassName="flex flex-col gap-4"
    >
      <InsightPending />
      <div className="flex flex-col gap-4 @min-[720px]:flex-row @min-[720px]:items-start">
        <div className="min-w-0 flex-1">
          <HeadToHeadPending />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-4 @min-[720px]:w-[416px]">
          {/* 104px figure, then the set-label row under it. */}
          <ChartCardPending
            eyebrow="Performance tracker"
            padding="16px 20px 12px"
            gap="gap-2.5"
          >
            <PendingBar className="h-[104px] rounded-[var(--radius-cell)]" />
            <div className="flex h-[15px] items-center justify-center">
              <PendingBar className="h-2.5 w-10" />
            </div>
          </ChartCardPending>
          {/* The 96px band, its three labels, then the legend row. */}
          <ChartCardPending
            eyebrow="Rally length"
            padding="16px 20px 14px"
            gap="gap-3"
          >
            <div className="flex flex-col gap-2">
              <PendingBar className="h-24 rounded-[var(--radius-cell)]" />
              <div className="flex h-[17px] items-center gap-3">
                <PendingBar className="h-2.5 w-16" />
                <PendingBar className="h-2.5 w-16" />
                <PendingBar className="h-2.5 w-16" />
              </div>
            </div>
            <div className="flex h-[15px] items-center gap-3.5">
              <PendingBar className="h-2.5 w-20" />
              <PendingBar className="h-2.5 w-20" />
              <div className="flex-1" />
              <PendingBar className="h-2.5 w-24" />
            </div>
          </ChartCardPending>
          {/* Two name rows over a 10px track, then the four-entry legend. */}
          <ChartCardPending
            eyebrow="How points ended"
            padding="16px 20px 14px"
            gap="gap-3"
          >
            {[0, 1].map((row) => (
              <div key={row} className="flex flex-col gap-1.5">
                <div className="flex h-[17px] items-center gap-2">
                  <PendingBar className="h-2.5 w-20" />
                  <div className="flex-1" />
                  <PendingBar className="h-2.5 w-6" />
                </div>
                <PendingBar className="h-2.5 rounded-[var(--radius-cell)]" />
              </div>
            ))}
            <div className="flex h-[17px] items-center gap-3.5 pt-0.5">
              <PendingBar className="h-2.5 w-14" />
              <PendingBar className="h-2.5 w-10" />
              <PendingBar className="h-2.5 w-16" />
              <PendingBar className="h-2.5 w-20" />
            </div>
          </ChartCardPending>
        </div>
      </div>
    </PendingRegion>
  );
}

/* ── Pane: Visualizations ──────────────────────────────────────────────── */

/** One `CourtTile`: the 334:216 court, a 16px title, the pill row. */
function TilePending() {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="w-full" style={{ aspectRatio: "334 / 216" }}>
        <PendingBar className="h-full w-full rounded-none" />
      </div>
      <div className="flex flex-col gap-2 px-4 pt-[14px] pb-[15px]">
        <div className="flex h-5 items-center">
          <PendingBar className="h-3.5 w-40" />
        </div>
        <div className="flex h-5 items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <PendingBar className="h-5 w-14 rounded-full" />
            <PendingBar className="h-5 w-16 rounded-full" />
          </div>
          <PendingBar className="h-2.5 w-12" />
        </div>
      </div>
    </div>
  );
}

/**
 * The wall (two rows of three tiles, `viz-wall.tsx`) or the focused view's
 * toolbar + court card + 292px stats card (`viz-focused.tsx`). The saved-views
 * band is per-workspace and so not drawn.
 */
export function VisualizationsPanePending({
  focused = false,
}: {
  focused?: boolean;
}) {
  return (
    <PendingRegion label="visualizations" innerClassName="flex flex-col gap-6">
      {focused ? (
        <>
          <div className="flex h-8 items-center gap-2">
            <PendingBar className="h-7 w-28 rounded-[var(--radius-element)]" />
            <PendingBar className="h-7 w-24 rounded-[var(--radius-element)]" />
            <PendingBar className="h-7 w-20 rounded-[var(--radius-element)]" />
          </div>
          <div className="flex items-start gap-4">
            <div className="flex min-w-[360px] flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)]">
              <div className="flex h-[47px] items-center gap-3 px-4">
                <PendingBar className="h-3.5 w-44" />
                <div className="flex-1" />
                <PendingBar className="size-7 rounded-[8px]" />
              </div>
              <div className="mx-4" style={{ aspectRatio: "334 / 216" }}>
                <PendingBar className="h-full w-full rounded-none" />
              </div>
              <div className="flex h-[46px] items-center gap-3 px-4">
                <PendingBar className="h-2.5 w-16" />
                <PendingBar className="h-2.5 w-16" />
              </div>
            </div>
            <div className="surface-card flex w-[292px] shrink-0 flex-col gap-3 p-4">
              <PendingBar className="h-2.5 w-24" />
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex h-6 items-center gap-2">
                  <PendingBar className="w-28" />
                  <div className="flex-1" />
                  <PendingBar className="w-10" />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        [0, 1].map((row) => (
          <div
            key={row}
            className={VIZ_TILE_GRID_CLASS}
            style={VIZ_TILE_GRID_STYLE}
          >
            <TilePending />
            <TilePending />
            <TilePending />
          </div>
        ))
      )}
    </PendingRegion>
  );
}

/* ── Pane: Video ───────────────────────────────────────────────────────── */

/** `film-tab.tsx`'s room: player + current-point card beside the 320px point list. */
export function FilmPanePending() {
  return (
    <PendingRegion
      label="video"
      className="flex min-h-0 flex-1 flex-col"
      innerClassName="flex min-h-0 flex-1 flex-col gap-4 @min-[720px]:flex-row"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <FilmFramePending />
        <section
          aria-label="Current point"
          className="surface-card flex flex-col"
          style={{ padding: "10px 8px 8px" }}
        >
          <div className="flex items-center gap-2.5 pt-0.5 pr-[5px] pb-2.5 pl-3">
            <span className="eyebrow">Current point</span>
            <div className="flex-1" />
            <PendingBar className="h-2.5 w-14" />
          </div>
          <div className="flex flex-col gap-1 px-3 pb-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex h-7 items-center gap-3">
                <PendingBar className="w-6" />
                <PendingBar className="w-24" />
                <PendingBar className="w-20" />
                <div className="flex-1" />
                <PendingBar className="w-10" />
              </div>
            ))}
          </div>
        </section>
      </div>
      {/* The list column is out of flow beside the player, exactly as
          `film-tab.tsx` draws it, so it takes the row's height and never
          adds to it. */}
      <div className="relative flex min-h-0 w-full shrink-0 flex-col @min-[720px]:w-[320px] @min-[720px]:self-stretch">
        <section
          aria-label="Point list"
          className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden @min-[720px]:absolute @min-[720px]:inset-0"
        >
          <div className="flex h-7 items-center gap-2 border-b border-[var(--border-hairline)] px-3">
            <PendingBar className="h-2.5 w-16" />
            <div className="flex-1" />
            <PendingBar className="h-2.5 w-12" />
          </div>
          <div className="flex flex-col px-3 py-1">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <div key={row} className="flex h-9 items-center gap-3">
                <PendingBar className="w-6" />
                <PendingBar className={row % 3 === 0 ? "w-32" : "w-24"} />
                <div className="flex-1" />
                <PendingBar className="w-8" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PendingRegion>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

/**
 * The whole report, pending: `[matchId]/layout.tsx`'s bounded box, the rail
 * and the pane for `view`. Pure props — this is what the offline spec
 * renders — and `match-report-skeleton.tsx` is the one that reads the URL.
 */
export function MatchReportPending({
  view,
  focused = false,
}: {
  view: ReportView;
  focused?: boolean;
}) {
  return (
    <div className="flex h-[calc(100vh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
      <MatchReportFrame>
        <MatchReportRail>
          <PendingRegion label="match summary">
            <ScoreboardPending />
          </PendingRegion>
          <SwitcherPending active={view} />
          <MatchReportSpacer />
          <MatchReportRailFooter>
            <PendingBar className="h-8 rounded-[var(--radius-element)]" />
          </MatchReportRailFooter>
        </MatchReportRail>
        <MatchReportPane>
          <TitleRowPending view={view} />
          {view === "statistics" ? (
            <StatisticsPanePending />
          ) : view === "shots" ? (
            <VisualizationsPanePending focused={focused} />
          ) : (
            <FilmPanePending />
          )}
        </MatchReportPane>
      </MatchReportFrame>
    </div>
  );
}
