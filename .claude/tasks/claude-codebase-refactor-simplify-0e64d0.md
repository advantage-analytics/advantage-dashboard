# Tasks — claude/codebase-refactor-simplify-0e64d0

> Scope: design-system drift only — make the DS machine-checkable, then burn
> down the ~150 off-spec value sites and the leftover shadcn scaffold. No
> component extraction, no layout change, no structural refactor.

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

Plan of record: `~/.claude/plans/system-reminder-you-are-operating-zippy-adleman.md`.

## T1 · Add the design-drift checker and its test gate

- **status:** done
- **model:** sonnet
- **files:** scripts/check-design-drift.mjs, tests/design-drift.spec.ts
- **done when:**
  - [ ] Reads the allowed-hex set from colors.css, data-viz.ts AND player-colors.ts — none hardcoded
  - [ ] Implements four counted checks: off-palette hex, off-scale `text-[Npx]`, inlined viz hex, shadcn token utilities
  - [ ] Fails when a count exceeds its seed (regression) AND when it drops below (stale seed — forces the ratchet)
  - [ ] `tests/design-drift.spec.ts` runs it and passes on the current tree with no secrets
  - [ ] Google-brand hexes in login-form.tsx and provider hexes in lib/providers.ts are allowlisted with a stated reason
- **notes:** Check 4 exists because checks 1–3 are blind to the shadcn oklch
  layer — no hex appears, so `tooltip.tsx` painting `bg-primary` instead of
  `--ink-900` would never be caught.

## T2 · Settle the primitive foundation

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/ui/{select,field,card,tabs,badge,checkbox,switch,textarea,chart}.tsx, src/components/ui/{tooltip,dialog,alert-dialog,button}.tsx, src/app/globals.css, src/app/layout.tsx, .skills/advantage-analytics-design/SKILL.md
- **done when:**
  - [ ] The nine zero-importer scaffold files are deleted, each re-verified unreferenced across src, tests and scripts first
  - [ ] SKILL.md carries the behavior-vs-appearance rule for when to wrap Radix, wrap native, or hand-build
  - [ ] The adv-switch.tsx and adv-select.tsx docstrings cite that rule instead of the deleted files
  - [ ] tooltip/dialog/alert-dialog/button and layout.tsx use DS vars, not shadcn tokens; tooltip matches SKILL.md §"Dark Tooltip (v3)"
  - [ ] Check 4 reads 0 and its assertion is flipped
- **notes:** DONE. Went further than drafted, and the extras were forced:
  - `button.tsx` was not on the delete list (3 importers) but WAS pure shadcn
    with a black primary. Its three consumers migrated to `advButton()`
    — `alert-dialog` (primary + outline), `delete-match-dialog`
    (danger-solid, which also retired a `#C81530` near-twin of `--danger-hover`
    for free), and `auth-nav` (every visual was already overridden, so a plain
    styled `Link` replaced it). Ten files deleted, not nine.
  - `.btn-primary` in globals.css was dead AND used `bg-blue-600`, a
    near-miss of Signal Blue. Removed.
  - `--radius` + `--radius-*` and `--font-sans` / `--font-mono` were KEPT: 65
    `rounded-*` utilities resolve through the radius steps, so deleting them
    would have silently reshaped every one.
  - Two `.dark` systems exist. Only shadcn's went; the DS's own dark tokens in
    `colors.css:173`, `effects.css:55` and `globals.css` are untouched.
  - Verified with `npm run build`, not just the checker — see T12.

## T3 · Add the missing page-title step and normalize 14 sites

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** .skills/advantage-analytics-design/SKILL.md, src/styles/design-system/typography.css, 14 call sites
- **done when:**
  - [ ] One 24px font-light page-title step is defined in BOTH the SKILL.md type-scale table and typography.css
  - [ ] All 14 sites at 22/24/26px use it
  - [ ] Its tracking is consistent with the -0.5px/-0.4px neighbours it sits between
- **notes:** The scale jumps 16 → 28. Fourteen independent authors reached into
  that gap, so it is a missing step, not fourteen mistakes.

## T4 · Snap the remaining 11 off-scale font sizes

- **status:** done
- **model:** sonnet
- **needs:** T1, T3
- **files:** ~9 files, one line each
- **done when:**
  - [ ] The 7 `text-[15px]` sites use 14px or 16px, matching their surrounding block
  - [ ] The 3 `text-[18px]` dialog titles follow SKILL.md §"Dialog (v3)" if it specifies a size, else snap to 16px
  - [ ] `profile-form.tsx:160`'s 19px is resolved alongside its 24px sibling from T3
  - [ ] Check 2 reads 0 and its assertion is flipped

## T5 · Centralize inlined chart hex onto data-viz exports

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** src/components/dashboard/shared/kpi-detail-chart.tsx (6), src/components/dashboard/matches/serve-placement/serve-placement-widget.tsx (2)
- **done when:**
  - [ ] The 8 remaining inlined viz hues import their named export instead
  - [ ] Hues without an existing role get a NAMED export in data-viz.ts, not an inline value
  - [ ] Every substituted value is byte-identical to the one it replaced
  - [ ] Check 3 reads 0 and its assertion is flipped
- **notes:** RESCOPED TWICE. Was ~12 files / 40 sites; 14 sat in the
  unreachable statistics subtree and 2 in the unreachable court-visualization,
  which the checker now skips, and T8 converted serve-placement-widget's
  first/second-serve pair on its way past. Eight sites remain: kpi-detail-chart
  is six identical `#3B82F6` on chart props, and serve-placement-widget still
  has its court fill (`#EFF4FF`, which per SKILL.md §"Court Visualization
  Colors" should be `--viz-court-fill` `#D6E4F9`, so check that is not a
  straight swap) and an active-zone `#3B82F6`.

## T6 · Resolve the off-palette hex

- **status:** blocked
- **model:** opus
- **needs:** T1, T5
- **files:** ~35 live files; heaviest are lib/data/performance-server.ts, matches/match-score-row.tsx, match-detail/share-match-button.tsx, statistics/match-selector.tsx
- **done when:**
  - [ ] Near-twin greys (#F0F0F0, #1D1D1F, #E7E7E7, #EBEBEB, #D9D9D9, #F7F7F7, #BFBFBF) resolve to the token they duplicate
  - [ ] Real roles missing a token (#CC1530/#C81530/#B91230 as danger hover/pressed) are promoted to colors.css, not collapsed onto the resting colour
  - [ ] The Tailwind amber ramp is gone from UI chrome and #4A90E2 is replaced by Signal Blue
  - [ ] performance-server.ts colour values are fixed and its layering violation is noted, not refactored
  - [ ] Check 1 reads 0 and its assertion is flipped
  - [ ] Collapsed greys verified on a rendered dashboard, focusing on borders and dividers
- **notes:** RESCOPED after T1 — 79 findings, not 107; the other 32 were in the
  unreachable statistics subtree. colors.css already merged #EAECF0 as "a
  near-twin of ink-200" — same move, and its comment is the precedent.
  `--danger-hover: #C41530` ALREADY EXISTS in globals.css:111, so the
  #CC1530/#C81530/#B91230 family resolves onto it rather than needing a new
  token. The only visually consequential task in this queue.

## T7 · Build the DS Card primitive and adopt it across 48 shells

- **status:** later
- **model:** opus
- **needs:** T2
- **files:** src/components/ui/, ~48 call sites
- **done when:**
  - [ ] A hand-built Card matching SKILL.md §Card exists (not a shadcn re-import)
  - [ ] The 48 hand-rolled shells use it
  - [ ] No layout or spacing changes ride along
- **notes:** Deferred on purpose — this is the component tier and it touches
  layout, which the scope decision keeps off in-flux surfaces. Promote to
  `todo` once [matchId] is settled.

## T8 · Retire violet from player attribution

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/app/globals.css, src/lib/design/player-colors.ts, src/lib/design/data-viz.ts, src/components/dashboard/matches/visuals/court-visualization.tsx, src/components/dashboard/matches/serve-placement/serve-placement-widget.tsx, src/components/dashboard/matches/match-detail/radar-chart-section.tsx
- **done when:**
  - [ ] globals.css `--color-player-2` / `-bar-tint` match colors.css (slate), not violet
  - [ ] player-colors.ts PLAYER_2 family transcribes colors.css's slate values
  - [ ] data-viz.ts drops the violet ramp; VIZ_PLAYER.p2 and VIZ_SURFACE.Indoor use a slate role
  - [ ] The 3 live render sites use --viz-opp (opponent) or --viz-you-mid (second serve) per colors.css's own prescription
  - [ ] Check 5 counts only the green ramp; its seed is lowered accordingly
  - [ ] SKILL.md §"Match Detail Colors" states the slate values as current, with the purple table removed rather than annotated
- **notes:** colors.css:118 retired violet in "review decision C"; three layers
  never followed. SKILL.md:243 already calls this out as "drift to migrate
  surface by surface". Marked `next` because T5 and T6 both touch
  serve-placement-widget.tsx and would otherwise re-token a colour that is
  about to be deleted.
  Deliberately NOT in scope: data-viz.ts's green ramp (#3E9A45/#84C97E/#ABDCA6)
  also fails check 5. It is undefined in colors.css but is not violet, so it
  needs its own decision — either colors.css defines the ramp or data-viz drops
  it. Leave the seed accounting for it.

## T9 · Coming-soon parity for Opponents — DONE outside the queue

- **status:** done
- **model:** sonnet
- **files:** src/lib/dashboard/nav.ts, src/app/dashboard/opponents/page.tsx
- **done when:**
  - [x] Opponents appears in PERSONAL_NAV with `comingSoon: true`, as it already does in TEAM_NAV
  - [x] The page returns its stub BEFORE the team gate, so a personal workspace sees "coming soon" instead of being redirected to /dashboard
  - [x] The team gate still guards the finalised path, which needs `active.id` to be a program
  - [x] nav.ts's docstring states why the entry belongs in both lists
- **notes:** Statistics and Ask were already `ComingSoonPage` in both navs;
  Opponents was the only gap. Landed with T1 rather than queued separately
  because it was two lines and the user asked for it directly.

## T10 · Decide the data-viz green ramp

- **status:** todo
- **model:** opus
- **needs:** T8
- **files:** src/lib/design/data-viz.ts, src/styles/design-system/colors.css
- **done when:**
  - [ ] `VIZ_GREEN_DEEP` / `_MID` / `_LIGHT` (#3E9A45 / #84C97E / #ABDCA6) either appear in colors.css as a real role, or are deleted from data-viz.ts
  - [ ] If deleted, `stat-progression-chart.tsx`'s five green assignments are repointed and still compile
  - [ ] Check 5 reads 0 and its assertion is flipped
- **notes:** The last 3 of check 5's original 11. Split from T8 deliberately:
  it is transcription drift like the violet was, but it is NOT violet and has
  no review decision behind it, so it needs its own answer rather than being
  swept along. data-viz.ts:64 calls it "the return-family series" — but green
  is the outcome register (won/lost), so a green series colliding with a green
  outcome is the question to settle.

## T11 · Reconcile the docs with what is actually reachable

- **status:** todo
- **model:** sonnet
- **needs:** T8
- **files:** AGENTS.md, docs/ui-revamp-guardrails.md
- **done when:**
  - [ ] AGENTS.md's "Statistics" section marks `statistics-server.ts` / `statistics-client.ts` / `STAT_CONFIG` as behind ComingSoonPage, not live architecture
  - [ ] AGENTS.md's "Court visualization" section reflects that `visuals/court-visualization.tsx` has no importer and `match-detail/shots/shots-tab.tsx` superseded it (it also states ~730 lines; the file is 1,239)
  - [ ] Any guardrails reference to those files says the same
  - [ ] No doc claims a file is live that `check-design-drift.mjs` lists as unreachable
- **notes:** Found while running T8. Both docs describe 5,800 lines of dead
  code as current architecture, which is how it kept looking maintained — and
  is why the violet in court-visualization.tsx read as a live bug. Docs
  drifting silently is worse than no docs, per docs/README.md's own house rule.

## T12 · Teach the drift checker to read stylesheets

- **status:** done
- **model:** sonnet
- **needs:** T2
- **files:** scripts/check-design-drift.mjs
- **done when:**
  - [ ] The walk covers .css as well as .ts/.tsx
  - [ ] A utility class used via `@apply` inside a stylesheet is counted like one in a component
  - [ ] Tailwind default-palette classes (`bg-blue-600`, `text-gray-500`) are caught in CSS too
  - [ ] Seeds are re-measured against the widened scope
- **notes:** Found the hard way in T2. Deleting shadcn's token layer left
  `@apply border-border` inside globals.css's own base layer; the checker
  stayed green and `npm run build` failed. The blind spot is documented at the
  top of the script. `npm run build` is the backstop (Vercel builds every
  push), so this is a coverage gap, not a safety one — but a checker that goes
  green on a broken tree teaches people to distrust it.
