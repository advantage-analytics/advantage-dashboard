import type { MatchReportMeta } from "@/components/dashboard/matches/match-detail/match-report-context";

/**
 * What the Visualizations (Shots) tab lets this viewer WRITE — the one place
 * its writers ask.
 *
 * - `canSaveViews`: the "Create view" tile, "Save this view…" (and the Save
 *   dialog behind it) and Manage mode's rename/duplicate/share/delete. Saving
 *   is on for every member, players included; which saved views a viewer may
 *   then manage is still `canManageSavedView` per view, ANDed with this.
 * - `canEditBands`: the band presets and the "Edit bands…" drag editor —
 *   `meta.canEditBands` (personal owner, or team owner/coach/staff).
 *
 * `meta.readOnly` (the public share page and the sample match) forces both
 * false: nothing on such a report belongs to the viewer, and every one of
 * those writers would hit a server action that refuses them. Reading is
 * untouched — default tiles, filters, the court and the stats card all
 * render exactly as before. Pure so the rule is spec'd without React
 * (`tests/shots-read-only.spec.ts`).
 */
export interface ShotsWriteAccess {
  canSaveViews: boolean;
  canEditBands: boolean;
}

export function shotsWriteAccess(
  meta: Pick<MatchReportMeta, "readOnly" | "canEditBands">,
): ShotsWriteAccess {
  if (meta.readOnly) return { canSaveViews: false, canEditBands: false };
  return { canSaveViews: true, canEditBands: meta.canEditBands };
}
