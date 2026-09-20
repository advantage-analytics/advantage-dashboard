"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  useMatchSides,
  type MatchSide,
} from "@/components/dashboard/matches/match-detail/use-match-sides";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import { canManageSavedView } from "@/lib/data/saved-views-logic";
import type { ProgramRole } from "@/lib/workspace/types";
import { CourtTile } from "./court-tile";
import { useVizState } from "./use-viz-state";
import type { VizState } from "./viz-url";
import { activeFilterEntries } from "./viz-url";
import { computeViz, subjectFor, EMPTY_VIZ_FILTERS } from "./viz-model";
import { truncatePillLabels } from "./viz-labels";

/**
 * Task 9 (P1a band, without Manage mode): every saved view the viewer can
 * see — their own private ones plus the workspace's shared ones, in the
 * given order — as the same 3-col `CourtTile` grid the wall draws, plus a
 * dashed "New view" tile. Mounted by `shots-tab.tsx` on both `VizWall` (via
 * its `savedViewsBand` slot) and `VizFocused` (ditto), so it is the SAME
 * band on both surfaces — one component, two mount points.
 *
 * P1b: renders nothing at all with zero views — never an empty band, a
 * skeleton or sample tiles. A band that always drew a "New view" tile even
 * with nothing saved would need its own onboarding treatment; the simpler,
 * correct choice is to stay absent until there is at least one real view,
 * matching every other empty surface in this tab.
 *
 * `onManage` is Part B's seam: undefined here (no-op) is fine for this task,
 * since it's only reachable through the "Manage views" button this file
 * draws but leaves inert — Part B wires it to open Manage mode. Kept
 * minimal on purpose per task-9-brief.md's "keep it minimal" — no
 * `overlay`/`header` render-prop object yet, since nothing here needs one
 * until Manage mode exists to fill it.
 */
export function SavedViewsBand({
  views,
  workspaceRole,
  onManage,
}: {
  views: SavedViewRow[];
  workspaceRole: ProgramRole;
  onManage?: () => void;
}) {
  const { points } = useMatchData();
  const { you, opp } = useMatchSides();
  const { hrefFor } = useVizState();

  const canManageAny = useMemo(
    () => views.some((view) => canManageSavedView(view, workspaceRole)),
    [views, workspaceRole],
  );

  if (views.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-4"
      style={{
        marginTop: 8,
        paddingTop: 24,
        borderTop: "1px solid var(--border-hairline)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2
            style={{
              fontSize: 24,
              fontWeight: 300,
              letterSpacing: "-0.3px",
              color: "var(--ink-900)",
            }}
          >
            Saved views
          </h2>
          <span className="text-micro">
            {views.length} saved view{views.length === 1 ? "" : "s"}
          </span>
        </div>
        {canManageAny && (
          <button
            type="button"
            onClick={onManage ?? (() => undefined)}
            className="shrink-0 cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            Manage views
          </button>
        )}
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
      >
        {views.map((view) => (
          <SavedViewTile
            key={view.id}
            view={view}
            points={points}
            you={you}
            opp={opp}
            hrefFor={hrefFor}
          />
        ))}
        <NewViewTile hrefFor={hrefFor} />
      </div>
    </div>
  );
}

function SavedViewTile({
  view,
  points,
  you,
  opp,
  hrefFor,
}: {
  view: SavedViewRow;
  points: MatchPoint[];
  you: MatchSide;
  opp: MatchSide;
  hrefFor: (next: VizState) => string;
}) {
  const subjectIsPlayer1 = subjectFor(view.filters, you.isPlayer1);
  const result = computeViz(points, view.cut, view.filters, subjectIsPlayer1);
  const subjectName = view.filters.player === "you" ? you.name : opp.name;

  const entries = activeFilterEntries({
    cut: view.cut,
    chart: view.chart,
    filters: view.filters,
    viewId: null,
  });
  const pills = truncatePillLabels(entries.map((entry) => entry.label));

  const countLabel =
    view.cut === "serve"
      ? `${result.count} of ${result.total}`
      : `${result.count} returns`;

  const href = hrefFor({
    cut: view.cut,
    chart: view.chart,
    filters: view.filters,
    viewId: view.id,
  });

  return (
    <CourtTile
      playerName={subjectName}
      name={view.name}
      nameAdornment={
        view.shared ? (
          <Users
            className="size-3 shrink-0"
            strokeWidth={1.5}
            style={{ color: "var(--ink-500)" }}
            aria-label="Shared with team"
            role="img"
          />
        ) : undefined
      }
      pills={pills}
      countLabel={countLabel}
      cut={view.cut}
      dots={result.dots}
      href={href}
    />
  );
}

/**
 * The band's trailing dashed tile — always the Serve cut, default filters
 * (never carries anything over from the last-focused view), matching the
 * wall's own default entry point.
 */
function NewViewTile({
  hrefFor,
}: {
  hrefFor: (next: VizState) => string;
}): ReactNode {
  const href = hrefFor({
    cut: "serve",
    chart: "scatter",
    filters: EMPTY_VIZ_FILTERS,
    viewId: null,
  });

  return (
    <Link
      href={href}
      className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border-medium)] transition-colors duration-200 ease-[var(--ease-primary)] hover:border-[var(--blue)] motion-reduce:transition-none"
    >
      <Plus
        className="size-4 shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--ink-500)" }}
        aria-hidden="true"
      />
      <span
        className="text-[12px] font-medium"
        style={{ color: "var(--ink-500)" }}
      >
        New view
      </span>
    </Link>
  );
}
