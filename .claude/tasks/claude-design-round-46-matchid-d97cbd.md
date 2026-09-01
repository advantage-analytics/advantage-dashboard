# Tasks — claude/design-round-46-matchid-d97cbd

> Scope: rebuild `/dashboard/matches/[matchId]` 1:1 to Claude Design round 46
> (two-pane tabbed page). Spec chain: `work/design-round-46-matchid/` (design →
> plan); artboard markup at
> `work/design-round-46-matchid/02_design/references/match-details-final.dc.html`.
> Fresh checkout: run `npm ci` before any tsc/lint/build gate.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Build the two-pane shell, rail and tabs; flip page.tsx onto them
- **status:** done
- **model:** fable
- **files:** src/components/dashboard/matches/match-detail/{use-match-sides.ts,match-detail-shell.tsx,match-rail.tsx,match-tabs.tsx} (new), src/app/dashboard/matches/[matchId]/page.tsx, src/components/dashboard/dashboard-shell.tsx, src/components/dashboard/page-transition.tsx
- **done when:**
  - [ ] The match page renders a 300px left rail (players + verified check + score with superscript tiebreaks, short-month date, surface, event, mono duration, "N points · M games") and a content pane with a sticky Statistics/Shots & placement/Film room tab strip, each pane scrolling independently at 1512px wide — verify by adding `min-h-0` wherever the flex chain from `dashboard-shell.tsx`'s `<main>` down to the new shell is missing it (`dashboard-shell.tsx` and `page-transition.tsx` both currently omit it), not only inside the new components
  - [ ] Tab selection syncs to a `?tab=` query param (back button restores the prior tab); no new route directory exists under `matches/[matchId]/`
  - [ ] The existing cards still render, parked per tab (Statistics: insight + statistics + performance cards; Shots: ServePlacementCard; Film: MatchVideoCard or a placeholder when video is null) — no stat data disappears in this step **beyond what `02_design/output/design.md`'s "Dropped by the artboard" list already calls out as intentionally cut (MatchKpiRow, PerformanceProfileCard, KeyMomentsCard, the hero prev/next arrows, the standalone MatchVideoCard as its own section) — those may leave the render now rather than being parked, since the artboard never carries them and parking them only to delete them again in T7 wastes the work**
  - [ ] An in-flight or failed-analysis match renders the rail plus MatchAnalysisProgress only — no tabs, no stat sections (guardrails §3.3 gate preserved, `withStatsPublished`/`analysisFor` logic untouched); stats-pending still surfaces UnpublishedStatsNotice in the Statistics tab
  - [ ] All "you"-side rendering (check glyph, emphasis) comes from a single `useMatchSides()` helper keyed on `match.isUserPlayer1`; the rail's no-video slot is gated by provenance, not merely by `video === null` — a true SwingVision import (`match.sourceProvider !== "splitstep"`) with no video shows "the stats came from the SwingVision export" + Add video, while an Advantage-Intelligence-analyzed match (`sourceProvider === "splitstep"`) whose trimmed copy is missing/reclaimed shows a neutral "No video available for this match" with no SwingVision claim; `npx tsc --noEmit && npm run lint` pass
- **notes:** Plan step 1. Artboard frames 46a–d (lines 431–1217 of the reference .dc.html) share this shell; two-pane flush precedent: `schedule/event-shell.tsx`. Read `docs/ui-revamp-guardrails.md` §3.2–3.4 first. Header breadcrumb is already handled by `src/app/dashboard/header.tsx` — do not add a second crumb bar. Prev/next arrows and `getAdjacentMatchIds` leave the render (deletion happens in T7). **Retry of a blocked run** — see `.claude/tasks/claude-design-round-46-matchid-d97cbd.log.md`'s T1 entry for the two failures being fixed here (broken independent-scroll chain outside the original file list; a false SwingVision-provenance claim on video-analyzed matches missing their trimmed copy). No existing "add video to an existing match" flow was found in the codebase — the SwingVision-import copy's "Add video" link may still point at `/dashboard/matches/new` (a semantic gap already flagged in `docs/match-detail-v46-flags.md`'s planned entries), but the copy itself must not appear for a match it doesn't describe.

## T2 · Statistics tab: insight strip + head-to-head card
- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/matches/match-detail/{insight-strip.tsx,head-to-head-card.tsx,statistics-tab.tsx} (new), src/app/dashboard/matches/[matchId]/page.tsx
- **done when:**
  - [ ] The Statistics tab renders the 46a insight strip (ink-900 logo chip, insight summary as the claim line, dismiss X persisting via the existing localStorage key, link to /dashboard/ask, no fabricated "from N matches" count) and it stays dismissed across reload
  - [ ] HeadToHeadCard renders the legend row (viz-you left with green check, viz-opp right), set-score chips from match.score.sets, and the Serve/Return/Other stat groups with value + fraction sub-figures + mirrored bars, values matching the published match_stats numbers shown by the old MatchStatisticsCard for the same match
  - [ ] Clicking a set chip recomputes derivable rows from points filtered to that set, non-derivable rows show the "—" convention, and "Whole match" restores published values
  - [ ] On a match where the viewer is player2, the viewer's name and stats occupy the left/you slot (attribution keyed via useMatchSides, not player order)
  - [ ] The SERVE/RETURN/OTHER stat configs now live with the card (not in page.tsx), and tsc + lint pass
- **notes:** Plan step 2. Frame 46a lines 486–517. AiInsightCard + MatchStatisticsCard leave the render here but their files survive until T7.

## T3 · Statistics tab: momentum, rally length, point endings charts
- **status:** done
- **model:** opus
- **needs:** T2
- **files:** src/components/dashboard/matches/match-detail/{performance-tracker-chart.tsx,rally-length-card.tsx,point-endings-card.tsx} (new), statistics-tab.tsx
- **done when:**
  - [ ] The performance tracker renders the mirrored momentum area chart from points (you-fill above the midline, opp-fill below, set dividers at proportional x positions, dashed viz-key verticals at games where the server lost, legend + Set axis row per frame 46a)
  - [ ] RallyLengthCard renders three bands (1–4/5–8/9+) whose widths are proportional to each band's share of total points and whose fill split matches you-won%, with dark hover tooltips whose counts sum to the header's total points
  - [ ] PointEndingsCard renders one 100% stacked bar per player over Winners/Aces/Unforced errors/Double faults derived from resultType × decisive player, with segment tooltips whose counts sum to each player's "N shot outcomes" label; the Aces segment is absent for splitstep-derived matches
  - [ ] Chart enter animations collapse to opacity under prefers-reduced-motion
  - [ ] The old PerformanceTrackerCard is out of the render (file remains until T7); tsc + lint pass
- **notes:** Plan step 3. Frame 46a lines 519–556 carries the exact SVG/legend/tooltip structure and the `.seg`/`.mom-annot` hover patterns (reproduce with CSS/React state, not the artboard's global stylesheet).

## T4 · Shots & placement tab: filters, court, zone table
- **status:** blocked
- **model:** fable
- **needs:** T1
- **files:** src/components/dashboard/matches/match-detail/shots/{use-shot-filters.ts,court-header.tsx,serve-zones-court.tsx,zone-table.tsx,shots-tab.tsx} (new), src/app/dashboard/matches/[matchId]/page.tsx
- **done when:**
  - [ ] The Shots & placement tab renders the 47a header (eyebrow + subtitle, "{you} serving" legend, Filters popover with segmented Set/Game/Ball/Court/Zone/Pressure/Result/Rally groups, maximize control opening a larger-court dialog, segmented toolbar Serve|Return · Zones|Placements · 1st|2nd|Both · All|Won|Lost) and an applied-cut sentence strip with working "Clear filter"
  - [ ] The Zones court renders the artboard SVG with cells shaded by serve frequency, pct-won + count labels per cell, and the six cell counts sum to the "N of M serves" header count for the current filter cut
  - [ ] The Placements view renders the same dot positions the old ServePlacementCard renders for the same match (normalization/end-change/deuce-ad logic reused from matches/visuals, not reinvented)
  - [ ] Every filter narrows the count sentence and the drawn set consistently (spot-check: set filter, 1st/2nd ball, deuce/ad, break-point pressure), and Return mode draws return shots on the full court
  - [ ] The zone table (Zone · Serves · Won bar · Rate) matches the court cells' numbers for the same cut; tsc + lint pass; verified once on a viewer-is-player2 match
- **notes:** Plan step 4. Frames 46b (lines 564–751) for the page, 47a (lines 44–164) for the header — the canvas marks 47a "what ships". Read guardrails §4 before touching placement math; the existing `matches/visuals/` + `serve-placement-card.tsx` code is the reference for coordinate normalization.

## T5 · Film room tab: player, point list, empty state
- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/matches/match-detail/film/{film-player.tsx,point-list.tsx,film-filters.tsx,film-empty-state.tsx,film-tab.tsx} (new), src/app/dashboard/matches/[matchId]/page.tsx
- **done when:**
  - [ ] With a video, the Film tab renders the 46c player (playback SAS in a <video>, custom bar: play/pause, prev/next-point seeking via point videoTime, scrubbable progress, mono elapsed/total, mute, fullscreen; unspecced glyphs render inert with tooltips) and clicking a point row seeks the video to that point's videoTime
  - [ ] The point list renders Points/Saved tabs, set·server group headers with game-score chips, and rows per 46c (decisive-player initials chip in viz-you or subtle, result label, description micro, point score, hover bookmark)
  - [ ] Toggling a bookmark persists (row appears under Saved after a full page reload) with optimistic UI and revert on write failure, using the browser Supabase client pattern from match-video-sidebar.tsx
  - [ ] The Filters popover filters the list with live counts and a "N of M points" footer; the applied-cut strip states the cut in words with a working clear; the currently-playing row shows the blue progress underline driven by video timeupdate
  - [ ] With no video, the tab renders the 46d empty state with the real size cap (from MAX_VIDEO_SIZE_BYTES, not "4 GB") and CTAs linking to /dashboard/matches/new; `npm test` stays green and tsc + lint pass
- **notes:** Plan step 5. Frames 46c (753–1138) and 46d (1140–1217). Guardrails: this file is "the match video", never a highlight/condensed cut. SAS expires ~30min — video error state offers reload.

## T6 · Rail completion: match-data block, no-video strip, flags doc
- **status:** todo
- **model:** sonnet
- **needs:** T1, T5
- **files:** src/components/dashboard/matches/match-detail/{match-data-block.tsx (new),match-rail.tsx}, docs/match-detail-v46-flags.md (new), docs/README.md
- **done when:**
  - [ ] On a splitstep-derived match the rail shows the 46c "Match data" block (Coming soon pill, the two true caveat lines — aces vs service winners, winners/errors are model output — disabled "Review flags" button + micro caption); the fabricated "Two games have no point data" line is absent; non-derived matches don't render the block
  - [ ] On a match with no video the rail shows the 44a note strip ("No video on this match…" + Add video link to /dashboard/matches/new) in place of the film card
  - [ ] docs/match-detail-v46-flags.md exists with one entry per design-copy element (element · where it renders · suspected real source · what unblocks it), covering at least the eight entries listed in design.md, updated for anything T1–T5 already resolved
  - [ ] docs/README.md indexes the new doc with its current-state/point-in-time marking; tsc + lint pass
- **notes:** Plan step 6. Frames 46c rail (lines 799–811) and 44a (1229+). This block supersedes DerivedStatsNotice's content; the notice file itself is deleted in T7.

## T7 · Retire replaced components and run the full gate
- **status:** todo
- **model:** opus
- **needs:** T2, T3, T4, T5, T6
- **files:** src/components/dashboard/matches/{match-detail-hero.tsx,match-video-sidebar.tsx}, src/components/dashboard/matches/match-detail/{match-summary-row.tsx,match-kpi-row.tsx,performance-tracker-card.tsx,match-statistics-card.tsx,serve-placement-card.tsx,performance-profile-card.tsx,key-moments-card.tsx,match-video-card.tsx,derived-stats-notice.tsx,unpublished-stats-notice.tsx}, src/app/dashboard/matches/[matchId]/page.tsx, src/lib/data/match-detail-server.ts
- **done when:**
  - [ ] Every listed component file whose render moved into the v46 tree is deleted, and a grep for each deleted export name across src/ returns no importers (files still imported elsewhere — e.g. a notice still rendered by the new tree — are kept and the exception noted in the commit message)
  - [ ] page.tsx carries no dead imports; getAdjacentMatchIds usage is removed from the page, and its export is removed from match-detail-server.ts only if grep shows no other importer
  - [ ] `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`, and `npm test` all pass on the branch
  - [ ] The four artboard states render on the dev server: 46a/46b/46c on an analyzed video match, 46d + no-video rail strip on a SwingVision match, analysing gate on an in-flight match
- **notes:** Plan step 7. The similarly-named serve-placement/statistics components under home/, statistics/, and matches/serve-placement/ belong to OTHER pages — verify importers before every deletion, delete only match-detail's own.
