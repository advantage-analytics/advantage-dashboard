# Brief — team-schedule-db-wiring

## Goal

The team schedule surface reads and writes real program data instead of the
design fixtures it was rebuilt against, without losing the visual result of
that rebuild.

Four routes under `/dashboard/team/schedule` were re-pointed to a
fixture-backed `static/` tree during the `events-lineups` design-copy run.
They draw `src/lib/schedule/fixtures.ts` and touch no database: every
program name, opponent, date, score and count on screen today is a literal
transcribed from an artboard. This run reverses that — the same screens,
fed by `program_events`.

This is a job the previous run planned for.
`src/components/dashboard/schedule/README.md` §5 ("Re-wiring the static tree
later") names it, and nine DB-wired files were kept dormant expressly as its
source material.

## Scope

1. **The four static routes**, re-pointed to real data:
   `/dashboard/team/schedule`, `.../new`, `.../new/dual`,
   `.../new/tournament`. This covers both directions — the list, drawer and
   detail pane reading `program_events`, and the dual/tournament builders
   actually persisting what a coach fills in.
2. **The two already-live routes**, `.../[eventId]` and
   `.../single/[matchId]`, re-checked for consistency with the newly wired
   ones. They are already DB-wired; the check is that the six routes agree,
   not a rewrite.
3. **Every fixture literal computed**, not only the event rows. Named
   explicitly because these are easy to leave behind:
   - `PROGRAM_NAME` (`"Meridian State"`) and `USER_NAME`
     (`"Elena Vasquez"`) — both available from the workspace context
     (`Workspace.name` is the school name; `Viewer.name` already falls back
     to the email local part).
   - `SEASON_LABEL` (`"2026–27"`) and `SEASON_FACTS`
     (`"3–1 in duals · 31 of 36 lines analyzed"`).
   - The drawer's header count — `"6 events · 2 upcoming · 4 completed"`,
     which contradicts the four rows the same fixture supplies. It is
     acknowledged invented copy: `SCHEDULE_ROWS`' own comment says the two
     extra events "are not here: an invented event is invented copy."
4. **Deletion of the dormant files this run supersedes**, per README §2 —
   the §3.5 hazard ("a dead near-duplicate beside working code is how the
   wrong one gets edited later") that the README says only deletion removes.

## Non-goals

- **Redesigning any screen.** The events-lineups rebuild's visual result is
  the target to preserve, not a starting point to improve on. Layout,
  spacing, wording and punctuation stay as drawn; only the source of the
  values changes.
- **`.../new/single`.** It renders the matches wizard, not this directory,
  and is already real.
- **Inventing data the schema cannot back.** The opponent `seasonRecord`
  the `2c` artboard draws comes from matches this program never played;
  `opponent-history.ts` states it "does not exist anywhere in this app."
  Nothing in this run fabricates a figure to fill a designed slot.
- **Deleting the type-only lifeline.** `lineup-editor.tsx` and
  `opponent-name-cell.tsx` are unreachable at runtime but compile-load
  bearing (README §4); they survive this run unless their exports are
  ported first.

## Constraints

- **`docs/ui-revamp-guardrails.md` governs.** §3.1 and §4 cover the
  `"<bestOf>|<adScoring>"` format encoding that
  `static/dual-build-step.tsx` currently hard-codes as `"3|false"` — its
  header explains why an interpolated value corrupts submissions. This is
  one of the three wizard inputs that, when wrong, attribute every statistic
  to the wrong player with nothing looking broken on screen.
- **`tests/schedule-static-copy.spec.ts` is a 710-line copy contract** over
  the fixture literals this run replaces — `PROGRAM_NAME`, `SEASON_FACTS`,
  `SCHEDULE_ROWS`, the directory rows, the punctuation. Its expectations are
  transcribed by hand from the artboards specifically so they are an
  independent second copy. Wiring the page changes what that spec is a
  contract *for*; the run must decide its fate deliberately rather than let
  it fail.
- **Workspace scoping.** Every read and write is scoped to the active
  program and RLS-enforced. The existing permission gating on the schedule
  page — `isProgramStaff` for the "New event" CTA, `canUploadForProgram` for
  the one-off match affordance — is already correct against the workspace
  rather than the fixtures, and must survive unchanged.
- **The README is the map, and it goes stale.** Its §6 says not to trust it
  after the tree changes. Re-wiring collapses §2 and §4, so the file is part
  of the deliverable, not documentation to update afterwards.
- **Live DB is the schema source of truth** — `supabase/migrations/` runs
  well behind it.
- Design system per `.skills/advantage-analytics-design/SKILL.md`.

## Success criteria

1. No route under `/dashboard/team/schedule` imports
   `src/lib/schedule/fixtures.ts` at runtime.
2. A coach on a team workspace with events in `program_events` sees those
   events — their real opponents, dates, sites and scores — and a coach on a
   program with none lands on the day-zero frame the `7e` artboard draws.
3. Creating a dual or a tournament through the builders persists a row that
   the schedule list then shows, and that `[eventId]` opens.
4. Every string on screen is either derived from the database or is design
   chrome that names no fact. No program name, person, season, record or
   count remains a literal.
5. Two programs' schedules never bleed into each other.
6. The screens still match the artboards they were built from, down to the
   punctuation, wherever the value behind a string is unchanged.
7. `npm run lint`, `npm run build` and `npm test` pass, and the fate of
   `schedule-static-copy.spec.ts` is a decision recorded in the diff rather
   than a deleted failure.
8. `src/components/dashboard/schedule/README.md` describes the tree as it
   then stands.

## Open questions

1. **What backs `SEASON_LABEL` and `SEASON_FACTS`?** A season label
   (`"2026–27"`) implies a season concept; "3–1 in duals · 31 of 36 lines
   analyzed" implies aggregates over duals and line analysis state. Whether
   these are derivable from `program_events` and its entries as they stand,
   or need something the schema has not got, is unresolved — and it is the
   most likely place this run meets a wall.
2. **What do "upcoming" and "completed" mean** for the drawer's header
   count? Both are computable, but the boundary (an event today; an event
   past with no result recorded) is a product decision the artboard does not
   answer.
3. **What happens to `schedule-static-copy.spec.ts`?** Its literals stop
   describing the page. Options range from keeping it as a record of the
   design's strings over a `fixtures.ts` demoted to test-only, to retiring
   the parts the wired surfaces supersede. Not resolved here.
4. **Is there a program with real events to verify against?** The known test
   program (`ZZ Test Program`) has no matches, and criteria 2 and 3 need
   something with rows in it.
5. **Does the opponent-directory surface (`2c`) have a real backing at
   all?** It draws a school directory with conference, division and
   head-to-head history. `programs-server.ts` and `opponent-history.ts`
   exist, so it is likely — but its `seasonRecord` column is already known
   to be unbackable, and how the design's row survives losing one of its
   three subline slots is undecided.

## Also consulted

Beyond `BRIEF-SEED.md` (this stage's only declared input; `references/` was
empty), the following were read to establish what the schedule surface does
today — the seed's "tangible elements" could not be scoped without it:

- `src/app/dashboard/team/schedule/page.tsx` — the static re-point and its
  header comment
- `src/components/dashboard/schedule/README.md` — the live/dormant map and
  its §5 re-wiring note
- `src/lib/data/schedule-server.ts` — the dormant loaders and their types
- `src/lib/schedule/fixtures.ts` — the literals in scope
- `src/lib/schedule/actions.ts` — existing server actions (export list only)
- `src/lib/workspace/types.ts` — whether program and viewer names are
  available
- `tests/schedule-static-copy.spec.ts` — the copy contract over the fixtures
