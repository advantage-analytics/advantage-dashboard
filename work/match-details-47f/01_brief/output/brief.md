# Brief — Match Details 47f ("Statistics — dashboard density")

Refined from `../BRIEF-SEED.md` on 2026-09-02. The human's intent, verbatim:
*"make sure the designs are exact and hookup to the db what is tangible, for
the rest leave as flags/comments for future implementation."*

## Goal

Bring the match report's **Statistics tab and match rail** on
`/dashboard/matches/[matchId]` to frame **47f** of `Match Details Final.dc.html`
exactly as drawn — the "dashboard density" layout that fits the whole tab on
one 1512×982 screen with no pane scroll — with every figure bound to a real
value wherever the data layer can supply one, and every element nothing backs
yet shipped as drawn and **recorded as a flag** in
`docs/match-detail-v46-flags.md` (the round-46 convention) rather than guessed
at or quietly dropped.

Round 46 of the same artboard already shipped (`32bb5bd`). This feature is the
delta 47f adds on top of it, not a rebuild.

## Scope

The frame is `<div id="47f">` in `references/match-details-final.dc.html`
(lines 288–454; `references/frame-47f-only.html` is the same slice). Its
rendered sample values were read from the present view and are quoted in the
seed. In scope, by element:

1. **Shell surface** — white (`surface-card`) content pane instead of
   `surface-page`; every card hairline-bordered with `shadow-card`; rail
   `border-right`; 42 px tab row; `14px 20px 16px` content padding with 14 px
   gaps; a 100 px KPI strip over two equal columns, the Rally card absorbing
   the remaining height.
2. **Rail** — identity and facts at 47f's tighter metrics (26 px score, one
   fact group at 8 px); a `surface-subtle` **insight card pinned to the rail
   bottom** (logo chip, headline, dismiss, body, `View full analysis`,
   `Advantage Intelligence` label). This card supersedes three shipped things
   at once: the Statistics tab's in-pane `InsightStrip`, the rail's
   "Advantage Intelligence" blurb, and the film cross-link card (47z archives
   the film action as removed from 47f).
3. **Tab row** — the per-set scope chips move out of the Head-to-head card to
   the right of the tabs, with the scope label and the blue `Whole match`
   reset appearing only while a set is selected.
4. **KPI strip (new)** — DS `KpiStrip` of four `KpiTile`s: *First serve in ·
   First serve points won · Second serve points won · Break points saved*,
   each a percentage, a signed delta against a baseline (`↑7 vs season 71%`,
   coloured good/bad), and a sparkline in the same colour.
5. **Head to head** — a plain two-column table: `Reid ✓ | Okafor` column
   heads, 15 rows in three groups (`SERVE` 7 · `RETURN` 4 · `POINTS` 4) with
   sentence-case labels, leader emphasis (500 / `ink-900` vs 400 / `ink-500`),
   **lower value leads on Double faults and Unforced errors**, row hover on
   `surface-muted`, and a dark tooltip carrying the label plus the fraction
   that used to sit beside the number. No legend row, no set chips, no bars,
   no fraction sub-figures. Header meta gains the game count
   (`Whole match · 188 points · 31 games`).
6. **Performance tracker** — eyebrow + blue `Expand` link, `Reid above` label
   inside the chart, 104 px chart with dashed set dividers and no
   break-of-serve verticals, crosshair hover with a three-line annotation
   (event · description · `mm:ss · point N`), 10 px set labels.
7. **Rally length** — `4.6 shots average` meta, mosaic filling the card with
   fixed `viz-you-mid` over `viz-opp-light`, no in-band percentages,
   `Short 106 · Medium 54 · Long 28` labels, `Width is how often` footer,
   tooltip with one-decimal share and per-player percentages.
8. **How points ended** — `Own outcomes` meta, per-player name + mono total,
   10 px bars, 6 px legend squares (`Winners · Aces · Unforced · Double
   faults`), no footer sentence.
9. **Data plumbing** the strip needs and the page does not carry today: a
   baseline for break points saved, and a per-match history of the four KPI
   stats for the sparklines and trend, delivered through the page's existing
   single fetch.
10. **Flags doc** rows for every element that stays presented copy, and
    resolution notes for any round-46 row this work settles.
11. **Retirement** of whatever 47f supersedes, in the same change — no
    orphaned components.

## Non-goals

- Shots & placement and Film room content. 47f does not draw them; they keep
  their round-46 (+47a) build. Whether they inherit the *surface* change is an
  open question below, not a redesign.
- Every other frame on the canvas: 55a–c match-band treatments, 51a–f key
  moments, 54a–d switcher-rail variants, 46a–d, and the 47z/48z archives.
- New routes or sub-routes. The match page stays one page.
- Any change to statistics derivation, the vendor pipeline, `points` /
  `match_stats` semantics, or the upload wizard.
- Solving the round-46 open flags (#2 analysis page, #3 add-video flow, #7
  court-maximize spec, #9 `"0-0"` score coercion). They are carried forward
  and referenced where 47f touches them; none is rebuilt here.
- The drift between the live `46b` frame and the copy round 46 built from
  (noted in the seed as out of scope).

## Constraints

- **Exactness.** The frame's markup is the spec for layout, spacing, type and
  colour; DS tokens resolve as they do in `src/styles/design-system/`.
  Where the canvas prose contradicts the markup (the header-span sentence),
  the markup wins. Where a DS component is imported (`KpiStrip`, `KpiTile`),
  the bundle's CSS wins over any hand-drawn approximation. Sample names and
  numbers (Reid / Okafor / 188 points) are placeholders for the viewer's real
  match — never literal copy.
- **Presented-copy honesty** (repo rule, `docs/match-detail-v46-flags.md`'s
  reason for existing): no number, label or link may look computed when it
  isn't. Real when tangible; otherwise drawn as-is and flagged with its
  suspected source and unblock condition; a fabricated *count* is omitted,
  as round 46 did with "from 12 analyzed matches".
- **Guardrails** (`docs/ui-revamp-guardrails.md`): the only you/opp decision
  point is `useMatchSides()`; the analysing/failed short-circuit stays; the
  unpublished-stats notice stays; derived-match caveats (`MatchDataBlock`,
  em-dash suppression, the withheld Aces segment) stay on screen even though
  47f's sample match draws none of them; the wizard's attribution inputs are
  untouched.
- **Data.** Existing tables and views only, verified against the live
  database. New reads ride the page's one cached fetch and reach components
  through `MatchDataProvider`; no client-side fetching, no global state.
  Baselines and histories are the *viewer's own*, keyed the way
  `getPlayerAverageStats` already keys them.
- **Chrome.** Sidebar and the 44 px breadcrumb header are shipped and out of
  bounds.
- **Fit.** At 1512×982 the pane must not scroll. Narrower or shorter
  viewports keep the shipped shell's scrolling; no new breakpoints are being
  designed.
- **Design system.** Inter, Lucide, the three DS easing curves, `advButton()`
  for any button, `prefers-reduced-motion` honoured as the shipped cards do.
  DS type classes are unlayered — size overrides go inline.
- **Engineering.** Branch is on `splitstep-integration`; `npm run lint`,
  `tsc --noEmit`, `npm run build` clean; Playwright specs that touch the
  Statistics tab updated; `pipeline-guardrails-reviewer` run before review
  sign-off.

## Success criteria

Checked side by side with the 47f present view at 1512×982:

1. Structure, spacing, type sizes, colours and copy match the frame element
   for element, with the viewer's real names and values in Reid/Okafor's
   places. The pane does not scroll.
2. **KPI strip**: four tiles, in the frame's order; each value is the
   viewer's published whole-match statistic; each delta is that value minus
   the viewer's own baseline; each sparkline is the viewer's own per-match
   series ending at this match; colour follows the DS good/bad rule (red for
   the first-serve-in tile in the sample). A tile whose statistic the
   provider withheld shows no invented number.
3. **Head to head**: exactly the 15 rows in the three groups; lower value
   leads on Double faults and Unforced errors; the fraction appears in the
   hover tooltip and nowhere else; the set chips live in the tab row and
   still narrow the derivable rows, with `—` for the rest; the reset and
   scope label appear only while filtered.
4. **Tracker, Rally, Endings** render their 47f deltas (no legends, the
   `Expand` link, the in-chart `above` label, no in-band percentages, 10 px
   bars, the new metas and tooltips).
5. **Rail**: the insight card sits at the bottom with the viewer's real
   summary; dismissing it persists under the existing storage key; no film
   card and no in-pane strip remain.
6. **Player-2 viewer**: every you/opp orientation on the tab is correct
   (tested, not eyeballed).
7. **Derived match**: Aces withheld, `MatchDataBlock` visible, no fabricated
   score or time in any hover.
8. `docs/match-detail-v46-flags.md` has a row for every element still shipped
   as copy after this work, and names the task for every row it resolves.
9. Superseded components are deleted; lint, types, build and tests pass; the
   guardrails reviewer reports clean.

## Open questions

Answer in this file, or leave for stage 02 to propose against.

1. **Set scope breadth.** 55c's caption says the tab-row chips "scope the
   page". Should selecting a set narrow the tracker, rally and endings cards
   too, or only Head to head as today? (The KPI strip cannot follow a set —
   `points` carry no first/second-serve split — so it stays whole-match
   either way.)
2. **Rail slots 47f does not draw.** Where do the 44a no-video note strip and
   the derived-match `MatchDataBlock` go in a 47f rail — stacked above the
   insight card, or somewhere else? Dropping the caveats is not an option.
3. **Surface on the other tabs.** Shots & placement and Film room share the
   shell. Do they take the white pane and hairline cards too, or keep
   `surface-page`?
4. **"vs season".** The only baseline in the app is the mean of the viewer's
   *other* matches, with no date window. Keep the word and define a season,
   or say what it actually is?
5. **`Expand`** on the tracker has no specified destination or behaviour. Ship
   it inert-and-flagged like the court maximize button, or drop the link?
6. **Return winners** has no statistic behind it. Row with an em dash and a
   flag, or no row?
7. **Break points saved** has no baseline today. May the baseline grow to
   cover it, or should that tile show no delta and be flagged?
8. **History window.** The sparkline needs a per-match series. How many
   matches back, and does "season" (question 4) decide it?
9. **No published stats.** 47f does not draw the unpublished-stats state.
   Does the notice sit where the KPI strip would be, or above it?

## Also consulted

Beyond the seed and `references/`, these were read to verify the seed's data
claims before writing (they are the basis of the "tangible" line above):
`src/lib/data/match-stats-server.ts` (`getPlayerAverageStats`),
`src/lib/data/types.ts` (`PlayerStatistics`),
`src/lib/data/match-detail-server.ts`, `src/lib/data/performance-server.ts`
(`KpiCardData`), `src/components/dashboard/shared/kpi-tile.tsx`,
`src/components/dashboard/matches/match-detail/{match-detail-shell,
match-rail,match-tabs,statistics-tab,head-to-head-card,rally-length-card,
point-endings-card,performance-tracker-chart,insight-strip,match-data-block}.tsx`,
`src/app/dashboard/matches/[matchId]/page.tsx`,
`docs/match-detail-v46-flags.md`, and round 46's `design.md`
(`git show 0eec94e:work/design-round-46-matchid/02_design/output/design.md`).
The DS `KpiTile`/`KpiStrip` source is in
`../02_design/references/_ds_bundle.js` (lines 176–303).
