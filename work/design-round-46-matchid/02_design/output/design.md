# Design — Match Details round 46 (1:1) on `/dashboard/matches/[matchId]`

Artboard source: `Match Details Final.dc.html` from Claude Design project
`afde9116-…` — extracted verbatim to
[`../references/match-details-final.dc.html`](../references/match-details-final.dc.html)
(build stages read the markup from there, no MCP round-trip needed).

**What round 46 actually is** (frames `46a`–`46d`, "Finalized pages", drawn at
1512×982): a full replacement of the match detail page's content area —

- a **300px left match rail** (players + score, date/surface/event/duration/
  points·games facts, an Advantage Intelligence blurb, and a film cross-link
  card) that scrolls independently;
- a **tabbed content pane** — `Statistics` / `Shots & placement` / `Film room` —
  with the tab strip pinned (sticky) and the pane scrolling under it;
- **46a Statistics**: AI insight strip · Head-to-head stat card with per-set
  score-chip filtering · Performance tracker (mirrored momentum area chart with
  break-of-serve markers and set dividers) · Rally length marimekko · How
  points ended (100% stacked bars per player);
- **46b Shots & placement**: court SVG (serve zones view with
  frequency-shaded cells, pct-won + count labels) · zone table · a filter
  system (header toolbar + "Filters" popover + applied-cut sentence strip);
- **46c Film room**: 16:9 video player with custom control bar · Points/Saved
  tabbed point list, grouped by set + server with game-score chips, per-row
  save bookmark, filter popover, currently-playing row indicator;
- **46d Film room, no video**: the SwingVision-import empty state (film icon,
  one sentence, `Add video` primary + `Import from SwingVision` link), plus a
  rail note strip replacing the film card (from round 44).

The sidebar/header drawn in the frames is the existing v3 chrome — already
shipped (`app-sidebar.tsx`, `src/app/dashboard/header.tsx`, which already
resolves the `Matches › vs {name}` breadcrumb for this route). **Only the
content area is new work.**

Round 47 (`47a`–`47d`, same canvas) iterates the Shots & placement header;
the canvas's own annotation says **"47a is what ships"** (a segmented toolbar
row: `Serve|Return · Zones|Placements · 1st|2nd|Both · All|Won|Lost` + Filters
popover + applied-cut sentence). 46b's header (named dropdown chips) is the
superseded draft. → Recommendation: build **47a's header** inside 46b's page.
See Open questions.

## Approaches considered

1. **Restyle the existing single-column page in place** — keep the current
   scroll-anchored sections, re-skin cards. Rejected: the artboard is a
   structurally different page (two-pane, tabbed, independent scroll); a
   restyle is not "1:1".
2. **Rebuild inside the existing route as client-side tabs** *(chosen)* —
   keep `layout.tsx` + `MatchDataProvider` + the single cached
   `getMatchDetailData()` fetch untouched; replace `page.tsx`'s render tree
   with the new shell. Tabs are client state synced to a `?tab=` query param
   (shareable, back-button works, still one page — honours the "no sub-routes"
   contract in CLAUDE.md and the brief).
3. **Nested/parallel routes per tab** — rejected outright: brief non-goal,
   CLAUDE.md contract ("single page with no sub-routes"), and it would split
   the single fetch.

## Chosen design

### Architecture

Route files stay: `layout.tsx` (fetch + provider) and `page.tsx` (server
component) — one fetch via React `cache()`, unchanged. `page.tsx` keeps its
job/reconcile/video parallel loads and passes everything into one new client
shell component. New/changed components all live in
`src/components/dashboard/matches/match-detail/` (v46 files replace old ones;
retired components are deleted in the same feature, not left as orphans —
that's how the wrong file gets edited later).

```
page.tsx (server; keeps reconcile + loadMatchAnalysis + getMatchVideo)
└─ MatchDetailShell (client; full-height two-pane flex, min-h-0 pattern
   │                 from schedule/event-shell.tsx's flush mode)
   ├─ MatchRail (left, 300px, own overflow-y)
   │   ├─ identity block (names + verified check + Score w/ tiebreaks)
   │   ├─ fact list (date · surface · event · duration · points/games)
   │   ├─ AI blurb (Shots/Film tabs; Statistics tab carries the big strip)
   │   ├─ film card → switches to Film room tab   (video present)
   │   ├─ no-video note strip (44a)               (video absent)
   │   └─ MatchDataBlock — derived-match caveats (46c, see below)
   └─ content pane (own overflow-y, surface-page)
       ├─ MatchTabs (sticky; Statistics · Shots & placement · Film room)
       ├─ StatisticsTab
       │   ├─ InsightStrip (dismissable; reuses AiInsightCard's
       │   │   localStorage-dismiss pattern, new 46a markup)
       │   ├─ HeadToHeadCard (set-chip filter + grouped stat rows + bars)
       │   ├─ PerformanceTrackerChart (mirrored momentum area, SVG)
       │   ├─ RallyLengthCard (marimekko bands + hover tooltips)
       │   └─ PointEndingsCard (100% stacked bar per player)
       ├─ ShotsTab
       │   ├─ CourtHeader (47a toolbar + FiltersPopover + cut sentence)
       │   ├─ ServeZonesCourt (SVG per artboard, zones + placements views)
       │   └─ ZoneTable
       └─ FilmTab
           ├─ FilmPlayer (<video> + custom control bar over playback SAS)
           ├─ PointList (Points/Saved tabs, FilmFiltersPopover,
           │   set/server group headers, save toggle, click-to-seek,
           │   playing-row progress underline)
           └─ FilmEmptyState (46d, when video === null)
```

**Analysing / failed state** (guardrails §3.3 — the gate stays): when
`isInFlight(status) || isAnalysisFailed(status)`, `page.tsx` renders the same
shell with the rail's identity block, and the content pane holds
`MatchAnalysisProgress` instead of tabs — nothing below it, no stat section
ever draws zeroes. `MatchAnalysisProgress`, `MarkReportSeen`,
`ClearRetryOnSuccess` are kept as-is.

**Stats-pending state** (§3.2): `resolveAnalysisStatus`/`withStatsPublished`
logic is untouched. When the timeline exists but stats are unpublished,
StatisticsTab renders `UnpublishedStatsNotice` in place of the four stat
cards (Film room still works — it needs only points + video).

### Data flow — every binding is an existing field

All reads come through `useMatchData()` (provider already carries `match`,
`statsResult`, `points`, `insights`, `playerAverages`); `video` and
`analysis` pass as props from `page.tsx`. **No new fetch path, no schema
change.** Schema verified against the live DB (`points`, `shots` columns).

Attribution guardrail (§4): "you" (viz-you, left slot, check glyph) is keyed
off `match.isUserPlayer1` everywhere — never off player1 position. One shared
helper `useMatchSides()` returns `{you, opp}` name/stat/point accessors so no
card re-derives it.

| Design element | Source |
|---|---|
| Names, score, winner emphasis | `match.player1/2`, `match.score.sets` (+ tiebreak superscripts per the `Score` primitive), `match.won` |
| Verified check | `match.verificationStatus` |
| Date · surface · event | `match.date` (reformat to short month per artboard), `match.courtType`, `match.tournamentName` |
| Duration `1:26:00` (mono) | `match.durationSec` |
| `188 points · 31 games` | `points.length`; games = Σ set games from `match.score.sets` |
| Insight strip / rail blurb | `insights.{player1|player2}.summary` picked by side |
| H2H rows + fraction subs | `statsResult.statistics.player{1,2}Stats` via the existing `SERVE_STATS`/`RETURN_STATS`/`OTHER_STATS` configs (moved out of `page.tsx` into the card) |
| H2H set-chip filter | recompute rows from `points`/shot fields filtered by `setNumber` (see Open questions — derivable subset only) |
| Momentum chart | `points` (rolling won-point differential), set dividers ∝ point counts, break markers = games where `serverIsPlayer1` lost the game |
| Rally length bands | `points.rallyLength` × `wonByPlayer1` (1–4 / 5–8 / 9+) |
| Point endings bars | `points.resultType` × `points.player` (decisive-shot player) → Winners / Aces / Unforced errors / Double faults |
| Serve zone cells + table | serve shot per point (`pickServeShot` role logic) — `zone` (T/Body/Wide) + court side; existing normalization in `matches/visuals/` is the reference for deuce/ad + end-change handling |
| All filters (set, serving/returning, 1st/2nd ball, deuce/ad, zone, pressure, result, rally band, wing, saved) | `MatchPoint` fields — all present today |
| Film player | `getMatchVideo()` SAS url (already on the page); seek = `points[].videoTime` |
| Point list rows | `setNumber`/`gameNumber` groups, `gameScore` chips, `pointScore`, `resultType` + `description`, `player` initials chip, `saved` |
| Save toggle | browser-client `points.update({saved})` — the working pattern in the orphaned `match-video-sidebar.tsx` (which this feature finally replaces/deletes) |
| Playing-row underline | `video.currentTime` vs point `videoTime` windows |

**Dropped by the artboard** (deliberate, listed for review): the radar
`PerformanceProfileCard`, `KeyMomentsCard`, `MatchKpiRow`, hero prev/next
match arrows, and the standalone `MatchVideoCard`. Their files (plus
`match-detail-hero.tsx`, `match-summary-row.tsx`, `match-video-sidebar.tsx`)
are deleted once the new page renders; `getAdjacentMatchIds` goes with the
arrows unless review says keep keyboard nav.

**Derived (Advantage Intelligence) matches**: per-statistic suppression
stands — H2H rows render the existing "—" contract for absent stats; the
Point endings bar drops its Aces segment; the rail's `MatchDataBlock` is the
redesigned home of `DerivedStatsNotice`'s content (the artboard's first two
caveat lines are the real ones; the third is fabricated — flagged).

### The flagged-items file

`docs/match-detail-v46-flags.md` (indexed in `docs/README.md`), one row per
element shipped as static design copy: what it shows, where it renders, the
suspected real source, and what unblocks it. Initial entries (from this
design):

1. Insight strip claim/evidence split + "from 12 analyzed matches" count —
   we have one `summary` string; no analyzed-match count. Render summary as
   the claim line, omit the fabricated count.
2. "Open the full analysis" / rail "View analysis" — no analysis page
   exists; link to `/dashboard/ask` for now.
3. "Add video" / "Import from SwingVision" CTAs (46d/44a) — no
   add-video-to-existing-match flow; link to `/dashboard/matches/new`,
   semantic gap noted.
4. "MP4 up to 4 GB" micro-copy — false (cap is `MAX_VIDEO_SIZE_BYTES`,
   8 GB conservative); ship the real number per the copy-vs-reality rule.
5. `MatchDataBlock` third line ("Two games have no point data") — per-match
   flag counts need `points.flags`/`shots.flags` semantics; ship without the
   line until derivable.
6. Film player extras (loop/speed/kebab glyphs in the control bar) — render
   the bar 1:1; wire play/pause, seek, prev/next point, mute, fullscreen;
   leave the rest inert with tooltips until specced.
7. Court maximize button — renders; opens a plain larger-court dialog
   (same SVG) rather than a specced expanded view.
8. H2H set-chips — filtered values recomputed from `points`, which can
   disagree at the margin with published `match_stats`; whole-match view
   always shows published stats.

### Error handling

- `error.tsx` / `not-found.tsx` / `loading.tsx` for the route: untouched.
- Video SAS expiry (30 min): on `<video>` error after stall, show the 46d-style
  message with a "Reload" action (page refresh re-mints).
- Empty `points` (legacy/partial rows): Statistics tab falls back to H2H only
  (published stats need no points); Film room point list shows an empty note;
  Shots tab shows its zero-state count sentence ("0 of 0 serves").
- `prefers-reduced-motion`: chart draw-in and tab transitions collapse to
  opacity, per the design system.

### Testing

- `npm run lint`, `npx tsc --noEmit`, `npm run build` clean (43 pre-existing
  lint warnings allowed).
- Playwright: existing `tests/` specs touching match detail get updated to
  the tab structure; new smoke spec — open a seeded match, assert rail facts,
  switch all three tabs, apply one Shots filter (count sentence updates),
  toggle one saved point (row moves to Saved), 46d empty state renders for a
  no-video match. No new route → `npm run map` unaffected.
- `pipeline-guardrails-reviewer` run against the diff before stage 06
  sign-off (short-circuit gate, status predicates, attribution, five wizard
  fields untouched).

## Open questions

1. **46b header vs 47a header** on Shots & placement: the canvas itself says
   47a ships. Design assumes **47a**. Say the word if round 46's dropdown
   header should be built literally instead.
2. **Analysing state** unified into the new shell (rail + progress pane)
   rather than keeping the old hero/summary/progress stack — the gate
   semantics are identical; only presentation changes. Confirm.
3. **Prev/next match arrows** (and `getAdjacentMatchIds`) are dropped —
   the artboard has no successor control. Keep the ⌘-arrow behaviour anyway?
4. **Per-set H2H filtering** ships as a derivable-subset recompute from
   `points` (rows whose stat can't be derived per-set show "—" when a set
   chip is active). Acceptable for v1?
5. Responsive below ~1280px: rail stacks above the pane, tabs stay sticky —
   the artboard defines nothing below 1512px (carried from the brief).
6. Team-workspace behaviour: identical page; "you" resolution already comes
   from `my_player_ids()` via `isUserPlayer1`, so a coach viewing an
   unclaimed player's match sees player1 as the left/you slot. Unchanged
   from today — no special handling added.

## Also consulted

Beyond the declared inputs (brief, MAP.md, ui-revamp-guardrails.md, design
SKILL.md) and the imported artboard:

- `src/app/dashboard/matches/[matchId]/page.tsx`, `layout.tsx` — current tree
- `src/lib/data/match-detail-server.ts`, `match-points-server.ts`,
  `types.ts` (`PlayerStatistics`), `match-video-server.ts` — data shapes
- `src/components/dashboard/matches/match-detail/match-video-card.tsx`,
  `matches/match-video-sidebar.tsx` (orphaned Points/Saved precedent),
  `schedule/event-shell.tsx` (flush two-pane precedent),
  `dashboard-shell.tsx`, `src/app/dashboard/header.tsx` (breadcrumbs)
- `src/app/api/matches/[matchId]/route.ts` (PATCH exists; no saved-toggle API)
- Live DB via Supabase MCP: `information_schema.columns` for `points`, `shots`
