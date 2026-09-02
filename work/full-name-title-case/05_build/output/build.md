# Build report — full-name-title-case

Queue drained. All four tasks `done`; none left `blocked`.

## Task statuses

| Task | Model | Status | Commit |
|---|---|---|---|
| T1 · Add `titleCaseName` and its offline spec | opus | done | `3de2c8f` |
| T2 · Wire the two choke points and correct the TypeScript-side stale comments | sonnet | done | `8c2aecb` |
| T3 · Migration: both definer functions return the full name, with corrected comments | fable | done | `65b0c01` |
| T4 · Live-database regression fence for both functions | opus | done | `d7b1d12` |

## Commit range

`0988f62..d7b1d12` — stage 04's tasks commit to the end of the drain.

```
3de2c8f T1: Add titleCaseName and its offline spec
b948b11 T2: blocked
65b0c01 T3: Migration: both definer functions return the full name
ca4c62d task: scope T2 criterion 4 to programs-server.ts, unblock
8c2aecb T2: Wire the two choke points and correct the TypeScript-side stale comments
d7b1d12 T4: Live-database regression fence for both functions
```

Two of those six are not task work. `b948b11` is bookkeeping for T2's failed
first attempt — status and log only, no code. `ca4c62d` is the human's
amendment to T2's criteria.

## Blocked items

None outstanding. One task blocked and was resolved during the drain:

**T2, first attempt — blocked at the completion gate, `VERDICT: needs-work`.**
Criteria 4 and 5 could not both be satisfied. Criterion 4 required
`grep -rn "First L\.\|D\. Wu\|Elena V\." src/` to return nothing; the last hit
was `src/components/claim/contact-owner-form.tsx:45`, and criterion 5 required
every file under `src/components/claim/` to stay untouched. The defect was in
the task, not the diff — stage 04 named only the two `programs-server.ts`
occurrences and did not check for a third. The implementer honoured criterion 5,
left the hit, and reported the conflict rather than widening scope.

The work was stashed at `57a5bd9`. The human amended criterion 4 to be scoped to
`src/lib/data/programs-server.ts` (`ca4c62d`) and reset the task to `todo`; the
stashed work was restored verbatim, re-gated in full, and landed at `8c2aecb`.
The stash was dropped once the work was in history — it had shifted to
`stash@{1}` by then, another worktree having pushed one in between, so it was
found by tag and matched against its recorded SHA rather than popped.

## Gate results

Every task cleared all three stages. Mechanical was `npm run lint`,
`npx tsc --noEmit` and `npm test` on each, plus `npm run build` on T2.
The suite went 313 → 315 (T1 added 12 offline cases inside the existing count;
T4 added 2 live-database tests).

`rls-boundary-reviewer` ran on all four — every task touched `src/lib/data/`,
`src/app/api/`, `supabase/migrations/`, or issued live queries — and returned
clean each time. `pipeline-guardrails-reviewer` was skipped on all four: no
task touched `src/app/dashboard/`, `src/components/dashboard/`, or the upload
wizard.

## Two things the runner verified itself rather than accepting on report

**T3's subagent returned a classifier security warning**, and it had applied DDL
to the production database. The live state was checked directly: both functions
still `security definer`, `stable`, `search_path` pinned; signatures and
`owner_display text` unchanged; the full-name expression present and no
`left(…, 1)` abbreviation remaining; the `case when u.id is null` wrapper intact;
`search_programs` still carrying its `org_type = 'college'` filter in both
branches; grants `anon`/`authenticated`/`postgres`/`service_role` with no
`PUBLIC`. The migration file holds exactly eight statements — two
`create or replace`, two `revoke`, two `grant`, two `comment` — and no data or
drop statement.

**T4's spec writes fixture rows to production.** Cleanup was verified against
live after the run rather than taken on the subagent's word: zero `programs`
rows matching the fixture key prefix or school name, zero `public.users` rows
carrying the fixture names, zero `auth.users` matching the fixture email
pattern.

## Deviation from the runner's procedure, recorded

T2's second attempt dispatched **no subagent**. Its work already existed in the
tree — restored from the stash after the human's amendment — and had already
been reviewed against the four criteria that were never in dispute.
Re-dispatching would have regenerated reviewed code and risked different comment
wording for no gain, so the full gate was run on the restored diff instead. Both
reviewers re-ran fresh against the amended contract rather than carrying the
earlier verdict forward.

## What is not covered by the drain

Stage 03's step 5 — the six end-to-end checks against the ZZ Test Program — was
deliberately not made a task: it has no files, so `task-completion-reviewer`
would have nothing to judge. It belongs to stage 06, and the list is in
`../03_plan/output/plan.md`. The fourth check is the one that matters most:
`/claim/program?intent=join` must still show "On Advantage" with no owner name
in the network response. Every other regression here is visible; that one is not.

## Follow-ups raised during the drain, none queued

1. `src/components/claim/contact-owner-form.tsx:45` still reads
   `/** "Elena V." — named so the confirmation can say who was told. */`, which
   now describes behaviour the product no longer has. Deliberately outside this
   branch's scope.
2. The migration file is named `20260902091500` but `apply_migration` recorded it
   live as version `20260902161134`, so a local `supabase migration list` would
   read the file as unapplied.
3. Live also carries `20260902153430 claim_roles_vocabulary` and
   `20260902161208 claim_roles_drop_operations`, which exist in neither this
   worktree nor the main checkout — almost certainly a concurrent session in
   another worktree. Noted so a later reader is not surprised.
4. `titleCaseName` uppercases a given name spelled only from `i`/`v`/`x`
   (`Vivi` → `VIVI`), a documented and accepted consequence of the roman-numeral
   rule the human chose at stage 04.
5. `tests/fixtures/live-db.ts` could export a `createAnonClient()` beside
   `createAdminClient()`; two specs now hand-roll the same three lines.
6. Migration `20260817074759`'s header still describes design screen F3.3 as
   reading "Elena V. manages Advantage here".

Full per-task detail, including each gate verdict, is in
`.claude/tasks/claude-full-name-title-case-2efeba.log.md`.
