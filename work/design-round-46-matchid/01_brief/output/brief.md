# Brief — design-round-46-matchid

## Goal

Rebuild the match detail page (`/dashboard/matches/[matchId]`) to match Claude
Design round 46 — the `Match Details Final.dc.html` artboard in project
`afde9116-328b-445c-aeff-8b3c2a702d6f` — as a 1:1 layout copy. Wire every
section to real match data where the mapping is clear; where it is uncertain,
ship the design's static copy verbatim and leave an explicit flag for a later
data pass.

## Scope

- The single match detail route only: `src/app/dashboard/matches/[matchId]`
  and the components it renders (`src/components/dashboard/matches/…`).
- Import the design via the claude_design MCP: the artboard itself, the DS-v2
  token files it imports (`base/colors/effects/fonts/spacing/typography.css`),
  `_ds_bundle.js`, `support.js`, and the three SVG assets
  (`logo-mark`, `tennis-court-icon`, `tournament-icon`).
- Translate design tokens onto the repo's existing design system
  (`src/styles/design-system/`, Tailwind utilities, `advButton()`), not a
  parallel token layer.
- Data wiring through the existing `getMatchDetailData()` /
  `MatchDataProvider` / `useMatchData()` path.
- A visible-in-repo list of flagged items: every element left as static design
  copy, with what real field it likely maps to.

## Non-goals

- No new sub-routes; the page stays a single scroll-anchored page.
- No changes to other dashboard pages, navigation, or the upload wizard.
- No schema or data-layer changes beyond what the page's own loader needs;
  the vendor/video pipeline is untouched.
- No dark mode, no new fonts, no new icon sets — repo design system rules hold.
- Not a redesign pass: where the artboard and the current page disagree, the
  artboard wins (that is what "1:1" means); do not "improve" on it.

## Constraints

- **Guardrails**: `docs/ui-revamp-guardrails.md` must be read before touching
  this page and its invariants respected — statistics attribution must not
  silently flip players.
- **Analysing state**: `page.tsx` short-circuits to hero + progress while a
  match is still analysing. The rebuilt page must keep an equivalent guard.
- **Single fetch**: layout and page share one `getMatchDetailData()` via React
  `cache()`; the rebuild must not introduce a second fetch path.
- **1:1 means layout, not lies**: per prior rounds, copy the layout literally,
  but design copy that states something false about the data (wrong labels,
  fabricated numbers presented as real) gets flagged, not shipped as truth.
- **Design system**: Inter only, existing type scale, blue `#3B82F6` accent,
  Lucide icons, the three sanctioned Motion curves, `advButton()` for primary
  buttons, `rounded-[6px]` buttons.
- Worktree needs `npm ci` before any build/test gate; claude_design MCP must
  be authenticated (`/design-login`) before the import stage can run.

## Success criteria

- Side-by-side, the rendered page visually matches the artboard's layout,
  hierarchy, spacing, and copy positions for a real match with full stats.
- Everything with an obvious mapping (players, score, date, event, serve/return
  stats, court visuals, point/shot data) renders live data, not design copy.
- Every unmapped element is (a) rendered exactly as designed and (b) listed in
  a flagged-items file with its suspected data source.
- The analysing, error, and not-found states still work.
- `npm run lint`, `npm run build`, and `npm test` pass;
  `pipeline-guardrails-reviewer` finds no violations.

## Open questions

- Does round 46 cover both personal and team workspaces, or was it drawn for
  one? (Affects who sees what — resolve when the artboard is imported.)
- The artboard may redraw sections that earlier feedback deliberately
  restrained (KPI row, match summary). Assumption: the new artboard
  supersedes that feedback for this page. Confirm if wrong.
- Mobile/responsive: the artboard is presumably one desktop frame. Assumption:
  match the frame at desktop widths and keep sensible existing responsive
  behaviour below, flagging anything the design leaves undefined.
