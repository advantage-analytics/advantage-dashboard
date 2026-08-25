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

## T6 · Roster rows take the round-44 treatment — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings,
  none in the changed file), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `pipeline-guardrails-reviewer` — ran (dashboard UI); no findings. It diffed
  out comments and class strings to show every remaining changed line is a
  Tailwind constant or a `className`: no JSX element type, prop, handler,
  `href` or import moved. The name link still points at
  `/dashboard/team/roster/${member.playerId}`, Resend, Withdraw, Upload and the
  row menu are byte-identical, and `canManage` is still computed once on the
  page and passed in.
  `rls-boundary-reviewer` — skipped: one component file, no `src/lib/data/`,
  `src/lib/supabase/`, `src/app/api/` or migration, and no new query. Confirmed
  against both `git diff HEAD --stat` and
  `git ls-files --others --exclude-standard` (nothing untracked).
  `task-completion-reviewer` — **`VERDICT: pass`**, all four criteria.
- **changed:** the Roster table's member and invite rows take round 44's 8a
  hover — a `--surface-muted` wash on a rounded rect inset from the card edge —
  and lose their between-row hairlines. The invite row had no hover at all
  before and gains one. The column-header rule stays, because it heads a table
  rather than following an eyebrow.
- **the two deviations from T4's worked example, both upheld on review:**
  alignment is paid for out of the row's own padding (`px-6` → `px-[18px]` plus
  `mx-1.5`) rather than `match-rows.tsx`'s `p-1.5` on the list, because a list
  inset would have pushed every cell 6px right of the un-inset header — the
  reviewer redid the arithmetic and confirmed 6+18 = 24 per side matches the
  header's `px-6`, on both row shapes. And focus keys on
  `has-[:focus-visible]` rather than `focus-visible:`, because this row is not
  itself the anchor: the name link stretches it with `after:inset-0` while
  Upload and the overflow trigger are separately focusable. It adds a wash on
  top of each control's existing ring, so no duplicate ring and no tab-order
  change.
- **also:** two comments defended the full-bleed wash, not the one the task
  named. Both now describe what the code does.

## T7 · Clear what rounds 44 and 45 left behind — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings,
  none in the changed files), `npx tsc --noEmit` clean, `npm test` 93 passed.
  `rls-boundary-reviewer` — ran (the diff touches `src/lib/data/`, including a
  `*-server.ts`); no findings. It checked the failure mode that would have been
  quiet: both `buildSets` and `transformDbMatch` build their sets as explicit
  field-by-field literals with no `...row` spread, so dropping the field
  narrows the shape and cannot let a raw database row through in its place. The
  query, the `getWorkspaceContext()` scoping and the player-id ownership check
  around `buildSets` are outside the diff and unchanged.
  `pipeline-guardrails-reviewer` — skipped: no `src/app/dashboard/`,
  `src/components/dashboard/` or wizard file in the diff. Confirmed against
  both `git diff HEAD --stat` and `git ls-files --others --exclude-standard`.
  `task-completion-reviewer` — **`VERDICT: pass`**, all five criteria.
- **changed:** `resultInk()` and `formatScore()` are gone, along with the
  `tiebreak?: boolean` field — both declarations and both writers. Nothing
  rendered differs: the field lost its last reader when `ScoreLine` took over,
  and the reviewer re-checked every `SetScore` and `score.sets` consumer for a
  spread, destructure or `JSON.stringify` that would have carried it unnamed.
- **criterion 4 could not be met as written, and that was the criterion's
  fault, not the work's.** It asked that `SKILL.md:744` cite a file that
  exists. None does: T2 deleted the only file demonstrating the
  `has-[input:focus-visible]` wrapper-ring pattern, and its replacement puts
  chips above an underline field instead of inside a bordered box. The one
  surviving `has-[…focus-visible]` is T6's row wash, which is not `input:`
  scoped — citing it would be a false example. The cell now reads
  `none in src/ today`, which the reviewer verified independently and judged
  the correct discharge.
- **not removed, deliberately:** `buildScoreString` in `match-utils.ts`. It has
  three live loader callers and delegates to `formatScoreText`, so it is a
  row-shape adapter rather than a second spelling — the reviewer agreed it
  satisfies criterion 2 rather than breaking it.

## T8 · Results in the Team Home rows — blocked
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 93 passed.
  `rls-boundary-reviewer` — ran (new columns and a new RPC); no findings. It
  checked the thing that would have been an RLS bypass wearing a function
  signature: `program_roster_full` is `SECURITY DEFINER`, but every one of its
  three `UNION ALL` branches ends `and p_program_id in (select
  public.user_program_ids())`, derived from `auth.uid()` — a non-member passing
  any id gets zero rows. It also established that the new person identifiers
  never leave the server: `player1_id`/`player2_id` are consumed inside
  `programSide()` and discarded, and the RPC's rows are reduced to a bare
  `Set<player_id>` before use, so names, emails and roles stay in the loader.
  `pipeline-guardrails-reviewer` — ran; clean on the misattribution question.
  It traced every writer of the three columns: the wizard always resolves
  `player1_id` to the roster pick regardless of who won, `recordResult` never
  touches `player2_id`, and `opponent_player_id` exists precisely because
  `player2_id` sits in the matches SELECT policy — an opponent there would hand
  them read access. The only other writer of `player2_id` is
  `merge_program_players`, which re-points ids inside one roster. So the glyph
  cannot flip through either channel.
  `task-completion-reviewer` — **`VERDICT: needs-work`**. This is the stage
  that failed, on one criterion.
- **why it failed:** criterion 4 asserts the column tracks are unchanged. They
  are not: `…_150px_120px` became `…_162px_72px_84px`, a fifth track with the
  fluid columns absorbing 46px. **The criterion is the thing at fault, not the
  work** — criterion 2 requires a glyph, a score *and* a report affordance in a
  cell that was 150px wide with no slot for the third, so 2 and 4 contradict
  each other geometrically. The reviewer reached the same reading independently
  ("very plausibly a necessary consequence of criterion 2") and correctly
  declined to soften a stated criterion. Row height and every part of T4's
  treatment — hover, inset, eyebrow, padding, no hairlines — are preserved and
  were verified.
- **what passed, and is worth keeping:** the attribution rule, which is the
  dangerous part of this task. Roster id first, then a set `event_entry_id`
  implying player1, then `null` and **no glyph at all** rather than a guess.
  Both reviewers verified all three premises against the writers themselves
  rather than against the reasoning, and confirmed title, sets and `won` all
  key off one `side` value, so a flipped score cannot appear under an
  unflipped name.
- **one real inaccuracy to fix on the rerun:** the code comment claims only
  `recordResult` writes `event_entry_id`. The upload wizard writes it too
  (`useUploadMatchWizard.ts:1130`). The invariant holds — the wizard resolves
  `player1_id` to the same roster pick a preset implies — but a comment that
  overstates which writers exist is the comment someone later trusts instead of
  re-checking.
- **stash:** `a4ec547032a5e53b173763e39e88a9fb6da87c63` — the full T8 diff.
  Recoverable; nothing discarded.

## T8 · Results in the Team Home rows — done (second attempt)
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 93 passed.
  `task-completion-reviewer` — **`VERDICT: pass`**, all five criteria. It went
  past the claims twice over: it grepped for every writer of `event_entry_id`
  and found the two the comment names plus a DB trigger blocking the column
  from changing on UPDATE, so no third writer can exist; and it re-derived the
  track arithmetic (270 → 318 is 48px, plus one more 16px gap = 64px) and
  checked each per-track figure against the actual JSX classes.
  `pipeline-guardrails-reviewer` and `rls-boundary-reviewer` — **not re-run,
  deliberately.** Both cleared this diff on the first attempt, and the rerun
  changed comments only: `git diff a4ec547 -- src/` yields zero non-comment
  changed lines, so the executable code they reviewed is byte-identical.
  Their first-attempt results stand and are recorded above under
  "T8 — blocked": the RPC re-derives membership from `auth.uid()` rather than
  trusting its argument, the new person identifiers never leave the server, and
  every writer of the three columns was traced to confirm the glyph cannot
  flip.
- **changed:** Team Home's match rows now show a result. `TeamMatchRow` carries
  `sets` and `won`, built in the loader from `matches.score` (newly selected,
  with `player1_id`, `player2_id` and `event_entry_id` alongside it) and
  oriented to the program's side. A settled row renders `<ResultMark>` +
  `<ScoreLine>` and, when the analysis is actually ready, a "View report"
  affordance; an in-flight or failed row keeps its dot and `ANALYSIS_LABEL`.
- **the rule this task turns on**, in `programSide()`: a roster id in either
  player column means the row is ours; failing that, a set `event_entry_id`
  means our side is `player1`; otherwise `null` and **no glyph at all**. The
  third clause is the point — a row nobody can attribute shows a score and no
  mark, because a row with the wrong mark looks exactly like a row with the
  right one.
- **two deliberate narrowings of criterion 2, both upheld:** a failed row keeps
  its dot rather than showing a score, because burying "Failed" under a result
  hides a job nobody will retry; and "View report" appears only when
  `isAnalysisReady`, so a hand-scored dual line gets a mark and a score but no
  link to a page of zeroes.
- **what the first attempt failed on:** criterion 4 forbade the column-track
  change criterion 2 requires — a defect in the criteria, corrected in
  `63dd69b`, not a defect in the work. The rerun added the track reasoning and
  fixed a comment that named only one writer of `event_entry_id`.

## T9 · This weekend — the dual sheet — blocked
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 93 passed.
  `task-completion-reviewer` — **`VERDICT: pass`**, all five criteria.
  `rls-boundary-reviewer` — no findings. It read the policies rather than the
  comments asserting parity: Team Home's card and the schedule page call the
  same `cache()`d `getEventDetail()` under the same cookie session, so the
  `matches` policy that row-filters a `player` to their own line when
  `roster_visible` is off applies identically on both. It also confirmed the
  widened read cannot be steered — `eventId` comes only from already-scoped
  rows — and that no person identifier reaches the client.
  `pipeline-guardrails-reviewer` — clean on misattribution, having traced every
  writer that can populate a line, confirmed doubles work off the game arrays
  rather than the deliberately-null `player1_id`, and confirmed both silences
  render no glyph. **But it raised one finding, and that is why this is
  blocked.**
- **why it failed:** "Analyzing", "In line" and "Analysis failed" are now
  spelled byte-identically in `line-row.tsx:146-159` and the new
  `dual-sheet.tsx:220-233`, hardcoded in JSX conditionals in both. The
  reviewer's words: "a real drift risk worth flagging — nothing enforces the
  two literal strings stay in sync mechanically." The shared `EntryState` still
  decides *which* state a line is in, so the two screens cannot disagree about
  that; they can only disagree about the words, once someone edits one copy.
  The gate does not triage severity, and the implementer had itself flagged
  this and offered it as a follow-up, so it blocks rather than shipping.
  **Note the review brief I wrote was wrong on this point**: I told the
  reviewer `ANALYSIS_LABEL` was the shared source for these words. It is not —
  both files hardcode the strings. The reviewer corrected me.
- **stash:** `eed71ae14e51e209f8422c2ce8c51139c66c2576` — the dual sheet, the
  loader work and the page wiring. Recoverable; nothing discarded. Everything
  except the duplicated strings stands.
- **what this attempt got right, and must not be rebuilt:** it reused
  `getEventDetail` and `dualScore` rather than assembling a dual a second way,
  and it added no query — it widened T2's existing `program_events` read
  instead. The tally is `dualScore`'s, "final" appears only when its `decided`
  flag is true, and a clinch is derived from the points the lines can actually
  award rather than an assumed seven.
- **a real but implausible risk, recorded not fixed:** widening that read to
  `.limit(12)` means the derived `nextEvent` could be truncated by a program
  with 12+ events inside one Monday–Sunday week, all already past — which would
  silently revert T2's checklist card *and* null this card. Reachable through
  the app's own write path; not reachable through any real collegiate season.
  Worth a guard if this loader is touched again.

## T9 · This weekend — the dual sheet — blocked (second attempt)
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 93 passed.
  `pipeline-guardrails-reviewer` — **its own earlier finding resolved**, and
  nothing to block on. It checked the extraction byte-for-byte against the
  prior inline versions: each state produces the same word, tone and pulse on
  both surfaces, `line-row.tsx`'s control flow is preserved (the `empty` branch
  and its `canEdit` gate still run before the map is consulted, and `ready`
  plus the upload fallback still fall through), no write affordance migrated to
  the read-only card, and the `StatusTone` import is type-only under
  `isolatedModules` so nothing from a component reaches the server module.
  `rls-boundary-reviewer` — not re-run: nothing under `src/lib/data/` changed
  since the revision it cleared, and a string extraction has no query, column
  or shape implication.
  `task-completion-reviewer` — **`VERDICT: needs-work`** on criterion 6.
- **why it failed, and why this one is not another criterion defect:** I
  expected the reviewer to find my "a grep finds exactly one definition"
  wording overreaching, because a third, pre-existing surface —
  `single-detail.tsx:128,137,140` — still spells the three words. It ruled the
  opposite way, and it is right. The implementer's argument for leaving that
  file alone covers only its `ready` branch, which genuinely has no key in the
  map. Its `failed`/`working`/`waiting` branches map onto exactly the three
  `LINE_STATUS` keys with matching tones and could read the map without
  touching `ready` or changing any behaviour. The criterion is satisfiable; the
  work is incomplete. That is a different thing from T4's and T8's failures,
  where the criteria genuinely contradicted what the task required.
- **stash:** `dbceda33b679372da2c172f48466f25da0e55546` — the dual sheet, the
  loader work, the page wiring, `line-status.ts` and the converted
  `line-row.tsx`. Recoverable; nothing discarded.
- **judged fine, not scope creep:** moving `tone` and `live` into the map
  alongside the labels widens the literal criterion, which named only the
  words. The reviewer accepted it as narrowly contained — but noted it does not
  rescue criterion 6, since `single-detail.tsx` duplicates the tones and the
  `live` flag too.

## T9 · This weekend — the dual sheet — done (third attempt)
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 93 passed.
  `pipeline-guardrails-reviewer` — no findings. It verified all four states on
  `single-detail.tsx` word-for-word against their prior inline versions and
  checked the detail the equivalence turns on: `StatusChip` destructures
  `live = false`, so `undefined` hits the same default an omitted prop would
  and no chip can start pulsing that did not before.
  `rls-boundary-reviewer` — not re-run for the last two passes: nothing under
  `src/lib/data/` changed since the revision it cleared, and extracting strings
  has no query, column or shape implication. Its clearance of the loader work
  stands and is recorded above.
  `task-completion-reviewer` — **`VERDICT: pass`**, all seven criteria. It
  confirmed the `live` default by direct read rather than inference, checked
  the `ready` branch byte-identical against `git show HEAD`, and walked the
  nested ternary to confirm the `else` is still reachable only via `waiting`
  and no branch renders `null` where a chip rendered before.
- **changed:** Team Home gains a "This weekend" card above the matches list —
  the dual's lines in position order, each with its players and either a
  ResultMark and score or a status chip, under a tally and a clinch note. It
  reuses `getEventDetail` and `dualScore` rather than assembling a dual a
  second way, and adds no query: T2's existing `program_events` read was
  widened instead.
- **and one vocabulary now has one home.** `src/lib/schedule/line-status.ts`
  holds the words, tones and pulse for a line's waiting states;
  `line-row.tsx`, `dual-sheet.tsx` and `single-detail.tsx` all read it. Before
  this, three surfaces spelled "Analyzing", "In line" and "Analysis failed"
  into their own JSX. `single-detail.tsx`'s `ready` branch keeps its own
  wording and its own state model deliberately — it has no key in the map and
  says something the other surfaces never say.
- **what the three attempts cost, and why:** the first was blocked on the
  duplicated words, which the guardrails reviewer found and I had wrongly told
  it were already shared. The second extracted them but left a third file
  spelling them; I expected that to be my criterion overreaching and it was
  not — the reviewer showed three of that file's four branches could read the
  map with no behaviour change. Only the third attempt was a straightforward
  finish. Two of the three blocks were real defects; one was mine.

## T10 · KPI strip, only once the numbers are honest — blocked
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` **107 passed** (93 baseline + 14 new in
  `tests/team-kpi.spec.ts`).
  `pipeline-guardrails-reviewer` — no findings. The check that mattered: it
  diffed `matchOutcome()`'s old and new bodies line by line rather than
  reasoning about them, and confirmed `setTally()` is a verbatim extraction —
  same guard, same `forEach`, same tie check, same orientation. Missing score,
  empty arrays, level sets and unequal-length arrays all behave identically.
  **T8's glyphs are safe.** It also confirmed a match whose side cannot be
  established is skipped before reaching either average rather than defaulting
  to a column, and that headline and sparkline read the same array.
  `rls-boundary-reviewer` — no findings, and it answered the
  `match_stats_with_percentages` question with history: the view *was* a
  definer view readable by `anon` — a real past bug — and
  `20260817074053_secure_match_stats_view.sql` set `security_invoker = on` and
  revoked `anon`. It checked every later migration touching the view to confirm
  none reverts it. The widened reads change how many of a player's *own*
  visible rows are aggregated, not which rows exist.
  `task-completion-reviewer` — **`VERDICT: needs-work`** on criterion 1.
- **why it failed:** criterion 1 says four tiles render. The strip renders
  three whenever no dual is decided, omitting the dual-record tile rather than
  printing `0–0`. I had assumed this was my wording being loose — the reviewer
  showed it is not a rare corner: **any program with matches but no completed
  dual hits it in normal operation**, which is most of a season's early weeks
  and any program playing individual matches. Criterion 2 already carves out
  the true empty state; nothing carves out this partial one. It also found that
  **no test exercises `teamKpis()` itself** — the 14 new tests cover the pure
  helpers, not the function that decides which tiles exist — so the branch in
  question is unverified as well as unmet.
- **judged sound and not softened:** the never-trending decision on the dual
  record and matches-analyzed tiles. The reviewer read "only once there is a
  week of data" as a ceiling on when a trend may appear rather than a mandate
  that every tile gets one, and accepted the reasoning — a W–L record's only
  drawable line is a cumulative win percentage wearing the record's label, and
  a count that only rises reports growth as improvement. The chosen constants
  (`SMALL_SAMPLE_MIN = 5`, `TREND_MIN_SPAN_DAYS = 7`, required together) were
  judged defensible and implemented as described.
- **stash:** `9db3e34683717299c6f72c36731c26a3f50bbe41` — the strip, the
  aggregation, the tests, and the `setTally`/`statKey` de-duplication.
  Recoverable; nothing discarded.

## T10 · KPI strip, only once the numbers are honest — done (second attempt)
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` **111 passed** (93 at branch start).
  `task-completion-reviewer` — **`VERDICT: pass`**, all six criteria, and it
  did not take the mutation claims on trust: it reproduced all five mutations
  against the real files, confirmed each broke a specific `teamKpis`-level
  assertion, reverted them and diffed to confirm the originals were restored.
  It also verified the mid-season fixture genuinely alternates `programSide` by
  index parity and that the decoy 20% opponent stat rows do degrade the serve
  average under a wrong-attribution mutation.
  `pipeline-guardrails-reviewer` and `rls-boundary-reviewer` — **not re-run for
  this attempt, on a mechanically verified basis.** The only non-comment change
  in `src/` since the revision they cleared is three `export` keywords
  (`teamKpis`, `DbSeasonMatch`, `DbTeamStat`); everything else is prose inside
  comment blocks. Their first-attempt results stand and are recorded above
  under "T10 — blocked": `setTally()` verified line by line as a verbatim
  extraction of `matchOutcome`'s body (T8's glyphs depend on it), and
  `match_stats_with_percentages` confirmed `security_invoker = on` with the
  migration history that made it so.
- **changed:** Team Home gains a KPI strip between the greeting and the rest of
  the page — dual record, sets won, team first serve, matches analyzed. It
  renders nothing at all until a match has actually been analyzed, states the
  sample under every figure computed from fewer than five matches, and draws no
  trend or sparkline until there are five observations spanning at least seven
  days. `SMALL_SAMPLE_MIN` and `TREND_MIN_SPAN_DAYS` are named constants
  carrying their reasoning.
- **the honesty rules, which are the point of the task:** a figure that cannot
  be computed honestly is omitted rather than printed as `0–0` or `—%`, so the
  strip carries one to four tiles; the dual record and the analyzed count never
  draw a trend, because a W–L record's only drawable line is a different
  statistic wearing its label and a count that only rises reports growth as
  improvement; and a match whose side cannot be established contributes to no
  average rather than defaulting to a column.
- **what the first attempt failed on:** criterion 1 demanded four tiles
  unconditionally — my wording, which would have required the `0–0` the round
  exists to refuse. The reviewer refused to soften it and was right to: the
  three-tile state is reachable in any normal early season. It also found the
  real gap, that `teamKpis()` — the function deciding which tiles exist — had
  no coverage while its helpers did. Four tests now cover it.

## T11 · The right column — next event, roster, needs attention — done
- **gate:** mechanical — `npm run lint` 0 errors (38 pre-existing warnings),
  `npx tsc --noEmit` clean, `npm test` 111 passed.
  `pipeline-guardrails-reviewer` — no violations. It verified the new write
  path calls the *existing* `inviteMember`, which takes no `programId` and
  resolves it server-side, and enumerated the predicate sets to confirm
  `isLiveUpdating` is exactly `IN_FLIGHT` minus `processed` — `isInFlight`
  would have flagged every analysed match as "taking longer", `isWorking` would
  have dropped `uploaded`, which the guardrails doc says must stay alertable.
  `rls-boundary-reviewer` — no findings. `create_program_invite` is
  `security definer` re-checking `is_program_staff` and raising `42501`, so a
  player is refused by the database even if they reach the action. Only
  `resend-invite.tsx` is a Client Component, taking `email` and `role` — both
  already client-rendered on the Roster table. The `program_roster_full` change
  is a **TypeScript cast widening**, not a new read.
  `task-completion-reviewer` — **`VERDICT: pass`**, all five criteria.
- **changed:** Team Home is a two-column page at `xl` — main plus a 340px rail
  carrying a Next event card, a roster card and a Needs-attention list, each
  rendering nothing at all when it has nothing to say. The frame spans both
  columns by construction: greeting and usage footer are siblings of the grid,
  never cells in it. A player, or a staff member whose three cards are all
  empty, gets a single-track grid with no gutter.
- **the deleted `PendingInvites` block, ruled a gain not a regression.** T4's
  line is gone from the main column; the reviewer checked reachability state by
  state rather than the phrase, and found the old block was gated on `!empty`
  as well as pending invites — so **on day zero it never rendered at all**. The
  roster card has no such gate, lists every open invitation with an inline
  Resend, and surfaces pending *staff* invites that `rosterProgress()` never
  counted. "Resend from Roster" and the `/dashboard/team/roster` link survive
  verbatim on the urgent alert. No state exists where a coach could resend or
  reach Roster from Team Home before and cannot now.
- **T8, T9 and T10 are untouched** — `match-rows.tsx`, `dual-sheet.tsx`,
  `kpi-strip.tsx`, `first-steps.tsx` and `usage-footer.tsx` show no
  modification, and their call sites pass identical props. The brief required
  reporting rather than retuning if anything could not survive the narrower
  column; nothing had to give.
- **two accurate criticisms the reviewer raised, neither blocking, both worth
  fixing later:**
  1. A comment in `page.tsx` justifying the `xl` breakpoint claims the `lg`
     split's 580px column is "narrower than anything the card renders in
     today" — inconsistent with its own preceding sentence, since the card
     already renders at 560px at `sm`. The conclusion (use `xl`) stands; the
     stated reason does not. Same class as T8's `event_entry_id` comment: a
     justification someone later trusts instead of re-deriving.
  2. `first-steps.tsx`'s checklist gets a new minimum container of 268px at the
     `xl` split, narrower than the 304px it previously bottomed out at. Its
     content is fluid and wrapping so it is unlikely to break visibly, but the
     implementer's blanket claim that every protected component's narrowest new
     container is wider than one it already renders in is not quite true here.
