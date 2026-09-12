# Stage 05 — Build report

Branch `codex/dual-match-workflow`. Queue: `.claude/tasks/codex-dual-match-workflow.md`.

**Every task in `04_tasks/output/tasks.md` is `done`. Nothing is blocked.**

## Task statuses

All 21 tasks reached `done`.

| Task | Title | Status |
| --- | --- | --- |
| T1 | Persist schedule outcome records | done |
| T2 | Resolve outcome state in the schedule domain | done |
| T3 | Load outcomes with team schedule data | done |
| T4 | Define schedule role capabilities | done |
| T5 | Authorize outcome writes and score conflicts | done |
| T6 | Delete eligible events with server enforcement | done |
| T7 | Wire Schedule capabilities and remove Import | done |
| T8 | Add the viewer drawer footer | done |
| T9 | Expose event edit and delete in the drawer | done |
| T10 | Validate lineup identities and pairs | done |
| T11 | Choose doubles partners by roster identity | done |
| T12 | Support either forfeit side in the lineup builder | done |
| T13 | Round lineup hover treatment | done |
| T14 | Clarify tournament roster inclusion and draws | done |
| T15 | Title-case the wizard venue labels | done |
| T16 | Add result choice to inline scoring | done |
| T17 | Add result choice to the full-page score flow | done |
| T18 | Render outcomes on the dual detail page | done |
| T19 | Render tournament outcomes by round | done |
| T20 | Render outcomes in the Schedule drawer | done |
| T21 | Verify the complete Schedule workflow | done |

## Commit range

`40f5505..6db619b` — 36 commits (8 pipeline/docs, 28 task runner).

Oldest first:

```
605476f pipeline(dual-match-workflow): scaffold workspace
ae9ba22 docs(dual-match-workflow): clarify schedule scope
470cbaa pipeline(dual-match-workflow): stage 01 brief
1403441 pipeline(dual-match-workflow): stage 02 design
d5f1a28 pipeline(dual-match-workflow): stage 03 plan
178cf3d pipeline(dual-match-workflow): stage 04 blocked on branch
1cd04d2 pipeline(dual-match-workflow): stage 04 tasks
cb1311d docs(dual-match-workflow): match task mirror whitespace
ecbb1e4 T1: blocked
1be9676 T4: Define schedule role capabilities
a77c6c4 T7: blocked
96efdb4 T14: blocked
5de2f3f T1: Persist schedule outcome records
db8ee97 T2: Resolve outcome state in the schedule domain
a39e99c T3: Load outcomes with team schedule data
4e5c532 T5: Authorize outcome writes and score conflicts
ef5458d T6: Delete eligible events with server enforcement
ed0652b T10: Validate lineup identities and pairs
58f23a7 T11: blocked
e324a86 T16: blocked
8d629a8 T7: Wire Schedule capabilities and remove Import
e9a02dd T16: Add result choice to inline scoring
7c41ce7 T11: Choose doubles partners by roster identity
41e704a T14: blocked
00a260e T14: Clarify tournament roster inclusion and draws
88d8d3e T17: Add result choice to the full-page score flow
c842aa1 feat(schedule): support both forfeit sides in lineup
1b15a46 T13: Round lineup hover treatment
b65e16d T8: Add the viewer drawer footer
1dc39b6 T9: Expose event edit and delete in the drawer
383dca3 T15: Title-case the wizard venue labels
c2aa283 T18: Render outcomes on the dual detail page
5503480 T19: Render tournament outcomes by round
6b0db11 T20: Render outcomes in the Schedule drawer
ac22ba1 T21: blocked
6db619b T21: Verify the complete Schedule workflow
```

## Blocked items

**None outstanding.** Six `blocked` commits appear in the range; every one was a
recoverable intermediate state that a later authorized retry resolved, and each
stashed its failed work rather than discarding it.

| Task | Why it blocked | Resolved by |
| --- | --- | --- |
| T1 | gate failure on the first attempt | `5de2f3f` |
| T7 | gate failure on the first attempt | `8d629a8` |
| T11 | acceptance test was static rather than a hydrated real component | `7c41ce7` — replaced with a hydrated browser harness |
| T14 | blocked twice: fixture mounted `TournamentFieldStep` with duplicated local state instead of the real `NewTournamentFlow`/`useTournamentDraft`, so it proved no actual persistence | `00a260e` — real hydration path |
| T16 | gate failure on the first attempt | `e9a02dd` |
| T21 | `rls-boundary-reviewer`: the reduced local `processing_jobs` fixture omitted production triggers and policies, so its "no processing job created" assertion proved only the fixture, not the production contract | `6db619b` — fixture reconstructs the full `processing_jobs` catalog, hard-gated in `beforeAll` |

## Final gate record (T21, `6db619b`)

- `npm run lint` exit 0 · `npx tsc --noEmit` exit 0 · `npm run format:check` exit 0
- `npm test` — 730 passed, 17 skipped, 0 failed
- Serialized local-database specs ran **opted in, not skipped** — 17 passed
- `task-completion-reviewer` — `VERDICT: pass`
- `rls-boundary-reviewer` — explicit no findings
- `pipeline-guardrails-reviewer` — skipped; the diff is `tests/` only, confirmed
  via both `git diff HEAD --stat` and `git ls-files --others --exclude-standard`

## Notes carried forward to stage 06

1. **Production migrations are applied.** All three feature migrations
   (`20260910120000`, `20260910184159`, `20260910190731`) were applied to the
   live database after T21 passed, at the author's explicit instruction, and
   verified: table + 3 RLS policies, `schedule_private` with 3 guard functions,
   both RPCs `security invoker`, all 4 triggers attached, `event.deleted` added
   to the audit constraint. Row counts unchanged (39 matches, 57 audit, 11
   entries). The deployment prerequisite T12 flagged is therefore satisfied.

2. **Grant-hardening drift between repo and live.** A post-apply parity check
   compared the live `processing_jobs` catalog against the gated local contract.
   Seven of eight sections are byte-identical (columns, constraints, indexes,
   policies, triggers, publication, RLS). **Grants differ:** live grants `anon`
   and `authenticated` the full `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,
   TRUNCATE,UPDATE` set, where the repo contract narrows them. This is not
   specific to `processing_jobs` — `matches`, `users`, `points`, `shots`,
   `match_stats` and `program_members` all carry the same stock Supabase
   grants, so the repo's hardening migration never reached production. RLS is
   enabled throughout and gates all DML, and `TRUNCATE` is not reachable through
   PostgREST, so this is a latent hardening gap rather than an active
   vulnerability. It is **pre-existing and out of scope for this feature** —
   `program_event_outcomes`, created by this feature, is correctly narrow
   (`anon` none, `authenticated` SELECT+DELETE only). Worth its own branch.

3. **Test-infrastructure follow-ups** (from T21's runner, not queued): the
   catalog gate's expectations are hand-transcribed and would drift silently — a
   generator needs `supabase/migrations/` to be replayable from empty, which it
   is not (the earliest migration already assumes `public.matches` exists); and
   the local bootstrap procedure (project-dir basename, 553xx port block, env
   vars) is reconstructible only from spec comments.
