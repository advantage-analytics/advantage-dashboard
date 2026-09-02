# Design — team-schedule-db-wiring

## The fact that sets the shape

The brief treats "wire the schedule to the database" as one job. It is two,
with very different sizes, and every decision below follows from the split:

- **The read path is a re-pointing.** `fixtures.ts` was built against the
  loaders' own types — `ScheduleRow`, `EventDetail`, `ProgramEvent`,
  `EventEntry` — and its own comment says `StaticSchedule` "is the same pair
  the live route already hands `ScheduleList`, so a component taking this
  takes the loader's output unchanged later." `getProgramSchedule`,
  `scheduleRowsFrom` and `eventDetailFrom` are intact in
  `src/lib/data/schedule-server.ts` and already serve two live routes.
- **The write path is construction.** The static tree is not a UI missing a
  data source; it is a *picture* of one, deliberately. The school search on
  `2c` is "a rendering of a field, not an `<input>`". Its rows and "Clear"
  are `<span>`s, because "a `<button>` that takes focus and does nothing is
  worse than a picture of one". The chosen school is deliberately prevented
  from travelling to step two. The tournament builder's five fields are
  literals in component source. None of these has an interaction layer to
  connect — it has to be built, with the dormant tree as the reference
  implementation.

Roughly: one screen of re-pointing, three screens of building.

## Approaches considered

### A. Port the database into the static tree, screen by screen — **recommended**

Routes fetch again; the `static/` components take real props; the drawn
controls become real controls; `createDual` / `createTournament` are wired
behind them; the dormant files each screen supersedes are deleted as that
screen proves out.

This is the plan the previous run wrote down. README §5: "Re-wiring means
porting those into the static components, then deleting the dormant nine."

- **For** — keeps the design-copy rebuild, which the brief names as the thing
  to preserve. Reuses every loader and action that already exists. Retires
  the §3.5 duplicate-tree hazard as a side effect rather than a separate
  cleanup.
- **Against** — the largest of the three. Touches four screens plus the two
  live ones, and the write path lands on `docs/ui-revamp-guardrails.md` §3.1
  and §4 territory.

### B. Revert the four routes to the dormant tree

Re-point the routes back to `ScheduleList`, `NewEventChooser`, `DualForm`
and `TournamentForm`; delete `static/`.

- **For** — by far the fastest route to a working, DB-backed schedule. The
  dormant components are complete implementations, not stubs.
- **Against** — **rejected.** It discards the events-lineups rebuild
  entirely, which the brief's first non-goal forbids in as many words: the
  rebuild's visual result "is the target to preserve, not a starting point to
  improve on." It would also make the four re-pointed routes the second
  reversal of the same decision in two runs.

### C. An adapter module between the loaders and the static components

Keep both trees; add a mapping layer that shapes loader output into the
props the static components already take; `fixtures.ts` stays as the type
source.

- **For** — smallest possible edit to the components.
- **Against** — **rejected on YAGNI.** The shapes are already identical, so
  on the read path the adapter is a function that returns its argument. It
  does nothing at all for the write path, which is the actual work. And it
  keeps both trees alive permanently — the precise hazard README §3.5 says
  only deletion removes.

## Chosen design — A

### Architecture

No new architectural layer. Six Server Component routes fetch through the
existing server loaders and pass props down; client components own
interaction and write through the existing server actions. That is the
repo's standing pattern and this run adds nothing to it.

Three changes to shared code, and only three:

1. **`Workspace` gains `season: string | null`.** The `7d` / `7e` header
   draws a season label and `programs.season` backs it (verified live:
   column exists, `text`, nullable). `active-workspace-server.ts` already
   selects the program row once per request, so this is one column on an
   existing select. It rides on `Workspace` for the reason that type's own
   doc comments give for `orgType` and `playersCanUpload` — the answer has
   to be available wherever a `Workspace` is, without a second read.
   *Alternative considered:* call `getTeamSettings()`, which already returns
   `TeamIdentity.season`. Rejected for the schedule page — it also pulls
   every member and every outstanding invite to answer one string.

2. **`seasonSummaryFrom(schedule, season)`, a new pure function in
   `schedule-server.ts`.** Derives the header's summary line from a
   `ProgramSchedule` already in hand. Pure and exported beside
   `scheduleRowsFrom` for the same stated reason — "so this mapping can be
   tested without a database."

3. **`fixtures.ts` is demoted to a test-only module.** It stops being
   imported by anything under `src/app/`, and stays in the tree as the
   record of the artboards' strings that `schedule-static-copy.spec.ts`
   asserts over. Nothing else imports it.

### Components

| Route | Renders | Change |
|---|---|---|
| `/dashboard/team/schedule` | `static/static-schedule.tsx` → `event-drawer`, `dual-widget` | **Re-point.** Route fetches; `StaticSchedule`'s existing `{rows, details}` prop takes loader output unchanged. Header strings become computed. |
| `.../new` | `static/static-event-chooser.tsx` | **Near-none.** It "reads nothing" today and needs nothing; only its two destinations change behaviour. Delete dormant `new-event-chooser.tsx`. |
| `.../new/dual` | `static/static-dual-builder.tsx` → `dual-school-step`, `dual-build-step` | **Build.** Real search input, real selectable rows, the school must travel to step two, real lineup editing, `createDual` on submit. |
| `.../new/tournament` | `static/static-tournament-builder.tsx` | **Build.** Five literal fields become inputs; roster rail from `getLadder`; `createTournament` on submit. |
| `.../[eventId]` | `dual-detail.tsx`, `tournament-detail.tsx` | **Verify only.** Already DB-wired and live. |
| `.../single/[matchId]` | `single-detail.tsx` | **Verify only.** Already DB-wired and live. |

New interactive controls use `advButton()` and the design system's existing
variants, so the drawn appearance survives becoming real. Two rules from
`SKILL.md` bear directly on this screen: hover on `outline` / `ghost` is a
surface wash and never blue, and one primary per surface.

### Data flow

**`/dashboard/team/schedule`** — one read, three derivations:

```
getWorkspaceContext()  ─→ active (id, name, season, role)
getProgramSchedule(active.id) ─→ ProgramSchedule
      ├─ scheduleRowsFrom(schedule)          → ScheduleRow[]   (drawer rows)
      ├─ eventDetailFrom(schedule, id)       → EventDetail     (detail pane)
      └─ seasonSummaryFrom(schedule, season) → header strings
```

`getProgramSchedule` is already `cache()`d on the read that costs round
trips, so the layout and page share one fetch.

**The header strings**, which the brief names individually:

| Fixture literal | Source |
|---|---|
| `PROGRAM_NAME` "Meridian State" | `Workspace.name` — the school name |
| `USER_NAME` "Elena Vasquez" | `Viewer.name`, already falling back to the email local part |
| `SEASON_LABEL` "2026–27" | `programs.season` |
| `SEASON_FACTS` "3–1 in duals · 31 of 36 lines analyzed" | `seasonSummaryFrom` — dual W–L via the existing `dualScore()`, lines analyzed via entry match status |
| Drawer "6 events · 2 upcoming · 4 completed" | `seasonSummaryFrom` — see the boundary rule below |

**`.../new/dual`** — the route's own header states the target: "this route
reading again and handing `DualForm` the same props it always did," now
handing them to the static components instead. Four loaders in parallel
(`getLadder`, `getTeamSettings`, `getConferenceTable`, `getProgramSchedule`),
then `opponentDualHistory()` over the last. All five verified present.

**`.../new/tournament`** — `getLadder` and `getTeamSettings` in parallel,
as its header records.

### The strings that have no source

The brief forbids inventing a figure to fill a designed slot. Four are
already documented as unbackable, and each gets an explicit answer rather
than a quiet omission:

| Drawn | Live-DB finding | Resolution |
|---|---|---|
| `2c` "18–4" opponent season record | No column. `opponent-history.ts`: "does not exist anywhere in this app" | **Drop the slot.** The subline keeps its other two facts. |
| `2c` "Region ⌄" filter | `programs` has `state`, `division`, `conference`; no region, no mapping | **Drop the control.** |
| `2c` "5 of 1,940" total | `/api/programs/search` returns a capped page with no total | **Compute it.** A count is cheap; this one is backable and should be real. |
| `7d` "6 events" over four rows | Invented copy, acknowledged in `SCHEDULE_ROWS`' own comment | **Computed** — resolves itself, since a real count cannot disagree with the rows it counts. |

**Upcoming vs completed.** `starts_on` / `ends_on` are `date`, and
`programs.time_zone` exists (default `UTC`). Completed is `ends_on` strictly
before today in the program's zone; upcoming is everything else. A pure date
partition, deliberately not consulting whether lines were played — an event
whose day has not passed is upcoming even if every line is in, and one whose
day has passed is completed even if nothing was recorded. Two rules that can
disagree about one row are the defect this avoids.

### Error handling

- **RLS is already correct and is the real boundary.** Verified live on both
  tables: `SELECT` is `program_id IN user_program_ids()`; `INSERT`,
  `UPDATE`, `DELETE` are all `is_program_staff(program_id)`. The route
  guards (`isProgramStaff` → redirect) stay exactly as they are — they make
  a refusal a redirect instead of an error, and they are not the
  authorization.
- **Empty program → the `7e` day-zero frame.** Already the designed answer
  and already reachable: `EMPTY_SCHEDULE` proves the components branch on
  `rows.length`. Wiring changes only where the empty list comes from. This
  is the *common* path today, not an edge case — see testing.
- **Null season.** Every program has `season = NULL` right now. The label is
  omitted, never defaulted to a computed year range: a season label the
  program did not set is a fact invented on its behalf.
- **`format` encoding — guardrails §3.1 / §4.** Stored shape verified live
  as jsonb `{"best_of": 3, "ad_scoring": false}`. `dual-build-step.tsx`
  hard-codes the form value `"3|false"` and its header explains why: an
  interpolated `null` becomes the string `"null"`, which the decoder's
  `adScoring === "true"` reads as a confident `false` — "a wrong answer that
  looks like a real one", and the exact failure that made every tournament
  video fail submission long after the coach had left. When this control
  becomes real it must carry an explicit boolean, never an interpolated
  nullable. This is the single highest-risk edit in the run.
- **Write failures** surface through the `ActionError` shape
  `actions.ts` already returns; no new error channel.

### Testing

**`schedule-static-copy.spec.ts` — the decision the brief asked for.** Its
710 lines assert over `fixtures.ts` module exports and over component source
text, not over rendered pages. So demoting `fixtures.ts` to test-only leaves
most of it passing untouched — and that is the trap: a green spec that no
longer says anything about what a user sees. The resolution has three parts:

1. **Keep** the assertions over `fixtures.ts` exports. They remain a
   faithful record of the artboards' strings, independently transcribed, and
   that record is worth having.
2. **Retitle it** for what it now guards — the design record, not the live
   copy — so the next reader is not misled by a passing suite.
3. **Delete or move** every assertion that reads component *source* for a
   literal that this run interpolates. Those will fail, and they should:
   they are the ones whose subject genuinely leaves.

**New coverage**, at the level the current suite lacks:

- Unit, no database: `seasonSummaryFrom` over a constructed
  `ProgramSchedule` — zero events, one event, mixed decided/undecided duals,
  the upcoming/completed boundary at exactly today.
- Render: the wired schedule against seeded data, and against an empty
  program for the `7e` frame.
- Write: a dual created through the builder appears in the list and opens at
  `[eventId]`, with `format` landing as `{"best_of": …, "ad_scoring": …}`
  and never as a string.

**Seed data is a prerequisite, not a detail.** Live counts today: **1 event,
3 entries, 0 matches linked to any entry, 0 programs with a season**. The
one event is a `dual` for Dartmouth College. So a re-wired page today draws
one event with no results and a summary line of zeroes — correct behaviour,
and nearly indistinguishable from a broken one. Success criteria 2 and 3
cannot be judged without a seeded program carrying several events, decided
and undecided duals, and entries linked to matches in more than one analysis
state.

### Build order

Sequenced so the visible win lands first and the riskiest edit lands with
the most context. Scope is unchanged — this is ordering, not narrowing.

1. `Workspace.season` + `seasonSummaryFrom` + its unit tests.
2. Re-point `/dashboard/team/schedule`. Delete `schedule-list.tsx` and
   `event-detail-pane.tsx`.
3. Seed data, then verify 2 against it.
4. `.../new` and its dormant `new-event-chooser.tsx`.
5. `.../new/tournament` — the simpler builder. Delete `tournament-form.tsx`,
   `entry-editor.tsx`.
6. `.../new/dual` — the largest, and the one that touches the format
   encoding. Delete `dual-form.tsx`, `school-search.tsx`, `opponent-rail.tsx`,
   `field-row.tsx`.
7. Port the `LineupLine` type and `OpponentNameCell` out of the type-only
   lifeline, then delete `lineup-editor.tsx` and `opponent-name-cell.tsx` —
   **only if** step 6 leaves them genuinely unused. The brief permits them to
   survive the run.
8. Verify `[eventId]` and `single/[matchId]` still agree with the wired
   screens. Rewrite `README.md` to the tree as it then stands; §2 and §4
   should be gone.

## Open questions

1. **Which program gets seeded, and how?** A script under `scripts/`, a
   migration, or rows inserted by hand against the live database. The
   existing Dartmouth program with its one event is the obvious host, but
   using it means the verification data and a real claimed program are the
   same rows. *This is the one open item that blocks verification rather
   than implementation.*
2. **Does `2c`'s directory need a real search backend at all?** Dropping
   "Region" and computing the total still leaves a field that must actually
   filter 1,940 programs. `/api/programs/search` exists and returns a capped
   page; whether that is sufficient for the drawn interaction, or needs
   paging it does not have, is not settled here.
3. **Does the lineup editor's re-target `key` contract survive the port?**
   `opponent-name-cell.tsx`'s header is flagged in README §5 as required
   reading before touching it, and it was not read for this design — step 7
   is where that debt comes due.
4. **Carried forward from the brief, unresolved:** nothing. Open questions
   1, 2, 4 and 5 are answered above (`programs.season` exists; the
   boundary rule is stated; the data gap is quantified; the directory is
   backed except for the three named figures). Question 3 is answered by
   the testing section.

## Also consulted

Declared inputs were `01_brief/output/brief.md`, `MAP.md`,
`docs/ui-revamp-guardrails.md` and
`.skills/advantage-analytics-design/SKILL.md` (§376–445 buttons, §552–570
skeleton and empty state); `references/` was empty. Beyond those:

**Live database** via Supabase MCP, project `pouxujkhtbvkdwbzfvka`
(`advantage-dashboard`) — column definitions for `program_events`,
`program_event_entries` and `programs`; RLS policies on both event tables;
row counts; the single existing event and its `format` jsonb.

**Code**
- `src/app/dashboard/team/schedule/page.tsx`, `new/page.tsx`,
  `new/dual/page.tsx`, `new/tournament/page.tsx` — the four static routes,
  whose headers each state their own re-wiring target
- `src/components/dashboard/schedule/README.md` — the live/dormant map
- `src/components/dashboard/schedule/static/static-dual-builder.tsx`,
  `dual-school-step.tsx`, `dual-build-step.tsx` — the drawn-not-wired
  boundary and the `FORMAT_VALUE` note
- `src/lib/data/schedule-server.ts` — loaders and derivations
- `src/lib/schedule/fixtures.ts` — the literals in scope
- `src/lib/schedule/entry-state.ts`, `format.ts` — export lists
- `src/lib/data/team-settings-server.ts` — `TeamIdentity.season`
- `src/lib/workspace/types.ts`, `active-workspace-server.ts` — what
  `Workspace` carries today
- `src/lib/data/roster-server.ts`, `team-settings-server.ts`,
  `opponents-server.ts`, `opponent-history.ts`, `programs-server.ts` —
  existence checks on `getLadder`, `getTeamSettings`, `getConferenceTable`,
  `opponentDualHistory`, `divisionLabel`
- `tests/schedule-static-copy.spec.ts` — what it asserts over
