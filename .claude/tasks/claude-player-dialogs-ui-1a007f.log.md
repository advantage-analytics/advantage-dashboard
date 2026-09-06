# Run log — claude/player-dialogs-ui-1a007f

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add `playedSets()` display-only trim helper — done
- **gate:** mechanical — `npm run lint`, `npx tsc --noEmit`, `npm test` all clean (no stale `.next/` re-run needed). Completion review — `VERDICT: pass`, all five criteria met, no scope creep. Guardrails — both skipped legitimately: the diff touches only `src/lib/ui/` and `tests/`, so `pipeline-guardrails-reviewer` (no `src/app/dashboard/`, `src/components/dashboard/` or upload wizard) and `rls-boundary-reviewer` (no `src/lib/supabase/`, `src/lib/data/`, `src/app/api/`, `supabase/migrations/`, no new table or query) had no surface to review. Confirmed against both `git diff HEAD --stat` and `git ls-files --others --exclude-standard` — no untracked files.
- **changed:** `src/lib/ui/score-format.ts` gains one exported pure function, `playedSets(sets)`, trimming trailing sets where both sides are `0` and stopping at the first set that is not — interior and leading `0-0` survive on purpose. Its doc comment records why it is deliberately separate from `scoreSetsFrom`: the trim is display-only and must never reach a write path or change what other readers of the shared adapter see. `scoreSetsFrom`, `tiebreakOf` and `formatScoreText` are byte-unchanged. `tests/score-format.spec.ts` was extended (not replaced) with a `playedSets` describe block covering all five required cases. Nothing imports the helper yet — T2 wires it into the roster drawer.
