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

## T4 · Round-44 row treatment on Team Home — blocked
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings,
  none in the changed files), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `pipeline-guardrails-reviewer` — ran (dashboard UI); no findings. It checked
  the things that would matter rather than assuming: the row's
  `href={/dashboard/matches/${match.id}}` and `key` are byte-identical, so no
  row can point at the wrong match; `dotColor()` still calls the shared
  analysis predicates with an unedited body; `match.label` still comes from
  `ANALYSIS_LABEL` in the untouched loader; the `isStaff` gate is unchanged and
  the new Roster destination derives the same role predicate, with
  authorisation still enforced by `is_program_staff` in SQL.
  `rls-boundary-reviewer` — skipped: the diff is two component/page files, no
  `src/lib/data/`, `src/lib/supabase/`, `src/app/api/` or migration, and no new
  query. Confirmed against both `git diff HEAD --stat` and
  `git ls-files --others --exclude-standard` (nothing untracked).
  `task-completion-reviewer` — **`VERDICT: needs-work`**. This is the stage
  that failed, and it is the only one that did.
- **why it failed:** all four criteria are met — the reviewer verified the
  geometry arithmetic (14px card radius − 6px list inset = the row's 8px
  radius, genuinely concentric), that `focus.css` already rings `a[href]` so no
  ring utility was needed, that nothing escapes the corners without
  `overflow-hidden`, that the `ROW` constant and all four cell spans are
  byte-identical, that the `RosterProgress` import is type-only, and that
  `roster.invited - roster.joined` really is `outstanding.length` rather than a
  misleading figure. What sank it is scope: the added
  `<h2 class="eyebrow">Recent matches</h2>` is new user-visible copy that no
  criterion and no line of the design reference asked for. Criterion 2 —
  "one hairline sits above the list only" — is satisfiable by putting the rule
  on the `<ul>` or `<section>` directly; the "a bare line reads as a rendering
  fault" argument is aesthetic, not a logical requirement. The implementer
  flagged it as its one judgement call, which is the right instinct; it should
  have been asked rather than shipped.
- **stash:** `111732d2f04500cf1e820342e95b7ec1b8f76ce1` — the full T4 diff, both
  files. Recoverable; nothing discarded. Everything except the header stands.
- **also noted, outside this diff:** `roster-table.tsx:312` and `:539` still use
  the old treatment — full-bleed wash with `border-b` hairlines between rows,
  and a comment at `:498` defending the full-bleed. Roster is a result list, so
  round 44's rule arguably applies there too. Left alone, correctly, as outside
  T4's scope.

## T3 · Score and outcome primitives — second attempt — blocked
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 93 passed.
  `rls-boundary-reviewer` — no findings. It diffed the query sites to show the
  `program_id` / `created_by` scoping is byte-identical, confirmed
  `match-detail-server.ts` already destructured the tiebreak arrays so the type
  widening only catches TypeScript up to data already flowing, and read the new
  `src/lib/ui/score-format.ts` to confirm it is directive-free with zero
  imports and so cannot cross a bundle boundary either way.
  `pipeline-guardrails-reviewer` — **one finding** (below). The wizard is
  clean: `validateSetScore`'s branching is byte-for-byte unchanged, only a
  comment and one validation message swapped en dash for hyphen, and
  `PinnedMatchContent` is display-only and not wired to `job-request.ts`.
  `initialTopPlayerIsPlayer1`, set-score ordering and the games-not-points
  encoding are untouched. ResultMark keeps "Won"/"Lost" as `sr-only`, and no
  surface shows both a glyph and a word.
  `task-completion-reviewer` — **`VERDICT: needs-work`**.
- **why it failed:**
  1. Criterion 2 is not met. `opponents-server.ts:374,400` calls
     `buildScoreString(score, true)` without the `.replaceAll(" ", ", ")` its two
     sibling callers apply, so `/dashboard/opponents/[programId]` still renders
     the space-joined `6-4 3-6 7-5`. **This is a conflict between criteria, not
     an oversight**: completing the consolidation means editing three loader
     call sites, and criterion 6 forbids a `*-server.ts` file in the diff. The
     implementer took criterion 6 as binding, rewired `buildScoreString` onto
     the shared rule and marked it `@deprecated` naming the three lines. That is
     the right call given the instruction; the criteria need reconciling.
  2. Guardrails finding: dropping `match-summary-row`'s
     `mine === 7 && theirs === 6` clause makes the superscript apply to sets
     that are not 7-6. A super-tiebreak third set stored `1-0` with the loser's
     `[8]` used to render a bare `1` and now renders `1` with a raised `8`.
     Worth knowing: this is **not** specific to that file — `tiebreakOf()` never
     had a games gate, so every converted surface already behaves this way, and
     the change brings the scoreboard into line with the shared rule rather
     than diverging from it. The completion reviewer examined the same code and
     ruled criterion 5 **met** on exactly that reasoning, adding that keeping
     the guard would itself be a second copy; it also verified all three
     writers null-default the field, that the wizard cannot produce a non-7-6
     set carrying a tiebreak, and that the only path that can is deliberate
     freeform entry in `score-entry.tsx`. The two reviewers differ in emphasis,
     not in fact.
- **stash:** `c449df8e2e5fe730a9b5d359074d9ce9a3a101fd` — the full rerun,
  including the three new files. Recoverable; nothing discarded. Everything
  except the `opponents-server.ts` spelling stands.
- **what this attempt did land:** the shared rule now lives in
  `src/lib/ui/score-format.ts` (lib→lib, so the earlier `lib/` → `components/`
  import inversion is gone), six private formatters are collapsed into it, and
  `match-summary-row` imports the rule while keeping its boxed layout.
- **orphans, reported not deleted:** `resultInk()`
  (`match-analysis.ts:244`), `formatScore()` (`schedule/format.ts`), and the
  `tiebreak?: boolean` field, which lost its last reader in this change but is
  still written by loaders.

## T4 · Round-44 row treatment on Team Home — done (second attempt)
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings,
  none in the changed files), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `pipeline-guardrails-reviewer` — no findings, nothing regressed: the row's
  `href={/dashboard/matches/${match.id}}` is byte-identical, `dotColor()` still
  calls the shared analysis predicates unmodified, `match.label` still comes
  from the shared vocabulary, and extracting `PendingInvites` did not move or
  duplicate the `isStaff && roster.invited > roster.joined` guard.
  `rls-boundary-reviewer` — skipped: two component/page files, no
  `src/lib/data/`, `src/lib/supabase/`, `src/app/api/` or migration, no new
  query. Confirmed against both `git diff HEAD --stat` and
  `git ls-files --others --exclude-standard`.
  `task-completion-reviewer` — **`VERDICT: pass`**, all five criteria.
- **changed:** Team Home's match list is a `<section>` carrying the only border
  in play; rows hover to a `--surface-muted` wash on a rounded rect inset 6px
  by the list's `p-1.5`, so the row's 8px corners sit concentric inside the
  card's 14px radius. Every hairline inside the card is gone — between rows and
  under the header alike — with whitespace doing the separating. The card is
  headed `<h2 class="eyebrow">Matches</h2>`, the design's own label. The
  pending-invites line became a `PendingInvites` component pointing at
  `/dashboard/team/roster` and saying to resend from there.
- **on the count:** left out deliberately, and the reviewer verified why —
  `RECENT_MATCH_LIMIT = 6` caps the matches query, so `matches.length` would
  render the page's fetch cap while reading as the program's match count. A
  truthful total needs a loader change, which criterion 4 forbids. The
  criterion made the count optional for exactly this kind of reason.
- **what the first attempt got wrong:** only the header — "Recent matches"
  instead of the design's `Matches`, and a `border-b` under it. Everything else
  in that attempt passed review both times.
- **follow-up left open:** `roster-table.tsx` still uses the old treatment —
  full-bleed wash with `border-b` hairlines between rows, and a comment
  defending the full-bleed. Roster is a result list too, so round 44's rule
  arguably applies there. Out of scope here; worth its own task.

## T3 · Score and outcome primitives — done (third attempt)
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings,
  none in the changed files), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `rls-boundary-reviewer` — ran (two `*-server.ts` files entered the diff under
  the amended criterion); nothing regressed. Each loader has exactly one hunk,
  dropping only the `.replaceAll`; the `cache()` wrapper, every `.select()`,
  filter and `.order()`, and the workspace scoping are untouched and absent
  from the diff. `buildScoreString` keeps its guard and its `""` on a malformed
  score. The three new files are directive-free and pure.
  `pipeline-guardrails-reviewer` — ran; no new findings. The wizard is clean
  again (`validateSetScore` byte-for-byte unchanged, only string literals
  moved; `PinnedMatchContent` display-only, not wired to `job-request.ts`). It
  traced digit orientation through `transformDbMatch` and confirmed
  `tiebreakOf()` is symmetric on winner/loser rather than on the viewer, which
  is what keeps the digit on the correct row. Its earlier finding was
  sanctioned by the author and is now criterion 9.
  `task-completion-reviewer` — **`VERDICT: pass`**, all nine criteria. It swept
  every remaining en dash in `src/` and confirmed each is a different quantity
  — team scores, win-loss records, shot ranges, 0–100 composites, date ranges,
  placeholder dashes — not a set score.
- **changed:** one score/outcome vocabulary now, defined in
  `src/lib/ui/score-format.ts` (`GAME_SEPARATOR`, `SET_JOINER`, `tiebreakOf`,
  `formatScoreText`, `scoreSetsFrom`) with `<ScoreLine>` and `<ResultMark>` as
  the renderers. Six private formatters are gone. `match-summary-row` imports
  the rule and keeps its boxed layout. `/dashboard/opponents/[programId]` picks
  up the canonical spelling for free — `opponents-server.ts` has an empty diff.
- **the two author decisions this attempt encodes:** criterion 6 now permits a
  loader *call-site* edit (no query, column, shape or logic), which is what
  made the three-line spelling fix reachable at all; and the superscript stays
  ungated on game count, so a super-tiebreak stored `1-0` with the loser's `8`
  renders `1⁸` — the shared rule's long-standing behaviour on every surface.
- **orphans, reported not deleted:** `resultInk()` (`match-analysis.ts:244`),
  `formatScore()` (`schedule/format.ts`), and the `tiebreak?: boolean` field,
  which lost its last reader but is still written by loaders.
- **noted, outside this task:** `performance-server.ts:448` has its own score
  formatter. It already matches the canonical spelling and never renders
  tiebreaks, so it breaks no criterion, but it is a seventh place that formats
  a score.
