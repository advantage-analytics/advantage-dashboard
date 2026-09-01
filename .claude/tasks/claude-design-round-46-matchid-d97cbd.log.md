# Run log — claude/design-round-46-matchid-d97cbd

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Build the two-pane shell, rail and tabs; flip page.tsx onto them — blocked

**gate:** mechanical (lint/tsc/test) pass · task-completion-reviewer `VERDICT: needs-work` · pipeline-guardrails-reviewer 1 finding · rls-boundary-reviewer skipped (no data/api/migration surface in diff)

**failed because:**
1. Completion review — the "each pane scrolling independently" criterion is not met: `dashboard-shell.tsx:73` (`<main className="flex flex-1 flex-col">`) and `page-transition.tsx:48` omit `min-h-0`, so the content pane never gets a bounded height and the ancestor scrolls as one blob (reviewer reproduced in an isolated CSS test; adding `min-h-0` at both spots fixes it). Both files sit OUTSIDE T1's `files:` list, so the subagent could not have fixed it in scope — the task's file list needs amending, not just the code.
2. Guardrails — `page.tsx` passes `film={video ? "card" : "note"}` with no `isDerived` gate, so the rail note "the stats came from the SwingVision export" renders for Advantage Intelligence–analyzed matches whose trimmed copy is missing/reclaimed — a customer-visible provenance error. Fix direction: gate the note on `!isDerived` (neutral "no video available" copy for derived matches), or defer the note strip to T6 as originally scoped.

**stash:** bd4b446832914cd6da22f0f54eb2604290025595 (`blocked: T1` — page.tsx/layout.tsx edits + 4 new match-detail components; work is otherwise complete and gates-green mechanically)

**to resume:** `git stash apply bd4b446832914cd6da22f0f54eb2604290025595`, apply the two fixes above (amend T1's `files:` to include `dashboard-shell.tsx` + `page-transition.tsx` for the min-h-0 chain), reset status to `todo`, re-run.

**follow-ups (from the build subagent):**
1. Tab switching via `router.push` refetches the whole RSC wave (reconcile + analysis + video) per switch; `window.history.pushState` shallow routing would keep back-button behavior with zero server round-trips.
2. `MatchDataProvider`'s `insights` context type omits `summary` while the server type has it — close the typing gap when T2 reads insights client-side.
3. Icons: `public/icons/{tennis-court-icon,tournament-icon}.svg` exist but bake `#888888` stroke; a token-colored variant may be wanted.
