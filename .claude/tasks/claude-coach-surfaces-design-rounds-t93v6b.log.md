# Run log — claude/coach-surfaces-design-rounds-t93v6b

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · The Team Home frame that never moves — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings, none
  in the changed files), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `task-completion-reviewer` — `VERDICT: pass`, all five criteria met with
  file/line evidence, no out-of-scope changes; it independently confirmed the
  deleted `usage-meter.tsx` had no remaining importers.
  `pipeline-guardrails-reviewer` — ran (the diff is `src/app/dashboard/` and
  `src/components/dashboard/`); clear on every guardrailed surface: the three
  wizard attribution inputs are untouched, workspace scoping unchanged, the new
  "New match" control is role-gated in agreement with `FirstSteps`,
  `canSubmitVideo` still decides link vs. disabled, no user-facing `splitstep`
  string. It noted — explicitly as not a violation, and in answer to a question
  put to it — that remaining hours now sit below the fold when a coach clicks
  "New match", which is what round 45 specifies; server-side quota enforcement
  is unaffected.
  `rls-boundary-reviewer` — skipped: nothing under `src/lib/supabase/`,
  `src/lib/data/`, `src/app/api/` or `supabase/migrations/`, and no new table,
  view or query. Confirmed against both `git diff HEAD --stat` and
  `git ls-files --others --exclude-standard`.
- **changed:** `src/app/dashboard/team/page.tsx` now renders one frame in every
  state — the greeting `<h1>` no longer branches on `empty` ("Nothing here yet"
  is gone from `src/`), a "New match" `advButton("primary")` sits in the header's
  trailing slot gated only on `canUpload` and `active.canSubmitVideo`, and the
  new `src/components/dashboard/team/usage-footer.tsx` renders last in both
  states. `usage-meter.tsx` is deleted rather than left beside its replacement.
  Not carried over from 45a: the "about 25 singles matches" clause (no
  hours-per-match constant exists to derive it from) and the progress bar.

## T2 · Checklist cards flip in place — blocked
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings, none
  in the changed files), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `rls-boundary-reviewer` — ran (the diff touches `src/lib/data/` and adds a
  query); no findings: the new `program_events` read goes through the
  RLS-scoped server client, is filtered on the server-resolved active program,
  and is further constrained by the pre-existing "Events are visible to program
  members" policy; no migrations; `startedAt` adds no query and no new
  sensitivity class.
  `pipeline-guardrails-reviewer` — ran (dashboard UI); clear on every
  guardrailed surface: wizard attribution inputs untouched, workspace scoping
  correct, `canSubmitVideo` and the role gates read from one source across both
  upload entry points, no `splitstep` string, and the progress receipt reuses
  `ANALYSIS_LABEL`/`isWorking` rather than a second status vocabulary. Outside
  its charter it noted that `setPlayersCanUpload`
  (`src/components/dashboard/settings/team-actions.ts:279`) is left dead by the
  dialog deletion.
  `task-completion-reviewer` — **`VERDICT: needs-work`**. This is the stage
  that failed.
- **why it failed:**
  1. Criterion 4 is not met. `emphasis = variants.indexOf("active")` skips a
     `progress` variant, so in the reachable state "report analysing, event
     scheduled, roster built" no card carries `--border-medium` +
     `--shadow-card` + the primary button — zero emphasised cards, where the
     criterion says exactly one. A progress receipt is not yet done, so it is
     "the first card not yet done".
  2. Capability loss. Deleting `invite-dialog.tsx` removed the bulk
     paste-a-list-of-addresses invite flow (`SEPARATORS`, `LOOKS_LIKE_EMAIL`,
     multi-chip input, "Send N invites"). `RosterInviteDialog` and
     `team-settings-form.tsx` cover single-address invites only, so a coach who
     could invite a whole roster in one paste must now add them one at a time.
     `grep -rl "LOOKS_LIKE_EMAIL\|SEPARATORS" src/` comes back empty.
  The reviewer judged the other out-of-guess changes necessary rather than
  creep: the `team-home-server.ts` reads feed card 1's elapsed clock and card
  2's done state, and rendering `FirstSteps` in both states is what makes the
  receipts reachable at all. It confirmed T1's frame is not regressed.
- **stash:** `91cbfcd519f3da568913a1d90a9aefbb6a8d4747` — the full T2 diff
  (`first-steps.tsx`, `team/page.tsx`, `team-home-server.ts`, the
  `invite-dialog.tsx` deletion). Recoverable; nothing was discarded.
