# Plan — Match Details round 46 rebuild

Ordered for one fresh subagent context per step: one surface each, new
components land unused first where possible, the page flips early so every
later step is visually verifiable against the artboard
(`work/design-round-46-matchid/02_design/references/match-details-final.dc.html`,
frames 46a–46d + 47a).

Standing prerequisites (every step): worktree has run `npm ci` (node_modules
is absent on fresh checkout); dev server for visual checks runs on port 3000
or 3101 only (Azure CORS). Read `docs/ui-revamp-guardrails.md` §3.2–3.4 and §4
before steps 1, 5, and 7.

---

## Step 1 — Shell, rail, tabs; flip the page

**Files:**
- new `src/components/dashboard/matches/match-detail/use-match-sides.ts`
- new `src/components/dashboard/matches/match-detail/match-detail-shell.tsx`
- new `src/components/dashboard/matches/match-detail/match-rail.tsx`
- new `src/components/dashboard/matches/match-detail/match-tabs.tsx`
- edit `src/app/dashboard/matches/[matchId]/page.tsx`

**Change:** `useMatchSides()` (you/opp accessors keyed on
`match.isUserPlayer1` — the single attribution point). Full-height two-pane
shell per the artboard: 300px rail (own scroll; identity block with `Score`
tiebreak superscripts + verified check, fact list — short-month date, surface,
event, mono duration, `N points · M games` — AI blurb, film cross-link card
switching to the Film tab). Sticky tab strip (`Statistics` / `Shots &
placement` / `Film room`, 2px blue inset underline) synced to `?tab=` via
`useSearchParams` + `router.replace`. `page.tsx` keeps all its data loads and
gates: analysing/failed renders the shell with `MatchAnalysisProgress` alone
in the pane (no tabs); otherwise tabs render, with the **existing** cards
temporarily parked per tab (Statistics: AiInsightCard + MatchStatisticsCard +
PerformanceTrackerCard; Shots: ServePlacementCard; Film: MatchVideoCard or a
plain placeholder when `video` is null). Old hero/summary/KPI rows drop out
of the render here; their files stay until step 7. Prev/next arrows and
`getAdjacentMatchIds` drop out of the render too.

**Verification:** `npx tsc --noEmit && npm run lint`; dev server: match page
shows rail + tabs at 1512px, rail facts real, tab switch updates `?tab=`,
back button works, analysing match still short-circuits (no stat sections),
stats-pending match shows `UnpublishedStatsNotice` in the Statistics tab.

## Step 2 — Statistics tab: insight strip + head-to-head card

**Files:**
- new `.../match-detail/insight-strip.tsx`
- new `.../match-detail/head-to-head-card.tsx`
- new `.../match-detail/statistics-tab.tsx`
- edit `page.tsx` (mount StatisticsTab; unpark replaced cards)

**Change:** InsightStrip per 46a (20px ink-900 logo chip, summary as claim
line, dismiss X with the AiInsightCard localStorage key, link →
`/dashboard/ask`, no fabricated match count). HeadToHeadCard: legend row
(viz-you/viz-opp swatches, you left with check), set-score chips from
`match.score.sets` (engaged state + "Whole match" reset), grouped rows from
the SERVE/RETURN/OTHER stat configs (move them out of `page.tsx` into the
card), value + fraction sub + mirrored bars; per-set chip active → recompute
derivable rows from `points`, "—" for non-derivable; derived matches keep the
per-stat "—" contract. StatisticsTab composes strip + H2H + the still-parked
PerformanceTrackerCard.

**Verification:** tsc/lint; dev server vs frame 46a top half: strip
dismisses and stays dismissed on reload; set chip filters and "Whole match"
restores published values; you/opp orientation correct on a match where the
viewer is player2 (flip check — guardrails §4).

## Step 3 — Statistics tab: the three charts

**Files:**
- new `.../match-detail/performance-tracker-chart.tsx`
- new `.../match-detail/rally-length-card.tsx`
- new `.../match-detail/point-endings-card.tsx`
- edit `.../match-detail/statistics-tab.tsx` (swap in)

**Change:** Momentum area chart per 46a: rolling won-point differential from
`points`, mirrored fills clipped above/below the midline, set dividers at
proportional x, break-of-serve dashed `--viz-key` verticals (games where the
server lost), legend row, Set 1/2/3 axis row, hover annotation opacity per
the artboard's `.mom-annot` pattern. RallyLengthCard marimekko: band widths ∝
share of points (1–4/5–8/9+), you-won% fill heights, dark hover tooltips with
counts, legend + "Width is how often" micro. PointEndingsCard: per player a
100% stacked bar (Winners/Aces/Unforced errors/Double faults from
`resultType` × decisive `player`), segment tooltips, legend, footnote; Aces
segment omitted for derived matches. All three respect
`prefers-reduced-motion`.

**Verification:** tsc/lint; dev server vs 46a bottom half on a real
SwingVision match: segment counts sum to the tooltip totals; set dividers
align with set boundaries; derived match hides Aces.

## Step 4 — Shots & placement tab

**Files:**
- new `.../match-detail/shots/use-shot-filters.ts`
- new `.../match-detail/shots/court-header.tsx`
- new `.../match-detail/shots/serve-zones-court.tsx`
- new `.../match-detail/shots/zone-table.tsx`
- new `.../match-detail/shots/shots-tab.tsx`
- edit `page.tsx` (mount ShotsTab, unpark ServePlacementCard)

**Change:** Filter state hook over `MatchPoint` fields (set, serving/
returning, ball 1st/2nd, court deuce/ad, zone, pressure, result, rally band)
producing the filtered serve/return shot set + "N of M serves" count +
plain-sentence cut description. CourtHeader per **47a** (the shipping
variant): eyebrow + subtitle, "{you} serving" legend, Filters popover with
segmented groups, maximize button (opens a plain dialog with the same court,
larger), segmented toolbar row (Serve|Return · Zones|Placements · 1st|2nd|Both
· All|Won|Lost), applied-cut sentence strip with "Clear filter".
ServeZonesCourt: the artboard's 449×352 SVG — zone cells shaded by
frequency (`--viz-you` at computed opacity), pct-won + count labels,
WIDE/BODY/T column labels, NET baseline, opacity-ramp legend; Placements view
renders the dot plot using the existing normalization logic from
`matches/visuals/` (borrow the deuce/ad + end-change handling — read
`serve-placement-card.tsx` + `visuals/` utils before writing new math).
ZoneTable per artboard grid (Zone · Serves · Won bar · Rate). Return mode
uses `pickReturnShot` data on the full court.

**Verification:** tsc/lint; dev server vs frames 46b + 47a: zone cell counts
sum to the header count; each filter narrows the count sentence; deuce/ad
split totals match; Placements dots match the old ServePlacementCard's dots
for the same match (regression check before it is deleted).

## Step 5 — Film room tab

**Files:**
- new `.../match-detail/film/film-player.tsx`
- new `.../match-detail/film/point-list.tsx`
- new `.../match-detail/film/film-filters.tsx`
- new `.../match-detail/film/film-empty-state.tsx`
- new `.../match-detail/film/film-tab.tsx`
- edit `page.tsx` (mount FilmTab; MatchVideoCard leaves the render)

**Change:** FilmPlayer: `<video>` on the playback SAS, 46c control bar
(play/pause, prev/next point seeking via adjacent `videoTime`, progress bar
with scrub, mono time readout, mute, fullscreen; unspecced glyphs inert with
tooltips), gradient overlay with event + date, SAS-expiry error state with
reload action. PointList per 46c: Points/Saved tabs, FilmFilters popover
(segmented + checkbox groups with live counts, `N of M points` footer, Apply
+ Clear all), applied-cut strip, set·server group headers with game-score
chips, rows (decisive-player initials chip viz-you/subtle, result label,
description micro, point score, hover save bookmark writing
`points.update({saved})` via the browser client with optimistic revert —
port the working logic from `match-video-sidebar.tsx`), row click seeks the
player, playing row gets the blue progress underline from `timeupdate`
windows. FilmEmptyState per 46d (real size cap from `MAX_VIDEO_SIZE_BYTES`,
CTAs → `/dashboard/matches/new`). Rail film card (step 1) now switches tab
AND autoplays nothing (per guardrails: it is "the match video", never a
highlight).

**Verification:** tsc/lint; dev server on the real analyzed video match:
row click seeks, save toggle persists across reload, Saved tab filters,
empty state renders for a SwingVision match; existing suite still green
(`npm test`).

## Step 6 — Rail completion + flags doc

**Files:**
- new `.../match-detail/match-data-block.tsx`
- edit `.../match-detail/match-rail.tsx`
- new `docs/match-detail-v46-flags.md`; edit `docs/README.md` (index line)

**Change:** MatchDataBlock per 46c rail: "Match data · Coming soon" pill,
the two true caveat lines for derived matches (aces/service winners,
winners/errors are model output), disabled "Review flags" button + micro —
rendered only when `sourceProvider === "splitstep"`; this becomes the
redesigned home of DerivedStatsNotice's content (notice component itself
retires in step 7). No-video note strip (44a) in the rail when `video` is
null. Write the flags doc with the eight entries from design.md §flagged
items, updating any resolved during steps 1–5; add the docs/README index row.

**Verification:** tsc/lint; derived match shows the block, SwingVision match
shows the no-video strip instead of the film card; flags doc entries each
name element · location · suspected source · unblock condition.

## Step 7 — Retire replaced components, full gate

**Files (delete):** `match-detail-hero.tsx`, `match-detail/match-summary-row.tsx`,
`match-detail/match-kpi-row.tsx`, `match-detail/performance-tracker-card.tsx`,
`match-detail/match-statistics-card.tsx`, `match-detail/serve-placement-card.tsx`,
`match-detail/performance-profile-card.tsx`, `match-detail/key-moments-card.tsx`,
`match-detail/match-video-card.tsx`, `match-detail/unpublished-stats-notice.tsx`
(only if its render moved into StatisticsTab markup), `match-detail/derived-stats-notice.tsx`,
`matches/match-video-sidebar.tsx`; edit `page.tsx` (drop `getAdjacentMatchIds`
+ dead imports; remove the export from `match-detail-server.ts` only if
nothing else imports it — grep first).

**Change:** Deletion pass — grep each file for external importers before
removing (statistics/home pages import their OWN serve-placement variants,
not these; verify, don't assume). `SectionsStagger` stays only if still used.
Then the full gate.

**Verification:** `grep -rn` per deleted symbol returns nothing;
`npx tsc --noEmit && npm run lint && npm run build && npm test` all pass
(43 pre-existing lint warnings, 0 errors); dev-server walkthrough of all
four artboard states side-by-side with the frames (46a/46b/46c/46d).

---

## Order dependencies

1 → everything (shell + parked cards keep the page whole).
2 → 3 (same tab file, chart swap assumes strip/H2H landed).
4 and 5 are independent of 2–3 and of each other (both depend on 1).
6 depends on 1 (rail) and is best after 5 (no-video strip interacts with the
film card slot). 7 strictly last — nothing may be deleted while a parked
card still renders it.

## Test strategy

- **Per step:** `npx tsc --noEmit && npm run lint`, plus the step's dev-server
  visual check against the extracted artboard (open the .dc.html file in a
  browser beside the app; frames are 1512×982).
- **Data honesty checks ride the visual checks:** every count shown must sum
  from the same filtered set the chart draws (steps 3–5 name them).
- **Existing Playwright suite** (`npm test`) is data/logic-level — no spec
  renders this page's DOM; keep it green at steps 5 and 7. No new route, so
  the generated route map is untouched.
- **New spec deliberately deferred** to review follow-up: the suite has no
  authenticated page-render harness today; building one is out of this
  feature's scope (brief non-goal: no changes beyond the page).
- **Guardrails:** `pipeline-guardrails-reviewer` runs against the full diff
  in stage 06; steps 1, 5, 7 re-read guardrails §3.2–3.4/§4 before editing.
- **Attribution flip check** (the silent corruption class): steps 2–5 each
  verify once on a match where the viewer is player2.
