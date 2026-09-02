# Brief seed — match-details-47f

Captured verbatim from the `/feature-new` invocation (2026-09-02). Edit freely —
stage 01 refines this into the brief. Run `/feature-next match-details-47f`
to start the pipeline.

> Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via
> /design-login) to import this project:
> https://claude.ai/design/p/afde9116-328b-445c-aeff-8b3c2a702d6f?file=Match+Details+Final.dc.html
>
> Focus on these files (the whole project is readable):
> - `Match Details Final.dc.html`
>
> Also read these files the selection imports:
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/_ds_bundle.js`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/base.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/colors.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/effects.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/fonts.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/spacing.css`
> - `_ds/advantage-design-system-v2-932d1406-360f-4a6e-8617-5a3c600ecb67/tokens/typography.css`
> - `assets/logo-mark.svg`
> - `assets/tennis-court-icon.svg`
> - `assets/tournament-icon.svg`
> - `support.js`
>
> Implement: `Match Details Final.dc.html` 47f
>
> /featture-new make sure the designs are exact and hookup to the db what is
> tangible, for the rest leave as flags/comments for future implementation

## Scaffold-time findings (session notes — not the human's words)

Checked on 2026-09-02 while scaffolding. Stage 01 should re-verify these, not
trust them.

1. **Round 46 of this artboard already shipped.** Frames 46a–46d plus the 47a
   Shots-header were built 1:1 by the retired `work/design-round-46-matchid/`
   pipeline (T1–T7, gate, review, sign-off) and merged to
   `splitstep-integration` at `32bb5bd`. The live page is
   `src/app/dashboard/matches/[matchId]/page.tsx` → `MatchDetailShell` /
   `MatchRail` / `StatisticsTab` / `shots/shots-tab` / `film/film-tab` under
   `src/components/dashboard/matches/match-detail/`. Its presented-copy flags
   are in `docs/match-detail-v46-flags.md` (open rows: #2 analysis link,
   #3 add-video CTA, #7 court maximize, #9 `"0-0"` score coercion). **This
   feature is the delta frame 47f introduces on top of that — not a rebuild.**
2. **47f is newer than anything in the repo.** The artboard copy round 46 was
   built from (extracted 2026-09-01) contains frames 46a–d and 47a–d only —
   no 47e or 47f. The live artboard must be re-read. Baseline copy for
   diffing what changed:
   `git show 0eec94e:work/design-round-46-matchid/02_design/references/match-details-final.dc.html`
3. **DesignSync was not authorized in the scaffolding session** (non-interactive;
   `/design-login` needs an interactive terminal on this machine), so 47f could
   not be read here. Unblock before stage 02: run `/design-login` once from an
   interactive `claude` session, then `get_file` the artboard into
   `02_design/references/` so build stages read it from disk.
4. The worktree had been cut from `main` (586 commits behind); it was reset to
   `splitstep-integration` (475f940), `npm ci` run, and `.env.local` symlinked
   before scaffolding.

## Resume-time findings (2026-09-02, after `/design-login`) — session notes, not the human's words

DesignSync now authorizes. Stage 01 should treat these as verified inputs but
re-check anything it builds on.

### What is on disk now

- `01_brief/references/` and `02_design/references/`:
  `match-details-final.dc.html` (the live artboard — **truncated at
  DesignSync's 256 KiB cap**, ends mid-`46c`; everything through `47f` and
  the four `54x` frames is intact), `frame-47f-only.html` (lines 283–454
  extracted), and `02_design/references/_ds_bundle.js` (v2 bundle, complete;
  `KpiTile`/`KpiStrip` source at its lines 176–303).
- The artboard's sample values (`{{kpiSeason}}`, `{{hhSections}}`, `{{mArea}}`
  …) are dc-runtime bindings and are not in the HTML. They were read off the
  rendered frame in Chrome (Present → New tab) — figures quoted below come
  from that view.

### What 47f is — one frame, `id="47f"`, "Statistics — dashboard density", 1512×982

Same numbers as 46a, laid out to fit one screen with no pane scroll. Only the
**Statistics tab and the rail** are redrawn; Shots & placement and Film room
are not drawn in 47f at all. Sidebar and the 44 px breadcrumb header are the
app's existing chrome (`app-sidebar`, `src/app/dashboard/header.tsx`) — in the
markup the header spans rail + pane, contradicting the section prose ("spans
only the analysis pane"); the markup is the drawn state.

Delta against the shipped round-46 page (`match-detail-shell.tsx`,
`match-rail.tsx`, `statistics-tab.tsx` and its cards):

1. **Shell surface.** Pane background becomes `surface-card` (white) instead
   of `surface-page`; every card gains `border:1px solid var(--border-hairline)`
   + `shadow-card`; rail keeps `border-right` hairline. Tabs row is 42 px,
   `padding:6px 20px 0`; content `padding:14px 20px 16px; gap:14px`; two equal
   `flex:1` columns under a 100 px KPI strip; the Rally card is the `flex:1`
   absorber so the whole pane fits 982 px.
2. **Rail** (`padding:18px 20px; gap:16px`): identity + facts as shipped but
   score `26px` (was 30), facts one group at `gap:8px` (no 5 px split). Bottom
   slot (`margin-top:auto`) is now a `surface-subtle` **insight card** — 20 px
   logo chip, 13 px/500 headline, dismiss ✕, 12 px `ink-600` body with tabular
   numbers, `View full analysis` (blue 11/500) + `Advantage Intelligence`
   micro label. It replaces three shipped things at once: the in-pane
   `InsightStrip`, the rail's "Advantage Intelligence" blurb, and the film
   cross-link card (frame `47z` archives the film action "removed from 47f but
   ready to drop back in"). Neither the 44a no-video note strip nor the
   derived-match `MatchDataBlock` is drawn — see open questions.
3. **Set-scope chips move out of the H2H card into the tab row** (right side):
   segmented control on `surface-muted`, 22 px chips in `text-scoreboard-sm`
   12 px, active chip on `surface-card`; when filtered, a `{{hhScope}} ·
   {{hhScopeMeta}}` label and a blue `Whole match` reset appear beside it. The
   H2H header meta now reads `Whole match · 188 points · 31 games` (adds
   games). Sibling frame 55c's caption says the chips "scope the page".
4. **KPI strip (new)** — DS `KpiStrip` of four `KpiTile`s: **First serve in ·
   First serve points won · Second serve points won · Break points saved**,
   each `NN%` + trend `↑7 vs season 71%` (green/red by `isGood`, red for the
   ↓4 first-serve tile) + an 80×28 sparkline in the same colour.
5. **Head to head** becomes a plain two-column table: header row blank |
   `Reid ✓` (104 px, right) | `Okafor` (104 px); no legend swatches, no set
   chips, no bars, no 9 px fraction sub-figures. Rows `min-height:32px`, label
   12 px `ink-600`, values 13 px tabular, leader 500/`ink-900` vs 400/`ink-500`;
   row hover `surface-muted` (`padding:0 8px; margin:0 -8px`); a dark tooltip
   carries the label + a mono `{{r.tip}}` line (the fraction moved here).
   **Leader is the LOWER value on Double faults and Unforced errors** (Reid 4
   bold vs 6; Okafor 34 bold vs 36) — the shipped `youLeads = you > opp` needs
   a per-row lower-is-better flag. Fifteen rows, section eyebrows `SERVE /
   RETURN / POINTS` (shipped: Serve / Return / Other, 24 rows), sentence-case
   labels:
   - Serve: Aces · Double faults · First serve in · First serve points won ·
     Second serve points won · Break points saved (shown as a %, 48z tip
     `9/12`) · Service games won (`75%`, tip `12/16`)
   - Return: First serve returns won · Second serve returns won · Break points
     converted · **Return winners** (`5` vs `3`)
   - Points: Net points won (`67%`, tip `12/18`) · Winners · Unforced errors ·
     Total points won (`100`, tip `of 188`)
   Dropped vs shipped: Service points won, First/Second returns in play,
   Return points won, Return games won %, Service breaks, Net approaches, the
   three rally-length % rows (the Rally card owns that now).
6. **Performance tracker** (`flex:0 0 auto`): header is eyebrow + blue
   `Expand` link — no legend swatches, no break-of-serve legend; a 10 px
   `Reid above` label sits inside the chart's top-left. Chart 104 px
   (`viewBox 0 0 1000 96`): dashed `ink-200` set dividers, 0.14-opacity area
   fills, 1.5 px lines, **no `viz-key` break verticals**. Hover: 1 px `ink-300`
   crosshair + dark annotation with three lines — `Break of serve · Set 2` /
   `Okafor breaks for 4-3 · Reid −3 on margin` / mono `44:28 · point 96`. Set
   labels row is 10 px `ink-400` (was `eyebrow-sm`).
7. **Rally length** (`flex:1`): header meta `4.6 shots average` (drops the
   point count); mosaic `min-height:96px` fills the card, 2 px gaps, fixed
   `viz-you-mid` over `viz-opp-light` (no leader-based tone swap), radius only
   on outer corners, **no in-band percentage labels**; labels `Short 106 ·
   Medium 54 · Long 28` (11 px + mono 10 px count); legend uses the same two
   tones; footer `Width is how often`. Tooltip: title / `106 points · 56.4% of
   the match` (one decimal) / `Reid 57%` / `Okafor 43%`.
8. **How points ended** (`flex:0 0 auto`): header meta `Own outcomes`; per
   player a name (11 px `ink-600`) + mono 10 px total; bars **10 px** (were
   16); 6 px legend squares labelled `Winners · Aces · Unforced · Double
   faults`; no footer sentence. Tooltip `Winners` / `Reid 24 · Okafor 19`.

### Data — what is tangible today (verified in `src/lib/data`)

- Everything the shipped cards read stays available through `useMatchData()`
  + `useMatchSides()` (guardrails §4 — nothing new may read player1/player2).
- **KPI values**: `sides.you.stats.firstServeInPct / firstServeWinPct /
  secondServeWinPct` (last one nullable on derived matches — DS tile has no
  em-dash state; decide). **Break points saved has no percentage field**:
  `PlayerStatistics.breakpointsSaved` is a count with
  `fractions.breakpointsSaved{made,attempts}` — derive made/attempts.
- **"vs season NN%"**: `playerAverages` is already on the provider
  (`getPlayerAverageStats`, `match-stats-server.ts:87`) — the mean over the
  viewer's OTHER matches as player1, current match excluded, absent values
  excluded. It is a career baseline, not a season, and it has **no
  break-points-saved average** (only `break_points_converted_pct`). Either the
  copy says "vs your average" (copy-vs-reality rule) or "season" gets a
  definition + date filter; the fourth tile needs a new averaged column either
  way.
- **Sparklines**: nothing on the match page carries a per-match history.
  `performance-server.ts` builds `KpiCardData.sparkline` (+ `points`) for the
  home strip from the last-N window; `statistics-server.ts`'s
  `getSelectableMatches()` returns per-match stats. Stage 02 picks one and
  threads a small four-stat history through `getMatchDetailData()`.
- **H2H**: all rows map to existing keys except **Return winners** — no
  `PlayerStatistics` field; only derivable from `points.result_type` if the
  vendor/import ever writes a return-winner value (unverified). Per-set
  recompute exists for the derivable subset (`head-to-head-card.tsx`).
- **Tracker annotation**: break detection exists (`detectBreakIndices`); the
  `4-3` game score is `gameScore`, which is coerced `"0-0"` on derived matches
  (flags doc #9, open); `44:28` is `videoTime` — null on imports with no
  video. `Expand` has no spec (same class as flags #7 court maximize).
- Rail insight card: the app has ONE `summary` string per side (flags #1
  resolved by rendering it alone); `View full analysis` → `/dashboard/ask`
  (flags #2 open); dismiss should reuse `insightDismissedStorageKey`.

### Open questions for stage 01 to carry (do not answer in the seed)

1. Does the tab-row set scope apply to the whole pane (tracker, rally,
   endings) or only H2H as today? The KPI strip cannot be recomputed per set
   from `points` (no first/second-serve split there) — whole-match regardless.
2. Where do the 44a no-video note strip and the derived-match `MatchDataBlock`
   sit in a 47f rail — above the insight card, or dropped? (Guardrails say the
   derived caveats must stay on screen.)
3. Does the white-pane/hairline-card surface change apply to Shots & placement
   and Film room too (they are not redrawn in 47f but share the shell)?
4. "vs season" — rename to the real baseline, or define season?
5. `Expand` on the tracker and the empty-state for a match with no published
   stats (`UnpublishedStatsNotice` is not drawn in 47f).

### Also noticed, out of scope

The live `46b` (Shots & placement) differs from the copy round 46 built from
(~180 changed lines around the court header); `46a` differs only in two
anchor hrefs. Not part of 47f; a separate check, not this feature.
