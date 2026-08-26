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

## T15 · Guard the tiebreak superscript on set shape
- **status:** done
- **files:** `src/lib/ui/score-format.ts` (`tiebreakOf`); a new `tests/score-format.spec.ts`
- **done when:**
  - [ ] A superscript renders only where the set was won by exactly ONE game — `Math.abs(player1 - player2) === 1`. That admits `7-6`, `1-0` and `9-8`; it refuses `6-3`, `7-5`, `3-3` and every other shape
  - [ ] The rule lives in `tiebreakOf` so `<ScoreLine>` and `match-summary-row`'s scoreboard both inherit it, and neither restates it
  - [ ] A stored `0` on a legitimate one-game-margin set STILL renders — a tiebreak won 7-0 in points is real, and a value-based guard would hide it. The guard is on shape, never on value
  - [ ] `tiebreakOf`'s side selection is UNCHANGED — it already prints the right digit under both storage conventions found in the data (see notes), so this task adds a guard and touches nothing else
  - [ ] Tests cover, from the real shapes below: `7-6` renders, `1-0` renders `5`, `0-1` renders `9`, `8-9` renders `3`, `6-3` with a stored `0` renders nothing, `3-3` renders nothing, and a one-game-margin set with a stored `0` still renders
- **notes:** **Unblocked 2026-08-25 by two production queries — the facts below are measured, not inferred.** Of 47 sets carrying a non-null tiebreak, **41 are zero-fill** (`tb1=0, tb2=0`) on shapes no tiebreak can decide, and 40 of those RENDER a spurious superscript today, because `0 ?? null` is `0` and `<ScoreLine>` gates on `!== null`. `3-3` escapes only because equal games make `tiebreakOf` bail early. This is live output, not a latent hazard.
  **The three real tiebreaks, verbatim:** `1-0 (tb 10,5)`, `0-1 (tb 9,11)`, `8-9 (tb 3,7)`. Two findings from these. First, **super-tiebreaks exist and are stored as `1-0`/`0-1`** — the shape nobody could find a writer for, which is what blocked this task, and it confirms the author's decision that the guard must not be `mine === 7 && theirs === 6`. Second, **both slots hold each player's OWN points**, which contradicts `single-score-entry.tsx`'s comment (quoted in `tiebreakOf`'s doc) that "the tiebreak belongs to whoever LOST the set". Two conventions in one column. `tiebreakOf` is unaffected: under own-points-in-own-slot the loser's slot holds the loser's points, which is the digit the notation wants, so all three render correctly today. Do not "fix" the side selection.
  **Why the margin rule rather than enumerating shapes:** `8-9` is a set played out to 8-8 and decided by a breaker, not a super-tiebreak. What `7-6`, `1-0` and `9-8` share is a one-game margin — and that is a fact about tennis, since without a tiebreak a set must be won by two (`6-0`…`6-4` are margin ≥2, `7-5` is margin 2). Only a tiebreak yields a margin of 1. So the rule generalises to a pro-set without revisiting, and refuses the zero-fill by construction.
  Original finding by `/pr-check`; T3 removed the two guards that existed (`matches-list-types.ts`'s `> 0` and `match-summary-row.tsx`'s `7-6` shape check) when it consolidated the rule. Note `> 0` was itself wrong — it would hide a legitimate `7-6⁰`.

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
- **status:** done
- **files:** `src/components/dashboard/team/roster-invite-dialog.tsx` (~lines 230-245)
- **done when:**
  - [ ] The current behaviour is established first and recorded in the task log — whether a selected `target` is meant to apply to a whole pasted list, or only to a single-address invite
  - [ ] If it is a bug: no run can attach more than one invitation to the same `profileId`, either because the form refuses a multi-address paste while a target is selected or because `playerId` is carried per-address rather than per-run
  - [ ] If it is intended: the dialog says so on screen before sending, so a coach pasting twelve addresses is not silently claiming all twelve are one player
  - [ ] Either way the one-open-invite upsert is not made to race itself — the sequential loop and its stated reason survive
- **notes:** Found by `/pr-check` (code-review), and the ONLY task in this batch whose premise I did not confirm — hence the investigate-first criterion. What is certain from the source: the loop passes `playerId: target?.profileId ?? null` unchanged for every address in `addresses`. What is not certain is whether the UI can even reach that state, since selecting a managed player may already constrain the form to one address. Establish that before changing anything; if the answer is "unreachable", close this `blocked` with the reason rather than hardening a path nobody can take.

## T19 · `readSchedule` runs twice per Team Home render
- **status:** done
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
  - [ ] **The invite countdown reads the same zone the week does.** `wholeDaysUntil` currently reaches for the module constant directly and `rosterProgress` has no zone parameter to thread, so without this the weekend sheet honours the program's zone while "One invite expires tomorrow" stays on UTC — one page, two zones, which is the failure `getTeamHomeData`'s single-clock comment exists to prevent
  - [ ] `claimedTodayNames()`/`isToday()` in `team-roster-server.ts` stop taking their own second clock via `new Date()` and the process zone, or it is established that they cannot affect what Team Home renders
  - [ ] A test pins a program in `America/Los_Angeles` at Sunday 18:00 Pacific and asserts the weekend dual sheet is still in range — the case T12 documented as still broken
  - [ ] The column is a real IANA zone name validated on write, not a UTC offset — an offset cannot express DST and is wrong twice a year
  - [ ] `tests/team-home-week.spec.ts`'s existing assertions still pass, including the one that pins today's shipped UTC behaviour for a program with no zone set
- **notes:** Criteria corrected during `/pr-check`'s `/simplify` pass — as first written this task would have PASSED while leaving the bug in, because its `done when:` list named only `PROGRAM_TIME_ZONE`, `localDay` and `weekBounds`, and the invite countdown reaches the constant by a different route. The other half of T12, which pinned UTC explicitly and made the comments honest but left the bug: a Pacific program's weekend dual sheet still leaves Team Home around 17:00 PT Sunday, because midnight UTC rolls the week forward while the coach is still reading about Saturday's dual. T12 deliberately shaped `localDay`/`weekBounds` so this is a one-line change from a constant to a field. `programs.state` was considered as a substitute and rejected — Arizona keeps no DST and nine states straddle two zones. Schema work, so verify the live database via the Supabase MCP before writing the migration; note that in this session only `query_logs` was exposed, so if `execute_sql`/`list_tables` are still unavailable, say so and mark this `blocked` rather than writing a migration against an unverified schema.

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

## T22 · Cancel and Done leave the invite dialog's state behind
- **status:** todo
- **files:** `src/components/dashboard/team/roster-invite-dialog.tsx` (the footer buttons and the `RosterDialog` wrapper)
- **done when:**
  - [ ] Closing by Cancel or Done resets the dialog exactly as Escape, overlay click and the shell's X already do
  - [ ] Reopening after any close route shows an empty form — no chip, no selected target, no error, no receipt
  - [ ] There is ONE close path that resets, not four callers each remembering to
  - [ ] The receipt's Done still does whatever refresh it does today
- **notes:** Found by the T18 subagent, which correctly did not fix it — out of that task's scope. The footer's Cancel and Done call the `onOpenChange` prop directly rather than the `RosterDialog` wrapper that calls `reset()`. Escape, overlay click and the shell's own X do reset. It matters more after T18: `submit()`'s tripwire can still set a `target` on the receipt path, and closing by Done then carries that selection into the next open, where it silently applies to whatever the coach types next.

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
- **notes:** Raised independently by the simplification and altitude reviewers during `/pr-check`. Marked `later` deliberately: it is a pure move with no behavioural intent, it touches the file every other queued task also touches, and doing it before T20/T23/T24 would rebase all three onto a moved target. Promote it once those have landed. Two specifics worth keeping: the **dual-sheet seam is the only clean one** — the simplification reviewer checked the KPI block and found `analysisOf` and `DbSeasonMatch` shared across the boundary, so cutting there splits a type and a helper; and `scheduleRowsFrom`/`eventDetailFrom` should NOT move, because they have a real production caller and their testability is a consequence rather than the reason. The altitude reviewer's stronger claim is worth weighing when this runs: the seven test-only exports currently work by accident of the whole transitive graph under `@/lib/supabase/server` being side-effect-free at module scope, and one module-scope `createClient()` anywhere in it breaks five specs for reasons unrelated to the code under test. `team-kpi.ts` is the in-repo precedent for the split, and `teamKpis` itself still living in the server module while its helpers sit in the pure one is the tell.

## T26 · Make the invite dialog's bad state unrepresentable rather than guarded
- **status:** todo
- **files:** `src/components/dashboard/team/roster-invite-dialog.tsx`
- **done when:**
  - [ ] A selected target cannot mean anything while the field holds a chip list — `target` is derived (`listed ? null : picked`) rather than maintained by a guard at each writer
  - [ ] T18's `&& !listed` at the submit-path `pick()` is gone, because it has become structurally impossible rather than checked
  - [ ] The remaining `listed` reads are presentation choices only: forgetting one shows a picker that should not be there, never a mis-bound invitation
  - [ ] Every existing behaviour survives — single-address tripwire still auto-binds, list-mode refusal still names the address, the sequential loop and its one-open-invite reasoning are untouched
- **notes:** Raised by the altitude reviewer during `/pr-check`, as the deeper form of T18's fix. The invariant "`linked` and `listed` are never both true" is stated in the module docblock and maintained by FIVE different mechanisms at five writers of `target`: nothing at all (`useState`, safe because `emails` starts empty), a `setEmails([])` on the next line (`reset`), a render gate (`InviteTargetPicker`), a blanked `normalized` (the on-screen tripwire), and now T18's explicit `&& !listed` (the submit path). One rule, five techniques — and the next writer has to know it and pick one. Note this file's own docblock argues against a `mode` enum because "the picker and the tripwire would each get their own idea of whether an invitation is linked"; that argument is about a second source of truth, and deriving `target` from `listed` is the opposite — one source, read consistently. The consequence when a writer is missed is what T18's comment spends fifteen lines describing, and T21's open schema hole means the client guard is currently the only thing in front of it. **Do T22 first or together** — same file, and T22's reset path is another way `target` outlives the state it belongs to.

## T27 · Team Home's `rosterIds` misses a claimed player's user id
- **status:** done
- **files:** `src/lib/data/team-home-server.ts` (`rosterIds`, ~line 1527); `src/lib/data/team-roster-server.ts` (`canonical`, ~lines 304-322) — extract the shared rule rather than copying it
- **done when:**
  - [ ] Team Home's `rosterIds` recognises BOTH ids `program_roster_full` returns for a claimed player — `player_id` and `user_id` — so `programSide()` attributes a match carrying either
  - [ ] The canonicalisation exists ONCE. `team-roster-server.ts:318-320` already does it; extract that into a shared helper both loaders call, rather than adding a second copy — a second answer to "who is on this team" is what this bug already is
  - [ ] A test builds a roster row whose `user_id` differs from its `player_id`, and a match carrying the `user_id` with no `event_entry_id`, and asserts the row draws its outcome mark and counts toward the sets-won tile
  - [ ] `teamKpis`, `teamAttention`, `teamFirstReport` and the match rows all attribute that match — they share `rosterIds`, so one fix should cover all four; verify rather than assume
  - [ ] Staff seats keep working exactly as they do now
- **notes:** **Found by `/pr-check`, confirmed independently by `code-review`, `pipeline-guardrails-reviewer` and `rls-boundary-reviewer`, and verified by hand.** `program_roster_full` returns eleven columns including both `player_id` and `user_id`. `team-roster-server.ts:304-322` canonicalises both into one map, with a comment saying why: "A match recorded before coach-managed profiles existed carries their USER id." `team-home-server.ts:1535` maps `player_id` only. So `programSide()` returns null for a claimed player's match carrying the user id, and the row renders with correct names and a score but NO win/loss mark, while dropping silently out of the sets-won and first-serve tiles. Nothing on screen says a match was skipped.
  **Why it hid:** the loader's own comment at ~1452 reasons about exactly this upload path — "a coach uploading without a schedule preset lands their own user id in `player1_id`, and that is still our side of the net" — and it is correct FOR STAFF, because a staff seat has the same value in `player_id` and `user_id`. Only a claimed player has two distinct ids, and that case was not considered.
  **Two mechanisms reach it, both real.** (1) `rls-boundary-reviewer` traced the migration timeline: `matches.program_id` landed 2026-08-17, the `program_players` backfill 2026-08-22, and `20260822090200_program_players_backfill.sql` states outright that historic matches keep the user id in `player1_id`. Any program match for a since-claimed player written in that window carries the wrong-era id. (2) `pipeline-guardrails-reviewer` found the live path: `/dashboard/matches/new` renders with no preset regardless of workspace, and `useUploadMatchWizard.ts:1007-1016` then writes the uploader's raw auth id into `player1_id` while still stamping `program_id`. **This branch adds a prominent new door onto it** — `first-steps.tsx:233`, the new checklist's "Send a match" CTA, points straight at that route.
  Neither reviewer could confirm the live blast radius: `.env.local` is unreadable and only `query_logs` is exposed on the Supabase MCP. `team-roster-server.ts`'s "There are no such rows in this database today" is an empirical snapshot, not a structural guarantee. Worth one production query before or alongside the fix — but the fix is correct regardless, since the sibling loader already does it.

## T28 · Four smaller findings from the branch pre-merge check
- **status:** todo
- **files:** `src/lib/data/team-home-server.ts`; `src/app/dashboard/team/page.tsx`; `src/components/dashboard/team/roster-invite-dialog.tsx`; `src/components/dashboard/team/roster-card.tsx`
- **done when:**
  - [ ] The next-event card does not print a date in the past: selection is on `endsOn >= today` but the card prints `startsOn`, so an in-progress tournament shows under "Next" having already started — either the copy says what it means or the selection does
  - [ ] `team/page.tsx`'s header date and the greeting's `getHours()` stop reading the process zone while the loader pins `PROGRAM_TIME_ZONE` — the printed day and the week boundary must not disagree. **Fold into T20 if that lands first**, since it is the same one-page-two-zones failure
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

## T32 · Merge splitstep-integration in and reconcile the roster surface
- **status:** done
- **files:** the merge itself; conflicts in `src/app/dashboard/team/page.tsx`, `src/app/dashboard/team/roster/page.tsx`, `src/components/dashboard/team/roster-invite-dialog.tsx`, `src/components/dashboard/team/roster-table.tsx`
- **done when:**
  - [ ] **Ownership of the roster surface is ESTABLISHED FIRST and recorded, before a single hunk is resolved.** Which design governs `roster-table.tsx` and the roster dialogs — this branch's Coach Surfaces round 44, or the other branch's Team Roster section 07 (9a–9d, v3 chrome)? Read `DESIGN.md`, `.skills/advantage-analytics-design/SKILL.md`, and BOTH design projects via the `claude_design` MCC (`DesignSync`): this branch worked from `afde9116-328b-445c-aeff-8b3c2a702d6f` ("Coach Surfaces.dc.html"), while `DESIGN.md` names `abcb65f6-4e66-44bc-b9de-b3b47f4313c1`. If those are two different projects, say which one the roster table appears in and which is the system of record
  - [ ] `origin/splitstep-integration` is merged into this branch — that direction, never the reverse — and all 11 conflict hunks across the four files are resolved to whichever design the first criterion established
  - [ ] No file ends up half one design and half the other. A component wearing round-44's inset hover wash above section 07's claim pill is the failure this task exists to prevent, and it will look entirely plausible on screen
  - [ ] The other branch's FEATURE work survives whatever the design answer is — the roster row edit menu, 9d's claim receipt, the `Can send video` switch. Design ownership decides chrome, not whether a feature exists
  - [ ] This branch's own fixes survive too, and this is the sharp one: T27's `rosterIds` fix, T13's `playerCount`, T14's expiry arithmetic and T18's `!listed` guard all live in files the other branch also edited. Verify each is still present and still correct AFTER the merge, by test, not by reading
  - [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` all pass on the merge result, and the test count is at least 183 plus whatever the other branch brought
- **notes:** The branch is `ready` at `c904257` against the base it was cut from — but `splitstep-integration` has moved 20+ commits since, so that receipt does not describe what would land. `git merge origin/splitstep-integration` produces 11 conflict hunks: 1 in `team/page.tsx`, 2 in `roster/page.tsx`, 2 in `roster-invite-dialog.tsx`, 6 in `roster-table.tsx` (956 lines). An earlier `git merge-tree` check reported zero conflicts and was WRONG — the old three-argument form does not emit conflict markers, so do not re-run that as evidence.
  **Why this is a design decision and not a diff.** Both tracks landed on the roster surface on 2026-08-25, in parallel, from different branches. This branch's T6 gave roster rows the round-44 treatment (inset rounded hover wash, no rules between rows, `has-[:focus-visible]`); the other branch brought the same component to Design 9a v3 chrome, aligned its dialogs to 9b/9c, and added 9d's claim pill. Neither supersedes the other by date. The section-vs-round naming suggests they are different axes of one system — or, per `DESIGN.md`'s project id, possibly two different design projects entirely.
  **If the repo and the design projects cannot settle ownership, mark this `blocked` and say exactly what is missing rather than picking.** That is a legitimate outcome — T15 ended that way and was right to. Do not resolve toward whichever side has more lines, and do not preserve both.
  Merge direction matters: into this branch, where a mess is cheap. Do not merge out, and do not rebase — the branch is pushed and shared.

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

## T34 · Team Home shows a player RLS-subset data under program-wide labels
- **status:** done
- **files:** `src/app/dashboard/team/page.tsx` (~232, ~262); `src/components/dashboard/team/dual-sheet.tsx`; `src/components/dashboard/team/kpi-strip.tsx`; `src/lib/data/team-home-server.ts` (`teamKpis`, `dualLines`); `src/lib/schedule/entry-state.ts` (`dualScore`, `entryPlayed`)
- **done when:**
  - [ ] A player on a `roster_visible = false` program is never shown a dual score or a "Team" figure derived from rows RLS handed back for them alone — either the surface is withheld, or it says whose figures it is showing
  - [ ] The loader can TELL that it is looking at a subset. Today `entryPlayed()` reads "no visible match row" and "not yet played" identically, and there is no third state. Compare the entries visible against the matches attached to them, or pass `roster_visible` down, or gate on role — but the decision must be made where the data is, not guessed in the component
  - [ ] `dual-sheet.tsx`'s headline stops rendering a specific score in full ink when the viewer cannot see every line. `{playedLines} of {lines.length} in` is not sufficient — it reads as "not everyone has finished", which is a different sentence
  - [ ] A line the viewer cannot read stops rendering as **"Not played"**. It was played; the viewer cannot see it, and those are not the same claim
  - [ ] `roster/page.tsx:119-123` already solves this for the Roster page — *"Match results are visible to coaches only"*. Whatever Team Home does should be recognisably the same answer, not a second one
  - [ ] The two comments that assert the opposite are corrected: `page.tsx:232` ("every figure on it is about the program, and a player reads the same numbers their coach does") and `:262`
- **notes:** **Found by `/pr-check` over the merge result; confirmed independently by `code-review`, `pipeline-guardrails-reviewer` and `rls-boundary-reviewer`.** Not an access breach — no teammate's row is readable by the wrong login, and both reviewers were explicit about that. It is a **confidently wrong number**. `programs.roster_visible` defaults to `false` (`20260817073914_programs.sql:83`), so this is the common case, not an edge.
  **What a player actually sees.** `program_event_entries` is visible to every member, but the RESULT lives on `matches`, which the policy restricts to their own rows. So they see all seven dual lines with names and opponents, and exactly one match. `dualScore()` counts what it can see; `dual-sheet.tsx:124` renders `{dual.us}–{dual.them}` in full `--ink-900` the moment `anyPoint` is true — **it is not gated on `decided`**. `dualLines()` sets `state: "empty"` for the invisible lines and `Trailing()` renders that as "Not played". Net: a confident **"0–1 · S 0–1 · D 0–0 · 1 of 7 in"** on a dual the team may have won 4–3, with six teammates' played lines each claiming they weren't.
  The KPI strip is the same shape: `teamKpis` computes over the RLS-narrowed season read, so "Matches analyzed", "Sets won" and **"Team 1st serve"** are that player's own figures under program labels. `dual-record` is the only tile that fails closed, and by accident — `decided` requires `entries.every(entryPlayed)`, which a restricted player can essentially never satisfy. `sampleNote()` fires only under `SMALL_SAMPLE_MIN`, so a player with five of their own analyzed matches gets no caveat at all.
  **Introduced by this branch** — `dual-sheet.tsx` (T9) and `kpi-strip.tsx`/`team-kpi.ts` (T10) are both new, and both carry an explicit comment saying they are deliberately not staff-gated. The intent is right: these should be program figures a player can read. The data underneath does not support it, and the comments reason only about `program_events` visibility, never about the `matches` policy the numbers are actually built from.

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

## T38 · The schedule page has T34's bug on a second surface
- **status:** todo
- **files:** `src/lib/data/schedule-server.ts` (~256, the `dualScore` call); `src/components/dashboard/schedule/dual-detail.tsx` (~39); `src/lib/data/results-visibility.ts` (`resultsScope`, already exists)
- **done when:**
  - [ ] A player on a `roster_visible = false` program is not shown a dual score on `/dashboard/team/schedule` or on an event's detail card, for the same reason T34 withheld it on Team Home
  - [ ] The gate is `resultsScope()` — the module T34 created — not a second rule. If either call site cannot reach the viewer's role and the program flag, thread them the way `getTeamHomeData` does rather than inventing a local answer
  - [ ] A line the viewer cannot read does not render as played-or-unplayed on these surfaces either, consistent with `DualSheetLine.readable`
  - [ ] A test covers a narrowed read on the schedule list the way `tests/results-visibility.spec.ts` covers the dual sheet
- **notes:** Found while gating T34, by grepping every `dualScore()` call site rather than only the ones the task named. T34 fixed Team Home's dual sheet and KPI strip; `dualScore` has two more production callers and neither was in T34's scope: `schedule-server.ts:256` (`event.kind === "dual" ? dualScore(entries) : null`) and `dual-detail.tsx:39`. Both reduce entries to a team score with no knowledge of whether the read was narrowed, which is exactly the shape T34's notes describe — a confident, wrong, low score, `0–1` on a dual won `4–3`.
  Unverified whether both surfaces are player-reachable; `program_events` is member-visible and the schedule page is on the player's rail, so the presumption is yes and that should be confirmed first. The mechanism is already built and tested, so this should be small — it is the same gate applied to two more call sites, not a new decision.
