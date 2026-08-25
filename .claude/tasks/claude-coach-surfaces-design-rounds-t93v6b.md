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

## T5 · Team Home data surfaces (rounds 44a / 45c / 45d)
- **status:** later
- **files:** `src/lib/data/team-home-server.ts`,
  `src/components/dashboard/team/*` — a guess
- **done when:**
  - [ ] `TeamMatchRow` carries outcome and set scores, so rows render ResultMark
        + score + "View report" instead of the status dot and word
  - [ ] The "This weekend" dual sheet renders its lines and the 4–3 tally from
        `program_events`
  - [ ] The KPI strip renders in slot 2 only once numbers are honest —
        small-sample subtext, no trend or sparkline until a week of data, never
        a skeleton strip on day zero
  - [ ] The right column carries Next event, roster ("Claimed today" pill,
        dashed-ring invited avatars, quiet Resend) and Needs attention
- **notes:** deferred by request — schema work is a later phase. Promote to
  `todo` by hand.
