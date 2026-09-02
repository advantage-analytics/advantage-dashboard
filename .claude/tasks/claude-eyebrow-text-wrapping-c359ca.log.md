# Run log — claude/eyebrow-text-wrapping-c359ca

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add `programEyebrow()` helper to programs-server — done
- **gate:** lint clear · `tsc --noEmit` exit 0 · `npm test` 301 passed · `task-completion-reviewer` VERDICT: pass, all five criteria met individually · `rls-boundary-reviewer` ran (diff touches `src/lib/data/`) and reported the diff clear with no findings · `pipeline-guardrails-reviewer` skipped: the diff touches nothing under `src/app/dashboard/`, `src/components/dashboard/` or the upload wizard.
- **changed:** One purely additive hunk in `src/lib/data/programs-server.ts` — `programEyebrow(schoolName, team, division)` beside `programSubtitle`, composing `school · squad · division` through the existing `teamLabel`/`divisionLabel` and dropping a null division via `.filter(Boolean)`. Its doc comment records why conference is excluded: the four-field eyebrow reaches 136 characters and roughly 1,134px, wider than any column in the claim flow. No caller is wired — that is T3 and T4. `programSubtitle`, `teamLabel` and `divisionLabel` are untouched and all four `programSubtitle` call sites remain.
