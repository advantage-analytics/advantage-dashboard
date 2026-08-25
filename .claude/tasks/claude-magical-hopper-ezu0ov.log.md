# Run log — claude/magical-hopper-ezu0ov

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Bring the roster widget to Design 9a (v3 chrome) — done
- **gate:** mechanical — `npm run lint` exit 0 (0 errors, 38 pre-existing
  `react-hooks/*` warnings in untouched files), `npx tsc --noEmit` exit 0 with no
  output, `npm test` 93 passed. No stale `.next/` type errors, so no clear-and-rerun
  was needed. Completion review — `VERDICT: pass`, all five criteria met, no files
  touched outside `files:`. Guardrails — `pipeline-guardrails-reviewer` ran
  (`src/app/dashboard/` and `src/components/dashboard/` both in the diff) and
  returned no findings; `rls-boundary-reviewer` was skipped because the diff
  contains no `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or
  `supabase/migrations/` path, no new table, view or query, and
  `git ls-files --others --exclude-standard` was empty so no untracked file could
  hide one.
- **changed:** `roster-table.tsx` and `roster/page.tsx` only. Added a 24px leading
  lineup `#` column (`COL.spot` + a display-only `LineupSpot` reading the existing
  `RosterMember.lineupSpot`, em dash in `--ink-400` for a null spot and for every
  invite row) with an `eyebrow-sm` `#` header plus a 10px `ArrowUp` labelling the
  sort `getRosterData` already returns. Member rows moved from full-bleed bordered
  rows to 8a's rounded inset hover (`ROW_INSET = -mx-4 rounded-[var(--radius-element)]
  px-4 py-3`, `hover:bg-[var(--surface-muted)]`), horizontal padding moved from the
  row to the card (`px-6 pt-0.5 pb-1.5`), and the comment that argued the opposite
  was rewritten rather than left contradicting the code. Invite rows keep their place
  in the same list; "Withdraw" is now "Revoke". Page header switched to
  `eyebrow` / `text-display` / `text-body-sm` with `lg:items-end` so the existing
  `RosterHeaderButtons` pair bottom-aligns with the heading block — that file needed
  no change, its `advButton("outline")`/`advButton("primary")` at `md` already being
  9a's 36px secondary/primary. Three implementer judgment calls were reviewed and
  accepted: all header cells moved to `eyebrow-sm` (9a marks them all that way),
  scroll body `min-w` 840px → 880px to pay for the new column, and Revoke's hover
  recoloured `--danger` → `--ink-900` per 9a's literal markup — the last drops a
  destructive-affordance tint and is flagged as a UX note, not a criterion breach.
  The deferred database work held: the invite line still reads
  "Invited {date} as {role}", with no "by you".
