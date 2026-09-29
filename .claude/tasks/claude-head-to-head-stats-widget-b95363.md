# Tasks — claude/head-to-head-stats-widget-b95363

> Scope: Head to head card aces/double faults on Advantage Intelligence matches

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

## T1 · Count unreturned serves as aces in Head to head on Advantage Intelligence matches

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/film-cut-context.tsx (new `isUnreturnedServe()` predicate and a new `FilmCutEnding` value, beside `isReturnWinner`); src/components/dashboard/matches/match-detail/head-to-head-card.tsx (`tallySide`, `H2HRowConfig.fromPoints`, `derivedValue`, a derived-config swap in `HeadToHeadCard` gated on `useMatchReport().meta.isDerived`); tests/head-to-head-cuts.spec.ts; tests/match-h2h-rows.spec.ts (guesses from the import chain — the card already reads `meta` from `useMatchReport()`, so no new prop or provider is needed)
- **routes:** /dashboard/matches/1e7f4043-fa4e-4740-89f6-65f09050ab5a?tab=statistics
- **done when:**
  - [ ] `tallySide()` gains an `unreturnedServes` count attributed to the server: a point with `rallyLength === 1` and `wonByPlayer1 === serverIsPlayer1`. A spec in tests/match-h2h-rows.spec.ts (or head-to-head-cuts.spec.ts) builds the derived Serve rows over a fixture containing two such points served by player1, one by player2, one double fault and one 5-shot winner, and asserts the Aces row reads you `"2"` / opp `"1"` with leader `"you"`, while the same fixture through the unchanged default configs (`SERVE_ROWS`) still yields Aces from `stats.aces` (`aces: null` → `""`).
  - [ ] On the derived configs the Winners row's value is the published `winners` minus that side's `unreturnedServes` (never below 0); a spec asserts `winners: 18` with two unreturned serves reads `"16"`, and the Double faults row is still read from `stats.doubleFaults` (no `fromPoints`).
  - [ ] The derived Aces row's cut is a new Film-only ending (e.g. `ending: "unreturned-serve"`, with `resultOutcome: ["winner"]`, `sideBy: "player"`) whose `matchesFilmCutExtras` predicate is the same `isUnreturnedServe()` the tally uses; a spec asserts `applyFilmCut(MATCH, MATCH, sideCut(derivedAces.cut, "you", "player"), CTX).length === tallySide(MATCH, true).unreturnedServes` and that the derived Winners cut over the same fixture contains no id the derived Aces cut contains. `FILM_CUT_EXTRA_KEYS` is unchanged (the new value lives inside `ending`).
  - [ ] SwingVision is untouched: the existing `EXPECTED_CUTS` / `EXPECTED_YOU_CUTS` tables in tests/head-to-head-cuts.spec.ts and the "is fifteen rows…", "return winners has no published source", "a withheld statistic stays an em dash" tests in tests/match-h2h-rows.spec.ts pass without edits to their expectations (comment on the em-dash test may be reworded); the `ace` ending still matches `resultType === "Ace"` only.
  - [ ] `HeadToHeadCard` selects the derived configs only when `meta.isDerived` is true (from `useMatchReport()`, which `/m/[token]` also sets), and `counts` / `ALL_H2H_CONFIGS` iterate the same selected configs so a cell's "Watch all N" count and its click open the identical cut. `npm run typecheck`, `npm run lint` and `npx playwright test --project=offline tests/match-h2h-rows.spec.ts tests/head-to-head-cuts.spec.ts tests/film-cut-intent.spec.ts tests/stat-widget-cuts.spec.ts` pass.
- **notes:** Product decision by the author (2026-09-29): on `sourceProvider === "splitstep"` matches, an unreturned In serve won by the server is an ace; `src/lib/services/splitstep/derivation/result-type.ts` `classifyPoint()` deliberately never emits `Ace` and labels every such point `Service Winner`, so `match_stats.aces` is 0 and `match_stats.winners` (LIKE '%Winner%') already includes these points — hence the subtraction. Expected on the Emon match (Emon = player1): Aces 2 / 0 (points 28 and 61), Winners 18 → 16, Double faults 0 / 0 unchanged (the classifier does emit `Double Fault` on a lost second serve; this transcript has none). Use the structural predicate (rally length + server won), not the `"Service Winner"` string; a `Service Winner` with an intermediate groundstroke (rallyLength > 1) therefore stays a winner — note it in the row comment. Keep `fromPoints` as a string union (`"returnWinners" | "unreturnedServes" | "winnersLessUnreturned"` or similar); `derivedValue` will need the side's published stats as well as `DerivedSide` for the Winners subtraction. Do not touch `match-stats-server.ts` or `suppress_derived_match_stats` — widget-level only. Point endings card (`point-endings-card.tsx` line ~182 drops the Aces bar when `isDerived`, and its winners bucket still includes unreturned serves) is NOT in scope — possible follow-up.

## T2 · Align derivation docs and classifier comments with the widget-level ace rule

- **status:** todo
- **model:** sonnet
- **needs:** T1
- **files:** docs/splitstep-derivation.md (§4 Trust tiers, lines ~176–200); src/lib/services/splitstep/derivation/result-type.ts (header docblock, lines ~60–65); src/components/dashboard/matches/match-detail/point-endings-card.tsx (the "ACES ON A DERIVED MATCH" paragraph, lines ~42–49, which says the head-to-head splits on the same line)
- **done when:**
  - [ ] docs/splitstep-derivation.md §4 keeps aces in the Unknowable tier for `match_stats` but adds one sentence (or a footnote row) stating that, as of T1, the Head to head card on a splitstep match counts an unreturned In serve won by the server as an ace from the points table and subtracts the same points from Winners, naming `head-to-head-card.tsx` and the predicate (`rallyLength === 1`, server won).
  - [ ] The `classifyPoint()` docblock in result-type.ts still says `Ace` is never emitted, and its last sentence ("`match_stats.aces` must be suppressed rather than published as 0") gains a pointer that the Head to head widget derives its own ace count from unreturned serves rather than from this field.
  - [ ] The point-endings-card.tsx header comment no longer claims `head-to-head-card.tsx` "splits them on exactly the same line" for aces on a derived match; it states the two cards differ on splitstep (Point endings drops the Aces segment, Head to head counts unreturned serves). No code in that file changes.
  - [ ] `npm run lint` passes (Markdown and comments only; no test changes).
- **notes:** Docs-only follow-through so the repo does not contradict T1. Keep it to one line per site.
