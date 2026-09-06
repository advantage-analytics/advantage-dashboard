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

## T3 · Scope home Serve Placement widget to personal matches — done
- **gate:** lint clean · `tsc --noEmit` clean · `npm test` clean (no stale
  `.next/` re-run needed). `task-completion-reviewer`: VERDICT: pass, all three
  criteria met; it also confirmed the note held — the other three
  serve-placement components are absent from the diff.
  `pipeline-guardrails-reviewer`: ran (diff touches
  `src/components/dashboard/`) — explicitly clean, no findings against any
  guardrail category; it notes this is a surface where wrong attribution would
  be visually silent, and that the fix propagates through the `shots` read
  rather than stopping at the matches query. `rls-boundary-reviewer`: ran (a
  browser-client Supabase query change) — explicitly clean; it confirmed the
  follow-on `shots` read is safe by construction because it keys off the
  already-narrowed match ids rather than carrying its own predicate.
- **changed:** `src/components/dashboard/home/serve-placement-home.tsx` — the
  browser-client `matches` query gains `.is("program_id", null)` after
  `.eq("created_by", userId)` and before `.order(...).limit(4)`, with T1's
  comment. The `shots` read and the empty-result early return are untouched.

## T4 · Add program clause to the personal activity-tray branch — done
- **gate:** lint clean · `tsc --noEmit` clean · `npm test` clean (includes
  `tests/activity-tray-detail.spec.ts`, 7 passed; no stale `.next/` re-run
  needed). `task-completion-reviewer`: VERDICT: pass — it verified the first
  criterion from the post-diff source rather than the diff, confirming
  `created_by` survives. `rls-boundary-reviewer`: ran (diff touches
  `src/lib/data/`) — no issues in the diff; it confirmed the change is
  additive not substitutive, that the embedded-resource `.is()` filter matches
  the mechanism the team branch already uses one line above, and that the
  `!inner` join's row-dropping semantics are unchanged.
  `pipeline-guardrails-reviewer`: skipped — the diff touches neither
  `src/app/dashboard/`, `src/components/dashboard/`, nor the upload wizard.
- **changed:** `src/lib/data/activity-server.ts` — `getActivityFeed()`'s personal
  branch is now `.eq('created_by', workspace.id).is('matches.program_id', null)`.
  The program clause is ADDED to the job scope, not substituted for it, which
  is the trap this task was written around. The stale comment claiming
  `program_id` "does not exist until the program migrations land" is gone
  (`grep -n "does not exist until"` returns nothing); its replacement states
  what the two clauses mean together and notes RLS cannot supply the second.
  The team branch and the `matches!inner(...)` projection are byte-identical.
- **follow-ups:**
  1. The RLS reviewer could not close one point without DB access: whether the
     one live job whose submitter differs from its match owner still survives
     the new filter. **The runner closed it directly against the live database**
     — that job is `2a11168d-9021-4822-9b40-c1afe7cddf82`, its match carries
     `program_id IS NULL`, so it is not re-hidden from its submitter. Verified,
     not inferred; recorded here because it is the exact failure the file's
     header comment exists to prevent.
  2. `tests/activity-tray-detail.spec.ts` covers only `trayDetail`'s
     pluralization — nothing exercises `getActivityFeed()`'s workspace scoping.
     A test with a fake query builder asserting both clauses land on the
     personal branch would make a future substitution catchable; today only a
     human reading the query would notice.

## T5 · Add personal-home-scope regression spec — blocked
- **gate:** lint clean · `tsc --noEmit` clean · `npm test` clean (430 passed,
  including the new spec running live, 6/6). **`task-completion-reviewer`:
  VERDICT: needs-work** — stage 5b, so 5c never ran.
  Four of the five criteria are met and it verified the three mirrored query
  shapes field-for-field against the real source. The fifth failed on its last
  clause only.
- **why blocked:** criterion 5 asks the runner to record "that temporarily
  removing one predicate **from source** turned the matching assertion red."
  That is **structurally impossible for this kind of test**, and the reviewer
  says so itself: the spec issues its own copy of each query rather than
  calling the loader — which is exactly why it also could not be written
  red-first — so editing the source alone can never turn it red. The
  implementer did the honest thing: removed the predicate from source *and*
  mirror, watched that assertion go red, restored both (`git diff src/` clean),
  and wrote the limitation into the doc comment instead of claiming the
  stronger result. The reviewer called that "the right response to an
  unsatisfiable spec" and still could not mark the literal item met. Correct
  per fail-closed: anything other than `VERDICT: pass` blocks, and the runner
  does not get to triage.
  Secondary artifact worth noting: the criterion says "the runner's notes
  record…", but the runner's notes are this log entry, written *after* the
  gate — so the gate can never see them. The criterion asks the reviewer to
  verify something that does not exist yet at review time.
- **stash:** 17afbb1705ead31726e90dd8fa9a59c317534ce4 (`blocked: T5`) — carries the whole new
  `tests/personal-home-scope.spec.ts`, untracked, recovered with
  `git stash apply 17afbb1705ead31726e90dd8fa9a59c317534ce4`. Nothing was discarded.
- **what would unblock:** the author amends T5's fifth criterion to ask for
  what a mirror test can actually show — e.g. "the doc comment states the
  limitation that editing source alone cannot turn this red, and records the
  both-sides removal that was observed red at authoring time" — then resets
  `status:` to `todo`. The work itself is finished and passing; only the
  contract is wrong.

## T5 · Add personal-home-scope regression spec — done (re-run after unblock)
- **gate:** lint clean · `tsc --noEmit` clean · `npm test` clean (430 passed,
  including this spec live 6/6). `task-completion-reviewer`: **VERDICT: pass**
  — all five criteria met, with the mirrored query shapes verified
  field-for-field against all four source sites, and `git diff HEAD -- src/`
  empty. `rls-boundary-reviewer`: ran (the spec uses the service-role client
  and writes to the live database) — **no blocking findings**; it confirmed
  every scoping assertion reads through the signed-in anon client rather than
  the admin one (an admin-client assertion would have made the spec vacuous),
  that teardown deletes in an FK-safe order and self-verifies, and that no
  secret-bearing module becomes reachable from client code.
  `pipeline-guardrails-reviewer`: skipped — the only new file is under
  `tests/`, touching neither `src/app/dashboard/`, `src/components/dashboard/`,
  nor the upload wizard.
- **changed:** `tests/personal-home-scope.spec.ts` (new, 6 tests). Nothing else
  — the subagent this run was dispatched to VERIFY the restored work, not
  rebuild it, and changed nothing.
- **why this needed a second run:** the first attempt was gated `needs-work`
  on criterion 5 alone, which as originally drafted asked for two impossible
  things — that removing a predicate *from source* turn the mirror red (it
  cannot; the spec issues its own copy of each query), and that "the runner's
  notes" record it (they are written after the gate, so a reviewer can never
  see them). The code was correct and passing throughout. The human amended
  criterion 5 to ask for what the file can actually show, restored the stashed
  work, and reset the task to `todo`. Stash `17afbb1705ead31726e90dd8fa9a59c317534ce4`
  is now redundant and can be dropped.
- **follow-ups:**
  1. The mirror's structural weakness is documented, not fixed. The durable
     version is a shared `personalMatchesQuery(client, userId)` helper that
     both the four call sites and this spec call, so a dropped predicate turns
     the spec red from a source edit alone. That is a refactor across four
     files — its own branch, per the branch-scope rule.
  2. Coverage gap the RLS reviewer flagged as an observation, not a defect:
     the tray's team-branch test cannot distinguish "correctly program-scoped"
     from "RLS let the creator see their own row anyway", because the querying
     athlete created both jobs. `processing_jobs` RLS is `created_by`-only by
     design (the row carries a live video token). Proving the team branch
     properly would need a second member — a coach or staff user — in the
     fixture.
