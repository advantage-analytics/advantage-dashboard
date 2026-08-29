# Run log — claude/team-workspace-isolation-c8c74a

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Prove and lock cross-program match isolation — done
**gate:** mechanical pass (lint, tsc, full Playwright suite 206 passed); task-completion-reviewer VERDICT: pass (all four criteria verified against the spec file, spec independently re-run 6/6 against live DB); rls-boundary-reviewer clear (explicit "no issues that block" — service-role key confined to the test process, no hardcoded secrets/PII, no migrations touched, teardown leaves no standing hazard); pipeline-guardrails-reviewer skipped — diff touches only `tests/`, no dashboard/upload-wizard surface.
**changed:** New live-DB Playwright spec `tests/rls-workspace-isolation.spec.ts` (6 tests, serial): builds a disposable two-program fixture (athlete rostered in A and B, match filed under A with stats/points/shots/files rows), proves B-staff and B-player (roster_visible on) read zero rows across `matches`, `match_stats`, `points`, `shots`, `match_files`, and that non-member INSERT into A and any client regraft of `program_id` are refused with 42501 by `matches_block_client_regraft`. Audit passed with policies unchanged — no migration needed. Fixtures fully torn down; run on demand with `npx playwright test tests/rls-workspace-isolation.spec.ts`.
**follow-ups:**
1. `match_files` SELECT is uploader-only — program staff cannot read their own program's match files via RLS; if a team-side file listing ever queries client-side it will silently show nothing. Worth a deliberate policy decision.
2. DELETE paths untested: `points`/`shots`/`match_stats` DELETE policies use `matches.created_by` subqueries a future policy edit could widen; the same spec pattern would cover it cheaply.
3. Add an anon (signed-out) session assertion of zero rows, guarding against a policy accidentally granted to `anon`.
