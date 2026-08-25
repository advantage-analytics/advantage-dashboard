# Run log — claude/update-header-dd0daa

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Workspace title in the header's leading slot — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing
  `react-hooks/set-state-in-effect` warnings, unchanged by this diff),
  `npx tsc --noEmit` clean, `npm test` 66/66 passed. Completion review —
  `VERDICT: pass`, all five criteria met with per-line evidence.
  Guardrails — `pipeline-guardrails-reviewer` ran (diff touches
  `src/app/dashboard/`) and found no violation: no wizard input, no
  `resolveAnalysisStatus`, no `splitstep` string, no new query.
  `rls-boundary-reviewer` skipped — the diff touches no `src/lib/supabase/`,
  `src/lib/data/`, `src/app/api/` or `supabase/migrations/` path and adds no
  table, view or query; `workspaceTitle()` is a pure display transform over
  the already-scoped `active` workspace.
- **changed:** design 9g. `/dashboard/team` now leads with the workspace name
  (12px/500/ink-900) and a squad qualifier in `text-micro` ("Meridian State" +
  "Men's tennis"), baseline-aligned at an 8px gap with no separator, in place
  of the "Team Home" breadcrumb. `WORKSPACE_TITLE_PATHS` is an exact-match set
  holding only that one path, and `breadcrumbs` short-circuits to `[]` when a
  title is present — "never both" enforced where the data is built rather than
  by two competing render conditions. New `workspaceTitle()` helper sits beside
  `teamLabel()` in `src/lib/workspace/types.ts` and returns a null qualifier
  when the workspace has no squad, so the second span is not emitted at all.
  `/dashboard` was deliberately left alone; the sidebar's "Team Home" label in
  `nav.ts` is unchanged. The right cluster has no diff hunk. The school name
  intentionally carries no `truncate` — `overflow: hidden` would move the flex
  item's baseline to its bottom margin edge and break the alignment the spec
  calls for.
