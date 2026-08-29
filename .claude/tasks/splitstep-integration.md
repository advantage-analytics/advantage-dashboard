# Tasks — splitstep-integration

> Scope: the integration trunk. Anything landing on `splitstep-integration`
> before it merges to `main`.

Consolidated on 2026-08-28: this is now the **only** queue file. The queues of
merged-and-deleted branches were removed (their full history is in git and in
this branch's log files' history); every task from them that was still open was
moved here — T11 from `claude/duplicate-lineup-warning`, and T21–T37 from
`claude/coach-surfaces-design-rounds-t93v6b`, whose code merged into this
branch at commit `78dc25c`. Done tasks were pruned; the log file keeps the
dispatch record.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue, then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T3 · Add a docs-freshness reviewer
- **status:** later
- **files:** .claude/agents/docs-freshness-reviewer.md
- **done when:**
  - [ ] Reads docs/README.md first and honours its current-vs-point-in-time marks
  - [ ] Flags a doc whose described behaviour the diff contradicts
  - [ ] Does not flag a point-in-time doc merely for being old
  - [ ] tools and model match the other agents in .claude/agents/
- **notes:** Phase 2. docs/README.md already states the house rule that a doc
  drifting silently is worse than no doc; this enforces it.

## T4 · Vitest over the pure logic layer
- **status:** later
- **files:** package.json, vitest.config.ts, src/lib/services/upload/, src/lib/data/
- **done when:**
  - [ ] Vitest runs alongside Playwright without either claiming the other's files
  - [ ] The SwingVision parser has tests over a real fixture
  - [ ] statistics-server and statistics-client are asserted to produce the same
        shape from the same input
  - [ ] `npm test` runs both runners
- **notes:** Phase 2, and deliberately scoped. Blanket unit tests across all 419
  files are rejected: the runner is Playwright, most files are React components,
  and the cost/benefit does not hold. Target the logic that fails silently.

## T5 · Notion task ingestion
- **status:** later
- **files:** .claude/skills/task-import/
- **done when:**
  - [ ] Pulls open items from Notion via MCP
  - [ ] Rewrites each into the schema in this file, with a `done when:` list
  - [ ] Appends to the current branch's queue without touching existing entries
  - [ ] An item too vague for acceptance criteria is reported, not guessed at
- **notes:** Phase 3. The rewrite is the point: a Notion line like "fix the
  matches page" has no criteria, and a task without criteria cannot be gated.

## T7 · Stop a refused upload stranding its blob and job
- **status:** todo
- **files:** src/lib/services/splitstep/submit-match-video.ts,
  src/app/api/splitstep/jobs/route.ts (guess)
- **done when:**
  - [ ] A permission refusal at `/api/splitstep/jobs` leaves the job in a state
        something eventually reclaims — not `uploaded`, which
        `reap_stalled_uploads()` skips, reaping only `pending`/`uploading`
  - [ ] The blob for a refused job becomes reclaimable by the `reclaim-videos`
        cron rather than staying pinned by a job row that names it
  - [ ] A genuine transient submit failure — network, vendor 5xx — still leaves
        the job retryable without re-uploading, which is why `uploaded` exists
  - [ ] The person is told the upload will not be retried, instead of a
        "Not submitted" state inviting a retry that can never succeed
- **notes:** `/pr-check` finding. A coach revoking "Can send video" mid-transfer
  is the trigger: bytes land, submit 403s, and the job sits at `uploaded`
  forever with the blob behind it. The pending-review refusal has the same shape
  but self-resolves when the claim is approved; a permission refusal does not.

## T8 · Tell "cannot resolve your workspace" apart from "you are not a member"
- **status:** todo
- **files:** src/app/api/splitstep/upload-url/route.ts (guess)
- **done when:**
  - [ ] A null `getWorkspaceContext()` on a personal upload no longer returns
        the "you do not have access to the workspace this match belongs to" 403
  - [ ] That case returns a status the client treats as transient, with a
        message that asserts no membership fact
  - [ ] A real non-member — a match whose `program_id` the caller genuinely has
        no membership for — still gets the 403 and the existing sentence
  - [ ] The transient case does not mark the job failed, so a retry needs no
        re-upload
- **notes:** The route calls `getWorkspaceContext()` a second time (after its own
  `getUser()`); any transient GoTrue failure collapses `available` to `[]`, and
  `billingWorkspaceFor([], null)` returns undefined — reported as "no access" to
  the user's *own* personal workspace.

## T9 · Name every remedy a refused uploader actually needs
- **status:** todo
- **files:** src/lib/workspace/types.ts (guess — `explainVideoRefusal`)
- **done when:**
  - [ ] With both `players_can_upload` and the member's `upload_enabled` off,
        the refusal names both fixes, not only the program-wide one
  - [ ] With only one off, the sentence still names just that one
  - [ ] Staff and personal workspaces are unaffected — the `kind` and
        `isProgramStaff` short-circuits still answer first
  - [ ] The pending-review sentence is unchanged and still answered before the
        switches
- **notes:** Today the `!playersCanUpload` branch returns first, so a coach who
  opens Team settings as instructed finds the player still refused, now with a
  different message pointing at the roster row. Two round trips for one refusal.

## T10 · Catch a roster email that belongs to an account, not a roster row
- **status:** todo
- **files:** src/components/dashboard/team/roster-actions.ts,
  supabase/migrations/ (one migration, likely a check inside
  `update_program_player` / `add_program_player`)
- **done when:**
  - [ ] Saving a roster row whose email matches a `users.email` in the program
        — a coach's or another athlete's login address — is refused with a
        sentence a coach can act on, not saved silently
  - [ ] The refusal names whose account it collides with only as much as a
        coach may already see on the roster; it must not disclose an address
        the caller could not otherwise read
  - [ ] `addProgramPlayer` and `updateProgramPlayer` behave the same way — the
        gap is in both paths, not only Edit
  - [ ] The existing `program_players_email_key` path is untouched: a
        collision with another live roster row still maps to the same
        coach-readable sentence, not the raw constraint string
  - [ ] The check runs in the database, not only in the server action, so a
        direct RPC call from a staff session cannot bypass it
- **notes:** `program_players_email_key` is
  `(program_id, lower(email)) where email is not null and merged_into_id is
  null and archived_at is null` — it is scoped to **`program_players` rows**
  (`supabase/migrations/20260822090000_program_players.sql:96`). An address
  that lives in `users.email` and on no live roster row in that program passes
  it and saves. That is the reverse of the collision the tripwire was built
  for: `program_roster_full` coalesces `pp.email` with `u.email`, so the
  roster already *displays* account addresses, and a coach retyping one has no
  signal that it binds a personal login address into the program's own column.
  Deferred from the roster-edit work on `claude/roster-edit-player` (branch
  merged and deleted); the finding is written up in
  `docs/roster-edit-and-people-search.md`. Smaller follow-ups from the same
  review, not worth their own tasks: consolidate `toMessage`/`activeProgramId`
  in `roster-actions.ts`, dedupe the repeated select field list, give
  `UnderlineSelect` a chevron affordance, and put a unit suite over
  `spotHolders`/`spotHeldNote` and the error classifier (T4's Vitest task is
  the natural home for the last one).

## T11 · Collapse whitespace in process-match's is_player1 comparison
- **status:** todo
- **files:** supabase/functions/process-match/index.ts *(guess)*
- **done when:**
  - [ ] Both sides of the `is_player1` comparison collapse internal whitespace as
        well as trimming and lowercasing, so a `Player` of "Rudy  Quan" against a
        `Host Team` of "Rudy Quan" yields `is_player1 = true`
  - [ ] The rule is a local copy with a comment naming the two it must stay in
        step with — `normalizedPersonName` in src/lib/data/person-name.ts and SQL
        `normalized_person_name` — because a standalone Deno function cannot
        import from `src/`
  - [ ] An empty or missing `Host Team` throws with a message naming it, the way
        a missing Points sheet already does at index.ts:205, instead of writing
        `is_player1 = false` for every shot
  - [ ] Nothing else about the function changes: the same rows are written, and
        only `is_player1` and the new failure path differ
- **notes:** Moved from `claude/duplicate-lineup-warning-880446`'s queue (its T4;
  the branch merged and its queue was deleted 2026-08-28 — verified still unfixed
  at that date: index.ts:671 does `.toLowerCase().trim()` with no collapse). The
  bug: index.ts:216 and :671 both do `.toLowerCase().trim()` with no collapse,
  and `createCombinedSheets` merges sheets across several uploaded files — so
  `settingsRows[0]` can come from one export while shot rows come from another
  spelled differently. Every shot from the mismatched file is written as the
  opponent's; the match processes green and the court visualization, serve
  placement and every shot-derived stat show the athlete's shots on the wrong
  side. This is the silent misattribution docs/ui-revamp-guardrails.md exists
  for. Two things to know: there is no Deno test harness in this repo (`tests/`
  is Playwright over `src/`), so state how the change was verified rather than
  claiming coverage; and the fix is inert until `process-match` is redeployed —
  the task does not deploy it.

---

The tasks below moved here from `claude/coach-surfaces-design-rounds-t93v6b`'s
queue when that branch's queue was deleted (2026-08-28). The branch itself had
already merged into `splitstep-integration` at `78dc25c`, so the code they
target lives on this branch. Their original numbering (T21–T37) is kept because
the notes cross-reference each other and the branch's done tasks (T13–T20, T27,
T32, T34 — see git history of the deleted
`.claude/tasks/claude-coach-surfaces-design-rounds-t93v6b.md` for those).

## T21 · One managed profile can hold any number of open invitations
- **status:** todo
- **files:** a new migration under `supabase/migrations/`; possibly `src/components/dashboard/settings/team-actions.ts` for the error mapping
- **done when:**
  - [ ] `create_program_invite` refuses a `p_player_id` that already has an open invitation on a different address, or a partial unique index makes it impossible — verify against the LIVE database before writing either, per CLAUDE.md
  - [ ] The refusal reaches the invite dialog as a message a coach can act on, in the same shape as the existing `link_player` tripwire rather than a raw Postgres error
  - [ ] An invitee who arrives second no longer leaves a seat reserved indefinitely — either their row is closed when the profile is claimed, or the seat count stops treating a dead invite as pending
  - [ ] `accept_program_invite`'s existing race guard (`where claimed_by_user_id is null`) still decides the winner, unchanged
  - [ ] A test or a documented manual check covers two open invitations naming one profile
- **notes:** Confirmed by `rls-boundary-reviewer` during T18's gate, reading `20260822120000_invites_target_a_player.sql` and `20260822120100_accept_invite_claims_profile.sql` directly. `create_program_invite` validates the player belongs to the program and is unclaimed, but never checks whether another open invite already names it; the upsert conflict target is `(program_id, lower(email)) where accepted_at is null`, keyed on the ADDRESS, and there is no unique index on `program_invites.player_id`. T18 closed the UI path that produced this by accident, but a client guard is not a security boundary — the RPC still accepts it. Consequence traced by the reviewer: `accept_program_invite` returns `already_claimed` for every invitee after the first BEFORE stamping `accepted_at`, so their row stays open, which is exactly the state the seat-reservation count treats as reserved. The seat is held with no path to release short of the coach deleting the row by hand. Reviewer's suggested shape: a partial unique index on `(program_id, player_id) where accepted_at is null and player_id is not null`, or an explicit existence check inside the RPC. Authorization is NOT the issue — `is_program_staff` is checked before any write and the player is validated against the program, so this is same-program only. Schema work: only `query_logs` was exposed in this session, so if `execute_sql`/`list_tables` are still unavailable, mark this `blocked` rather than writing a migration against an unverified schema.

## T23 · Team Home reads `processing_jobs` twice, and one read is on the critical path
- **status:** todo
- **files:** `src/lib/data/schedule-server.ts` (`readSchedule`, `getProgramSchedule`); `src/lib/data/team-home-server.ts` (`getTeamHomeData`'s second `Promise.all`)
- **done when:**
  - [ ] `loadMatchAnalysis` runs once per Team Home render, not once inside `readSchedule` and once for the season union
  - [ ] The measured hop count on the critical path drops from 5 to 4, and the number is stated in the task log — measured the way T19 measured, not counted
  - [ ] `/dashboard/team/schedule` and `/dashboard/team/upload` keep today's behaviour: they still get analysis resolved without the caller having to supply it
  - [ ] Team Home renders the same dual sheet, the same match rows and the same KPI figures
- **notes:** Found by `/simplify` during `/pr-check` after T19 landed. `readSchedule` ends by calling `loadMatchAnalysis` for every entry-linked match; `getTeamHomeData` then calls it again for the union of the six recent rows and the whole season. The second set CONTAINS the first — `recordResult` writes `program_id` and `event_entry_id` onto the same row, so every match `readSchedule` resolves is already in the unbounded season read. The framing that matters: wave 1's wall-clock is set by the schedule chain's 4 SERIALIZED hops (events → entries → matches → jobs) while everything else in that `Promise.all` is 1 hop, so this duplicate is one of 5 hops on the critical path — roughly 20% of the page's DB latency, not 7% of its query count. Suggested shape: have `readSchedule` return matches with a `jobIds` list and add `withAnalysis(schedule, jobs)`, or let `getProgramSchedule` take an optional pre-resolved map; Team Home resolves once and passes it in, the other two pages let the loader resolve its own. **Deeper alternative worth considering instead:** PostgREST can express the whole chain as one embedded select (`program_events?select=…,program_event_entries(…,matches(…,processing_jobs(…)))`), taking it from 4 hops to 1 and the page from 5 to 2 — that would speed the schedule and upload pages too, and would make this task moot.

## T24 · Two Team Home reads return rows the page already has
- **status:** todo
- **files:** `src/lib/data/team-home-server.ts` (`getTeamHomeData`'s first `Promise.all`); `src/lib/data/team-settings-server.ts` (a narrower reader)
- **done when:**
  - [ ] The six-row recent-matches query is gone, and the list is built from the season read it is a strict prefix of — the season `select()` gains `tournament_name, round, match_type` for `matchContext`
  - [ ] Team Home stops firing the `program_roster` RPC it no longer reads: `getTeamSettings` is replaced at this call site by a reader that fetches the program row and the invites only
  - [ ] The ordering change is stated explicitly rather than slipped in — the season read pins `nullsFirst: false` where the recent read took Postgres's DESC default, so which six rows appear changes for a program with undated matches
  - [ ] `/dashboard/settings/team` still uses the full `getTeamSettings`, unchanged
  - [ ] Team Home renders the same six rows for a program whose matches all have dates
- **notes:** Two independent findings from `/simplify`, both pure waste, both 1 of 14 round trips and neither on the critical path — so this is DB work and connection contention rather than latency. (1) The recent query and the season query are both `.from("matches").eq("program_id", programId).order("date", desc)`; the season one is unbounded, so it already returns every row the six-row one does. The code acknowledges the containment and declines to use it ("the union is taken rather than assumed"). (2) `getTeamSettings` is three parallel reads — `programs`, the `program_roster` RPC, `program_invites` — and **T13 removed the last consumer of `team.members`** when it switched `rosterProgress` onto `program_roster_full` rows. Team Home now runs that RPC, maps its rows into `TeamMember[]`, and throws them away, while separately paying for `program_roster_full`, which supersedes it. The same waste exists at `team/upload/page.tsx` and the three `schedule/new/*` pages, which use only `program.defaultSurface` — one narrow reader fixes all five, but only Team Home's call site is this task's to own.

## T25 · `team-home-server.ts` is 1600 lines and seven exports exist only for tests
- **status:** later
- **files:** `src/lib/data/team-home-server.ts`; new modules under `src/lib/data/`
- **done when:**
  - [ ] The dual-sheet block moves out whole — `DualSheetLine`, `WeekendDual`, `dualLines`, `dualBreakdown`, `weekendDualRow`, `buildWeekendDual` — and takes the sole users of `entryState`, `matchState`, `matchWon`, `EntryState`, `entryPlayed`, `dualScore`, `EventEntry`, `EventSite`, `EventDetail` with it
  - [ ] `getTeamHomeData` keeps a call site of a few lines and `TeamHomeData` re-exports `WeekendDual`, so no component import changes
  - [ ] The "exported only so a spec can call it" paragraphs collapse to one statement in the module header, or disappear because the function now has a real home
  - [ ] Team Home renders identically — established the way T19 established it, by diffing the loader's own output, not by reading
- **notes:** Raised independently by the simplification and altitude reviewers during `/pr-check`. Marked `later` deliberately: it is a pure move with no behavioural intent, it touches the file every other queued task also touches, and doing it before T23/T24 would rebase both onto a moved target. Promote it once those have landed. Two specifics worth keeping: the **dual-sheet seam is the only clean one** — the simplification reviewer checked the KPI block and found `analysisOf` and `DbSeasonMatch` shared across the boundary, so cutting there splits a type and a helper; and `scheduleRowsFrom`/`eventDetailFrom` should NOT move, because they have a real production caller and their testability is a consequence rather than the reason. The altitude reviewer's stronger claim is worth weighing when this runs: the seven test-only exports currently work by accident of the whole transitive graph under `@/lib/supabase/server` being side-effect-free at module scope, and one module-scope `createClient()` anywhere in it breaks five specs for reasons unrelated to the code under test. `team-kpi.ts` is the in-repo precedent for the split, and `teamKpis` itself still living in the server module while its helpers sit in the pure one is the tell.

## T26 · Make the invite dialog's bad state unrepresentable rather than guarded
- **status:** todo
- **files:** `src/components/dashboard/team/roster-invite-dialog.tsx`
- **done when:**
  - [ ] A selected target cannot mean anything while the field holds a chip list — `target` is derived (`listed ? null : picked`) rather than maintained by a guard at each writer
  - [ ] T18's `&& !listed` at the submit-path `pick()` is gone, because it has become structurally impossible rather than checked
  - [ ] The remaining `listed` reads are presentation choices only: forgetting one shows a picker that should not be there, never a mis-bound invitation
  - [ ] Every existing behaviour survives — single-address tripwire still auto-binds, list-mode refusal still names the address, the sequential loop and its one-open-invite reasoning are untouched
- **notes:** Raised by the altitude reviewer during `/pr-check`, as the deeper form of T18's fix. The invariant "`linked` and `listed` are never both true" is stated in the module docblock and maintained by FIVE different mechanisms at five writers of `target`: nothing at all (`useState`, safe because `emails` starts empty), a `setEmails([])` on the next line (`reset`), a render gate (`InviteTargetPicker`), a blanked `normalized` (the on-screen tripwire), and now T18's explicit `&& !listed` (the submit path). One rule, five techniques — and the next writer has to know it and pick one. Note this file's own docblock argues against a `mode` enum because "the picker and the tripwire would each get their own idea of whether an invitation is linked"; that argument is about a second source of truth, and deriving `target` from `listed` is the opposite — one source, read consistently. The consequence when a writer is missed is what T18's comment spends fifteen lines describing, and T21's open schema hole means the client guard is currently the only thing in front of it. **The former T22 (dialog reset-path state) landed as done** — its reset path was another way `target` outlived the state it belongs to; check the current file before assuming its shape.

## T28 · Four smaller findings from the branch pre-merge check
- **status:** todo
- **files:** `src/lib/data/team-home-server.ts`; `src/app/dashboard/team/page.tsx`; `src/components/dashboard/team/roster-invite-dialog.tsx`; `src/components/dashboard/team/roster-card.tsx`
- **done when:**
  - [ ] The next-event card does not print a date in the past: selection is on `endsOn >= today` but the card prints `startsOn`, so an in-progress tournament shows under "Next" having already started — either the copy says what it means or the selection does
  - [ ] `team/page.tsx`'s header date and the greeting's `getHours()` stop reading the process zone while the loader pins `PROGRAM_TIME_ZONE` — the printed day and the week boundary must not disagree. T20 (program timezone) has since landed, so align with whatever it established; verified 2026-08-28 that `page.tsx:83` still reads `now.getHours()`
  - [ ] Bulk-invite dedupe is case-insensitive, matching `create_program_invite`'s own `lower(email)` conflict target — today two spellings of one address send twice, the second invalidates the first's token, and the receipt reports "2 invitations sent" and two seats used
  - [ ] `roster-card.tsx`'s claimed-today rows are keyed by something unique, not by display name
- **notes:** All four from `code-review` during `/pr-check` over the whole branch range. None blocks the merge on its own; grouped because each is a few lines and they touch four files that other queued tasks also touch. The invite-dedupe one is the most user-visible: a coach pasting a squad list with inconsistent capitalisation is told they sent more invitations than exist, and the earlier token silently stops working.

## T29 · A claimed player's pre-claim matches are missing from their own profile
- **status:** todo
- **files:** `src/lib/data/player-profile-server.ts` (~line 130); `src/lib/data/roster-ids.ts` (the helper T27 extracted)
- **done when:**
  - [ ] The profile page finds a claimed player's matches whether the row carries their `program_players.id` or their `users.id`
  - [ ] `isPlayer1` is decided against the same set of ids the fetch used, not against a single `playerId` — today a row found by one id can still be sided by the other and come out wrong
  - [ ] It reuses `canonicalRosterIds`/`rosterMatchIds` from `roster-ids.ts` rather than growing a third answer to "which ids are this player's"
  - [ ] A test covers a claimed player with a pre-claim match and asserts it appears on their profile, on the correct side
- **notes:** Found by the T27 subagent while fixing the Team Home half, and correctly left alone — no `done when:` line of T27's covered it. `player-profile-server.ts:130` fetches with `.or('player1_id.eq.${playerId},player2_id.eq.${playerId}')` and then computes `isPlayer1` as `match.player1_id === playerId` — one id in both halves. So a claimed player's matches from before the `program_players` backfill, which carry their user id, are absent from their own profile page. Note the second criterion is the sharper half: once the fetch widens, siding against a single `playerId` would find a row and then attribute it to the wrong player, which is worse than not finding it. That page already reads `program_roster_full` and has the `user_id` in hand. Same class as T27; the helper now exists.

## T30 · Two writers disagree about how a tiebreak is stored
- **status:** todo
- **files:** `src/components/dashboard/schedule/single-score-entry.tsx`; `src/components/dashboard/schedule/score-entry.tsx`; `src/components/dashboard/matches/new-match-wizard/DetailsContent.tsx`; `src/components/dashboard/matches/match-actions/edit-match-dialog.tsx`; `src/lib/services/upload/parsers/swingvision-parser.ts`
- **done when:**
  - [ ] It is established and written down which convention `matches.score`'s tiebreak arrays actually use, per writer — "the loser's points in the loser's slot" or "each player's own points in their own slot"
  - [ ] All writers agree, or the difference is documented as deliberate with the rule a reader can apply
  - [ ] `tiebreakOf`'s doc stops quoting `single-score-entry.tsx`'s comment as though it were the whole rule, if it is not
  - [ ] A part-played set cannot carry a tiebreak, or T15's guard is tightened to cope. T15 admits any FINISHED one-game-margin set, and leans on nothing else storing an abandoned one — but the free-entry schedule forms (`score-entry.tsx`, `single-score-entry.tsx`) render a tiebreak cell for every set and bound nothing, so a set typed `5-4` with a tiebreak is storable today and would print a superscript. No such row is in the census; this is closing the door, not chasing a bug
  - [ ] The 41 zero-fill rows are addressed — either the writer that emits `0,0` for a non-tiebreak set stops doing so, or a migration nulls them, or it is recorded why leaving them is safe now that T15's guard refuses them
  - [ ] Nothing about `tiebreakOf`'s side selection changes without evidence — it currently prints correctly under both conventions
  - [ ] `countTiebreaksWon` (`src/lib/data/match-stats-server.ts:228`) is reconciled with T15's shape rule, or it is established that it cannot disagree. Today it compares `p1 > p2` with no margin check, so a margin-≥2 set carrying real stored points would COUNT as a tiebreak won while `<ScoreLine>` refuses to draw it — one number saying a tiebreak happened and the score beside it saying none did
- **notes:** Found by the two production queries that unblocked T15. `single-score-entry.tsx` comments that "the tiebreak belongs to whoever LOST the set — the winner took it 7-x", and `tiebreakOf`'s doc quotes that as the encoding rule. But the only three real tiebreaks in the database — `1-0 (10,5)`, `0-1 (9,11)`, `8-9 (3,7)` — all carry **both** players' own points in their own slots. Either a different writer produced them, or the comment describes the UI's input affordance rather than the storage. Also: 41 sets carry `tb1=0, tb2=0` on shapes no tiebreak can decide, so something is zero-filling the arrays rather than leaving them null. T15's guard makes those harmless to render, which is why this is not a blocker — but a column with two conventions and a zero-fill is a trap for the next person who reads it. Do NOT let this task change `tiebreakOf`'s side selection: it prints the right digit under both conventions today, verified against all three rows.

## T31 · Four Team Home specs, three row builders, two job builders
- **status:** todo
- **files:** a new `tests/fixtures/team-home.ts`; `tests/team-kpi.spec.ts`; `tests/team-first-report.spec.ts`; `tests/team-roster-ids.spec.ts`
- **done when:**
  - [ ] One `seasonMatch` builder, one `recentMatch`, one `jobsFor`, in `tests/fixtures/team-home.ts` — `tests/fixtures/` is already the convention (`tests/fixtures/splitstep/`)
  - [ ] All four Team Home specs import them; no spec keeps a private copy of a row or job builder
  - [ ] The shared builders take overrides, so the three current signatures (`side`, `ourId`/`column`, `provider`) are all expressible without a fourth
  - [ ] Adding a column to the season `select()` is a one-file edit in `tests/`
  - [ ] Every existing assertion still passes unchanged — this is a fixture move, not a rewrite
- **notes:** Found by `/simplify` across two `/pr-check` runs. `team-kpi.spec.ts` and `team-first-report.spec.ts` each grew a `seasonMatch` (flagged on the first run), and T27's `team-roster-ids.spec.ts` made it three with a third signature, plus a `jobsFor` that is `team-first-report.spec.ts`'s minus `startedAt`. The three already differ in what they default (`score: null` vs a real score, and how `verified` is derived), which is the drift starting. Concrete cost: T16 had to edit two fixture files when `DbSeasonMatch` gained `player1_name`/`player2_name`, and a spec that forgets one silently tests a row shape the loader cannot produce. Deliberately NOT done inside `/pr-check` — it is test churn touching four files at the end of a branch, and every one of them is a file other queued tasks also touch. Purely additive when it runs: the shared module can land before any spec migrates.

## T33 · T18's invite guard has no test, and every merge has to re-prove it by hand
- **status:** todo
- **files:** `src/components/dashboard/team/roster-invite-dialog.tsx`; a new spec, or a new extracted module plus a spec
- **done when:**
  - [ ] The `linked`/`listed` invariant is asserted by something `npm test` runs — not by reading, not by an ad-hoc AST script
  - [ ] The test fails if T18's `!listed` guard on `submit()`'s tripwire `pick()` is removed
  - [ ] It also fails if any OTHER writer of `target` loses its gate — the picker's render gate and the on-screen tripwire's blanked `normalized` are the two that currently hold the rest of the invariant
  - [ ] Whatever shape this takes does not require a component-rendering harness, or if it does, that harness is the deliverable and is justified separately — this repo deliberately has none
  - [ ] The invite loop still passes at most one `playerId` per run, and that is what the test asserts, rather than asserting the guard's syntax
- **notes:** Surfaced by T32's merge. T18 stops a bulk paste binding every pasted address to one athlete's `program_players` profile — twelve invitations, one player, eleven seats held with no release path (the DB does not refuse it; that is T21). It has no spec, because it lives in a `"use client"` dialog and `playwright.config.ts` states the suite is pure-logic with no browser. So when the other branch edited the same file for 9b chrome, proving the guard survived took an ad-hoc TypeScript-compiler-API script from the implementer plus an independent byte-for-byte diff of `submit()` against `ORIG_HEAD` from the reviewer. That worked, and it does not scale: the same hand-verification is due at every future merge that touches this file, and the failure it guards against is silent.
  Two shapes worth weighing. **Extract the decision** — the `linked`/`listed` derivation and "which `playerId` does address N get" are pure given the form's state, so lifting them into a testable function beside the component gets a real spec with no harness; T26 (make the bad state unrepresentable by deriving `target` from `listed`) would create exactly that seam, so doing T26 first may make this nearly free. **Or add the harness** — honest, larger, and it would serve `roster-table.tsx` and the wizard too, but it is a change to how this repo tests and should be decided on its own merits rather than smuggled in under a guard fix.

## T35 · Resend unbinds a player-targeted invitation
- **status:** todo
- **files:** `src/components/dashboard/team/resend-invite.tsx` (~54); `src/components/dashboard/team/roster-table.tsx` (~700); `src/lib/data/team-settings-server.ts` (~63, the select); `src/lib/data/team-roster-server.ts` (~112, ~252); `src/components/dashboard/settings/team-actions.ts` (`inviteMember`)
- **done when:**
  - [ ] Resending an invitation preserves its `player_id`. Today both call sites pass none, `inviteMember` defaults it to `null`, and `create_program_invite`'s upsert does `player_id = excluded.player_id` — so the resend writes null over the binding
  - [ ] The read layer carries `player_id` forward so a call site CAN pass it: `team-settings-server.ts` selects `id, email, role, created_at` and `RosterInvite` has no such field, which is why neither call site could pass it even if it tried. That is the structural cause, not the call sites
  - [ ] `resend-invite.tsx` handles `result.linkTo` the way the invite dialog does, so a tripwire refusal is actionable rather than a dead-end red string
  - [ ] A test covers resending an invitation bound to a coach-managed profile and asserts the binding survives
- **notes:** Found by `/pr-check` over the merge result, confirmed by both project reviewers. **Distinct from T21**, and the RLS reviewer was explicit about why: T21 is `create_program_invite` failing to refuse a SECOND open invite naming the same `player_id` (a seat leak). This is the opposite shape — a single, correctly-targeted invitation losing its binding entirely, so acceptance mints a NEW `program_players` row instead of claiming the existing one. That is precisely the duplicate-profile bug migration `20260822120000` was written to prevent; its own header describes it as "accepting mints a second Priya and her three matches are stranded on the first one". T21's fix would not touch this.
  The RPC's tripwire does not reliably catch it: it refuses only when an unclaimed `program_players` row's email exactly matches the invite address, and `program_players.email` is nullable and documented as normally empty in a program's first week.
  **Partly inherited, partly newly propagated.** The `roster-table.tsx` call site and the missing `player_id` in the read layer predate this branch. `resend-invite.tsx` is NEW here and reproduces the identical bug on a second surface — and this branch's diff touches the old call site (extracting `resendRole`/`RESEND_LABEL`) without noticing.

## T36 · `teamAttention` reads the six-row window, not the season
- **status:** todo
- **files:** `src/lib/data/team-home-server.ts` (~1664, the `teamAttention` call site)
- **done when:**
  - [ ] `teamAttention` decides over the program's matches, not the six the list renders — a failed or stalled job outside that window still raises its alert
  - [ ] Nothing new is fetched: the season rows and the jobs map are already in hand at that call site, the same way T16 fixed `teamFirstReport`
  - [ ] A test builds a failed match older than the six most recent rows and asserts the alert appears
- **notes:** Found by `code-review` during `/pr-check`. This is **the same window mistake T16 already fixed for `teamFirstReport`**, still present in its sibling: `teamAttention` is handed `matches`, the six-row `TeamMatchRow[]`, and asks a whole-program question of it. A program whose failed upload has scrolled past six more recent matches is never told. Low frequency on a young program; certain on an established one, which is exactly when a coach stops watching the list.

## T37 · The onboarding checklist comes back on an established program
- **status:** todo
- **files:** `src/components/dashboard/team/first-steps.tsx` (~128, `scheduleVariant`); possibly `src/app/dashboard/team/page.tsx`'s render gate
- **done when:**
  - [ ] A program that has finished onboarding does not see the three-card checklist again because its schedule ran out
  - [ ] `scheduleVariant` distinguishes "never had a schedule" from "has no UPCOMING event", which is what it keys on today
  - [ ] The row still leaves once and stays gone, which is the rule its own doc comment states
- **notes:** Found by `code-review` during `/pr-check`. `scheduleVariant` is `nextEvent ? "done" : "active"`, and `nextEvent` is upcoming-only by design. Combined with `FirstSteps` now rendering for all staff rather than only on an empty page, an established program's Team Home re-mounts the onboarding checklist every time the last scheduled event passes — telling a coach who has run a season to "Add your first event". The component's own header says "The row leaves once… nothing is left behind to explain where it went"; this is the case where it comes back.
