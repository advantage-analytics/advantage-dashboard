# Personal Home Recipes (v3)

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

## Personal Home Recipes (v3)

Page-specific recipes from the Personal Home & Matches canvas — not general
primitives, but locked patterns for that page's own cards.

**Home opens on numbers.** The greeting moves into the header's breadcrumb
slot; the body opens with "Your season" at 24px (`.text-title-lg`), so the
first screen's display type is a KPI number, not a title — Home is the one
exception to the title slot's 30px. _Shipped:_ `dashboard/header-greeting.tsx`

- `home/season-title.tsx`.

**Day zero is the offer over the page it offers.** Before the account holds a
single match, Home is not the populated frame and not a separate screen of
door cards — it is one centred offer with the real page quietened behind it.

_The offer_ (`home/day-zero-offer.tsx`), three elements and no subline: the
sentence at **30px/300**, `-0.5px`, on a **24ch** measure so it breaks over two
lines; the primary; the conditions at `text-micro` on a 52ch measure. **70px
above, 24px gaps, 38px below.** **30px is a deliberate exception** — every
other page title runs 24px, and this is the one screen with nothing competing
for the first glance.

_One primary, one ghost, 12px apart._ "Send match video" (`advButton("primary")`)
beside "Import instead" (`advButton("ghost")`), the ghost linking to
`/dashboard/matches/new?source=swing-vision`, which preselects the wizard's
Source field. The pair is one route with two entrances, not two routes: the
param cannot skip step one, which also asks which workspace the match is filed
under and who played it. **The primary names the artifact, not the outcome.**
It read "Send a match" first; beside "Import instead" its job is to name the
other path, and "a match" is what both paths deliver — an export is a match
too. "Match video" is the product's own term (guardrails: never a highlight or
a condensed cut), and verb + object with no article is how the system writes
"Save changes" and "View report". **The ghost label stays short.** "Import a
SwingVision export" ran to 209px beside a 119px primary and the bigger grey
button stopped the blue one reading as the main action; "Import instead" sits
at 124px, against the primary's 146, and leaves naming the source to the
conditions line beneath — "A SwingVision export needs none of that."

Onboarding has already asked about a team and routed coaches and rostered
players elsewhere, so no "Join a team" belongs on either day-zero page; the
switcher's "Create team workspace" is where that lives.

_`DayZeroOffer` is shared._ Matches renders the same component with its own
sentence and measure — everything under the sentence is byte-identical, so a
player who lands on either page meets one offer. The list page's own recipe
lives with the rule that governs it: Data Table → Table page states.

The generous version is the shipped one. A height study got the same three
elements to 214px by closing the padding to 36px and the gaps to 14px, but
the air is what the block is for: the gap between the sentence and the button
is what gives the action room, and closing it makes the offer read as page
content rather than as the one thing on the screen. Roughly 80px is spent
deliberately here.

_The tail_ — the real page, in its real order, each region holding its own
honest zero state (**Empty State**, `reference/empty-and-loading.md`), under **one continuous grade**: a mask
running `0.62 → 0.46 at 40% → 0.32`, so a region fades with how far down it
sits. Two dead ends got here. The strip first held full strength, on the
argument that its five labels are the page's most specific promise — but then
it was the only region not reading as background, and the page had an offer,
a solid band and a fade: two treatments for one idea. Fixing that with a
second fixed opacity produced banding, not a grade — a hard edge under the
strip and one flat value for everything below however far down it sat.
Matches had always graded properly (its five ghost rows step 1 → 0.3); this is
the same idea where the regions are cards rather than rows.

**The grade ends at 0.32, never at zero.** That is the value the tail already
sat at, so nothing at the foot of the page is fainter than it has been. It
matters most for the activity heatmap, which lives down there and whose empty
cells are `#F2F2F2` — five per cent off white before any fade — and which a
gradient running to transparent erased once already. No bottom fade to nothing: a
mask running to transparent clips the activity heatmap mid-grid, and a
calendar cut off partway through its last week reads as a fault, not depth.

_The tail is `inert`._ At 0.32 its text is far below usable contrast and its
links would be invisible tab stops. `inert` removes it from the tab order and
the accessibility tree together; `aria-hidden` plus `pointer-events-none`
leaves a link hidden from a screen reader and still reachable by keyboard. A
`sr-only` sentence above it names what will fill the page and says plainly
that nothing below is real data yet.

_No furniture._ Day zero carries no title row, no getting-set-up line and no
usage footer; all of it returns with the first match, and from then on the
frame never moves again. The matches card also drops its own action band —
the centred offer is the page's one action, and the band would be the same ask
twice.

_What each region shows empty:_ KPI tile — a 34×2px rule on the value's
baseline, a grey sparkline, and "After your first match" ("When the report
lands" once a match is filed but unanalysed). Matches — three ghost rows at
the shipped 54px, stepping 1 → 0.6 → 0.35, keeping their live stat labels
because what each row will report is real information; only the values become
rules. Focus — its own anatomy holding nothing: two rules at the claim's
measure (a claim runs to about 30ch and wraps once, so full-width over
half-width is the shape it takes), two thinner and lighter ones for the
evidence run, and one line saying what arrives. A quoted example claim,
labelled **Example** in the header, was built and rejected: it demonstrated
more, but it made this the only card in the column carrying finished prose
and the largest prose in the tail, and the card sat visibly apart from its
neighbours. Serve placement — the quiet strip's own anatomy: a rule where the
claim goes, the two labelled 14px tracks holding no serves ("— serves"), the
legend at 0.6, and the caption slot carrying the one line that says what
fills it. (The hairline half court held this slot until Platform Audit Pa2 was
matched in full on 2026-09-07; it was the one region whose empty state was a
different object from its populated one, and the populated card is bars.)
Activity — the real 52×7 grid, all 364 cells empty, because a year with no
sessions genuinely is 364 empty cells; its footer reads "0 sessions · 12
months" from real data. Matches and Focus keep the populated card's hairline
footer with a true zero or the arrival line in it.

_One header grammar across the column (Pa2)._ Eyebrow left — or, on the
Focus card, the 16px engine mark beside "Advantage Intelligence" in 12px
ink-700, since that card is named by who wrote it — then the card's one 11px
blue link right: "All matches" on matches, "Session log" on Activity,
"Placement view" on serve placement, "Open Statistics" on Focus. Counts leave
the header for a hairline footer under the body: "Latest 3 shown · 12 matches
· 8 won", "24 sessions · 12 months", the legend row's "Last 4 · 89 in", and
Focus's caption naming the metric the evidence used ("1st serve won · 2nd
serve won") beside "12 matches". Every Home card runs `--pad-card` (20px
all round) — the matches card too, its rows bleeding 12px for the 8px hover
inset rather than the table-card 24/16 pair. The rail is 400px; the grid runs
`items-start` and the columns bottom out where their content does — nothing
is stretched to level them. (The earlier `items-stretch` grid, whose day-zero
court grew to level the columns, went with the court.)

_Claims are 14px/300 on Home, evidence 12px/1.7 ink-600 with its figures in
ink-900_ — Pa2's "quiet body" setting. The claim is a size step over the
evidence, not display type, so the largest type on the first screen stays the
KPI numbers; the evidence is something you lean in for. _Shipped:_
`home/focus-card.tsx` (header + footer shell), `home/home-ai-insight.tsx`,
`home/serve-placement-quiet-strip.tsx` (legend, caption from
`lib/ui/serve-placement-caption.ts` — first serves only, since the played
serve is the second when there was one).

**Next fixture card** — the claimed player's one forward-looking object.
Eyebrow middot-joins the stakes ("Next · B1G Conference" only when it's
actually a conference dual, else plain "Next"); grey 18px countdown pill top
right, computed ("in 3 days"), never blue, never invented; title is the
opponent's proper name (the "at/vs" preposition retires — site gets its own
row). One icon fact per row, 13px Lucide at ink-400: `calendar` date·time
(tabular) · `map-pin` site · court mark surface · `swords` "Your line · S2
singles" (mono line label) · `film` "tags itself". Fed by the team schedule
— personal Home never grows a schedule of its own.

**Serve placement quiet strip** — claim-led (the Focus grammar: eyebrow ·
claim title · evidence bars). One bar per court (Deuce/Ad), 14px tall,
radius-cell, 2px segment gaps; segments T · Body · Wide in `--viz-you` /
`--viz-you-mid` / `--viz-you-light`; label rows tabular, serve counts
right-aligned; the drawn court lives one click away on the expanded widget.

**Home result row + in-flight row** — 8a base (rounded surface-muted hover,
no dividers) + fixed columns: `ResultMark` 14px (`flex:0 0 14px`) ·
opponent 170px ("def./l." at 400 ink-600, name at 500 ink-900) · score 110px
scoreboard type with superscript tiebreaks · three right-aligned stat cells
(eyebrow-sm nowrap over 12px tabular — 1st serve · winners · errors) ·
chevron-right 13px closes every row. Rows: min-height 54px, padding 5px 12px,
gap 16. In-flight row: `Loader2` spinning 1.2s linear in the mark column ·
"vs {opponent}" · `StatusChip` Analyzing · chevron — **no elapsed time**, the
tray owns progress. Event group headers: name 13px/500 over an icon-metadata
row (calendar date · type mark — tournament icon / swords dual / `Target`
practice, crosshair retired · court mark · verified), 13px glyphs.

**Small locks** — personal-Home KPI strip defaults to the repo's five serve
cards (1st serve · 1st serve won · 2nd serve won · service games won · break
points saved), each with trend chip + sparkline; customize popover picks 4–5
across Serve/Return/Other — its trigger is hover-revealed (and shown on
focus / while open), because Platform Audit Pa2 draws the strip with an
empty corner and v3 reveals icon actions on hover. **The strip shows fewer
tiles, never narrower ones**: a tile needs 184px to hold "break points saved"
on one line inside its 20px padding, so the fifth tile leaves below 920px of
strip and the fourth below 736px, and the tile's height never changes with the
window. That is a **container** query, not a media query — the sidebar takes
either 64px or 232px, so the same 1280px window fits five tiles with the rail
and four with the panel open. Labels truncate with an ellipsis rather than
clipping: a hard clip turned "service games won" into "service game", which
reads as a different statistic. Hidden tiles stay mounted, so a customised
selection survives a resize. Card-header counts retire — no bare numeral beside
an eyebrow, no count inside an "All matches" link; counts live in sublines
and tooltips only. Low-confidence path: "Estimate · Review data" — grey fact

- blue action, never yellow (charts-only amber) or red (outcomes/form errors
  own the two reds). Cross-workspace scope is named out loud in greeting
  sublines ("Friday's dual is in your team workspace") and KPI subtexts
  ("personal matches only").

**Reports (draft — placement not locked).** The Focus insight follows the
match block in the report's context column — identity → details → claim, from
the top, never `margin-top:auto`. `InsightCard` is the engine's one card on
Home; on a report the evidence stats are bare type (`InsightStatChip`).

---
