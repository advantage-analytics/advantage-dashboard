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

## T12 · Team Home's day and week arithmetic is the server's, not the reader's — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0, no stale-`.next` rerun needed; `npm test` 120 passed
  (114 prior + 6 new). 5b `task-completion-reviewer` — `VERDICT: pass`; it
  independently re-ran the new spec against the pre-change file and confirmed all
  six fail there, so the test is not vacuous. 5c `rls-boundary-reviewer` ran
  (`src/lib/data/` touched) and returned an explicit no-findings all-clear;
  `pipeline-guardrails-reviewer` SKIPPED — the diff touches nothing under
  `src/app/dashboard/`, `src/components/dashboard/` or the upload wizard.
- **changed:** `localDay` and `weekBounds` now take an explicit `timeZone` and read
  the day through `Intl.DateTimeFormat(...).formatToParts` instead of the local
  date getters, which on Vercel silently read UTC while the comment claimed they
  read the visitor's zone. A named `PROGRAM_TIME_ZONE = "UTC"` is passed at the
  single call site in `getTeamHomeData`, matching how `usage-format.ts` and
  `active-workspace-server.ts` pin their zone. Monday-start semantics are
  unchanged; the ±6-day arithmetic moved onto a UTC-midnight anchor so no week
  crosses a DST discontinuity and comes out six or eight days long. Both helpers
  are now exported solely so `tests/team-home-week.spec.ts` (new, 6 tests) can pin
  a zone — every component-side import of this module is `import type`, so the
  exports create no runtime edge into a client bundle.
- **not fixed, and deliberately:** pinning UTC makes the code honest, not correct.
  A Pacific program's weekend dual sheet still leaves the page around 17:00 PT
  Sunday. Closing that needs a `programs.timezone` column, which does not exist —
  the task said to name the schema work rather than invent the column, and the
  implementer took the other branch the task allowed: satisfy the four criteria
  (all four are about honesty and explicitness, not per-program zones) and write
  the residual cost into the code. `programs.state` was considered and rejected as
  a substitute: Arizona keeps no DST and nine states straddle two zones. The two
  helpers are now shaped so landing a real column is a one-line change from a
  constant to a field. Worth queueing as a schema task.

## T13 · Roster progress counts `program_members`, so coach-managed players are invisible — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 127 passed (120 prior + 7 new). 5b
  `task-completion-reviewer` — `VERDICT: pass`. 5c BOTH guardrails ran, neither
  skipped: `pipeline-guardrails-reviewer` (diff touches `src/app/dashboard/` and
  `src/components/dashboard/`) and `rls-boundary-reviewer` (`src/lib/data/`), both
  returned explicit no-findings all-clears.
- **changed:** `rosterProgress` now counts the `program_roster_full` rows already
  loaded for `rosterIds` instead of `program_members` seats, so a coach-built
  roster stops reading as empty and the "Build your team" card shows its receipt.
  A new private `playerCount()` holds the `role === "player"` predicate once,
  shared with `rosterCard`. `RosterProgress.joined`/`.invited` renamed to
  `.players`/`.outstanding` — deliberately a rename rather than a silent
  re-pointing, so the compiler surfaced every reader; that turned up a fourth the
  task's `files:` list had missed, `src/app/dashboard/team/page.tsx`, whose
  greeting said "N players have joined" and would have become false the moment the
  count included profiles that have joined nothing. Reworded to "N players on the
  roster". New spec `tests/team-roster-progress.spec.ts`, 7 tests.
- **verified, because the risk here was attribution:** `rosterIds` feeds
  `programSide()`, which decides whose side of a match is the program's, and it
  deliberately KEEPS staff ids — a coach uploading without a lineup preset lands
  their own id in `player1_id`. `playerCount()`'s player-role filter reaching that
  set would have silently dropped the outcome glyph from every coach-uploaded
  match with nothing on screen looking wrong. The guardrails reviewer confirmed
  `rosterIds`, `programSide()` and `teamKpis()` are byte-for-byte outside every
  diff hunk, and that only counts — never rows — cross into a component.
- **noted, not a criterion failure:** the implementer reported its new spec as
  "6 of 7 fail against the pre-fix code, the 7th a deliberate fixture guard". The
  completion reviewer re-ran it and found all SEVEN fail, because every test
  touches `.players` at least once. The spec's assertions are real either way;
  the inaccuracy was in the report, not the code.
- **unverified assumption, carried forward:** CLAUDE.md requires schema claims be
  checked against the live database via the Supabase MCP, but only `query_logs` is
  exposed in this session — no `execute_sql` or `list_tables` — so the deployed
  `program_roster_full` body could not be read. Evidence is migration
  `20260822090500` plus three corroborating comments. If the live function has
  drifted, the assumption that breaks is "every player-role seat also appears as a
  `role = 'player'` roster row", which arms 1 and 3 of the UNION exist to
  guarantee.

## T14 · An expired invite reads "expires today", forever — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 135 passed (127 prior + 8 new). 5b
  `task-completion-reviewer` — `VERDICT: pass`. 5c `rls-boundary-reviewer` ran
  (`src/lib/data/` touched) and returned an explicit all-clear;
  `pipeline-guardrails-reviewer` SKIPPED — the diff touches only
  `src/lib/data/team-home-server.ts` and `tests/`, nothing under
  `src/app/dashboard/`, `src/components/dashboard/` or the upload wizard.
  **5a was re-run in full after both reviewers returned** — see the race below.
- **changed:** the expiry filter is now `expiry > now && expiry <= horizon`, so a
  lapsed invitation drops out of `expiringSoon` instead of pinning a permanent
  "One invite expires today" to Needs attention. The `Math.max(0, …)` clamp is
  removed outright rather than left unreachable, replaced by `wholeDaysUntil()`,
  which counts CALENDAR days anchored on UTC midnights via `localDay` — the same
  DST-safe construction `weekBounds` uses. That goes past the criterion on
  purpose: elapsed-24h arithmetic would still print "today" at 11pm Monday for a
  10am Tuesday expiry. `teamAttention` exported for the spec, with the same
  test-only note `rosterProgress` and `teamKpis` carry. Spec extended, not
  forked — the file already owns `rosterProgress`'s invite contract.
- **the design decision, and why (a):** an expired invite could be excluded from
  the count or surfaced as its own state. Neither `roster-card.tsx` nor the
  Roster page has ANY word for "expired" — both call every unaccepted invite
  "pending" and give it a Resend, from one shared `roster-vocabulary.tsx`. A new
  `invite-expired` alert would therefore print "expired" on the same page whose
  card calls that row "pending", which is the contradiction criterion 4 exists to
  forbid. So: excluded from `expiringSoon`, still counted in `outstanding`, so the
  card keeps listing it with the Resend that is the actual remedy. Teaching
  "expired" to the shared vocabulary is a design round across two screens, not a
  countdown fix.
- **worth knowing:** a lapsed invite is genuinely invalid server-side, not merely
  cosmetically expired — `accept_program_invite` raises on `expires_at <= now()`,
  `resolveJoinState` returns `expired`, `/join/[token]` says so, and
  `program_seat_usage` excludes it. The old alert was pointing a coach at a link
  that opens nothing.
- **the `>` boundary:** matches the app's own definition of expired, verified
  against live code (`invite-acceptance.ts:147`, `Date.parse(expiresAt) <= now()`)
  rather than only the migration — CLAUDE.md warns migrations run behind live.
- **derived expiry checked, no drift:** the UI computes expiry as
  `created_at + INVITE_TTL_HOURS` instead of selecting `expires_at`. Verified
  across four migrations that no path writes one without the other — the
  invite/resend upsert sets `created_at = now()` in the same statement as
  `expires_at`, and `inviteMember` is the only caller.
- **ORCHESTRATION ERROR, mine, recorded so it is not repeated:** I dispatched 5b
  and 5c concurrently in one message. `task-next` step 5 prescribes them in cost
  order, b then c, and for good reason — I had explicitly asked 5b to verify the
  pre-fix failure count, which it did via `git stash` + `git apply -R` round
  trips. 5c read the working tree during that revert window and correctly reported
  the tree as broken and inconsistent. Nothing was lost: HEAD never moved, no
  content was discarded, and both reviewers restored cleanly. But the finding was
  real and the gate was briefly reading a tree that did not match the diff under
  review, so 5a was re-run in full afterwards to prove coherence before this
  commit. Run 5b to completion before dispatching 5c.
- **test honesty, checked this time:** implementer reported 8 new tests, 6 failing
  pre-fix, 2 deliberate controls. The reviewer reconstructed the pre-fix state and
  measured exactly 6 failed / 9 passed, and confirmed both controls assert real
  behaviour rather than nothing. Report and reality agree.

## T15 · Restore the 7-6 guard on the tiebreak superscript — blocked
- **gate:** stopped at 5b's question before 5b was dispatched. The subagent
  produced NO diff — it followed the mandated order, put criterion 3 first, and
  reported that the writers do not agree, which the task block pre-authorized as
  a stop. `git diff HEAD` outside `.claude/tasks/` is empty and
  `git ls-files --others --exclude-standard` is empty, so there was nothing for
  `task-completion-reviewer` to judge and nothing for either guardrail reviewer to
  review. 5a `npx tsc --noEmit` exit 0 (unchanged baseline). 5b, 5c
  `pipeline-guardrails-reviewer` and 5c `rls-boundary-reviewer` NOT dispatched —
  an empty diff satisfies no criteria and reviewing one is theatre, not a gate.
- **stash:** no stash — the task produced no changes. `git stash push` reported
  `No local changes to save` and created no entry; `stash@{0}` is still T10's, so
  no ref is recorded here rather than a borrowed SHA.
- **why it blocked:** nothing in this repo records a super-tiebreak set
  distinctly. `matches.format` is `{best_of, ad_scoring, play_on_lets}` and
  `matches.score` is per-set games plus per-set tiebreak points — no flag says "a
  10-point tiebreak decided this set", and no migration constrains it. Of the
  score writers, two CANNOT produce one: `DetailsContent.tsx:74-77` and
  `edit-match-dialog.tsx:52-55` share an identical `needsTiebreak` that renders a
  tiebreak cell ONLY on 7-6 or 6-7, and the wizard's `validateSetScore` caps games
  at 7 ("Games must be 0–7"), so a 10-8 is refused outright; `edit-match-dialog`
  even wipes a loaded tiebreak when a set stops being 7-6. Two CAN, unbounded and
  ungated: `single-score-entry.tsx` and `score-entry.tsx` strip non-digits only
  and render the tiebreak cell for every set, and neither the PATCH route's
  `validateScore` nor `lib/schedule/actions.ts` bounds them. So three shapes are
  producible — `10-8` with no digit, `1-0` with a digit, `7-6` with a digit — and
  they demand contradictory guards. Two of the three are satisfied by exactly the
  `7-6` check the author's decision forbids; only the `1-0` shape needs a wider
  one, and that shape is UNATTESTED: nothing writes it, no comment describes it,
  no fixture contains it. Its only appearance in this repo is an assertion in this
  very log at lines 228 and 315, from an earlier investigation. The subagent
  refused to build a guard on that, which is correct — that is the inference the
  task told it not to repeat.
- **verified independently before recording:** I re-ran the `needsTiebreak` greps
  and the games cap myself rather than take the report on trust. Both hold.
- **the missing datum, and how to get it:** one read of production settles it —
  for rows where a set carries a non-null tiebreak, what are that set's game
  counts? If real rows only ever show 7-6, the strict guard is right and the
  author's premise does not apply to stored data. If `1-0`+tiebreak rows exist,
  the guard becomes "7-6 or 1-0", documented as such. Unobtainable here: no
  `.env.local` in the tree, and the Supabase MCP surface in this session exposes
  only `query_logs` — no `execute_sql`, no table read. Same gap that qualified
  T13's `program_roster_full` finding and that T20 carries a warning about.
- **a correction to the task block, for whoever re-queues it:** its `files:` line
  named four writers. There are FIVE, and the two it omitted —
  `src/components/dashboard/schedule/score-entry.tsx` and
  `src/lib/schedule/actions.ts` — are among the ungated ones that make this
  ambiguous at all. A re-queued T15 should name them.
- **the durable alternative**, if the answer is "make them agree" rather than
  "read production": have the two free-entry schedule forms adopt the wizard's
  `needsTiebreak` / `validateSetScore`, so all five writers agree by construction.
  That changes what a coach is allowed to type, so it is the author's call and a
  separate task, not a widening of this one.

## T16 · The first-report card reads only the six rows the list shows — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 143 passed (135 prior + 8 new). 5b
  `task-completion-reviewer` — `VERDICT: pass`. 5c BOTH guardrails ran, neither
  skipped: `pipeline-guardrails-reviewer` (`src/app/dashboard/` and
  `src/components/dashboard/`) and `rls-boundary-reviewer` (`src/lib/data/`), both
  explicit no-findings all-clears. 5b was dispatched ALONE and allowed to finish
  before 5c, per the correction recorded under T14.
- **changed:** the card's two questions — "has a report ever come back?" and "is
  one on its way?" — moved into the loader as `teamFirstReport(rows, jobs,
  rosterIds)`, computed over the season read that already exists for the KPI
  strip. `FirstSteps` no longer receives `matches` at all; it receives a
  discriminated union `TeamFirstReport` = `{state:"done", id, title, date}` |
  `{state:"progress", status, startedAt?}` | `null`. A union rather than two
  nullable props because "a report is back AND one is on its way" is not a state
  the card has a branch for, and two props would let a caller build it. The season
  `select` widened by `player1_name, player2_name` so the receipt can print a
  title. New spec `tests/team-first-report.spec.ts`, 8 tests.
- **the judgement call, ruled on rather than assumed:** criterion 3 says "nothing
  new is fetched". Widening an already-unbounded season select by two `text`
  columns is not obviously inside that. I put it to the reviewer as an explicit
  question rather than accepting the implementer's framing; it ruled the intent is
  "no second read, no second answer" — no new `.from()`, `.rpc()`, `await` or
  `Promise.all` member was added, and the alternative was a per-match query for
  one row. The implementer flagged the cost itself instead of burying it.
- **`programSide()` gained a second consumer, and that was the risk:** it decides
  which side of a match is the program's, so a wrong read prints a result under
  the wrong player with nothing on screen looking broken. Checked twice, by both
  5b and the guardrails reviewer: `programSide` is byte-for-byte outside every
  diff hunk; the new swap is character-for-character the convention the existing
  `TeamMatchRow` builder uses; and the receipt carries no score field, so there is
  no path where a name half and a score half could half-swap. A row nothing
  attributes to the program keeps stored column order — same as the row builder,
  and pinned by a test.
- **checked for a third instance of the a8479e2 bug:** that commit fixed two
  surfaces asking `isInFlight` where they meant `isLiveUpdating`, because
  `processed` is in flight but never moving. `teamFirstReport` also uses
  `isInFlight`, so I asked the guardrails reviewer directly whether it reintroduces
  it. It does not: `isInFlight` here decides only WHICH SLOT a match falls into,
  which is the question it is documented for, and the "is anything actually
  coming" questions stay downstream on `isLiveUpdating`/`isWorking` in the
  component. T14's `stalled` flag reads the same status it did before.
- **test honesty, verified not trusted:** implementer reported 8 new tests, 4
  failing pre-fix, 4 controls. The reviewer independently reproduced the pre-fix
  state by slicing the season to six rows and measured exactly 4 failed / 4
  passed, and confirmed the controls assert real behaviour. Report and reality
  agree. Pre-fix reproduction was done with `cp`, not `git stash` — the standing
  fix for T14's tree race.
- **outside `files:`, all necessary:** `src/app/dashboard/team/page.tsx` owns the
  prop (3 lines); `tests/team-kpi.spec.ts` fixture widened 4 lines because
  `DbSeasonMatch` gained required fields and `tsconfig` includes `tests/**`.

## T17 · KPI sparkline and headline read different windows — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 149 passed (143 prior + 6 new). 5b
  `task-completion-reviewer` — `VERDICT: pass`, dispatched ALONE and finished
  before 5c. 5c `rls-boundary-reviewer` ran (`src/lib/data/` touched) and returned
  an explicit all-clear; `pipeline-guardrails-reviewer` SKIPPED — the diff touches
  only `src/lib/data/` and `tests/`, nothing under `src/app/dashboard/`,
  `src/components/dashboard/` or the upload wizard.
- **changed:** `SPARK_WINDOW = 8` deleted; `seriesTile` returns
  `sparkline: earned ? values : []` rather than `values.slice(-SPARK_WINDOW)`. The
  tile's three claims — headline, change and line — now read one array. Route (a)
  of the two the criteria allowed; route (b), labelling the shorter window, was
  rejected because `kpi-strip.tsx`'s note slot is a one-slot/three-occupants
  design where a window caption would have to displace the delta line or the
  sample note, and because it concedes that one tile carries claims about two
  stretches of season rather than fixing it.
- **the finding that decided it, and it was verified twice:** `SPARK_WINDOW`'s
  comment claimed 8 was chosen so the team and personal strips "draw the same
  shape". That has cause and effect backwards. On the personal strip
  (`performance-server.ts:647-667`) the 8 is not a spark length at all — it is the
  ONE window everything reads: headline is `measured[0].value`, change is
  `measured[0] - measured[1]`, and the same window feeds `KpiTile`'s hover-preview
  `detail`, bounded by how many match cards fit a popover. What was copied to the
  team strip was the number; the reason did not come with it. The two headlines
  also answer different questions — personal is a most-recent reading, team is a
  season mean — so matching their pixel lengths made incomparable figures LOOK
  comparable. Deleting the constant restores on the team strip the invariant the
  personal strip actually holds. I put this to the reviewer as the thing that
  decides pass-or-block, and it confirmed independently from the source.
- **an existing test was rewritten, not just added to** — `'the sparkline is
  chronological and capped at the drawn window'` became `'…and draws every
  observation'`, expectation `[3…10]` → all ten. Sometimes that is the tell of a
  bad change, so I asked for a ruling: it is a legitimate consequence, because the
  old expectation encoded the window the fix removes.
- **criterion 4 was a no-change criterion**, the kind most easily claimed and
  least often checked. `earned`, `SMALL_SAMPLE_MIN` and `TREND_MIN_SPAN_DAYS` are
  byte-identical, and the three new gate tests pin both edges. The reviewer built
  a harness importing HEAD's and the working tree's `team-kpi.ts` side by side and
  reproduced the split exactly: 4 window tests fail under old code and pass under
  new; 3 gate tests pass under BOTH, which is what makes them regression pins
  rather than tests of the fix. Implementer's report and reality agree.
- **`Sparkline` needed no edit, and that was checked rather than assumed:** its
  coordinate math normalises x by `index / (points.length - 1)`, so an unbounded
  series draws denser but correctly scaled. A bounded assumption there would have
  rendered badly on a long season. Its own comment — "the line and the number
  under it can never disagree about which way things went" — becomes true rather
  than aspirational.
- **outside `files:`, one file, comments only:** `team-home-server.ts:1232-1246`.
  The false claim criterion 2 targets lives on `teamKpis()` there, not in
  `team-kpi.ts` — the `files:` list was wrong about where. The RLS reviewer
  confirmed the whole hunk sits inside one `/** */` block with no statement,
  filter or predicate changed, which mattered because that file holds every Team
  Home query and `programSide()`.

## T18 · A bulk invite binds every pasted address to one managed profile — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 149 passed, no delta (see below). 5b
  `task-completion-reviewer` — `VERDICT: pass`, dispatched ALONE and finished
  before 5c. 5c BOTH guardrails ran, neither skipped:
  `pipeline-guardrails-reviewer` (`src/components/dashboard/`) and
  `rls-boundary-reviewer` (the write path it drives), both explicit no-findings
  all-clears on the diff.
- **the premise was real, by a path nobody had guessed.** This was the one task in
  the batch whose premise I could not confirm when I wrote it, hence its
  investigate-first criterion. Code-review implied the picker could be used
  alongside a paste; that is not it. The dialog is deliberately built so `linked`
  (a target selected) and `listed` (chips parsed) are mutually exclusive, and FOUR
  of the five writers of `target` are gated behind `!listed`. The fifth is not:
  `pick(match)` inside `submit()` itself, on the server's `link_player` tripwire.
  Route: paste twelve addresses, press Send; if the FIRST address belongs to a
  coach-managed unclaimed roster row, the RPC refuses, the dialog helpfully
  selects that row, and the run takes an early return that does not clear
  `emails`. The coach is left looking at a target AND twelve chips, footer reading
  "Send 12 invites". The NEXT press binds all twelve to one profile. Only `i === 0`
  leaks — every later iteration hits the receipt branch, which does clear them.
- **changed:** `if (result.linkTo)` → `if (result.linkTo && !listed)`, so the fifth
  writer catches up to the invariant the other four already obey. The "nothing has
  gone out" error now names the offending address when a list is present, because
  with auto-select suppressed a generic refusal gives a coach no way to tell which
  of N chips caused it; single-address behaviour is byte-identical. One paragraph
  added to the file's header comment. The sequential loop and its one-open-invite
  race comment are untouched.
- **proof re-walked, not accepted:** I asked 5b to verify the five-step
  reachability argument against the source rather than take it, because if any
  step were wrong the fix would be hardening a path nobody can take. Every step
  held. It traced `linkTo.profileId` end to end — `program_players.id` →
  `program_roster_full`'s `pp.id` → `team-roster-server.ts:357` →
  `RosterMember.profileId` → `ManagedPlayer.profileId` — to establish the
  `managedPlayers.find(...)` genuinely always hits, and confirmed the `i === 0`
  confinement from the branch structure.
- **the cost of suppressing the tripwire was judged, not assumed:** with the guard,
  a list-mode refusal no longer auto-selects. The guardrails reviewer checked
  whether that strands a coach and found it does not — the error reads
  "coach@school.edu — P. Sharma is already on this roster without an account", the
  chip is still on screen with its own remove button, and the next move is
  directly executable. It also confirmed the true single-address flow (address
  left in the draft field, never chipped) still auto-binds exactly as before, so
  the guard suppresses only the case where auto-selecting WAS the bug.
- **no test, and that is honest:** the change is a condition on a `pick()` call and
  an error-string branch inside a `"use client"` submit handler awaiting a server
  action. Nothing pure is reachable; `tests/` are Playwright-runner unit tests over
  `src/lib` pure functions and this repo has no component-rendering setup.
  Extracting `submit()` to test it would mean lifting the run loop, its
  `useTransition` and five setters out of the component — a far bigger change than
  this task warrants. I told the reviewer explicitly not to accept a faked or
  trivial test as an alternative; it judged the omission honest.
- **A DATABASE-SIDE GAP THIS FIX DOES NOT CLOSE — confirmed from the migrations,
  queued as T21.** `create_program_invite` never checks whether another open
  invite already names the same `p_player_id`: no lookup, no unique index, and the
  upsert conflict target is `(program_id, lower(email)) where accepted_at is null`
  — keyed on the ADDRESS. So N open invitations to N addresses may all carry one
  `player_id`, and a crafted client call still can. `accept_program_invite` closes
  the race correctly (`where claimed_by_user_id is null`, first clicker wins) but
  every later invitee returns `already_claimed` BEFORE `accepted_at` is stamped —
  so their row stays open, which is precisely the state the seat-reservation count
  treats as reserved. The seat stays held with no path to release it short of the
  coach deleting the row by hand. A client guard is not a security boundary and
  was never claimed to be one; the new comment says so. Authorization itself is
  sound: the RPC checks `is_program_staff` before any write and validates the
  player belongs to the caller's program, so the gap is same-program only.
- **adjacent bug, correctly NOT fixed here:** the footer's Cancel and Done call the
  `onOpenChange` prop directly rather than the wrapper that calls `reset()`, so
  closing by those two leaves dialog state — including a `target` — in place for
  the next open. Escape, overlay click and the shell's X do reset. Separate task.

## T19 · `readSchedule` runs twice per Team Home render — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 159 passed (149 prior + 10 new). 5b
  `task-completion-reviewer` — `VERDICT: pass`, dispatched ALONE and finished
  before 5c. 5c `rls-boundary-reviewer` ran (`src/lib/data/` touched) and returned
  an explicit no-findings all-clear; `pipeline-guardrails-reviewer` SKIPPED — the
  diff touches only `src/lib/data/` and `tests/`.
- **MEASURED QUERY COUNT: 19 → 14** for a render with a dual in range. Measured,
  not read: the implementer built a throwaway harness patching Node's
  `Module._load` to swap `next/headers` and `@supabase/ssr` for a counting fake,
  ran the real `getTeamHomeData` end to end over six scenarios against HEAD and
  against the new code, then deleted it. 5b verified the arithmetic
  mechanistically rather than trusting the harness: the diff removes exactly the
  narrow `program_events` query (1 round trip) plus `getEventDetail`'s separate
  `readSchedule` (events + entries + entry-matches + analysis jobs = 4) — the 5
  that accounts for the difference. Other scenarios: 17→14, 15→14, 15→14, 10→9,
  11→10. `program_events` reads drop 2-3 → 1 in every one.
- **the "7" in my criterion was never a real number.** I wrote "back toward the 7
  it was before this branch". The implementer could not reproduce it: reverting
  ALL of this branch's schedule work still measures 11, because six other reads on
  the page — recent matches, season matches, `program_roster_full`, two usage
  RPCs, `getTeamSettings`, `processing_jobs`, `match_stats` — have nothing to do
  with this task. The 7 came from the `/simplify` agent's reading, not an
  instrumented run. It reported the shortfall plainly instead of massaging it. 5b
  ruled the criterion satisfied on its own wording — "toward", not "to".
- **criterion 3's premise was also wrong, and this is the third time in this queue
  my wording was the problem rather than the code.** It said retire the query "if
  `ScheduleRow` can answer the next event and the weekend dual". `ScheduleRow`
  answers the next event but CANNOT build the dual sheet: no `surface`, and
  entries reduced to `entryCount`/`playedCount`/`workingCount`, where
  `DualSheetLine` needs per-line players, scores, state and `reportId`. The
  comment I corrected during T12's `/simplify` pass was right that the query was
  redundant and optimistic about WHICH object replaces it. Retired anyway by
  routing Team Home through `ProgramSchedule`, the read `ScheduleRow` derives
  from. 5b confirmed the `ScheduleRow` finding independently and called the
  workaround a legitimate resolution, not an evasion.
- **changed:** new `getProgramSchedule = cache(...)` is the single memoised
  whole-program read; `readSchedule` stays private and uncached, with a comment
  saying why the old per-wrapper `cache()` deduped nothing. `getScheduleRows` split
  into pure `scheduleRowsFrom(schedule)` + a thin wrapper; new pure
  `eventDetailFrom(schedule, eventId)`; `getUploadQueue` reads through the shared
  cache. Team Home: `EVENT_WINDOW` and the narrow query deleted, `loadWeekendDual`
  became synchronous `buildWeekendDual(detail)`, and next event / dual selection /
  KPI rows all derive from the one `ProgramSchedule`.
- **an ordering hazard disappeared with the query.** `program_events` is now
  ordered in exactly one place in the codebase — `readSchedule`'s `starts_on
  DESC`. Team Home reverses that array in memory rather than asking Postgres for a
  second ordering, so there is no longer a second `ORDER BY` that has to stay in
  step with the schedule page's.
- **`getEventDetail` deliberately NOT routed through the shared read.** Same
  round-trip count either way, but it would make one event's page pull every entry
  and match in the program. 5b judged the call sound.
- **one deliberate behaviour change, disclosed:** the retired 12-row `EVENT_WINDOW`
  used to HIDE a next event behind 13 finished ones. The new code finds it.
  Criterion 4 said "renders the same"; 5b judged this an unavoidable consequence
  of criterion 3 rather than an embellishment. Scenarios A-E are byte-identical on
  `{nextEvent, weekendDual, kpis}`, established by diffing serialised output from
  the real loader before and after.
- **test honesty, volunteered rather than extracted:** all 10 new tests fail
  against HEAD, but the implementer disclosed unprompted that they fail for a WEAK
  reason — `scheduleRowsFrom` does not exist there and `weekendDualRow` was
  private, so `TypeError`, not a wrong assertion — and stated it was not claiming
  they reproduce a bug. 5b reproduced that at HEAD via a disposable `git worktree`
  and confirmed the characterisation exact. The real evidence for criterion 4 is
  the before/after output diff, not the tests.
- **`git worktree` is the right way to compare against HEAD.** 5b used one instead
  of `git stash`; it does not touch the working tree or index, and it is what the
  reviewer in T14 should have reached for.

## T27 · Team Home's `rosterIds` misses a claimed player's user id — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 172 passed (159 prior + 13 new). 5b
  `task-completion-reviewer` — `VERDICT: pass`, dispatched ALONE and finished
  before 5c. 5c BOTH guardrails ran: `pipeline-guardrails-reviewer` and
  `rls-boundary-reviewer`, both explicit no-findings all-clears.
- **this was the blocker on `/pr-check`'s not-ready verdict** at 40e7b56, found by
  `code-review` and confirmed independently by both project reviewers and by hand.
- **changed:** new `src/lib/data/roster-ids.ts` holds the rule ONCE —
  `canonicalRosterIds(rows): Map` (moved out of `team-roster-server.ts`, where it
  already existed) and `rosterMatchIds(rows): ReadonlySet`, literally
  `new Set(canonicalRosterIds(rows).keys())`. `team-roster-server.ts` calls the
  helper instead of its inline loop; `team-home-server.ts`'s `people` row type
  gains `user_id` and `rosterIds` becomes `rosterMatchIds(people)`. The inline
  `matches` mapping was extracted verbatim into an exported `teamMatchRow(...)` so
  a test can assert the row a coach actually sees — both reviewers diffed the body
  field-for-field against the original lambda and the `.select()` behind it.
- **why one builder plus a derived view, rather than handing Team Home the Map:**
  the two callers ask different questions — the Roster page RESOLVES an id to a
  row (`canonical.get(raw) ?? raw`), Team Home asks MEMBERSHIP (`Set.has`). Giving
  the membership call site a `.get()` it has no business calling is this same bug
  one level along. One loop decides which ids belong to a roster row, so the two
  answers cannot drift; a test asserts the set IS the map's key set.
- **the widening direction was the risk, and it was checked:** the bug was a set
  too NARROW; the fix makes it wider, and a set grown too far attributes
  strangers' matches to the team — worse than what was fixed. `canonicalRosterIds`
  adds `user_id` only when non-null AND different from `player_id`, so a staff seat
  and an unclaimed player (both columns equal, per the RPC's three UNION arms)
  contribute exactly one id; a null `player_id` row is skipped entirely; and every
  id still comes from a row already scoped to `p_program_id`.
- **side is unaffected by the widening, verified not assumed:** `programSide` tests
  `player1_id` then `player2_id` in order, so the set decides only WHETHER a row is
  attributed, never which column wins. A test puts the user id in `player2_id` with
  a score that is a win for player1 — so a wrong side would print a win under the
  player who lost — and asserts `won === false` with the sets flipped.
- **THE IMPLEMENTER CAUGHT ITS OWN BAD TEST, which is the thing worth recording.**
  Its first `teamFirstReport` test PASSED against the pre-fix code: an unattributed
  row keeps stored order, and the fixture already had the player in
  `player1_name`, so the title read correctly whether or not attribution ever
  happened. It rewrote the fixture to store the player in `player2`, so the title
  only reverses if the side was established. Same trap, same fix, for
  `teamAttention` — whose alert would otherwise have named the opponent first to
  that player's own coach. 5b confirmed both now fail pre-fix with the stated
  symptom by substituting the old rule in a disposable worktree: exactly 8 of 13
  fail, across all four consumers, and the 5 that pass both ways are genuine
  controls (strangers not ours, profile id on both sides, coach seat, unclaimed
  player, two-stranger row).
- **`rosterIds` never reaches a query.** The RLS reviewer confirmed it is used only
  for in-memory attribution — no `.in()`, `.eq()` or `.or()` receives it — so no
  query returns rows a caller could not previously read. And `user_id`, though now
  on the `people` row type, is never read or forwarded: every return shape was
  traced and none carries a raw id.
- **flagged, correctly not fixed:** `player-profile-server.ts:130` has the same
  class of gap — it computes `isPlayer1` from one id, so a claimed player's
  pre-claim matches are missing from their OWN profile page. Queued as T29.

## T15 · Guard the tiebreak superscript on set shape — done
- **gate:** 5a mechanical — `npm run lint` 0 errors / 38 pre-existing warnings;
  `npx tsc --noEmit` exit 0; `npm test` 183 passed (172 prior + 11 new). 5b
  `task-completion-reviewer` — `VERDICT: pass`, dispatched ALONE and finished
  before 5c. 5c `pipeline-guardrails-reviewer` ran (`src/lib/ui/` score rendering,
  a surface the guardrails doc names) and returned an explicit all-clear;
  `rls-boundary-reviewer` SKIPPED — the diff touches only `src/lib/ui/` and
  `tests/`, nothing under `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or
  `supabase/migrations/`, and adds no query.
- **this was the second of two merge blockers**, and it had been `blocked` since
  its first run because the answer was not in the repo.
- **unblocked by two production queries the author ran.** The census: 47 sets
  carry a non-null tiebreak, 41 of them zero-fill (`tb1=0, tb2=0`) on shapes no
  tiebreak can decide, and 40 of those were PRINTING a spurious superscript —
  `6-3⁰`, `6-4⁰`, `7-5⁰` — because `0 ?? null` is `0` and `<ScoreLine>` gates on
  `!== null`. Live output, not a latent hazard. The three real tiebreaks: `1-0
  (tb 10,5)`, `0-1 (tb 9,11)`, `8-9 (tb 3,7)`.
- **changed:** one line prepended to `tiebreakOf` —
  `if (Math.abs(set.player1 - set.player2) !== 1) return null;` — plus a doc
  paragraph recording the derivation, plus a new `tests/score-format.spec.ts`
  (11 tests) where no spec for this module existed.
- **the rule, and why it is not pattern-matching:** a set decided by a tiebreak is
  won by exactly one game, because the tiebreak IS the final game; without one you
  must win by two. So margin 1 implies a tiebreak. That is a fact about tennis,
  and 5b verified it AGAINST THE SPORT rather than against the census, at my
  explicit request: the only one-game-margin completions are 6-6→7-6, 8-8→9-8, and
  a super-tiebreak stored as 1-0 — every non-tiebreak completion needs two. It
  also checked the incomplete-set states (`formatScoreboardStatus` has unfinished
  / withdrew / default) and confirmed they are not counterexamples to a rule about
  FINISHED sets. No counterexample exists.
- **both narrower guards this repo previously tried were wrong, in opposite
  directions**, and the comment now records both so nobody re-litigates:
  `mine === 7 && theirs === 6` (too tight — hides the `1-0` super-tiebreaks that
  production actually holds) and `tiebreak > 0` (guards VALUE — hides a real `7-6`
  won 7-0 in points). The new guard reads only the games, never the value.
- **side selection untouched, verified byte-for-byte by both reviewers.** The diff
  is a pure prepend; the three original lines are identical, and the now-unreachable
  trailing `return null` was deliberately left rather than tidied, so those lines
  stay undisturbed. This matters because the production data stores each player's
  OWN points in their own slot, contradicting the comment `tiebreakOf` quotes —
  and `tiebreakOf` is nevertheless correct under both conventions, since the
  loser's slot holds the loser's points either way. An agent "fixing" the side to
  match the data would have broken what works. That conflict is T30's.
- **effect on the real rows:** `1-0`→5, `0-1`→9, `8-9`→3, all unchanged; `6-3`
  with `0,0` goes from `0` to `null`. Every consumer inherits it —
  `<ScoreLine>` (matches list, Team Home rows, search palette, schedule, dual
  sheet, home rail) and `match-summary-row`'s scoreboard, whose `setWon` the
  reviewer confirmed is layout (which player row hangs the digit) and not a second
  shape rule.
- **test honesty, volunteered unprompted:** the implementer reported 3 of 11
  failing pre-fix AND flagged, without being asked, that `an unfinished 3-3
  renders nothing` passes either way — equal games already returned null via the
  pre-existing comparisons — marking it in the source and keeping it only because
  the criterion names it. 5b confirmed the count, confirmed the disclosure
  accurate, and checked that none of the other seven both-ways tests share that
  property. Third task running where the implementer caught this class itself.

## T32 · Merge splitstep-integration in and reconcile the roster surface — done
- **gate:** 5a mechanical on the merge result — `npm run lint` 0 errors / 38
  pre-existing warnings; `npx tsc --noEmit` exit 0; `npm test` 183 passed. 5b
  `task-completion-reviewer` — `VERDICT: pass`, dispatched ALONE before 5c. 5c
  BOTH guardrails ran: `pipeline-guardrails-reviewer` and
  `rls-boundary-reviewer`, both explicit no-findings all-clears.
- **THE QUESTION WAS WRONG, AND ESTABLISHING IT WAS THE TASK.** I framed this as
  "which of two designs governs the roster surface — Coach Surfaces round 44 or
  Team Roster section 07". Both branches were working from the SAME project,
  `afde9116`, which holds one canvas per surface: `Coach Surfaces.dc.html` is
  Team Home, `Team Roster.dc.html` is the Roster page, alongside `Events &
  Lineups.dc.html` and `Header.dc.html`. And `abcb65f6` — the id in `DESIGN.md`
  I flagged as a competing project — is the v3 DESIGN SYSTEM LIBRARY, components
  and tokens, containing no roster table at all. It is the vocabulary a roster
  table is drawn in. The `claude_design` MCP is not available in this session, so
  this was settled from repo-internal evidence and every citation was
  independently verified by 5b.
- **the roster table has no artboard in Coach Surfaces, and this branch said so
  at the time.** T4's own note filed it as "Out of scope but worth its own task
  later: `roster-table.tsx` still uses the old full-bleed wash … and Roster is a
  result list too." T6 then applied round 44's CROSS-CUTTING rule (8a, the
  result-list row treatment) to it by extension, without an artboard.
- **and the two never actually disagreed.** The other branch defines 9a as "6a's
  columns with 5a's `#` column and **8a's row treatment**" — 8a being the exact
  rule T6 applied. Resolving `roster-table.tsx` to 9a KEEPS round 44's row
  treatment and adds the roster's own artboard on top. The single divergence is
  one word on the invite row's trailing control: T6 kept "Withdraw", 9a says
  "Revoke". Resolved to 9a.
- **resolution, by file:** `roster-table.tsx` (6 hunks) to `MERGE_HEAD` wholesale,
  then six vocabulary substitutions re-applied by hand — `ClaimedTodayPill`,
  `InviteRing`, `invitedLine()`, `resendRole()`, `RESEND_CLASS`, `RESEND_LABEL` —
  all byte-identical strings, so zero visual delta, done because
  `roster-vocabulary.tsx` is also imported by Team Home's `roster-card.tsx` and a
  local copy is the two-spellings-of-one-fact failure that module exists to
  prevent. `roster/page.tsx` (2 hunks) both sides kept in full, both additive.
  `roster-invite-dialog.tsx` (2 hunks) import unions, every symbol confirmed live.
  `team/page.tsx` (1 hunk) ours' round-45 structure kept.
- **one hand-edit beyond resolution, and it prevented silently deleting their
  feature:** the other branch's only substantive change to `team/page.tsx` was
  `playersCanUpload` → `canUploadForProgram(active)`, and it landed in copy round
  45 had already deleted — so resolving to "ours" would have dropped their
  per-member upload gate without a conflict marker. Carried across by hand to the
  equivalent lines. Both reviewers confirmed `canUploadForProgram()` returns true
  for all staff before reading either flag, so no staff behaviour changed.
- **what the merge BRINGS that this branch wanted:** `matches_block_client_regraft`
  (migration `20260824211820`), a DB-level trigger that re-derives membership and
  closes the "regraft a match to a stranger's `player1_id`" hole. That is a
  database backstop for the same attribution class T8, T27 and the guardrails doc
  exist for. Merging gained protection rather than only costing reconciliation.
- **T18 has NO SPEC, and that is now a known gap.** Verifying its `!listed` guard
  survived took an ad-hoc TypeScript-compiler-API check by the implementer and an
  independent byte-for-byte diff of `submit()` against `ORIG_HEAD` by 5b. It is a
  `"use client"` dialog and this repo has no component-rendering harness. The
  guard stops twelve pasted addresses binding to one athlete's profile; it will
  need re-verifying by hand at every future merge until it has a test. Queued as
  T33.
- **verified surviving, by test not by reading:** T27 (`tests/team-roster-ids.spec.ts`,
  13), T13 and T14 (`tests/team-roster-progress.spec.ts`, 15), T15's margin guard
  and T3's `tiebreak` field removal (the `match-detail-server.ts`/`types.ts`
  auto-merge preserved it — the pair I had flagged as riskiest resolved correctly
  with no conflict). The other branch brought ZERO test files, verified two ways,
  so 183 is the correct target and not a shortfall.

## T34 · Team Home shows a player RLS-subset data under program-wide labels

- **verdict: pass.** 5a green — `npm run lint` 0 errors / 38 warnings, none in a
  touched file; `npx tsc --noEmit` exit 0; `npm test` **196 passed**, up from 183.
- **5b was run by me, not by `task-completion-reviewer`.** The reviewer subagent
  was dispatched and ran for ~25 minutes, then **died silently without delivering
  a report** — its transcript stopped growing at 250521 bytes, no completion
  notification ever queued, and `TaskStop` returned "No task found". This is a new
  failure mode for this queue and worth remembering: a subagent can disappear
  without the gate noticing, so an unreturned reviewer must be treated as *no
  verdict*, never as a pass. I re-ran all six `done when:` boxes by hand against
  primary sources.
- **box 2 verified against the migration, not the paraphrase.** `resultsScope()`'s
  doc quotes `20260822090400_match_access_by_player_identity.sql`; the real policy
  at lines 61-82 matches it structurally. `is_program_staff` is
  `user_program_role in ('owner','coach','staff')`
  (`20260817073930_program_members.sql:100`), and `resultsScope` returns
  `"program"` for every role except `'player'` — the two agree exactly, no gap.
- **box 1 fails closed and has one call site each.** `scope` is computed once in
  `getTeamHomeData` from `viewerRole` + `team?.program.rosterVisible ?? false`.
  `teamKpis` takes it as a **required** 6th parameter (so tsc, not review, is what
  stops a caller arriving without one) and returns `[]` before any arithmetic.
  `buildWeekendDual` gates `tally` on `scope === "program"`. Greps confirm exactly
  one production caller of each, both passing it.
- **box 3 is enforced by the type, not by a conditional.** The score moved into a
  `Tally` component taking a non-null `DualTally`; a narrowed read renders the
  sentence instead. That is stronger than the box asked for — it makes the wrong
  render unwritable rather than merely un-taken.
- **box 4 verified by ordering.** `Trailing()` tests `!line.readable` *before*
  `reportId` and before every branch that assumes a match. `readable` is
  `scope === "program" || match !== null`, so a player's OWN line stays readable.
- **box 5 is byte-identical.** `resultsVisibilityPhrase` returns the same two
  strings and `resultsVisibilitySentence` reproduces `Match results are ${…}.`
  exactly; the Roster page's rendered copy is unchanged.
- **off-list files are consequences, not creep.** `roster-vocabulary.tsx` and
  `roster/page.tsx` are how box 5 gets one phrase instead of two.
  `entry-state.ts` is genuinely doc-only — diff shows comment hunks only, both
  function bodies untouched.
- **tests assert behaviour.** The load-bearing one is *"a narrowed read gets none,
  on identical rows"* — same fixture, same jobs, same roster, only `scope`
  differs. That isolates the gate as the single variable rather than restating
  the implementation.
- **found while gating, queued as T38:** T34 named `dualScore` but fixed only
  Team Home. Grepping every call site found two more production callers with the
  identical shape — `schedule-server.ts:256` and `dual-detail.tsx:39` — neither in
  T34's scope. The mechanism is built and tested, so applying it there is small.
- **still unverified against production:** the Supabase MCP exposes only
  `query_logs`, no `execute_sql`, so the RLS predicate above is read from
  `supabase/migrations/`, which CLAUDE.md warns runs ~100 migrations behind. The
  gate can only ever withhold, so a stale reading costs a coach nothing and costs
  an entitled player a number they could have seen — the safe direction, but not a
  verified one.

## T38 · The schedule page has T34's bug on a second surface

- **verdict: pass.** 5a green — `npx tsc --noEmit` exit 0; `npm run lint` 0
  errors / 38 warnings, all pre-existing, none in a touched file; `npm test`
  **198 passed**, up from 196.
- **both premises held.** Neither the schedule list nor the event detail route
  is staff-gated for visibility — `canEdit`/`isProgramStaff(active)` gates only
  the edit affordances, so both surfaces are confirmed player-reachable and
  the task's presumption was correct.
- **box 1 & 2 — gate reused, not forked.** `scheduleRowsFrom` and `DualDetail`
  both take `scope: ResultsScope` as a required parameter and import
  `resultsScope`/`ResultsScope` from T34's `results-visibility.ts` — no second
  rule. Neither schedule route had `roster_visible` already in hand (unlike
  Team Home's free ride off `getTeamSettings()`), so one minimal new read,
  `programRosterVisible()`, was added — a single-column `programs` select,
  matching `getRosterData`'s own precedent rather than pulling in the larger
  `getTeamSettings()`. Fails closed the same way: `Boolean(data?.roster_visible)`.
- **box 3 — verified in the diff, not the summary.** `DualDetail`'s `score` is
  `scope === "program" ? dualScore(entries) : null`; every downstream read
  (`anyPlayed`, `singlesScore`, `doublesScore`, the win/loss badge, the "final"
  eyebrow) is null-guarded off it, and the withheld branch renders
  `RESULTS_WITHHELD_SENTENCE` — the same sentence T34 used, not new copy.
- **box 4 — confirmed by reading `line-row.tsx`, not by trusting the claim.**
  `Action()`'s `state === "empty" && !canEdit → return null` already exists
  and predates this task. `canEdit` is `isProgramStaff(active)` at both page
  call sites — the identical predicate `resultsScope` gates staff on — so a
  player never has `canEdit` and a withheld line already renders nothing
  rather than "Not played", for every player-reachable case. No new field
  needed; T38 correctly did not add one.
- **test isolates the gate as the one variable.** The new
  `scheduleRowsFrom` spec runs the identical 4–3 fixture through both scopes —
  `{us:4, them:3}` on `PROGRAM`, `null` on `OWN` — the same shape as T34's own
  "identical rows" tests.
- **flagged, not actioned:** the implementer noted `ScheduleRow.playedCount`/
  `workingCount` and the list's "N of 9 in"/"final" cell are also computed via
  `entryPlayed`/`isWorking` over possibly-narrowed `entries` and can
  under-report the same way — out of T38's named scope (which pointed at the
  `dualScore` consumers specifically), not evaluated further here. Worth a
  follow-up task if confirmed.
- **also out of scope, correctly:** `tournament-detail.tsx` and
  `single-detail.tsx` were not touched — not named by the task, and
  tournament-entry visibility narrowing is a distinct question neither T34
  nor T38 addressed.
