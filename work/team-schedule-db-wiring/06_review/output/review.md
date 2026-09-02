# Review — team-schedule-db-wiring

**Sign-off: pending**

*(The human edits this line to `approved`, or annotates otherwise. That edit is
the pipeline's final gate.)*

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
| 4 | Every string on screen is derived, or is design chrome that names no fact | **NOT MET** — see below |
| 5 | Two programs' schedules never bleed into each other | **met** — RLS verified live; both boundary reviewers cleared the range |
| 6 | The screens still match their artboards, punctuation included, where the value is unchanged | **met** — 125 `drawn()` assertions hold; 4 retirements across fourteen tasks, each with a recorded reason |
| 7 | Gates pass, and the spec's fate is a decision in the diff rather than a deleted failure | **met** — lint 0 errors / 37 warnings, `tsc` clean, 260 tests, build green; `expect()` count unchanged at 57 across the whole feature |
| 8 | `README.md` describes the tree as it stands | **met** — entries spot-verified against the tree by the guardrails reviewer |

### Criterion 4 is not met, and that is the one thing blocking a clean sign-off

`static-schedule.tsx`'s two Jump-to rows still print a hardcoded **`in 4 days`**
and **`· 8 of 9 lines analyzed`**. Against fixtures these were flagged and
harmless. Against the loader they are assertions about a real event, and they
were observed live stating something false: "in 4 days" over an event dated
*today*, and "8 of 9 lines analyzed" directly beneath the season strip's
*computed* "1 of 41 lines analyzed" — two coverage figures on one screen, one of
them invented. A third, `3 Big Ten programs are in this field` on the tournament
builder, asserted Big Ten while the program under test was in the ACC.

This was flagged at T15 and never became a task. It is finding 3 below.

---

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

## Verdict

**Not ready to merge as-is.** The gates are green and the feature works, but
criterion 4 is not met and two findings are user-facing defects on paths a coach
will hit:

- the two false literals (criterion 4, finding 3)
- a seed of `0` failing the write with a raw Postgres error (finding 1)
- `seedLineup` presenting an unranked roster as a ladder (finding 2)
- a program able to schedule a dual against itself (finding 4)

None of these is structural, and none needs the pipeline re-run — they are four
small, well-localised fixes. The remaining seven findings are real but lower
stakes and can be triaged normally.

**Consciously left, and why:** every finding above is left unfixed in this
stage. Stage 06's job is to run the gate and record what it found, and this
feature's whole discipline has been that the human's sign-off decides what ships
— fixing eleven findings here, after fourteen gated tasks, would put unreviewed
work into the range this very report attests to.

---

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
