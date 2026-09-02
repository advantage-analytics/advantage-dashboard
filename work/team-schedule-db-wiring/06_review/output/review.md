# Review — team-schedule-db-wiring

**Sign-off: approved**

*(Approved by the repo owner on 2026-09-02, instructing the runner to record it
after the four blocking findings were fixed and re-gated. The six remaining
findings below were read and accepted as non-blocking follow-ups.)*

**Range reviewed:** `f97e236...HEAD` plus the uncommitted quality pass this
stage applied. The scaffold commit's parent **is** the merge-base with
`splitstep-integration`, so pr-check's default branch range and this feature's
range are the same commits — no part of the branch escaped review, and none of
a previous feature's work was swept in.

**Guardrail reviewers re-ran over the whole range.** pr-check's literal
task-gated pattern does not match `pipeline(...)` or `task: amend` subjects, so
seven commits in the range never faced a per-task gate. Fail-closed applies;
they ran.

---

## Success criteria — 7 of 8 met

| # | Criterion | |
|---|---|---|
| 1 | No route imports `fixtures.ts` at runtime | **met** — the spec is its only importer anywhere |
| 2 | A coach with events sees them; a coach with none gets the `7e` day-zero frame | **met** — observed live (T15, T25) |
| 3 | Builders persist a row the list shows and `[eventId]` opens | **met** — observed live end-to-end (T20, T23, T25), with two input paths that fail loudly; see findings 1 and 7 |
| 4 | Every string on screen is derived, or is design chrome that names no fact | **met, after the fixes below** — both literals are now derived |
| 5 | Two programs' schedules never bleed into each other | **met** — RLS verified live; both boundary reviewers cleared the range |
| 6 | The screens still match their artboards, punctuation included, where the value is unchanged | **met** — 125 `drawn()` assertions hold; 4 retirements across fourteen tasks, each with a recorded reason |
| 7 | Gates pass, and the spec's fate is a decision in the diff rather than a deleted failure | **met** — lint 0 errors / 37 warnings, `tsc` clean, 260 tests, build green; `expect()` count unchanged at 57 across the whole feature |
| 8 | `README.md` describes the tree as it stands | **met** — entries spot-verified against the tree by the guardrails reviewer |

### Criterion 4 — how it came to be met

`static-schedule.tsx`'s two Jump-to rows printed a hardcoded **`in 4 days`** and
**`· 8 of 9 lines analyzed`**. Against fixtures these were flagged and harmless;
against the loader they asserted things about real events, and were observed
doing so — "in 4 days" over an event dated *today*, and "8 of 9 lines analyzed"
directly beneath the season strip's computed "1 of 41".

Both are now derived. See **Fixed after review** below.

## What pr-check found, and what was done

### Stage 1 — mechanical
Pass. lint 0 errors / 37 warnings (the queue preamble's 43 is stale), `tsc`
clean, 260 tests, `npm run build` green. Re-run after every edit this stage
made.

### Stage 2 — quality pass (`simplify`, four angles in parallel)

**Fixed:**

1. **An O(n²) walk** in `schedule/page.tsx` — the details map called
   `eventDetailFrom(schedule, event.id)` inside a loop over `schedule.events`,
   and that helper `find()`s the very array being iterated. Built inline from
   the loop's own `event` instead. A reviewer confirmed the two are exactly
   equivalent, including for an event with no entries.
2. **Two dead context fields.** `NewDualData.ourName` / `ourTeam` were computed
   by the route, typed, documented — and read by nothing. Removed from both
   ends. (`ladder` and `defaultSurface` on the same context *are* read; only
   these two were dead.)
3. **`todayISO()` deduplicated** into `lib/schedule/format.ts`. It was
   byte-identical in both builders, and `dual-build-step.tsx`'s own comment
   said so.
4. **The four `{bestOf, adScoring}` pairs deduplicated** into `EVENT_FORMATS`
   in the same file, with each builder keeping its own labels — `2b` spells out
   where `3c` abbreviates. This is the §3.1/§4 seam that caused a real outage,
   so it was verified explicitly rather than trusted: both defaults unchanged,
   option order unchanged, all four boolean pairs unchanged, and the guardrails
   reviewer re-checked it hardest by instruction.
5. **The positional coupling that extraction introduced** — `FORMATS[0]` and
   `FORMATS[1]` now indexed into a *shared* array, where a reorder would have
   silently flipped both builders' default with no type error and no failing
   test. Changed to select by value.
6. **Two stale route headers.** `new/tournament/page.tsx` still said submitting
   "is not wired yet" and the Create button "is still inert"; `new/dual/page.tsx`
   still called deleted files "dormant where they were".
7. An unused `eventDetailFrom` import left by fix 1.

**Reverted, deliberately.** Building the site labels from `siteTitle()` instead
of literal tables was applied, then reverted when `npm test` caught it: the copy
spec pins `"Neutral"` in the tournament builder's *source*, and deriving it
removed the literal. Rule 9's situation — but the honest call was to revert, not
to retire the assertion. The improvement was cosmetic (a word unlikely to be
reworded); the assertion is part of the fidelity contract this feature spent
fourteen tasks protecting. `simplify`'s own instruction is to skip a fix rather
than argue with it.

**Skipped, with reasons:** `FieldSelect` is near-duplicated across the two
builders (markup only, and they are two design-copied screens that may
legitimately diverge); `nonForfeitedLineCount` arithmetic appears twice in
`schedule-server.ts` (deliberate and cross-referenced in a comment); both step
components rebuild the same history `Map` (small, per-render); and the
`NewDualDataProvider` altitude question — a reviewer noted the shell already
forwards one prop, so props were possible and the context may be solving a
one-hop pass with a page-wide mechanism. That is a structural change, not a
quality pass.

**`vercel-react-best-practices`:** trigger applied (data fetching inside
components changed). The check that matters most came back clean — **no file
newly became a client component**. The single `+"use client"` in the range is
`static-schedule.tsx`, which already had one at the base; the other ten hits are
the deleted files.

### Stage 3 — correctness and safety

**`code-review` at medium: 11 findings, none fixed here.** Full detail is in the
findings report; the four that matter most:

1. **A seed of `0` fails the whole tournament write.** `entry.seed ? Number(...) : null`
   treats `"0"` as truthy, and the live constraint is `CHECK (seed IS NULL OR seed > 0)`
   — verified against the database. The event is created, the entries insert
   violates the constraint, the action deletes the event and surfaces a raw
   Postgres string in the footer, with nothing pointing at the seed cell.
2. **`seedLineup()` invents a ranking its own doc comment forbids.** It takes
   `ladder[0..5]` unconditionally, but `getLadder` returns *every* roster player
   with unranked ones sorted alphabetically last. A program that never set a
   ladder gets S1–S6 pre-filled with real names and real `ourIds` in alphabetical
   order — and submitting persists those against court numbers nobody assigned.
   The doc says the opposite: "roster join order is not a ranking… the form
   claiming to know something nobody told it." The guard only holds for an
   *empty* ladder, not an *unranked* one.
3. **The two hardcoded literals** — criterion 4, above.
4. **The self-exclusion filter is vacuous when a program has no conference.**
   `ourProgramKey` comes only from the conference table, which is empty when
   `programs.conference` is null — verified live that ZZ Test Program has both
   conference and division null. A coach on such a program can pick their own
   program as the opponent and schedule a dual against themselves.

The rest: a cleared Starts date reaching the insert as `""`; `todayISO()`
computing the "local" date in the *server's* zone during SSR (its own comment
says it exists to prevent exactly that); `seasonSummaryFrom` folding every event
ever under a block labelled "Season"; an unhandled rejection on the
opponent-roster fetch; a line with only an opponent named being silently dropped
at submit; and a rail/header divergence if a dual entry ever carries two matches.

**`pipeline-guardrails-reviewer` — clear.** Re-checked the three §4-shaped
hazards *in combination* and found all three still closed, and examined the
`EVENT_FORMATS` extraction hardest: same four pairs, same order, same defaults,
no null or string path reintroduced.

**`rls-boundary-reviewer` — clear.** Every new write path re-establishes
authorization server-side; the cross-program contribution is bounded by the
database function rather than by client input; no service-role client reaches
anything but the standalone seed script.

**`supabase:supabase-postgres-best-practices` — skipped, surface not touched.**
No migration, SQL, table, column, index, policy or database function changed in
the range (`git diff --name-only -- supabase/ '*.sql'` is empty).

**A methodology note worth carrying.** `rls-boundary-reviewer` had no live
database access on this and several earlier runs, and verified from
`supabase/migrations/` — which this repo documents as running ~100 migrations
behind. It cited `20260817073914_programs.sql` for a "world-readable `programs`"
that is superseded live. Its conclusions held (the live policy is stricter), but
every policy or function its reasoning depended on was re-verified live from the
runner. Any future reviewer taking that folder at face value will be wrong in
the same way.

---

## Fixed after review

The four blocking findings were fixed after this report's first pass, on the
human's instruction. Every fix re-ran the full gate, and
`pipeline-guardrails-reviewer` re-reviewed them as a set — no violations.

1. **A seed of `0` no longer fails the write** *(finding 1)*. The cell strips a
   leading zero and caps at four digits, so it cannot hold a value the column
   refuses; the submit guards on `Number(entry.seed) > 0` as a second lock.
   Verified by evaluation: `""` and `"0"` both mean a null column, `"3"` and
   `"03"` both mean 3.
2. **`seedLineup()` no longer invents a ranking** *(finding 2)*. It now filters
   to `ladderPosition !== null` before seeding, in both the singles and doubles
   halves. The reviewer confirmed the filtered list stays in rank order (the
   roster read already sorts ranked players ascending first), that a partial
   ladder yields that many seeded courts and the rest empty rather than a
   silent shift, and that unfilled courts are dropped at submit rather than
   sent. Editing a court by hand still resolves against the *whole* roster —
   naming an unranked player deliberately is a human choice, not an invented
   seed.
3. **Both literals are derived** *(finding 3)*. `daysAway()` prints "today",
   "tomorrow", "in N days", or nothing beyond a month out, from a `today` prop
   the server route supplies — a prop rather than a clock read, because this is
   a `"use client"` component that also renders on the server, and a clock here
   would be a hydration mismatch. The coverage figure comes from a new
   `lineCoverageFrom()`, which `seasonSummaryFrom` now sums, so the pane's two
   "analyzed" figures are one rule counted once.

   That helper went into `src/lib/schedule/entry-state.ts`, **not**
   `schedule-server.ts` — the latter imports the Supabase server client at
   module scope, and a value import into a client component would have pulled
   it into the browser bundle. Caught while wiring it, and confirmed by the
   reviewer.
4. **A program can no longer schedule a dual against itself** *(finding 4)*.
   `getConferenceTable` now returns `ourProgramKey` from the row it already
   reads, conference or not, so the self-exclusion filter works for a program
   that never set one. Its other caller destructures around the added field and
   is unaffected.

**One further finding was fixed because fixing finding 3 exposed it.** The
"Next" row selected on `playedCount === 0`, which a January dual nobody scored
satisfies all year — so it offered the oldest unscored event. Harmless while the
row printed a fixed string; with a derived label it would have read "4 months
ago" under a heading that says Next. The predicate is now `startsOn >= today`
(*finding 6*).

**Two spec assertions retired**, under the rule that has governed all fourteen
tasks: an assertion whose literal genuinely left the component is removed and
the reason recorded. `in 4 days` and `· 8 of 9 lines analyzed` were held through
the whole re-wiring precisely because they were still drawn; they left the
component here, and only then left the spec. `drawn()` calls 125 → 123,
`RETIRED` notes 4 → 6, `expect()` unchanged.

**Six tests added** for `lineCoverageFrom`, since two surfaces now depend on it
and this feature's pattern is that a shared derivation gets pure coverage. They
earned their place immediately: the first run failed because they called a
fixture with the wrong signature, rather than passing vacuously. Suite 260 → 266.

## Verdict

**All eight success criteria are met, and the four blocking findings are
fixed.** Gates green throughout: lint 0 errors / 37 warnings, `tsc` clean, 266
tests, `npm run build` green. Both boundary reviewers cleared the whole range,
and the guardrails reviewer additionally cleared the fixes as a set.

**Six findings remain open**, none of them blocking, all recorded in the
findings report:

- `todayISO()` still computes the "local" date in the *server's* zone inside two
  builders' `useState` initializers. The schedule pane no longer has this
  problem — it takes `today` as a prop — but the two builders do.
- A cleared Starts date reaches the tournament insert as `""` and surfaces a raw
  Postgres error. The same class as the seed bug, one field over.
- `seasonSummaryFrom` folds every event ever under a block labelled "Season".
- An unhandled rejection on the opponent-roster fetch.
- A dual line with only an opponent named is silently dropped at submit, along
  with the name the popup just confirmed saving.
- The rail and the header score would disagree if a dual entry ever carried two
  matches; the matches read has no `ORDER BY`.

One nuance the guardrails reviewer named and judged not a violation: with an odd
number of ranked players, a doubles court can seed with a single player rather
than a pair. That behaviour predates this feature — it came unchanged from the
deleted `dual-form.tsx` — and the ids involved are real ranked players', never
invented.

**Consciously left:** the six above. They are real, they are recorded, and they
are the kind of thing a follow-up queue is for — fixing them here would keep
adding unreviewed work to the range this report attests to. The four that
blocked were fixed because they were user-facing defects on paths a coach hits,
and because criterion 4 could not be met without one of them.

## Also consulted

Beyond the declared inputs (`05_build/output/build.md`, the range diff,
`01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- `git log`, `git diff`, `git merge-base` — to establish the review target and
  confirm the branch range and the feature range coincide.
- The live database via Supabase MCP, project `pouxujkhtbvkdwbzfvka` — the
  `program_event_entries` seed constraint (`CHECK (seed IS NULL OR seed > 0)`),
  and ZZ Test Program's null `conference`/`division`. Both were needed to
  confirm findings 1 and 4 rather than report them as theory.
- `src/lib/schedule/format.ts`, `entry-state.ts`, `roster-match.ts`,
  `src/lib/data/schedule-server.ts` and the four route files — read while
  applying and verifying the quality-pass fixes.

**No pr-check receipt was recorded.** The skill's stage 5 records one, but its
`--verdict` values are `ready` / `not-ready` for a branch, and this run is a
pipeline stage whose verdict is this file's `Sign-off:` line. Recording a
receipt as well would put a second, competing verdict on the same work. Noted
here rather than skipped silently.
