# Tasks — claude/coach-surfaces-design-rounds-t93v6b

> Scope: Team Home (`/dashboard/team`) — apply rounds 45 and 44 of
> `Coach Surfaces.dc.html`; data-dependent surfaces deferred to a later phase.

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

## T1 · The Team Home frame that never moves
- **status:** done
- **files:** `src/app/dashboard/team/page.tsx`,
  `src/components/dashboard/team/usage-meter.tsx` (likely a new footer strip
  beside it) — a guess
- **done when:**
  - [ ] `/dashboard/team` with zero matches renders the same greeting `<h1>` as
        the populated page (`Good morning/afternoon/evening, {first name}`), and
        the string "Nothing here yet" appears nowhere under `src/`
  - [ ] The New match primary (`advButton("primary")`) sits in the header's
        trailing slot in both empty and populated states, same position in both
  - [ ] Usage renders as a footer strip at the bottom of the page in both states
        — gauge icon, "N of M hours left this month" in tabular figures,
        "Resets <Month> 1" micro, link to `/dashboard/settings/usage` — and no
        usage meter renders beside the greeting any more
  - [ ] Empty → populated changes only the middle: header, primary and footer
        markup are identical, and neither state renders a dashed ghost or
        placeholder card standing in for content that hasn't arrived
  - [ ] The player (non-staff) view keeps the same frame with its own subline,
        no checklist, and no empty gap where the staff checklist would be
- **notes:** round 45 rule 1 — "the frame never moves"; 45a is the day-zero
  reference artboard.

## T2 · Checklist cards flip in place
- **status:** done
- **files:** `src/components/dashboard/team/first-steps.tsx`, and whatever
  restoring the bulk invite flow needs — a guess
- **done when:**
  - [ ] Each of the three cards renders one of three variants in its own fixed
        slot, keeping its eyebrow ("First report" / "Your schedule" /
        "Your team"): active, progress receipt, done receipt
  - [ ] Progress receipt: title dims to `--ink-700` ("On its way") and the
        button is replaced by a StatusChip plus mono elapsed time — same slot,
        same eyebrow
  - [ ] Done receipt: a plain 15px Lucide `check` before the title, title and
        body at `--ink-500`, one quiet link and no button; `circle-check` and
        `circle-x` appear nowhere in the file (outcome glyphs are match-only)
  - [ ] Exactly one card carries emphasis (`--border-medium` + `--shadow-card`,
        and the primary button when that card has a button) — the first card
        that is not `done`, whatever its variant. A progress receipt is not
        done, so it takes emphasis when it is first; its emphasised slot is the
        StatusChip row, since a receipt has no button to promote. The only
        state with no emphasised card is the one where the row has already
        exited
  - [ ] All three done → the whole row unmounts in one step; no card is removed
        on its own and no ghost or explanatory placeholder replaces it
  - [ ] The bulk invite flow survives: a coach can still paste a list of
        addresses and send them in one action, reachable from the product
        without opening a dialog that no longer exists. No user-facing invite
        capability is lost relative to `ea2bcd6`
- **notes:** 45b/45c/45d. 40b's "remove done cards immediately" is what this
  revises — receipts hold their slots so nothing reflows mid-week.
  First attempt is stashed at `91cbfcd519f3da568913a1d90a9aefbb6a8d4747` —
  start from it rather than rebuilding; it satisfied every criterion except
  emphasis, and it deleted `invite-dialog.tsx`, which is where the bulk flow
  went. Its dialog deletion also left `setPlayersCanUpload`
  (`src/components/dashboard/settings/team-actions.ts:279`) dead; whatever the
  rerun does with the dialog, that export must not be left orphaned.

## T3 · Score and outcome primitives — superscript tiebreak, ResultMark
- **status:** done
- **files:** new shared components under `src/components/dashboard/` (e.g.
  `score-line.tsx`, `result-mark.tsx`), replacing the local formatters in
  `src/lib/schedule/format.ts`, `matches/match-card-list.tsx` and
  `search/search-command-palette.tsx` — a guess
- **done when:**
  - [ ] A shared score renderer prints a tiebreak as a superscript digit —
        `6-7³`, 0.6em, raised, 0.5px offset — and never `6-7(3)`
  - [ ] One spelling survives, and it is the artboards': hyphen between games,
        comma-space between sets — `4-6, 6-7³`. Schedule surfaces
        (`line-row.tsx`, the `single-detail.tsx` hero) therefore change from
        `6–4 6–2`; that is intended, not a regression. No en-dash or
        space-joined score spelling is left anywhere in `src/`
  - [ ] A shared ResultMark renders Lucide `circle-check` (win) / `circle-x`
        (loss) at 14px, 1.5 stroke, with an accessible label and no "Won"/"Lost"
        word or badge
  - [ ] Both are consumed by at least the schedule line row and the matches card
        list, so no second copy of the tiebreak rule survives in `src/`
  - [ ] `match-summary-row.tsx` imports the shared rule for *which side holds
        the tiebreak digit* rather than restating it, and keeps its own boxed
        per-set scoreboard layout. The rule lives in one place; the layout stays
        where it is
  - [ ] Neither component fetches or derives data — both take resolved props.
        A `*-server.ts` file may appear in the diff **only** to update a call
        site to the shared rule: no query, no selected column, no returned
        shape and no loader logic may change. The three
        `buildScoreString` callers are the intended case
  - [ ] `/dashboard/opponents/[programId]` renders the canonical spelling.
        `buildScoreString`'s legacy space-joined form is gone, along with the
        `.replaceAll(" ", ", ")` patches its other two callers apply
  - [ ] The superscript is not gated on a 7-6 game count. A set recorded with a
        tiebreak value carries its digit whatever the games read — a
        super-tiebreak third set stored `1-0` with the loser's `8` renders
        `1⁸`. This is what the shared rule already does on every surface;
        `match-summary-row` matching it is the point, not a regression
- **notes:** round 44 — "one outcome vocabulary per row shape, never both";
  superscript applies to any score on any page.
  Second attempt is stashed at `c449df8e2e5fe730a9b5d359074d9ce9a3a101fd` —
  start from **that** one, not the first. It landed the shared rule in
  `src/lib/ui/score-format.ts`, collapsed six private formatters into it, and
  made `match-summary-row` import the rule while keeping its boxed layout. The
  two criteria added above are the only gaps left, and both were previously
  forbidden by a criterion of mine that was wrong rather than by anything in
  the code.
  (The first attempt is stashed at
  `4860c8d05b92bffb0e68219b879451271f70703a`; superseded, ignore it.) It met criteria 2 and 4 and got the
  superscript and the loser-side attribution right; the two criteria added
  above are exactly what it missed. Two things it found and left alone, both
  fine to leave: `buildScoreString()` in `(home)/recent-activity.tsx:127` is a
  fifth spelling carrying no tiebreak rule, and `resultInk()` in
  `match-analysis.ts:244` lost its last caller — report either again rather
  than deleting. Its own architectural wart is worth revisiting: `lib/`
  importing `formatScoreText` from `components/` inverts the usual direction,
  and moving the shared pure functions into `lib/` would settle it.

## T4 · Round-44 row treatment on Team Home
- **status:** done
- **files:** `src/components/dashboard/team/match-rows.tsx`,
  `src/app/dashboard/team/page.tsx` — a guess
- **done when:**
  - [ ] Rows hover to a `--surface-muted` wash on a rounded rect inset from the
        card edge — corners visible inside the border, not a full-bleed wash
  - [ ] No hairlines inside the card at all: the `border-t` between rows is
        gone, and no rule is added under the header either. The card's own
        border is the only line — 45c/45d's Matches card is `surface-card` with
        `padding:8px 24px` and nothing ruled inside it
  - [ ] The pending-invites line links to `/dashboard/team/roster` and says to
        resend from Roster, instead of pointing at `/dashboard/settings/team`
  - [ ] Row height and column grid are unchanged and `TeamMatchRow` is untouched
        — the diff is presentation only
  - [ ] The card is headed by an `eyebrow` reading exactly `Matches` — the
        design's own label, not "Recent matches" and not any other wording. A
        count beside it is optional; leave it out unless it falls out for free
- **notes:** 8a hover. Alert lists keep their hairlines — this rule is for
  result lists.
  First attempt is stashed at `111732d2f04500cf1e820342e95b7ec1b8f76ce1` —
  restore it, then change the header wording and **remove the hairline it put
  under that header**. The author has ruled the rule out explicitly, and the
  artboards agree.
  Row geometry in 45c/45d, for reference: `margin:0 -12px; padding:0 12px;
  border-radius:var(--radius-element)`, hovering to `--surface-muted` — the
  hover rect bleeds wider than the text column while staying inside the card's
  24px padding. The stash reaches the same effect with a padded `<ul>`; either
  is fine so long as the corners read as inset and the row grid is unchanged. Every other criterion passed its
  review: the geometry is concentric (14px card radius − 6px list inset = the
  row's 8px), `focus.css` already rings `a[href]` so no ring utility is needed,
  the `ROW` constant and all four cell spans are byte-identical, the
  `RosterProgress` import is type-only, and `roster.invited - roster.joined` is
  genuinely `outstanding.length`. It failed only because it invented the header
  copy; the artboards (45b/45c/45d) head this exact card `Matches` + count, so
  the header itself was right and only the wording was not.
  Optional, and only if it costs nothing: 45c and 45d also put an `All matches`
  link at the right of that header, pointing at the matches list.
  Out of scope but worth its own task later: `roster-table.tsx` still uses the
  old full-bleed wash with between-row hairlines, and Roster is a result list
  too.

## T6 · Roster rows take the round-44 treatment
- **status:** done
- **files:** `src/components/dashboard/team/roster-table.tsx` — a guess
- **done when:**
  - [ ] Member and invite rows hover to a `--surface-muted` wash on a rounded
        rect inset from the card edge, not the current full-bleed row wash
        (`roster-table.tsx:312`), and keyboard focus gets the same wash
  - [ ] The `border-b` hairlines between rows are gone (`:312`, `:541`); the
        single rule under the column-header row (`:506`) stays, because it
        heads a table rather than following an eyebrow
  - [ ] Pending invites keep their dashed-ring rows, Resend and Withdraw
        exactly as they are — this is a hover and hairline change only
  - [ ] Row heights, column tracks and every action are unchanged, and no
        `*-server.ts` file appears in the diff
- **notes:** round 44's 8a rule — "surface-muted wash on a rounded row inset
  from the card edge; hairline only above the list, none between rows" — for
  result lists. Roster is one; `match-rows.tsx` (T4, `cadfee2`) is the worked
  example to copy. The comment at `:498` currently defends the full-bleed wash
  and needs rewriting rather than left to contradict the code.

## T7 · Clear what rounds 44 and 45 left behind
- **status:** done
- **files:** `src/lib/data/match-analysis.ts`, `src/lib/schedule/format.ts`,
  `src/lib/data/matches-list-types.ts`, `src/lib/data/types.ts`,
  `src/lib/data/match-detail-server.ts`,
  `.skills/advantage-analytics-design/SKILL.md` — a guess
- **done when:**
  - [ ] `resultInk()` is gone from `match-analysis.ts:244` and
        `grep -rn "resultInk" src/` returns nothing
  - [ ] `formatScore()` is gone from `schedule/format.ts:84` and nothing
        imports it; `formatScoreText` from `src/lib/ui/score-format.ts` is the
        only score-to-string function left in `src/`
  - [ ] The `tiebreak?: boolean` field is gone from both declarations
        (`matches-list-types.ts:63`, `types.ts:11`) **and** from the two places
        that still write it (`transformDbMatch`, `match-detail-server.ts:65`) —
        it lost its last reader when `ScoreLine` took over
  - [ ] `.skills/advantage-analytics-design/SKILL.md:744` cites a file that
        exists — it currently points at `team/invite-dialog.tsx`, deleted in T2
  - [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` are clean, and
        nothing rendered on any page differs
- **notes:** all four were found by reviewers during T2–T4 and deliberately
  reported rather than deleted, because each sat outside the task that found
  it. The `tiebreak` boolean is the only one needing a loader edit, and it is a
  field removal, not a query change.

## T8 · Results in the Team Home rows
- **status:** done
- **files:** `src/lib/data/team-home-server.ts`,
  `src/components/dashboard/team/match-rows.tsx` — a guess
- **done when:**
  - [ ] `TeamMatchRow` carries the match outcome and its set scores, tiebreak
        values included. `matches.score` and anything else needed may be added
        to the loader's existing select — that query did **not** select `score`
        before. No migration, no new table, column or view in the database
  - [ ] A finished row renders `<ResultMark>` + `<ScoreLine>` + a "View report"
        link in place of the status dot and word; a row still processing keeps
        the dot and its `ANALYSIS_LABEL` text
  - [ ] Scores render through `src/lib/ui/score-format.ts` — no new formatter,
        and the tiebreak digit comes from the loser's slot, as `tiebreakOf`
        defines it
  - [ ] Row height is unchanged, and T4's treatment is intact — rounded inset
        hover, no hairlines inside the card, the `Matches` eyebrow, and the
        row's `px-[18px] py-3.5`. The column *tracks* may change, because
        criterion 2 puts a glyph, a score and a report affordance where a dot
        and a word used to fit: state the new template and why each track is
        the width it is
  - [ ] Every claim a comment makes about which code writes a column is true.
        The first attempt said only `recordResult` writes `event_entry_id`; the
        upload wizard writes it too (`useUploadMatchWizard.ts:1130`). The
        invariant survives — the wizard resolves `player1_id` to the same
        roster pick a preset implies — but the comment must say so
- **notes:** was T5's first bullet, and the one that most changes how the page
  reads — T3 shipped both renderers, so this is the data to feed them. Board E
  of the preview shows the target; boards B–D show today's dot-and-word.
  First attempt is stashed at `a4ec547032a5e53b173763e39e88a9fb6da87c63` —
  start from it. It failed only on the tracks assertion above, which was a
  defect in the criterion rather than in the work. Everything else stands, and
  the part worth protecting is the attribution rule: roster id first, then a
  set `event_entry_id` implying player1, then `null` and **no glyph at all**
  rather than a guess. Both guardrail reviewers verified all three premises
  against the writers themselves; do not re-derive or "simplify" that rule.

## T9 · This weekend — the dual sheet
- **status:** done
- **files:** `src/lib/data/team-home-server.ts`, a new
  `src/components/dashboard/team/dual-sheet.tsx` — a guess
- **done when:**
  - [ ] When the program has a dual in the current week, a "This weekend" card
        renders above the matches list with the event name, site, surface and
        date
  - [ ] It lists that dual's lines in position order — S1–S6 then D1–D3 — each
        with its players, and either ResultMark + score where a result exists
        or a status chip where one does not
  - [ ] The team tally ("4–3") is computed from the lines, never stored, and a
        clinch is named only when the lines actually clinch it
  - [ ] Nothing renders when no dual is in range — no empty card, no
        placeholder, no explanatory ghost
  - [ ] Every read goes through the existing RLS-scoped server client and
        existing tables; no migration
  - [ ] One place spells a line's state. "Analyzing", "In line" and "Analysis
        failed" currently appear byte-identically in both `line-row.tsx` and
        the dual sheet, hardcoded in each file's JSX. Extract the words to one
        exported map keyed on `EntryState` and have both files read it, so a
        `grep` for any of those strings finds exactly one definition. The
        states themselves already come from the shared `EntryState`; it is only
        the words that are duplicated
  - [ ] `single-detail.tsx` reads the map too, for the three branches that
        match it. Its `failed`, `working` and `waiting` chips
        (`single-detail.tsx:127-140`) carry the same three words and the same
        tones as `LINE_STATUS`'s keys, so they read from it. Its **`ready`
        branch stays exactly as it is** — "Analysis ready", tone `win`, no key
        in the map — and that file keeps deriving its states from the
        `match-analysis` predicates rather than adopting `EntryState`. Nothing
        it renders may change
- **notes:** was T5's second bullet. 44a is the reference artboard. The
  schedule pages already read these tables — reuse their loaders rather than
  writing a second way to assemble a dual.
  Second attempt is stashed at `dbceda33b679372da2c172f48466f25da0e55546` —
  start from **that** one. It carries the sheet, the loader work, the page
  wiring, `line-status.ts` and the converted `line-row.tsx`; only
  `single-detail.tsx` is left. (The first attempt is at
  `eed71ae14e51e209f8422c2ce8c51139c66c2576`; superseded, ignore it.)
  Do not fold `single-detail.tsx`'s `ready` branch into the map, do not convert
  that file to `EntryState`, and do not touch its fourth chip — the reviewer
  accepted that argument, and only the three matching branches are in scope. Every criterion passed and both boundary reviews were clean;
  the only thing that blocked it is the duplicated strings the criterion above
  now names. Do not rebuild the sheet, do not re-derive the tally, and do not
  restructure the loader: it reuses `getEventDetail` and `dualScore`, adds no
  query (it widened T2's existing `program_events` read), and derives a clinch
  from the points the lines can actually award rather than an assumed seven.
  `line-row.tsx` renders those words interleaved with the event page's *write*
  actions, which have no place on this read-only card — so extract the words,
  not the component.
  Recorded and deliberately not fixed here: widening that read to `.limit(12)`
  means `nextEvent` could truncate for a program with 12+ events inside one
  Monday–Sunday week, all already past. Reachable through the app's write path,
  not through any real collegiate season.

## T10 · KPI strip, only once the numbers are honest
- **status:** done
- **files:** `src/lib/data/team-home-server.ts`, a new
  `src/components/dashboard/team/kpi-strip.tsx` — a guess
- **done when:**
  - [ ] The strip renders between the greeting row and the matches list, and
        carries a tile for each of dual record, sets won, team first serve and
        matches analyzed **whose figure can be computed honestly**. A figure
        that cannot — a dual record before any dual is decided, a first serve
        with no stat rows — is **omitted**, never printed as `0–0`, `—%` or any
        other placeholder. This is the same rule T8 set for a row whose side
        cannot be established: silence beats a plausible wrong answer. Say in
        the code which tiles can be absent and when
  - [ ] The strip renders only when the program has at least one analyzed
        match; on day zero it renders nothing at all — no skeleton, no zeroed
        tiles
  - [ ] Below the stated sample threshold each tile carries a subtext naming
        the match count ("3 matches — small sample") and renders no trend and
        no sparkline
  - [ ] Trend and sparkline appear only once there is at least a week of data
  - [ ] Every figure traces to an existing table; no migration
  - [ ] `teamKpis()` itself is under test, not only the pure helpers it calls.
        Cover the four states that decide what a coach sees: day zero (no
        analyzed match — no tiles at all), a program with analyzed matches but
        **no decided dual** (the tile is absent, and nothing prints `0–0`),
        below the sample threshold (every tile carries its count, no trend, no
        sparkline), and mid-season (trend and sparkline on the tiles that
        carry them)
- **notes:** was T5's third bullet. 45d is the honest-small-sample reference;
  44a is the same strip at mid-season. The rule the round states is "never a
  skeleton strip on day zero".
  First attempt is stashed at `9db3e34683717299c6f72c36731c26a3f50bbe41` —
  start from it. Everything in it passed except the two criteria above, and the
  first of those was my wording rather than its work: it already omits a tile
  it cannot compute, which is what the amended criterion now asks for. So the
  real work left is the `teamKpis()` tests.
  Do not re-derive any of this, all of it reviewed and cleared: `setTally()` is
  a verbatim extraction of `matchOutcome`'s counting body (both guardrail
  reviewers checked it line by line — T8's glyphs depend on it); the constants
  `SMALL_SAMPLE_MIN = 5` and `TREND_MIN_SPAN_DAYS = 7`, required together; the
  decision that dual record and matches analyzed never carry a trend or
  sparkline; and `statKey`'s move into `aggregate.ts`.

## T11 · The right column — next event, roster, needs attention
- **status:** done
- **files:** `src/app/dashboard/team/page.tsx`,
  `src/lib/data/team-home-server.ts`, `src/components/dashboard/team/*`
  — a guess
- **done when:**
  - [ ] Team Home becomes a two-column grid — main plus a 340px right column —
        at desktop width and stacks to one column below it, with T1's frame
        (greeting row, primary, usage footer) spanning the full width in both
  - [ ] The right column carries a "Next" event card, a roster card and a
        "Needs attention" list, each rendering nothing at all when it has
        nothing to say
  - [ ] The roster card uses the Roster page's own vocabulary — dashed-ring
        invited rows with Resend, the claimed-today pill — not a second set of
        words for the same states
  - [ ] "Needs attention" keeps per-row hairlines: round 44 exempts alert lists
        from the 8a rule, which is for result lists
  - [ ] Staff only, matching the existing `isStaff` gate; a player sees the
        main column alone with no empty gutter beside it
- **notes:** was T5's fourth bullet. Run this last of the four — it changes the
  page's layout, and T8–T10 all land inside the main column.

## T12 · Team Home's day and week arithmetic is the server's, not the reader's
- **status:** done
- **files:** `src/lib/data/team-home-server.ts` (`localDay`, `weekBounds`, ~lines 85-120); a new or extended spec under `tests/`
- **done when:**
  - [ ] `localDay()` and `weekBounds()` state which timezone they actually compute in, and the comments no longer claim "the reader's own reckoning" unless a zone is being passed in to make that true
  - [ ] The zone is explicit at the call site rather than inherited from the server process — the same shape as `usage-format.ts` and `active-workspace-server.ts`, which both pin `timeZone: "UTC"` on purpose
  - [ ] A test pins `now` to Sunday 18:00 US Pacific (Monday 01:00 UTC) and asserts `weekBounds` returns the week still containing the preceding Friday and Saturday
  - [ ] `getTeamHomeData` derives the day, the week bounds and the invite-expiry arithmetic from one clock, so no two of them can disagree about what day it is
- **notes:** Found by `/pr-check` on this branch. The comment argues these getters protect readers west of Greenwich from `toISOString()`; on Vercel the server's local time *is* UTC, so the protection does not exist and the code is a no-op relative to its own rationale. Live effect: after 17:00 PT Sunday the week rolls forward and the weekend dual sheet disappears — exactly the failure the Monday-start rationale two lines below exists to prevent. Note the repo has no `programs.timezone` column that surfaced in a grep; if the fix needs one, that is a schema task and this one should be `blocked` naming it rather than inventing the column.

## T13 · Roster progress counts `program_members`, so coach-managed players are invisible
- **status:** done
- **files:** `src/lib/data/team-home-server.ts` (`rosterProgress`, ~line 653, and its call site ~line 1274); `src/components/dashboard/team/first-steps.tsx` (`teamVariant`, ~line 106)
- **done when:**
  - [ ] `rosterProgress` counts coach-managed players, using the same `program_roster_full` rows `getTeamHomeData` already loads for `rosterIds` — not a second read and not a second answer to who is on this team
  - [ ] A program whose roster is entirely coach-managed profiles gets `joined > 0`, so the "Build your team" card shows its done receipt instead of asking for invitations that are not needed
  - [ ] The receipt's count and `playersLabel()` report the same number a coach sees on `/dashboard/team/roster`
  - [ ] Staff seats are still excluded from the player count — the existing comment's reason ("a program with four coaches and no roster is not 0% of the way to being set up") still holds
- **notes:** Found by `/pr-check`. `rosterProgress` is handed `team?.members` (`program_members`), but this file's own comment at ~line 1130 says `program_roster_full` is "the only one that includes a coach-managed player". So `invited = joined + outstanding` is 0 for a fully coach-built roster and the checklist keeps asking a coach to invite a team they have already built.

## T14 · An expired invite reads "expires today", forever
- **status:** done
- **files:** `src/lib/data/team-home-server.ts` (`rosterProgress` expiry arithmetic ~line 660, `teamAttention`'s `invites-expiring` alert ~line 807)
- **done when:**
  - [ ] An invite whose TTL has already passed is not counted in `expiringSoon` — it is either excluded or surfaced as its own already-expired state, but it is not reported as expiring in the future
  - [ ] `expiringInDays` no longer reaches its `Math.max(0, …)` clamp with a negative input, so "expires today" is only ever printed on a day it is true
  - [ ] A test covers an invite that expired before `now` and asserts the alert list does not claim it expires today
  - [ ] Whatever the alert does with an expired invite, the roster card and the alert agree — a coach is not told two different things about the same invitation
- **notes:** Found by `/pr-check`, confirmed in the source. `outstanding` is every pending player invite regardless of TTL, and `expiries.filter(e => e <= horizon)` matches past expiries as readily as near-future ones; the `Math.max(0, …)` then turns the negative into 0. Net effect: an invite that lapsed last month pins a permanent "One invite expires today" to Needs attention, which is exactly the kind of alert that teaches a coach to ignore the list.

## T15 · Restore the 7-6 guard on the tiebreak superscript
- **status:** blocked
- **files:** `src/lib/ui/score-format.ts` (`tiebreakOf`); `src/components/dashboard/matches/match-detail/match-summary-row.tsx` (~line 220)
- **done when:**
  - [ ] A superscript is rendered only where the set score is one a tiebreak can decide — a stored tiebreak value on, say, a 6-4 set renders no digit
  - [ ] A third set played as a 10-point super-tiebreak DOES render its digit — it is a set a tiebreak decided, and the guard must not swallow it
  - [ ] How this app actually records a super-tiebreak set is established from the WRITERS (`single-score-entry.tsx`, `edit-match-dialog.tsx`, the SwingVision parser, `job-request.ts`) and written into `tiebreakOf`'s doc comment, rather than inferred from the shape of the guard
  - [ ] The guard lives in `tiebreakOf` so every consumer inherits it, rather than being restated at each scoreboard
  - [ ] `<ScoreLine>` and `match-summary-row`'s per-player scoreboard agree on which sets get a digit, and both still put it on the side the notation requires
  - [ ] Tests cover both directions: a set carrying a tiebreak value it cannot have prints nothing, and a super-tiebreak set prints its digit
- **notes:** Found by `/pr-check`. T3 routed `match-summary-row` through the shared `tiebreakOf` and dropped the local `set.tiebreak && mine === 7 && theirs === 6` check in the process. `tiebreakOf` already refuses a tiebreak filed against the set's winner, and documents why ("a misfiled value renders nothing rather than a plausible lie") — this is the same argument applied to the set score, so the guard belongs beside it.
  **Decided by the author, 2026-08-25:** a super-tiebreak set gets its digit. So the guard is NOT `mine === 7 && theirs === 6`; that was the old local check and it would hide exactly the set this decision says to show. If the writers cannot be made to agree on how a super-tiebreak is recorded — i.e. the answer genuinely needs data that is not in the repo — mark this `blocked` and say what is missing rather than picking a shape that looks plausible. A guard that silently drops a real tiebreak is the same class of bug as the one being fixed.

## T16 · The first-report card reads only the six rows the list shows
- **status:** done
- **files:** `src/components/dashboard/team/first-steps.tsx` (~line 94); `src/lib/data/team-home-server.ts` (whatever it has to hand the card)
- **done when:**
  - [ ] `report` and `inFlight` are answered from the program's matches, not from the six-row list prop
  - [ ] A program whose only analysed match is older than the six most recent rows shows the done receipt, not "Send your first match"
  - [ ] Nothing new is fetched for it — the season read `getTeamHomeData` already performs for the KPI strip is the source, or the answer is computed server-side and passed as a flag
  - [ ] The three checklist cards still unmount together once all three read done
- **notes:** Found by `/pr-check`. `matches` is the six-row `TeamMatchRow[]` the list renders, so the card's question ("has a first report ever come back?") is being asked of a window that cannot answer it. Low frequency today because young programs have few matches, and it gets worse as a program's history grows past six.

## T17 · KPI sparkline and headline read different windows
- **status:** done
- **files:** `src/lib/data/team-kpi.ts` (~line 192, `seriesTile`); `tests/team-kpi.spec.ts`
- **done when:**
  - [ ] The sparkline and the headline figure are computed from the same set of observations, or the tile states plainly that the spark shows a shorter recent window
  - [ ] The doc comment no longer claims the two cannot disagree if they still can
  - [ ] A test constructs a series longer than the spark window where the trailing slice moves opposite to the whole, and asserts the tile does not show a rising spark beside a falling change
  - [ ] `SMALL_SAMPLE_MIN` and `TREND_MIN_SPAN_DAYS` still gate the trend exactly as they do now
- **notes:** Found by `/pr-check`. The spark draws the last 8 observations while the headline and the change read the whole series, so a season that improved overall but dipped recently can show a falling spark next to a rising change — two claims about one number, on one tile.

## T18 · A bulk invite binds every pasted address to one managed profile
- **status:** todo
- **files:** `src/components/dashboard/team/roster-invite-dialog.tsx` (~lines 230-245)
- **done when:**
  - [ ] The current behaviour is established first and recorded in the task log — whether a selected `target` is meant to apply to a whole pasted list, or only to a single-address invite
  - [ ] If it is a bug: no run can attach more than one invitation to the same `profileId`, either because the form refuses a multi-address paste while a target is selected or because `playerId` is carried per-address rather than per-run
  - [ ] If it is intended: the dialog says so on screen before sending, so a coach pasting twelve addresses is not silently claiming all twelve are one player
  - [ ] Either way the one-open-invite upsert is not made to race itself — the sequential loop and its stated reason survive
- **notes:** Found by `/pr-check` (code-review), and the ONLY task in this batch whose premise I did not confirm — hence the investigate-first criterion. What is certain from the source: the loop passes `playerId: target?.profileId ?? null` unchanged for every address in `addresses`. What is not certain is whether the UI can even reach that state, since selecting a managed player may already constrain the form to one address. Establish that before changing anything; if the answer is "unreachable", close this `blocked` with the reason rather than hardening a path nobody can take.

## T19 · `readSchedule` runs twice per Team Home render
- **status:** todo
- **files:** `src/lib/data/team-home-server.ts`; `src/lib/data/schedule-server.ts` (or wherever `getScheduleRows` / `getEventDetail` are defined)
- **done when:**
  - [ ] `readSchedule` executes once per Team Home render, not once per `cache()`d wrapper
  - [ ] The measured query count for a render with a dual in range drops from 19 back toward the 7 it was before this branch, and the number is stated in the task log
  - [ ] The narrow `program_events` query and `EVENT_WINDOW` are retired if `ScheduleRow` can answer the next event and the weekend dual, as the corrected `TeamNextEvent` comment says it can
  - [ ] Team Home renders the same next event, weekend dual and KPI figures as it does today
- **notes:** Found by `/simplify` during `/pr-check` and deliberately deferred: `getScheduleRows` and `getEventDetail` are separately `cache()`d over one uncached inner function, so React's cache dedupes neither. Render cost went from 7 queries / 2 deep to 19 / 9 with a dual in range. Deferred at the time because rewriting a loader straight after per-task review would merge code no reviewer had seen — which is the reason it is a task rather than a fix.

## T20 · Give a program its own timezone
- **status:** todo
- **files:** a new migration under `supabase/migrations/`; `src/lib/data/team-home-server.ts` (`PROGRAM_TIME_ZONE`, `localDay`, `weekBounds`); wherever the program record is read into `getTeamHomeData`
- **done when:**
  - [ ] `programs` carries a timezone column with a sane default, and the migration backfills existing rows rather than leaving them null
  - [ ] `getTeamHomeData` passes the program's own zone where it currently passes the `PROGRAM_TIME_ZONE` constant, and the constant is retired or demoted to the fallback for a program with none
  - [ ] A test pins a program in `America/Los_Angeles` at Sunday 18:00 Pacific and asserts the weekend dual sheet is still in range — the case T12 documented as still broken
  - [ ] The column is a real IANA zone name validated on write, not a UTC offset — an offset cannot express DST and is wrong twice a year
  - [ ] `tests/team-home-week.spec.ts`'s existing assertions still pass, including the one that pins today's shipped UTC behaviour for a program with no zone set
- **notes:** The other half of T12, which pinned UTC explicitly and made the comments honest but left the bug: a Pacific program's weekend dual sheet still leaves Team Home around 17:00 PT Sunday, because midnight UTC rolls the week forward while the coach is still reading about Saturday's dual. T12 deliberately shaped `localDay`/`weekBounds` so this is a one-line change from a constant to a field. `programs.state` was considered as a substitute and rejected — Arizona keeps no DST and nine states straddle two zones. Schema work, so verify the live database via the Supabase MCP before writing the migration; note that in this session only `query_logs` was exposed, so if `execute_sql`/`list_tables` are still unavailable, say so and mark this `blocked` rather than writing a migration against an unverified schema.
