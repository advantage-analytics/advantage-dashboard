# Build report — match-details-47f

Queue drained: **13 of 13 tasks `done`, none `blocked`** as of 2026-09-02.
Branch `claude/match-details-implementation-97c1ee`, base
`splitstep-integration` @ `475f940`.

The queue that stage 04 wrote held T1–T12. **T13 was added during the build**
(`/task-add`, commit `d2f8692`) after T5 was blocked by a data-layer defect —
see "The one block and its resolution" below. It is part of this feature.

## Task statuses

| Task | Model | Status | Commit |
|---|---|---|---|
| T1 · KPI history loader and its spec | opus | done | `94196cd` |
| T2 · Thread kpiHistory through getMatchDetailData and the provider | fable | done | `e1cfba1` |
| T3 · Set-scope primitive: hook, helpers, chips, spec | opus | done | `b61d8a6` |
| T4 · Shell surface and tab row with the trailing slot | opus | done | `a994ddb` |
| T5 · KPI strip and the Statistics tab layout | opus | done | `eea5395` (first run blocked `adfbbeb`) |
| T6 · Head-to-head as a 15-row table | opus | done | `9ba63dd` |
| T7 · Performance tracker: Expand, above-label, annotation | opus | done | `2a3740d` |
| T8 · Rally length card | sonnet | done | `74c0b2f` |
| T9 · How points ended card | sonnet | done | `5e64b2f` |
| T10 · Rail metrics and the insight card; retire the strip | opus | done | `b2e7886` |
| T11 · Flags doc rows for 47f | sonnet | done | `9766d2b` |
| T12 · Gate and visual pass against the 47f frame | fable | done | `810b967` |
| T13 · KPI history covers both seats — fix the loader that blocked T5 | opus | done | `e7ba057` (added `d2f8692`) |

Every task cleared its gate: `npm run lint` (0 errors, 37 warnings = baseline),
`npx tsc --noEmit`, `npm test`, plus `task-completion-reviewer` (`VERDICT: pass`)
and the surface-appropriate guardrail reviewer. Per-task gate detail is in
`.claude/tasks/claude-match-details-implementation-97c1ee.log.md`.

## Commit range

`475f940` (base, exclusive) → `810b967` (HEAD). The feature's own commits, newest first:

```
810b967 T12: gate and visual pass — fix rail double-pad and stale seat comment
9766d2b T11: flags doc rows for 47f
b2e7886 T10: rail metrics and the insight card; retire the strip
5e64b2f T9: how points ended card
74c0b2f T8: rally length card
2a3740d T7: performance tracker — Expand, above-label, annotation
eea5395 T5: KPI strip and the Statistics tab layout
e7ba057 T13: KPI history covers both seats — fix the loader that blocked T5
d2f8692 task: add T13 KPI history covers both seats — fix the loader that blocked T5
9ba63dd T6: head-to-head as a 15-row table
adfbbeb T5: blocked
a994ddb T4: shell surface and tab row with the trailing slot
b61d8a6 T3: set-scope primitive — hook, helpers, chips, spec
e1cfba1 T2: thread kpiHistory through getMatchDetailData and the provider
94196cd T1: KPI history loader and its spec
```

Above these sit the five pipeline commits (`c2617ce` scaffold, `062ffb6`–`3459525`
stages 01–04). `adfbbeb` ("T5: blocked") and `d2f8692` ("task: add T13") are the
audit trail of the one block; both are intentional and stay in history.

## Blocked items

**None outstanding.** One task was blocked mid-build and resolved:

### The one block and its resolution — T5 → T13 → T5

- **T5 first run** built the KPI strip correctly and passed its completion
  review, but the **guardrails reviewer blocked it** (`adfbbeb`): the tile's
  sparkline could silently end on an *older* match while the headline number
  was correct for the current one. Root cause was in the loader T1 wrote, not
  the strip: `fetchPlayerStatRows` fetched only matches where the viewer was
  stored as **player 1**, so on a match where they were player 2 the series
  fell back to an empty anchor and `buildKpiHistory` dropped it. The strip code
  was sound and was stashed (`4de0791`), not discarded.
- **T13** (added `d2f8692`, approved plan
  `~/.claude/plans/elegant-shimmying-boot.md`) fixed the loader at its source:
  `fetchPlayerStatRows` now fetches both seats via
  `.or("player1_id.in.(…),player2_id.in.(…)")` and the new pure `ownSeatRows`
  discards the opponent's row server-side; the empty-anchor fallback is gone.
  Verified against the live database — no match currently stores anyone in
  seat two (opponents live in `opponent_player_id`), so the fix is
  behaviour-preserving today and correct for the day a seat-two row exists; the
  pure `ownSeatRows` spec pins the seat-two case live data cannot yet exercise.
  The RLS reviewer confirmed the widened read stays inside the viewer's grant.
- **T5 re-run** (`eea5395`) restored the stashed strip against the fixed loader
  and cleared the same guardrails reviewer on the exact finding, which reported
  it **resolved**.

The block was the process working as intended: a plausible-but-wrong number
was caught at the gate and fixed at its source rather than papered over with a
component-side guard.

## Verification standing at hand-off to stage 06

- **Mechanical, whole branch:** `npm run lint` 0 errors / 37 warnings
  (baseline, none new), `npx tsc --noEmit` exit 0, `npm run build` exit 0,
  `npm test` 323 passed.
- **Guardrails, whole-branch pass (T12):** `pipeline-guardrails-reviewer` over
  `475f940..HEAD` reported **no blocking findings** — §4 attribution traced end
  to end (every you/opp read flows from `useMatchSides()`; `resolveYouSide` is
  the single seat decision feeding both `match.isUserPlayer1` and `kpiHistory`
  from one cached id set), §3.3 short-circuit intact, §3.2 predicates and §3.1
  wizard untouched, derived-match caveats (`MatchDataBlock`, withheld Aces,
  em-dash suppression) all still render, flag #9 `"0-0"` coercion closed at the
  tracker site, no customer-facing "splitstep", loader change RLS-clean with no
  service-role client.
- **Attribution audit (T12 done-when 3):** every `player1`/`player2` occurrence
  in the changed files is a doc comment, a type, a symmetric sum, a data-layer
  stat key, or a `sides.pick(...)` translation point; no changed component
  reads player order to orient the UI.
- **The one open verification — the visual pass is unrun.** The brief's
  success criteria 1–7 (structure/spacing/colour at 1512×982 against the 47f
  present view; the player-2-viewer orientation criterion 6) are recorded in
  T12's result as **verified-by-code, browser-unverified**: the Statistics tab
  is auth-gated (`/dashboard/matches → 307 → /login`) and this worktree has no
  dev-login, so no app screenshot could be taken. Every criterion is backed by
  a code citation instead. **A credentialed browser pass at 1512×982 against
  the 47f present view is the one human step outstanding** — the natural place
  for it is stage 06 review or during PR review.

## Deferred, by design — not part of this feature

Recorded across the run log, each its own future task, none a blocker:

1. The page-wide **three-state viewer rule** (`viewer-side.ts`) for the
   "viewer is neither player" (coach) case — the current two-state rule seats a
   coach as player 2; T13 made this safe (neutral "vs avg" copy, own-seat
   history) but did not adopt the three-state rule, which changes rendered
   output and wants its own branch.
2. `playerAverages` is now **dead** (no consumer after the strip moved to
   `kpiHistory`) — a removal candidate.
3. A `size` prop on the shared `LegendSwatch` to retire the local 6 px swatch
   T9 inlined in `point-endings-card.tsx`.
4. `docs/README.md` line 13 still carries the round-46 point-in-time blurb —
   a docs-freshness sync (T11 follow-up).
5. Whether a personal "your avg" should exclude team matches; alumni/season
   archiving (would give #10/#13's "vs season" a real definition); the
   duplicate `playerSide()` in `player-identity-server.ts`.

These are the `/pr-check` and future-branch surface, not stage 06's concern.

## Also consulted

- `.claude/tasks/claude-match-details-implementation-97c1ee.md` and its
  `.log.md` (the declared inputs).
- `work/match-details-47f/04_tasks/output/tasks.md` (the declared input — which
  tasks belong to the feature; confirmed T13 is the one addition beyond it).
- `git log --oneline 475f940..HEAD` for the commit range.
