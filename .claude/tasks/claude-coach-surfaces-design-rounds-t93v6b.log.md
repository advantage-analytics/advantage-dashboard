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

## T3 · Score and outcome primitives — superscript tiebreak, ResultMark — blocked
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 93 passed.
  `rls-boundary-reviewer` — ran (the diff touches `src/lib/data/`); no findings:
  the widened types expose nothing new, since the tiebreak arrays already
  travel inside the `matches.score` JSONB that existing loaders select
  wholesale; no loader, migration or query in the diff; the new
  `format.ts` → `score-line.tsx` import is safe in both bundle directions.
  `pipeline-guardrails-reviewer` — ran (dashboard UI); no findings. It verified
  the tiebreak convention against the writers rather than the implementer's
  word: `single-score-entry.tsx:50-57` writes the number to the loser's slot,
  and `match-summary-row.tsx:219-222` already reads it that way, so the
  convention predates this diff. `tiebreakOf()` has no fallback to the winner's
  slot, so a misplaced value renders nothing rather than a wrong number. The
  orientation swap flips games and both tiebreak arrays from one boolean, so it
  cannot split a tiebreak from its set.
  `task-completion-reviewer` — **`VERDICT: needs-work`**. This is the stage that
  failed.
- **why it failed:**
  1. Criterion 1, second half. Schedule surfaces (`line-row.tsx`, and the hero
     score on `single-detail.tsx`) now render `6-4, 6-2` where they rendered
     `6–4 6–2` — en dash, space-joined — before. The criterion says a set with
     no tiebreak "renders exactly as it does today", with no carve-out for
     consolidation. The change is deliberate and well argued (it adopts the
     spelling the round-44 artboards and two of the three existing formatters
     use), but it is a literal miss.
  2. Criterion 3, second clause. `match-summary-row.tsx:219-244` still carries
     its own implementation of the same tiebreak-superscript rule — reads the
     loser's field, renders a raised digit — and does not import from
     `score-line.tsx`. That is a second copy of the tiebreak rule surviving in
     `src/`, which the criterion rules out. The implementer had judged it a
     boxed per-set scoreboard rather than a score line and left it alone.
  The reviewer judged every out-of-guess file necessary rather than creep, and
  confirmed `resultInk()` was left in place rather than deleted, per
  instruction. It also corrected one of the implementer's citations:
  `edit-match-dialog.tsx:42-43` is a type declaration, not the encoding
  comment it was cited as.
- **stash:** `4860c8d05b92bffb0e68219b879451271f70703a` — the full T3 diff, both
  new components included. Recoverable; nothing discarded.
- **also noted, outside this diff:** `swingvision-parser.ts` fills
  `hostTiebreak`/`guestTiebreak` straight from spreadsheet columns without the
  loser-only zeroing the manual-entry paths do. Harmless today because
  `tiebreakOf()` never reads the winner's slot, but it is a latent question for
  whoever owns the parser. `buildScoreString()` in
  `src/app/dashboard/(home)/recent-activity.tsx:127` is a fifth score spelling,
  carrying no tiebreak rule, left unconverted.

## T2 · Checklist cards flip in place — done (second attempt)
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings,
  none in the changed files), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `rls-boundary-reviewer` — ran (`src/lib/data/`, plus invite writes moving
  surface); no findings. The client never sends a program id: both
  `setPlayersCanUpload` and `inviteMember` resolve it server-side from the
  session workspace, and `update_program_settings` / `create_program_invite`
  are `SECURITY DEFINER` functions that re-check `is_program_staff` and raise
  `42501` otherwise — so relocating the controls to Roster cannot widen who may
  write, and the bulk loop cannot target another program.
  `pipeline-guardrails-reviewer` — ran (dashboard UI); clear on every
  guardrailed surface. It noted, as pre-existing rather than a regression, that
  the players-can-upload switch, the Roster footer and Settings › Team state
  one boolean three different ways — now visible on one screen rather than two.
  `task-completion-reviewer` — **`VERDICT: pass`**, all six criteria met.
- **changed:** the three first-steps cards now flip in place — active →
  progress receipt (StatusChip + mono elapsed) → done receipt (plain 15px
  check, `--ink-500`, one quiet link) — holding their slots, and the row
  unmounts in one step once all three are done. `emphasis =
  variants.findIndex(v => v !== "done")` puts emphasis on the first card that
  is not done, progress receipts included; the reviewer enumerated the states
  and found exactly one emphasised card in every one that renders.
  `team-home-server.ts` gained `TeamMatchRow.startedAt` (a free projection) and
  a `nextEvent` read from `program_events` inside the existing `Promise.all`.
- **on the deleted dialog:** the first attempt's deletion of
  `invite-dialog.tsx` stands, but its bulk paste-a-list flow is folded into
  `RosterInviteDialog` rather than lost — separators, email-shape filter,
  dedupe, removable chips, Backspace-eats-last-chip, "Send N invites",
  sequential send, the delivered/undelivered split and the players-can-upload
  switch were all compared against `ea2bcd6` and are present. Reachability is
  the same population (`role !== "player"`) and strictly more states: the old
  dialog vanished once the program had a match, the Roster one never does.
  `setPlayersCanUpload` has a caller again, with `ROSTER_PATH` revalidation.
- **follow-up left open:** `.skills/advantage-analytics-design/SKILL.md:744`
  still cites `team/invite-dialog.tsx` as its reference example for the
  `has-[input:focus-visible]` pattern, and that file no longer exists. A stale
  doc pointer, out of this task's scope, not fixed here.
