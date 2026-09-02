# `schedule/` — one tree, and where the old one's knowledge went

**Written:** 2026-08-31, on the `events-lineups` full-page design-copy run.
**Rewritten:** 2026-09-01, closing the `team-schedule-db-wiring` run (T13–T26).
**Why this file exists:** [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
§3.5 — *a dead near-duplicate beside working code is how the wrong one gets
edited later.* For one run this directory held two implementations of the
same four screens, and this file labelled which one a user saw. It no longer
does: the dormant tree is deleted. This file now says what is here, what was
deleted, and where each deleted file's knowledge landed.

> **Nothing in this directory is dormant.** The `static/` subdirectory is a
> name inherited from the design-copy run, when its files rendered
> `src/lib/schedule/fixtures.ts` instead of the loaders. Every file under it
> now reads the database through its route, and `fixtures.ts` has no importer
> under `src/` at all — `tests/schedule-static-copy.spec.ts` is its only
> reader, and that spec's header says what a green run of it does and does not
> prove. Renaming `static/` is a separate decision; this note is so the name
> is not read as a description.

---

## 1. The routes

Seven route files render this directory, and all seven read the database.

| Route | Renders | Reads |
|---|---|---|
| `/dashboard/team/schedule` | `static/static-schedule.tsx`, with `static/event-drawer.tsx` and `static/dual-widget.tsx` | `getProgramSchedule` → `scheduleRowsFrom`, `eventDetailFrom`, `seasonSummaryFrom` |
| `/dashboard/team/schedule/new` | `static/static-event-chooser.tsx` | nothing — two links and one piece of local state |
| `/dashboard/team/schedule/new/dual` | `static/static-dual-builder.tsx` → `static/dual-school-step.tsx`, then `static/dual-build-step.tsx` with `static/opponent-popup.tsx` | `getLadder`, `getTeamSettings`, `getConferenceTable`, `getProgramSchedule` → `opponentDualHistory`, a `programs` head count; `/api/programs/search` and `opponentRosterForDual` from the client; writes through `createDual` |
| `/dashboard/team/schedule/new/tournament` | `static/static-tournament-builder.tsx` | `getLadder`, `getTeamSettings`; writes through `createTournament` |
| `/dashboard/team/schedule/[eventId]` | `dual-detail.tsx`, `tournament-detail.tsx` | `getEventDetail` |
| `/dashboard/team/schedule/single/[matchId]` | `single-detail.tsx` | `getTeamSingleMatch` |
| `/dashboard/team/schedule/new/single` | `matches/new-match-wizard` (not this directory) | — |

The four `static/` routes were the design-copy run's; the three below them
were never re-pointed and never dormant. Which task wired which — the commits
carry the same numbers: T15 the schedule, T18 the chooser, T19–T20 the
tournament builder, T21–T23 the dual builder. T25 then confirmed the schedule
surfaces agree on the data of one event, and disagree on some words — §3.

---

## 2. Deleted — the dormant tree, and what replaced each file

The re-wiring caught up with the whole list this section used to hold, and
every file that was on it is deleted:

| Was dormant | Deleted when the live route grew its behaviour |
|---|---|
| `schedule-list.tsx`, `event-detail-pane.tsx` | `static/static-schedule.tsx` + `static/event-drawer.tsx` read the database (T15; deleted T17) |
| `new-event-chooser.tsx` | `static/static-event-chooser.tsx` took the route (T18) |
| `tournament-form.tsx`, `entry-editor.tsx` | `static/static-tournament-builder.tsx` calls `createTournament` (T20) |
| `dual-form.tsx` | `static/static-dual-builder.tsx` → `dual-school-step` + `dual-build-step`, the latter calling `createDual` (T23) |
| `school-search.tsx` | `static/dual-school-step.tsx` searches the real directory (T21; deleted T23) |
| `opponent-rail.tsx` | the left pane of `static/dual-build-step.tsx` (T23) |
| `field-row.tsx` | nothing 1:1 — the builders each draw their own defaults cells (T23) |
| `lineup-editor.tsx` | the lineup half of `static/dual-build-step.tsx`; its `LineupLine` type moved to `lib/schedule/types.ts` (T24) |
| `opponent-name-cell.tsx` | `static/opponent-popup.tsx`, plus the row key in `static/dual-build-step.tsx` — §4 on the `key` contract (T24) |

Only `dual-form.tsx`, `new-event-chooser.tsx` and `tournament-form.tsx` were
ever mounted by a route directly. The rest were unreachable transitively:
`school-search`, `field-row`, `opponent-rail` and `lineup-editor` through
`dual-form`, `opponent-name-cell` through `lineup-editor`, and `entry-editor`
through `tournament-form`.

The last two outlived `dual-form.tsx` by one task. Nothing rendered them, but
`fixtures.ts` and `static/dual-build-step.tsx` both did
`import type { LineupLine }` from `lineup-editor.tsx` — an edge that is erased
at build, so it never put either file in a bundle, yet would have broken the
static tree's compile had the files been deleted first. Moving the type to
`lib/schedule/types.ts` is what freed them.

Git history is the archive — what each one knew is recorded in the ported code
that replaced it, and each porting commit names the file it read from.

---

## 3. Live — all of it, and the one near-duplicate that remains

Everything here is reachable: `dual-detail.tsx`, `tournament-detail.tsx`,
`single-detail.tsx`, `single-score-entry.tsx`, `event-shell.tsx`,
`line-row.tsx`, `score-entry.tsx`, `add-result-row.tsx`, `run-strip.tsx`,
`row-action.tsx`, and everything under `static/`.

Two files are shared across routes and must survive any future deletion.
`event-shell.tsx` frames the three detail screens (`dual-detail`,
`tournament-detail`, `single-detail`) and three files under `static/`
(`dual-build-step`, `static-tournament-builder`, `static-event-chooser`).
`row-action.tsx` is not imported under `static/` at all, but is used from
three separate live surfaces: `/dashboard/team/roster` directly, `line-row.tsx`
(reachable via `dual-detail`/`tournament-detail`), and `team/dual-sheet.tsx`
via `/dashboard/team`.

### The near-duplicate that is still here

- **`dual-detail.tsx`** and **`static/dual-widget.tsx`** both draw the
  `7c`/`4c` dual card, and both are live, on different routes:
  `[eventId]/page.tsx` renders `dual-detail.tsx`; the schedule page's selected
  pane renders `dual-widget.tsx`. Editing one does not change the other. T25
  found they already disagree on the words for one `no-video` state — nothing
  or "Coming soon" on the widget, "Add video" / "Add file" on the event page —
  while agreeing on every score and outcome.

Having a counterpart is therefore **not** evidence that a file is dead.
Reachability is, and only reachability is.

---

## 4. Where the dormant tree's knowledge went

The dormant tree was never a discard pile — it was the half that knew about the
database. Deleting it was safe only because each piece landed somewhere first.
Where to read each one now:

- **`createDual` and its server-action call** — `static/dual-build-step.tsx`'s
  `submit()`. `createTournament`'s is `static/static-tournament-builder.tsx`'s.
- **Roster matching and name splitting** — `lib/schedule/roster-match.ts` and
  `lib/schedule/format.ts`, which is where both already lived; the builder
  imports `rosterIdsForLabels` rather than keeping a second rule.
- **The ladder seed** — `seedLineup()` in `static/dual-build-step.tsx`, ported
  from `dual-form.tsx` unchanged.
- **The lineup's line shape** — `LineupLine` in `lib/schedule/types.ts`, beside
  the `EventEntry` it becomes at submit. It came out of `lineup-editor.tsx`
  unchanged apart from spelling `discipline` as the file's own `Discipline`
  alias; its `forfeit` doc — `"ours"` is the only side a builder can set, and
  it awards the point to THEM — travelled with it.
- **The re-target `key` contract** — two places, which together are the whole
  of what the deleted `opponent-name-cell.tsx`'s `OpponentTarget` header
  specified. *The remount:* `static/dual-build-step.tsx` computes a
  `schoolKey` (`program:<programKey>` or `text:<typed name>`) and every row's
  React key is `` `${pool.key}:${line.key}` ``, so a change of school remounts
  the row and no draft, suggestion highlight or pending confirmation typed
  against the last school survives into this one. *The pool:* `OpponentPool`
  in `static/opponent-popup.tsx`, built only by `opponentPoolFor()`, which
  hands candidates on only while their fetch stamp matches the school on
  screen — empty the same render the target changes, and the school name and
  its roster arrive as one value so the popup cannot dedupe against another
  school's pool. Why it matters is unchanged: `contribute_opponent_player`
  matches by name WITHIN the target program, so a name carried across a
  re-target can attach to a real, different person there. The rail does not
  yet offer a re-target — today the key changes only between mounts — but
  both halves are in place for when it does.
- **Opponent-player contribution** — `createDual`'s own best-effort loop at
  submit, once the lines are safely written. The dormant cell also wrote
  per-pick, through `saveOpponentPlayer` in `lib/schedule/actions.ts`; the
  live popup does not (its "saved" confirmation is a statement the design
  draws, not a server's answer — `opponent-popup.tsx`'s `saveNote` says what
  that costs), so **`saveOpponentPlayer` currently has no caller**. It is left
  in place as the ready-made write for a popup that earns a real confirmation.
- **Bench substitution and drag-to-reorder — nowhere.** The deleted
  `lineup-editor.tsx` could reorder lines by drag and substitute from a bench
  built by `benchFromLines` (`lib/schedule/roster-match.ts`). `2b` draws
  neither, so the live builder has neither: a sub goes on by typing over a
  seeded name, and `rosterIdsForLabels` re-resolves the id in the same update.
  `benchFromLines` has no caller under `src/` — `tests/person-name-matching.spec.ts`
  still covers it — and stays as the ready-made rule for a bench that is
  drawn. That editor was never rendered on any route, so the logic has never
  run in production; this bullet is the only place that records it existed.
- **The `"<bestOf>|<adScoring>"` format encoding** that
  [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
  §3.1 and §4 govern — **gone, deliberately.** Both builders now carry `bestOf`
  and `adScoring` as literal fields on a `FORMATS` row, typed `boolean` so a
  null cannot be assigned; there is no string left to parse and so no `null`
  left to read as a confident `false`. `static/dual-build-step.tsx`'s
  `DualFormat` header records the outage that rule comes from.

---

## 5. Regenerating this map

Do not trust it after the tree changes. It was produced by a breadth-first walk
of the `@/`-alias and relative import graph rooted at every file under
`src/app/`, then refined by hand for type-only edges — which a plain import
walk cannot see, and which this directory has already had once: until
`LineupLine` moved to `lib/schedule/types.ts`, two `import type` lines kept
`lineup-editor.tsx` and `opponent-name-cell.tsx` looking live to an import walk
and looking deletable to a reachability walk, and both walks were wrong. To
spot-check one file:

```bash
grep -rn "schedule/<name>\"" src        # who imports it
grep -rn "<ComponentName" src           # who actually renders it
```

The second command is the one that catches a lifeline. An importer is not a
renderer — and an `import type` is not even an importer at runtime. Keep domain
types in `src/lib/schedule/types.ts`, not in component files, so the next
`fixtures.ts` never has to reach into `components/` for a shape.
