# Data Table — the Table Laws (v3)

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

## Data Table (v3 — the table laws)

Governs **every** table in the product — Matches, Roster, Events, Schedule —
not a page-specific treatment. Generalizes `matches/match-card-list.tsx` +
`match-actions/match-actions-menu.tsx`. The full laws and the column recipes
live in the design project's `components/data/DataTable.prompt.md`.

**One list-page shape** — Matches, Roster and Schedule share it, so a coach
moving between them re-learns nothing: title slot · ghost + primary · filter
row (status pills · Filters · sort) · one full-width table card, hairlined
against the white page · optional footer line ("Season 3–1 in duals · 31 of 36 lines
analyzed" + one blue link). Schedule is a list page too — the all-white
master-detail split is retired; its detail is the peek drawer below.

1. **Column order is a decision sequence, never fenced.** Priority is
   position — never a rule or wash around a column to signal importance. One
   reading order for every list: lists are newest-first, so **Date leads**
   (12px tabular ink-700, 72px) · the name at 13/500 ink-900 with its 26px
   mark (program initials for a dual, the tournament mark for a tournament) ·
   context at 12px ink-600 · then the numbers and the outcome, **flush left in
   fixed tracks** (see the alignment clause below). Canonical orders: **Matches** = Date · Opponent · Event (+ mono
   round) · Score · Result · Analysis (the fluid cell, heading nothing) · ⋯ ·
   chevron — the outcome closes the facts, and the lifecycle annotation trails
   them because it is blank on eight rows in ten; **Roster** = # · Player ·
   Record · Form · Last match (Record leads Form: the number a coach ranks
   by first, the five-tick trail that qualifies it second); **Schedule** = Date · Event · Type · Venue ·
   Lines `n / 9` · Score · Result. Text and its header flush left; a numeric
   measure that is compared down its column flush right; **Score and Result
   flush left**, in fixed tracks, at one precision, tabular — in _both_ lists.
   Schedule right-aligned that pair while Matches kept it left, which drew the
   two most-scanned cells in the product two ways depending on the page; the
   score's own rule (flush left in a fixed track) settles it and the outcome
   follows the score it belongs to. Header and value then share an x, which is
   the rule `EmptyMark` and `ResultMark` already follow inside a cell. The cost
   is that Schedule's rows no longer close on a hard right edge — Matches gets
   one from its chevron and a container row may not have one (rule 3) — so
   size the Result track to its widest content — "Not played", 60px, not the
   52px heading, which clips it — and let the column, not a gap, hold the
   remaining width. **Never center-align anything.**
   Exactly one fluid cell per table (Analysis in Matches) — everything else
   fixed or bounded so scores and dates start at the same x on every row.
   Where every measure is fixed, **the name takes the slack**: one flex
   spacer after it and the metrics packed to the right, so the only gap in
   the row falls on a column boundary. A flexible last cell with its date
   pinned to the far edge opens ~600px of nothing mid-row and splits one fact
   — opponent and date — into two. No
   column a filter or sort acts on may be merged into another cell; no
   repeated words — noun in the header, qualifier in the cell. Not-yet values
   are an ink-400 em dash — **one mark, one size, and centred under its own
   heading**, never left-aligned in the cell and never a per-column invention
   (a 13px dash, a 12px dash and a sentence read as three unrelated absences
   on one row). A dash carries no words beside it: three across a row already
   say "nothing yet" once, and a sentence in the last column says it a second
   time in a different voice while pulling the eye to the row with the least
   in it. Keep the sentence as `sr-only` — a dash reads as nothing to
   assistive technology. A future event's Result reads "Not played" (11px
   ink-500), never a Badge. Type is a plain word — no type swatch (amber stays
   chart-only).
2. **One outcome register: the glyph.** `ResultMark` draws every match outcome
   in the product — Matches, Schedule, the dual and single detail pages, the
   roster's Last-match cell, Home's result rows, the command palette. Under a
   labelled "Result" header or in a headerless row, it is the same mark.
   _This rewrites the earlier rule_ — "word under a labeled Result header,
   glyph in headerless rows, never both in one row" — which was sound in
   isolation and failed in practice: the trigger for a word was a property of
   the _table_ rather than of the fact, so the same outcome wore two faces
   depending on which page you were on, and the split was invisible in review
   because each table looked right on its own. Matches drifted to the glyph,
   Schedule kept the word, and the two lists a coach moves between stopped
   matching. A circle also survives translation, which a tracked English word
   does not. **The result cell has no container** — the tinted "banner" was
   built, evaluated and rejected, and that rejection carries over: the mark
   already says the thing, and a tint would make the outcome louder than the
   Score beside it. The mark **inherits its cell's alignment** and is never
   centred — it shares its column with `EmptyMark`'s dash on undecided rows,
   and those two must start on the same x. Never a bare W/L letter. A future
   event's Result still reads "Not played" (11px ink-500), and a level dual is
   the third glyph (`circle-minus`, ink-500) rather than a fourth register.
3. **The row-click law — containers peek, records open.** Decided by the
   noun, not the page. **Record rows** (matches, wherever they appear — Home,
   Matches, inside an event drawer, a player's match list) navigate to the
   report: trailing `chevron-right` 13px, ink-300 → ink-900 on hover, held
   resting and hovered so nothing shifts; the hover wash is transient.
   **Container rows** (events on Schedule, players on Roster) open the peek
   drawer (below) and carry **no chevron** — there is nothing to travel to;
   the wash persists on the selected row. `chevron-down` only when a row
   expands in place, rotating 180° on open (200ms). The same noun never opens
   two ways, and the report's pinned left column is chrome, not a peek. _The
   hover wash and cursor say a row is clickable, but not whether clicking
   leaves the page._
4. **Row state pills.** Shared / Private / Draft are grey 18px `StatePill`s
   (10/500 ink-700 on surface-subtle) beside the row's primary name — mark
   the exception, not the norm ("Private" under a share-everything policy,
   "Shared" under private-by-default). **"New" is the one blue-tinted pill**:
   18px, 10/500, `--blue` text on a 10% blue tint — emphasis, not neutral
   status; never filled blue (it would compete with the Result badge); gone
   once the report is opened. **Unread is not a dot and not a column** — the
   dot column retired from data tables (the 6px blue dot stays the activity
   tray's mark alone). Max one state pill per row. A pill never truncates:
   the name span takes `min-width:0; overflow:hidden; text-overflow:ellipsis`
   and the pill `flex-shrink:0` — a clipped pill reads like the banned W/L
   letter. _Shipped:_ `ui/state-pill.tsx` is the grey register (Draft, Shared,
   Private) and `ui/new-pill.tsx` is the blue one — 18px, 10/500, `--blue` on a
   10% blue tint mixed from the token so it follows into the dark scope.
   `match-card-list.tsx` draws "New" through `NewPill`.
5. **Row actions on hover:** surface-muted wash on the rounded
   `radius-element` row, inset 8px from the card edge; the lifecycle cell
   swaps for a `⋯` trigger (`MoreHorizontal`, stroke 1.75 — the one
   exception to strokeWidth 1.5 in the product) in a 28px radius-element
   square, opening a 12px-radius float menu with destructive last and a
   `detail` line on consequential items ("Coach and teammates lose this
   match"). Keep to 2–3, revealed on hover / focus-within. Container rows
   have no action gutter — the Roster's Upload lives in the drawer.
6. **Filter panel + applied strip.** One panel, sectioned: facets about the
   record first, facets about the counterparty below a hairline under an
   "Opponent" heading. 2–3 options → segmented row with an "Any" default;
   longer lists → checkboxes. Live match count in the footer beside a quiet
   "Clear all". On apply the panel **closes** and a note strip states the cut
   in words — plain sentence · middot · "N of M" · one quiet "Clear filter" —
   **never chips, never a badge**. Engaged trigger uses the nav-active
   grammar (surface-subtle wash + ink-900, no border/dot/count). Lifecycle
   pills stay independent of the panel — a filter cut is not a lifecycle
   bucket. Pagination reads against the filtered set ("4 of 4 in this
   filter") plus an escape link to the full library.
7. **Status pills are a view switcher, not a filter.** A fixed 3–4 set (All ·
   New · In progress · Estimates), 26px, hairline border, **no counts, no
   dots**; active = `--border-medium` + surface-subtle + ink-900. Counts live
   in the title slot's summary line ("6 players · 2 invites pending"), never
   on a pill. The chip ban covers chips that accumulate from user choices;
   this fixed row is sanctioned. Its multi-select cousin on reports is the
   **segmented set switcher**: 22px segments labeled by the set score itself,
   selected = surface-muted, unselected at 42% opacity; scope readout left,
   "Whole match" reset right, both only while filtered.
8. **Table page states.** Day zero on a **personal** list page is the same
   composition as personal Home's (Personal Home Recipes → Day zero): the
   offer, centred, over the page's own shape at 0.32 and `inert` — the
   lifecycle chips at zero, the toolbar, the table card with its column labels
   over ghost rows — and **no title row**, because the offer carries the
   page's one primary and a title-row button beside it would be two. The
   title row, chips and populated table return with the first match. _This
   rewrites the earlier rule_ — "title, primary and footer identical to the
   populated page; pills and table absent, not skeletoned" — which had two
   day-zero pages one click apart looking like two products, and whose
   shipped form carried two blue links to the same URL. What is dimmed is the
   list's real anatomy with its labels intact, never grey stand-ins for
   labels; the column headers are the payload (Empty State → labels). The
   **team** list draws the same composition with different words —
   `MatchesDayZero` takes a `scope`, and only the sentence and the action pair
   change. This closes the slot that read "the team list keeps the older shape
   until its own day zero is designed": two day zeros one workspace switch
   apart would be the same drift the rewrite above was for.

   The two other team table pages follow it. **Schedule**
   (`schedule/static/schedule-day-zero.tsx`) draws the offer over its pills,
   toolbar and seven column labels; **Roster** (`team/roster-day-zero.tsx`)
   over its five, and a program has that screen on its first day, because
   staff are not rows in that table. Both drop the title row and the footer
   for the same reason Matches does, and both take their grid and their labels
   by import from the real table — a ghost table never restates its own
   geometry. What differs by role rather than by page: a viewer who may not
   fill the page gets the identical shape with **no pair at all** and a
   conditions line naming who does, never a button that refuses on click.
   The gates are the page's own — `isProgramStaff` on Schedule and Roster,
   `canUploadForProgram` on Matches — so the offer never opens a door the next
   page closes.

   Day zero is the state where **nothing is in flight**, not where the table
   is empty: a draft keeps Matches' list, and an open invitation or a pending
   join request keeps Roster's, because each is a person or a match on the
   way and the page holding it has something waiting on somebody.

   _Shipped:_ `matches/matches-day-zero.tsx` — the shared `DayZeroOffer` with
   the page's own sentence ("Every match you send lands here." on a 30ch
   measure, so it holds one line), then the real `LifecycleChips` at zero, a
   drawn toolbar, and the list card with its six column labels over **five**
   ghost rows stepping 1 → 0.8 → 0.6 → 0.45 → 0.3. Five rather than Home's
   three because this card is the whole page below the offer, where Home's
   shares a column; three left it a stub. It renders only when there is
   neither a match nor a draft — a draft is a match in flight and keeps the
   list.

   Once populated the frame never moves again. The resting view is never
   pre-filtered; a filtered view is its own screen, never a mutation of the
   resting one — the resting frame keeps showing its in-flight and estimate
   rows regardless of what's filtered. Lifecycle cell copy: "View report"
   when ready · `StatusChip` while running (no elapsed time — the tray owns
   progress) · "Estimate · Review data" for low confidence (grey fact + blue
   action, never yellow, never red).

9. **8a is the default row treatment** — 52px fixed rows, hairline under the
   header only, none between rows; hover = surface-muted wash on a rounded
   radius-element row inset 8px. Eyebrow headers over 8a rows is the
   sanctioned combination. _(Erratum: an earlier v3 DataTable spec called for
   hairlines between every row — 8a's site-wide lock above supersedes that for
   every dense result list.)_
10. **A table-level action lives INSIDE a column, never beside the
    headings.** As a flex sibling in the header row it takes a column's worth
    of the row and pushes every heading off the cells beneath it — the
    Roster's "Set lineup" moved Record, Form and Last match ~100px left of
    their values, and only when a coach was the one looking, so it read as a
    data problem. Put it at the far end of the last column (`ml-auto` inside
    that column's span, `tracking-normal normal-case` so it does not inherit
    the eyebrow), and measure a heading against its own cell before believing
    it.
11. **Quiet ≠ empty.** Quiet is earned by removing redundancy (a legend under
    every bar), never information: Home result rows keep their three mini
    stats, event headers their 13px metadata glyphs, the KPI strip its five
    tiles.

### Peek Drawer (v3)

The container-row destination — one 340px shell for Roster and Schedule.
`--surface-card`, hairline left edge, `--shadow-dropdown`; slides in 200ms
`--ease-primary` while the table reflows to the remaining width (the flexible
name column absorbs the loss — nothing else moves). **Opens on click, never
hover**: a panel opening under a crossing cursor shifts the table and is
unreachable from a keyboard. Click opens and selects (the wash persists); `↑↓`
step to the next record; Esc, the X, or re-clicking the selected row closes.
No URL of its own — `?player=` / `?event=` deep links are the one case that
lands open. **Closed is the resting state**: full-width table, nothing
selected, no chevrons, no gutter.

- **Header, 44px, 20px inset:** ‹ › stepping · counter "Player 3 / 6" · ⋯ ·
  divider · X — and nothing else. The bridge to the record's page is the
  **name in the body**, ink-900 at rest and blue on hover, the same
  affordance the roster row's name carries; ⌘-click on the row does the same.
  The body scrolls; a full-width primary pins to the bottom ("Upload for
  Rafael" · "Enter results").

  _This retires the header's "Open profile ↗" chip._ Two routes to one page
  cost a 340px header its last breathing room: measured at 340, the flexible
  gap had collapsed to its 8px floor and the chip was the widest item in the
  row at 97px — a third of the header spent on a duplicate. Removing it
  returns the gap to 69px. The name is the better of the two anyway: it is
  the record itself, it costs the header nothing, and it puts the link where
  a reader already looks. **A drawer header holds navigation, position and
  dismissal only** — anything that travels somewhere belongs in the body.

- **The record's name wraps; it never truncates.** A 340px rail clips plenty
  of real names at 22px, and the answer is two lines, not a tooltip — the
  panel scrolls anyway, and a person's name in their own drawer is as
  essential as this surface gets ("nothing essential lives only in a
  tooltip", Empty State). The identity row is therefore `items-start`, so the
  avatar stays level with the first line rather than centring against a block
  that grew. The table row is the opposite case and truncates bare: 52px
  cannot give the height, and this drawer is the one click that shows the
  name whole.
- **Player body:** identity → six-match sparkline with a stat header → four
  24px stat pills that switch the chart → three recent matches as record rows
  (with chevrons — these navigate) → Upload. Upload is never event-level.
  **With no measured figure the chart and the pills are absent, not empty.**
  Gate on "is there a value", never on "has matches" — a player whose only
  match is still analysing has a row and no numbers, which is the same
  nothing to chart. Left in, the header read "—", the sparkline drew empty
  air between two blank dates, and the four pills stayed clickable: a coach
  could press one, watch it select, and watch nothing happen. **A control
  that responds and does nothing is worse than an absent one**, and it is the
  one case where honest-zero's "render the region's own anatomy" loses —
  anatomy is labels and axes, not live buttons wired to nothing. What the
  pills would have told you moves into the empty line under Recent matches
  ("Serve and pressure numbers appear here once one is analyzed"), and the
  way to make it appear is the drawer's own primary. A count link to an empty
  page ("All 0") goes too.
- **Event body:** program mark + name + conference → glyph row (date · venue ·
  surface) → score row (28/300 tabular, winner ink-900, loser ink-500) + nine
  4×18px outcome ticks (singles · gap · doubles) → all nine lines at 36px as
  record rows ("Awaiting result" lines have no chevron; an unset line is a
  blue "+ Set line" row) → Enter results.
- _Shipped:_ `schedule/static/event-drawer.tsx` and
  `team/player-drawer.tsx` — the roster's v3 delta (the Record column, the
  drawer, the retirement of the stat column and the action gutter) is closed.
  Both rails use one shell: a CSS width keyframe, never an animated inline
  width, which left the rail invisible.

### Roster Row (v3) — the row compares, the drawer reads

`#` (11px mono tabular ink-500, "—" when unranked) · Player (26px `Avatar` +
name 13/500 ink-900 — a link, blue on hover) · spacer · Record (13px tabular
— what coaches rank by) · Form (`FormPills`) · Last match. Invited people
share the table: dashed-ring avatar, position "—", email as the name,
"Invited Aug 4 by you · player role", Resend (11px blue) · Revoke (11px
ink-500) inline.

**The table is players only.** Staff sat in it once, told apart from players
only by the words under their name, which made a coach read as a player
ranked #7 and put dashes in the `#` column. They are named in a sentence
under the card — "Coached by Elena Vasquez and Jon Abara." + "Manage staff →"
— and managed in Settings › Team. A player sees the sentence and not the
link: knowing who coaches the program is fair, managing them is not theirs,
and a link that refuses on click is worse than no link.

**Last match carries exactly ONE trailing token.** The cell was answering two
questions at once — what happened, and what state the analysis is in — so
every state grew its own trailing element and the column lost its shape. Now:
`ResultMark`, opponent (12px ink-700), and one token in the same place. A
settled row shows its date (`text-micro` tabular), a running row shows a
`StatusChip`, an unscored row shows a "Review score" pill. No score — that
moves to the drawer's recent matches. No elapsed clock — the activity tray
owns running progress.

The two token treatments differ on purpose, and the difference is the rule:
**`StatusChip` is a flat dot-and-label with no container and means _nothing
to do_; the filled grey pill is this table's clickable-question treatment —
the same one "Possible duplicate" wears — and means _your move_.**

### Reorder Mode (v3) — a table that can be re-ranked

Where the order of a table IS the record it holds — the singles lineup — the
table becomes its own editor rather than sending a coach to a form. One mode,
entered from the column-header row. Everything it changes is listed here;
everything else must not move.

- **The toggle rides the column-header row**, not the title slot. It is a
  different kind of verb from Invite / Add player — it changes the page you
  are on rather than adding a person — and the header row already spans the
  card it modifies. 11px blue with a 12px grip glyph, inside the last column
  (law 10). A mode with its own Cancel, not a handle sitting there always,
  because in it a row click grabs instead of opening the drawer.
- **The mode swaps the page's actions, not its shape.** Ghost + primary
  crossfade to Cancel + Save (`AnimatePresence mode="popLayout"`, 120ms) so
  the primary never moves. A banner in the inline-notice register states the
  mode and its keys once, above the table — never a hint per row. Nothing
  else moves: no column shifts, no padding opens, no gutter appears.
- **The grip borrows the `#` cell** of the row under the pointer or holding
  focus — one row at a time, so every other line keeps the number that says
  what the order currently is, and entering the mode moves no column. A grip
  column of its own shifts the whole table on entry; a grip on every row
  hides the thing being edited behind a column of identical glyphs.
- **The row in hand carries its own marks.** A solid 2px `--blue` outline
  says WHICH row; a 20px blue disc in the page margin beside the card, level
  with the row and 10px clear of the outline, says WHERE it lands — the line
  it would take on release, live as the siblings swap. The held row also
  takes `--surface-card` and `--shadow-card-emphasis` so it reads as lifted
  off the list, and it must not take the hover wash the pointer sitting on it
  would otherwise give it.
- **Nothing is drawn between the rows.** A blue rule at the destination slot
  was built and rejected: with a pointer drag the held row already sits at
  that slot, riding the hand a few pixels off it, so rule and row overlapped
  and it read as a cut through the card. The gap the siblings slide open is
  the destination, and costs nothing to draw.
- **Focused and held are two weights of one outline, and only one of them is
  yours to invent.** Focused is the system's `--focus-ring` — this table does
  not get a second focus colour — written on plain `:focus`, not
  `:focus-visible`, because here a mouse click IS a selection and a selection
  nobody can see is the row the keyboard then acts on "for no reason". Held
  is solid `--blue` and rises inside that same outline. The step between the
  two is what tells them apart; making both solid left the difference resting
  entirely on the shadow.
- **The lineup and the bench are ONE sequence** with a sentinel between them
  ("Not in the lineup"). Dragging across it is how somebody enters or leaves
  the lineup — one gesture, no second control, and ↑/↓ cross it the same way.
- **The keyboard is the whole gesture, not an afterthought.** Arrows walk
  focus row to row; Space (or Enter) lifts; the arrows then move the lifted
  row; Space sets it down; Esc cancels the mode before it closes anything
  else. Space is the convention every drag library documents — Enter means
  "open", which is what it does on this row outside the mode. Every move is
  announced on an `aria-live="polite"` line ("Rafael Osei, line 2 of 6").
- **Pointer drag, never HTML5 drag-and-drop.** Native drag events fire at a
  throttled rate, the held row only jumps between slots, and a displaced row
  sliding under the cursor re-fires `dragover` and swaps straight back — a
  flicker loop no easing curve fixes. framer-motion's `Reorder` gives a
  transform that follows the pointer, siblings sliding on `--ease-out-expo`,
  and touch for free.
- **Constrain the drag to the list** (`dragConstraints` + `dragElastic`
  0.08). A table card is a scroll box — `overflow-x-auto` clips on both axes
  — so an unconstrained row dragged past the last slot is cut off outright,
  outline and all, while the card grows a scrollbar. There is nothing below
  the last slot to drop on.
- **A released row settles without a bounce.** framer's default drag snap is
  an under-damped inertia spring, so a row let go with any hand velocity
  overshoots its slot and springs back. `{ bounceStiffness: 600,
bounceDamping: 50 }` arrives once, in ~130ms. The system bans bounce, and a
  lineup is not a toy.
- **Save is live only when saving would change something** — Interaction
  States → Disabled.
- Two cascade hazards bite any custom row state built this way, and neither
  fails loudly: Interaction States → Focus.

_Shipped:_ `team/roster-table.tsx` + `team/roster-view.tsx`; the write is one
`set_program_lineup` RPC, where the order given IS the numbering and anyone
absent from it is taken out of the lineup.

**What this binds elsewhere.** These are table laws, not a roster treatment,
so the next re-rankable order takes them rather than inventing a second
grammar — **Schedule** is the one on the map: its event drawer holds nine
lines in a fixed order, and the day that order becomes editable it is this
mode (toggle on the header row, grip borrowing the leading cell, one sequence,
the same keyboard gesture), not a drag handle column or a set of up/down
arrows. Three of the rules bind Schedule already, whatever it does about
ordering: law 10 (its table-level actions live inside a column, not beside
the headings), law 1's empty mark (Lines `n / 9`, Score and Result all have a
not-yet state), and the disabled-until-dirty rule below — "Enter results" is
a draft-committing primary and should be dead until the draft differs from
what is stored.

---
