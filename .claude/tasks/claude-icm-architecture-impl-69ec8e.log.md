## T1 · Schedule subtree breadcrumbs in the shell header — done
- **gate:** lint OK · tsc OK · test OK · task-completion-reviewer VERDICT: pass ·
  pipeline-guardrails-reviewer ran (diff touches src/app/dashboard/) — no findings ·
  rls-boundary-reviewer skipped — no supabase/data/api/migration surface in the diff
- **changed:** `getStaticBreadcrumbs` in src/app/dashboard/header.tsx learned the
  schedule subtree: `SCHEDULE_CRUMB` (linked) + `SCHEDULE_LEAF_LABELS` for the four
  create routes; any other path under the subtree gets the linked Schedule crumb
  alone; the index path falls through to `navLabel` unchanged.
## T2 · Remove EventShell's crumb bar, atomically with its callers — done
- **gate:** lint OK · tsc OK · test OK · task-completion-reviewer VERDICT: pass ·
  pipeline-guardrails-reviewer ran (diff touches src/components/dashboard/) — no
  findings, and it verified the doc comment's T1 cross-reference against header.tsx ·
  rls-boundary-reviewer skipped — no supabase/data/api/migration surface in the diff
- **changed:** event-shell.tsx lost its 44px crumb bar and the crumb/trail/note
  props (body+footer frame remains); seven call sites dropped the removed props;
  dual-detail and tournament-detail re-home "Created just now" right-aligned on
  the eyebrow row under the same createdJustNow condition.
