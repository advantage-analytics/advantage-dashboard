## T1 · Schedule subtree breadcrumbs in the shell header — done
- **gate:** lint OK · tsc OK · test OK · task-completion-reviewer VERDICT: pass ·
  pipeline-guardrails-reviewer ran (diff touches src/app/dashboard/) — no findings ·
  rls-boundary-reviewer skipped — no supabase/data/api/migration surface in the diff
- **changed:** `getStaticBreadcrumbs` in src/app/dashboard/header.tsx learned the
  schedule subtree: `SCHEDULE_CRUMB` (linked) + `SCHEDULE_LEAF_LABELS` for the four
  create routes; any other path under the subtree gets the linked Schedule crumb
  alone; the index path falls through to `navLabel` unchanged.
