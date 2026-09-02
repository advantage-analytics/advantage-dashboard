# Build — team-schedule-db-wiring

**Queue drained.** Fourteen tasks, T13–T26, all `done`. None blocked at close.

## Task statuses

| Task | Model | Status | Landed as |
|---|---|---|---|
| T13 · Seed a verifiable schedule program | fable | done | `ce3ac4e` |
| T14 · Derive the season summary | opus | done | `0b2290e` |
| T15 · Re-point the schedule page at the database | opus | done | `6ec05f5` |
| T16 · Derive the dual widget's outcome rail | opus | done | `4ce3433` |
| T17 · Delete the read path's dormant pair | sonnet | done *(2nd run)* | `72f2738` |
| T18 · Retire the dormant event chooser | sonnet | done | `af323d0` |
| T19 · Tournament builder reads the roster | opus | done *(2nd run)* | `27507cc` |
| T20 · Tournament builder writes | opus | done | `eb3871a` |
| T21 · Dual step one searches real schools | opus | done *(2nd run)* | `ac37438` |
| T22 · Carry the chosen school into step two, format control real | fable | done | `690cc05` |
| T23 · Dual lineup editing and submit | opus | done | `e714873` |
| T24 · Resolve the type-only lifeline | fable | done | `4667ef0` |
| T25 · Confirm the already-live routes still agree | opus | done | `87d399f` |
| T26 · Correct the tests and the map | fable | done | `f45c44a` |

## Commit range

Build: **`ce3ac4e..f45c44a`** — 18 commits, of which 14 are task commits, 3
are `blocked` bookkeeping (below) and 1 is the queue amendment.

Whole workspace including the pipeline stages: `38925dc..f45c44a`, 23 commits.

Scale, task commits only, over `src/`, `tests/` and `scripts/`:
**29 files, +3,689 / −4,928** — net negative, because eleven components were
deleted:

```
schedule-list.tsx        event-detail-pane.tsx    new-event-chooser.tsx
tournament-form.tsx      entry-editor.tsx         dual-form.tsx
school-search.tsx        opponent-rail.tsx        field-row.tsx
lineup-editor.tsx        opponent-name-cell.tsx
```

## Blocked items

**None outstanding.** Three tasks blocked mid-run and were each recovered;
their bookkeeping commits stay in history because the runner commits a
`blocked` status and log entry even when it stashes the work.

| Blocked at | Stage that failed | Cause | Resolution |
|---|---|---|---|
| `842725c` T17 | 5b completion | Criterion 1 grepped all of `src` for two filenames, matching provenance comments in two files **not in the task's own `files:`** — unsatisfiable without violating its own scope | Criterion narrowed to imports and JSX; stash re-applied unchanged (`72f2738`) |
| `69f07b5` T19 | 5a `npm test` | The copy spec pins component *source* for two drawn dates that criterion 3 necessarily interpolates; the spec belonged to T26, which runs last — the task could not pass its own gate at its position | Spec co-owned across T19–T23 (`baa3d0f`); stash re-applied (`27507cc`) |
| `e155e6d` T21 | 5c guardrails | A real defect: `historyForProgram()` fell back to the bare school name, so one squad's dual record rendered on another squad's row | Fallback removed; full gate re-run from scratch (`ac37438`) |

**The first two were defects in the task definitions, not in the work** — both
authored at stage 04, and both the same mistake: a task forbidden from touching
something it necessarily invalidated. `baa3d0f` fixed that at the plan level by
giving `tests/schedule-static-copy.spec.ts` to every task that rewrites a
screen it reads, plus **rule 9** in the queue: *retire, do not weaken* — an
assertion whose literal genuinely left the component is removed with a reason;
one that still holds stays; deleting a failing assertion to get a green run is
not what the rule licenses. That rule then held in both directions for the rest
of the run — T20, T22, T23 and T26 each returned **zero** retirements after
checking, and T21 retired exactly one.

## Gate record

Every task cleared `npm run lint`, `npx tsc --noEmit` and `npm test` before
commit, then `task-completion-reviewer`, then the guardrail reviewers its diff
triggered. Final state: **0 lint errors, 37 warnings** (the queue preamble's
43 is stale), `tsc` clean, **260 tests passing**, `npm run build` green.

Two gate events worth carrying into review:

- **T23's `pipeline-guardrails-reviewer` crashed** with an API error and
  returned partial narration. Under the fail-closed rule a crashed subagent is
  a failure, not a pass, so it was re-run from scratch rather than credited.
- **T26 returned `needs-work` on a scope violation** — `fixtures.ts` was
  restricted to "import graph only" and received doc-comment edits. Reverted
  rather than argued away, then re-gated to a pass.

`rls-boundary-reviewer` ran without live database access on several tasks and
verified from `supabase/migrations/`, which this repo documents as ~100
migrations behind. Where its conclusions depended on a policy or function, the
runner verified those live: `is_program_staff` → `user_program_role` →
`pm.user_id = auth.uid()`; the `program_events` / `program_event_entries`
write policies; `contribute_opponent_player`'s membership guard;
`pooled_roster`'s `roster_public` gate; and the `programs` SELECT policy, which
is **not** the world-readable one its migration describes.

## What the build changed, in one paragraph

All six routes under `/dashboard/team/schedule` now read and write
`program_events`. The three silent-wrong-data traps recorded in
`work/events-lineups/REGRESSION-NOTE.md` §4 are closed — the outcome rail is
derived, the chosen school travels, and the opponent pool is bound to its
school by an unexported `unique symbol` so deduping against the wrong roster is
not expressible. The `"<bestOf>|<adScoring>"` string encoding is gone from both
builders, replaced by tables of literal booleans, closing the guardrails
§3.1/§4 seam that caused a real outage. The dormant tree is gone entirely.

## Carried into stage 06

Findings that no task owned, recorded here because review is where they get
triaged:

1. **Two literals on a live page are false.** `static-schedule.tsx` still
   prints a hardcoded `in 4 days` — observed on an event dated *today* — and
   `· 8 of 9 lines analyzed` directly beneath a computed `1 of 41 lines
   analyzed`. Flagged since T15 and never queued.
2. **The match page claims a point timeline was verified when none exists.** A
   hand-scored line with no job and no `match_stats` renders "Every point below
   has been checked against the final score you entered". This is the page
   every schedule report link lands on.
3. **`processing_jobs` RLS is per-creator**, unlike `matches`. A coach sees
   every line as `no-video` — including jobs their own player uploaded — so the
   season block's coverage figure is viewer-dependent.
4. **`schedule-server.ts` selects `matches.source_provider` and drops it**,
   resolving "no job" as `manual` rather than calling `analysisFor()`. A
   SwingVision import reads `imported` on the matches list and `manual` on all
   four schedule surfaces: §3.2 vocabulary drift at a third call site.
5. **`program_event_entries` has no constraint** tying `player_user_ids` to the
   program's roster; the trust boundary is client-side only. Pre-existing, but
   this feature made `createDual` reachable from a live route for the first
   time.
6. `saveOpponentPlayer` and `benchFromLines` are now uncalled. Bench
   substitution and lineup drag-reorder exist nowhere.
7. Stale prose naming deleted files remains in two route headers, several
   `static/` components, `fixtures.ts`, `roster-match.ts`, `focus.css` and
   `.skills/advantage-analytics-design/SKILL.md`.

## Also consulted

Beyond the declared inputs (`.claude/tasks/claude-new-session-c3f1ab.md`, its
`.log.md`, and `04_tasks/output/tasks.md`): `git log`, `git diff --stat` and
`git stash list` for the commit range, build scale and stash state.

**Stash note.** All three of this feature's stashes were verified by SHA and
dropped once their work landed. Three entries from this branch's *earlier*
`events-lineups` run remain on the shared stack — `blocked: T2`, `T4`, `T6` —
and are not this feature's to clear.
