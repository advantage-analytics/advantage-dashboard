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
- **status:** next
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
- **status:** todo
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
- **notes:** was T5's second bullet. 44a is the reference artboard. The
  schedule pages already read these tables — reuse their loaders rather than
  writing a second way to assemble a dual.

## T10 · KPI strip, only once the numbers are honest
- **status:** todo
- **files:** `src/lib/data/team-home-server.ts`, a new
  `src/components/dashboard/team/kpi-strip.tsx` — a guess
- **done when:**
  - [ ] Four tiles — dual record, sets won, team first serve, matches analyzed
        — render between the greeting row and the matches list
  - [ ] The strip renders only when the program has at least one analyzed
        match; on day zero it renders nothing at all — no skeleton, no zeroed
        tiles
  - [ ] Below the stated sample threshold each tile carries a subtext naming
        the match count ("3 matches — small sample") and renders no trend and
        no sparkline
  - [ ] Trend and sparkline appear only once there is at least a week of data
  - [ ] Every figure traces to an existing table; no migration
- **notes:** was T5's third bullet. 45d is the honest-small-sample reference;
  44a is the same strip at mid-season. The rule the round states is "never a
  skeleton strip on day zero".

## T11 · The right column — next event, roster, needs attention
- **status:** todo
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
