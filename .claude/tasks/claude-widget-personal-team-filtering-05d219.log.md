# Run log — claude/widget-personal-team-filtering-05d219

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Scope home performance read to personal matches — done
- **gate:** lint clean · `tsc --noEmit` clean · `npm test` clean (no stale
  `.next/` re-run needed). `task-completion-reviewer`: VERDICT: pass, all four
  criteria met, nothing changed outside the declared file.
  `rls-boundary-reviewer`: ran (diff touches `src/lib/data/`) — explicitly
  clean; it notes the change tightens scoping rather than loosening it, and
  that both callers are personal-home surfaces.
  `pipeline-guardrails-reviewer`: skipped — the diff touches neither
  `src/app/dashboard/`, `src/components/dashboard/`, nor the upload wizard.
- **changed:** `src/lib/data/performance-server.ts` — the `matches` read in
  `getOverallPerformance()` gains `.is("program_id", null)` after
  `.eq("created_by", user.id)`, plus a comment naming the rule and pointing at
  `matches/page.tsx` as its canonical statement. Nothing else in the file moved.
- **follow-ups:**
  1. `src/app/api/home-insight/route.ts` is a second consumer of
     `getOverallPerformance()` (surfaced by the RLS reviewer). It inherits this
     fix with no edit of its own — worth a glance during `/pr-check` to confirm
     the insight prose now narrates the personal-only figures.

## T2 · Scope Recent Matches card to personal matches — done
- **gate:** lint clean · `tsc --noEmit` clean · `npm test` clean (no stale
  `.next/` re-run needed). `task-completion-reviewer`: VERDICT: pass, all four
  criteria met including the read of the empty branch, nothing outside the
  declared file. `pipeline-guardrails-reviewer`: ran (diff touches
  `src/app/dashboard/`) — explicitly no findings; it confirms none of the three
  wizard misattribution inputs, role gating, `canSubmitVideo`, the analysis
  short-circuit or provider naming are implicated. `rls-boundary-reviewer`: ran
  (a Supabase query change, and a browser-client one) — explicitly clean; it
  independently verified the predicate against three other call sites rather
  than trusting the diff's own comment, and confirmed the follow-up
  `match_stats_with_percentages` read cannot reintroduce program rows because
  it keys off the now-narrowed match ids.
- **changed:** `src/app/dashboard/(home)/recent-activity.tsx` — the browser-client
  `matches` list query gains `.is("program_id", null)` after
  `.eq("created_by", userId)`, with T1's comment. The match-id-keyed
  `match_stats` read, the realtime channel, the toast state machine and
  `PROCESSING_TIMEOUT_MS` are untouched, which is the trap this task named.
