# `schedule/` — one tree, and where the old one's knowledge went

**Written:** 2026-08-31, on the `events-lineups` full-page design-copy run.
**Rewritten:** 2026-09-01, closing the `team-schedule-db-wiring` run (T13–T26).
**Why this file exists:** [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
§3.5 — _a dead near-duplicate beside working code is how the wrong one gets
edited later._ For one run this directory held two implementations of the
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

Nine route files render this directory, and all nine read the database.

| Route                                       | Renders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Reads                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/team/schedule`                  | `static/static-schedule.tsx`, with `static/schedule-table.tsx`, `static/event-drawer.tsx` and `static/event-mark.tsx` (Platform Audit `Tc2`/`Tc2c`)                                                                                                                                                                                                                                                                                                                                                                                                              | `getProgramSchedule` → `scheduleRowsFrom`, `seasonSummaryFrom`; `getOpponentPrograms`                                                                                                                                                                                                                                                                                |
| `/dashboard/team/schedule/new`              | `static/static-event-chooser.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | nothing — two links and one piece of local state                                                                                                                                                                                                                                                                                                                     |
| `/dashboard/team/schedule/new/dual`         | `static/new-dual-flow.tsx` — three steps on `matches/new-match-wizard`'s `WizardShell`, with `static/pinned-event-bar.tsx`: `DualSchoolStep` (`static/dual-school-step.tsx`), then `DualFactsStep` and `DualLineupStep` (`static/dual-build-step.tsx`, rows in `static/lineup-rows.tsx`, with `static/opponent-popup.tsx`)                                                                                                                                                                                                                                       | `getLadder`, `getTeamSettings` → `getOpponentDirectory`, own `program_key`, `getProgramSchedule` → `opponentDualHistory`, a `programs` head count; `/api/programs/search` and `opponentRosterForDual` from the client; writes through `createDual`                                                                                                                   |
| `/dashboard/team/schedule/new/tournament`   | `static/new-tournament-flow.tsx` — three steps on `matches/new-match-wizard`'s `WizardShell`, with `static/pinned-event-bar.tsx`: `TournamentNameStep`, `TournamentDetailsStep` (Site and Format from `static/event-fact-fields.tsx`, shared with the dual), then `TournamentFieldStep` (all `static/static-tournament-builder.tsx`, over its `useTournamentDraft`)                                                                                                                                                                                              | `getLadder`, `getTeamSettings`; writes through `createTournament`                                                                                                                                                                                                                                                                                                    |
| `/dashboard/team/schedule/[eventId]`        | `dual-detail.tsx` (lines grouped Singles/Doubles, `dual-ticks.tsx` in the summary strip) and `tournament-detail.tsx` (matches grouped by entry), both on `event-table.tsx`'s kit with `use-row-selection.ts`; a row opens `event-line-drawer.tsx` beside the table, selected by `?line=` (dual) or `?match=` (tournament)                                                                                                                                                                                                                                        | `getProgramSchedule` → `eventDetailFrom`; for a tournament also `getEventTeamTotals`                                                                                                                                                                                                                                                                                 |
| `/dashboard/team/schedule/[eventId]/edit`   | branches on the event's kind: a dual gets `static/new-dual-flow.tsx` in `mode="edit"` — the same three-step flow opened at step two, its school pinned by `static/pinned-event-bar.tsx` with no `Change` and step one unreachable, settled lines drawn read-only inside `DualLineupStep` (`static/dual-build-step.tsx`); a tournament gets `static/new-tournament-flow.tsx` in `mode="edit"` — both steps reachable, the field seeded from `static/static-tournament-builder.tsx`'s `useTournamentDraft` with saved ids, draws and seeds, settled entries locked | `getProgramSchedule` → `eventDetailFrom`, `getLadder`, `getTeamSettings`; a dual also reads one `programs` row for the opponent's directory key; `isSettled` from `lib/schedule/entry-plan.ts` decides which lines/entries are read-only; writes through `updateDual` or `updateTournament`, both of which consult `planEntryChanges` before writing anything at all |
| `/dashboard/team/schedule/[eventId]/score`  | `score-only-flow.tsx` — **the one place a score or outcome is recorded**, for duals and tournaments (a tournament's round is `?round=`). The upload wizard's chrome with its video half switched off — `StepIndicator`, `PinnedLineBar` and `ScoreBlock` come from `matches/new-match-wizard`                                                                                                                                                                                                                                                                    | `getEventDetail`, `programNamesFor`; `presetFor`/`lineupChoices`, `entryState` and `nextRound`; writes through `recordResult` and `setOutcome`                                                                                                                                                                                                                       |
| `/dashboard/team/schedule/single/[matchId]` | `single-detail.tsx` — its `single-score-entry.tsx` is the one scorer outside `[eventId]/score`, because a single match has no event entry and writes through `PATCH /api/matches/[matchId]`; folding it in is an open follow-up                                                                                                                                                                                                                                                                                                                                  | `getTeamSingleMatch`                                                                                                                                                                                                                                                                                                                                                 |

The four `static/` routes were the design-copy run's; the four below them
were never re-pointed and never dormant (the score-only flow at
`[eventId]/score` is newer still — T11, and the edit flow at `[eventId]/edit`
newer again — T19 wired the dual half, T20 the tournament half, both
dual/tournament designs). Which task wired which — the commits
carry the same numbers: T15 the schedule, T18 the chooser, T19–T20 the
tournament builder, T21–T23 the dual builder. T25 then confirmed the schedule
surfaces agree on the data of one event, and disagree on some words — §3.

---

## 2. Deleted — the dormant tree, and what replaced each file

The re-wiring caught up with the whole list this section used to hold, and
every file that was on it is deleted:

| Was dormant                                  | Deleted when the live route grew its behaviour                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule-list.tsx`, `event-detail-pane.tsx` | `static/static-schedule.tsx` + `static/event-drawer.tsx` read the database (T15; deleted T17)                                                                                                                                                                                                                                                                          |
| `new-event-chooser.tsx`                      | `static/static-event-chooser.tsx` took the route (T18)                                                                                                                                                                                                                                                                                                                 |
| `tournament-form.tsx`, `entry-editor.tsx`    | `static/static-tournament-builder.tsx` calls `createTournament` (T20); the `StaticTournamentBuilder` composite that framed it is itself deleted, replaced by `static/new-tournament-flow.tsx` over the same file's `useTournamentDraft` (T16, dual/tournament designs)                                                                                                 |
| `dual-form.tsx`                              | `static/dual-school-step.tsx` + `static/dual-build-step.tsx`, the latter's `useDualDraft` calling `createDual` (T23); the `static-dual-builder.tsx` shell that first framed the two is itself deleted, replaced by `static/new-dual-flow.tsx` (T15, dual/tournament designs)                                                                                           |
| `school-search.tsx`                          | `static/dual-school-step.tsx` searches the real directory (T21; deleted T23)                                                                                                                                                                                                                                                                                           |
| `opponent-rail.tsx`                          | `static/dual-school-step.tsx` (the school-directory search moved to its own step one) and `static/opponent-popup.tsx` (the per-line target picker); the pane itself is gone — `static/dual-build-step.tsx` collapsed to one column when the dual/tournament designs run split it into `useDualDraft` + `DualFactsStep`/`DualLineupStep` (T14, dual/tournament designs) |
| `field-row.tsx`                              | nothing 1:1 — the builders each draw their own defaults cells (T23)                                                                                                                                                                                                                                                                                                    |
| `lineup-editor.tsx`                          | the lineup half of `static/dual-build-step.tsx`; its `LineupLine` type moved to `lib/schedule/types.ts` (T24)                                                                                                                                                                                                                                                          |
| `opponent-name-cell.tsx`                     | `static/opponent-popup.tsx`, plus the row key in `static/dual-build-step.tsx` — §4 on the `key` contract (T24)                                                                                                                                                                                                                                                         |

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
`event-table.tsx`, `use-row-selection.ts`, `event-line-drawer.tsx`,
`event-header-slot.tsx`, `event-glyph-row.tsx`, `score-only-flow.tsx`,
`dual-ticks.tsx`, `row-action.tsx`, `result-choice.tsx`, and everything
under `static/`.

**The event pages' old furniture is deleted** (T11–T13, event pages as
match tables): `event-page.tsx` (`EventPageFrame`, `EventFacts`,
`FormatCapsule`, `DetailLine`, `TableCard`, `GroupHead`), `line-row.tsx`
(`LineRow`), `run-strip.tsx` (`RunStrip`) and `team-totals-widget.tsx`. What
they knew moved: `EventTitle` to `event-table.tsx`; the row-action rule
`lineAction` to `lib/schedule/line-action.ts`, read by the drawer's footer;
`scoreHref` to `lib/schedule/score-seed.ts`, beside the seed it feeds;
`runRecord` to `lib/schedule/tournament-run.ts`. `dual-ticks.tsx` lost its
`lg` size, drawn only by the retired score band.

**Scoring has one path.** `score-entry.tsx` (the in-row form),
`add-result-row.tsx`, `add-result-dialog.tsx` and `add-result-button.tsx` are
deleted: every "Add result" / "Edit result" — now in the event pages' line
drawer (`event-line-drawer.tsx`) and the page header's primary — and the
schedule drawer's "Enter results", is a link into `[eventId]/score` with the
line (and round) preset (`scoreHref` in `lib/schedule/score-seed.ts`). `nextRound` moved to `lib/schedule/tournament-run.ts`.
The lineup step's `···` play menu is gone, and the legacy `setForfeit` with
it.

**The score page asks score first.** There is no result menu and no forfeit
(a forfeit is the lineup's "No player"; a line holding one reads as a note
pointing at Edit dual). Under the score, "Didn't finish? Retired · Defaulted"
turns into "Who retired?" in the same place. `planSave` in
`lib/schedule/score-seed.ts` decides the write: a score — played out, retired,
or defaulted mid-match — is `recordResult` with `ending`, which stores
`matches.result` "Retired"/"Defaulted" and `matches.score.winner` (the side
that did not stop; player1 is ours); a default with no score is still the
`default` outcome. `matchWon` reads `score.winner` before counting sets, and
the event rows mark a stopped score "ret."/"def.". An opponent the lineup left
blank is named in the score row with the lineup's own pickers (`OpponentPopup`,
`OpponentPairPicker`).

**Scoring hands off to the upload wizard in two places** (`uploadInsteadHref`
and `savedLineUpload` in `lib/schedule/score-seed.ts`), both drawn only for a
viewer `canUploadForProgram` admits. A dual line with no result and no digits
typed offers "Upload it instead" — the wizard takes the score at its last
step; never on a tournament, whose `?entry=` alone would pick another round's
match. After "Save and next line" on a played score, the footer names the line
just saved with its "Add video", carrying `?match=`, on a singles line; a
doubles line offers nothing.

**A dual saves complete.** Every line S1–S6 and D1–D3 must hold a player, a
pair, or **No player** (`validateDualLineup` in `lib/schedule/lineup-validation.ts`,
asked by the builder — Create dual stays disabled beside `LineupProgress`, a grey "7 of 9 lines set" pill whose click takes the coach to the next line still to set — and again by `createDual`/`updateDual`). No
player is the ONE outcome a lineup writes — on our side a forfeit for us, and
from the opponent dropdown a forfeit for them (never both on one line) —
recorded by `recordLineupForfeits` at save and cleared when someone is named
(`lineupForfeitSide` in `entry-plan.ts` is how a saved one is recognised). A
player holds at most one singles line and one doubles line (`lineupClashes`):
the pickers leave them out, and the save refuses a clash. Every
other outcome is the score flow's, and a line that holds one is drawn
read-only (`LockedNote`). Because no dual has a gap, `UnsetLineRow`,
`SetLineAction`, the drawer's `SetLineRow`, the table's "Not set" and the
schedule's "Set next lineup" are deleted.

Two files are shared across routes and must survive any future deletion.
`event-shell.tsx` now frames only `single-detail.tsx` and
`static/static-event-chooser.tsx` — `dual-detail.tsx` and
`tournament-detail.tsx` moved onto `event-table.tsx`'s `EventPageLayout`
(T8–T11, event pages as match tables), and `static-tournament-builder.tsx` lost its
frame the same way `dual-build-step.tsx` did, when `static/new-tournament-flow.tsx`
took over on `WizardShell` (T16, dual/tournament designs). `row-action.tsx` is
not imported under `static/` at all, but is used from three separate live
surfaces: `/dashboard/team/roster` directly, and the player profile's
`team/player-profile/last-match-card.tsx` and `match-history-card.tsx`. The
event pages no longer draw it — their line actions are the drawer's buttons.

### The near-duplicate that was here

- **`dual-detail.tsx`** and **`static/dual-widget.tsx`** both drew the
  `7c`/`4c` dual card, live on different routes. The Platform Audit redesign
  (`Tc2`/`Tc2c`, 2026-09-04) deleted `dual-widget.tsx`: the schedule page's
  selected pane became a 340px right rail, `static/event-drawer.tsx`, whose
  lineup rows are links to each match rather than a second copy of the event
  page's line table. `dual-detail.tsx` is the only dual card now.

Having a counterpart is therefore **not** evidence that a file is dead.
Reachability is, and only reachability is.

---

## 4. Where the dormant tree's knowledge went

The dormant tree was never a discard pile — it was the half that knew about the
database. Deleting it was safe only because each piece landed somewhere first.
Where to read each one now:

- **`createDual` and its server-action call** — `static/dual-build-step.tsx`'s
  `useDualDraft().submit()`. `createTournament`'s is
  `static/static-tournament-builder.tsx`'s `useTournamentDraft().submit()`.
- **Roster matching and name splitting** — `lib/schedule/roster-match.ts` and
  `lib/schedule/format.ts`, which is where both already lived; the builder
  imports `rosterIdsForLabels` rather than keeping a second rule.
- **The ladder seed** — `seedLineup()` in `static/dual-build-step.tsx`, ported
  from `dual-form.tsx` unchanged.
- **The lineup's line shape** — `LineupLine` in `lib/schedule/types.ts`, beside
  the `EventEntry` it becomes at submit. It came out of `lineup-editor.tsx`
  unchanged apart from spelling `discipline` as the file's own `Discipline`
  alias. Its `forfeit` field is gone — `noPlayer` replaced it, and saving a
  No player line is what records our forfeit. `EventEntry.forfeit` remains
  only to read legacy rows.
- **The re-target `key` contract** — two places, which together are the whole
  of what the deleted `opponent-name-cell.tsx`'s `OpponentTarget` header
  specified. _The remount:_ `static/dual-build-step.tsx` computes a
  `schoolKey` (`program:<programKey>` or `text:<typed name>`) and every row's
  React key is `` `${pool.key}:${line.key}` ``, so a change of school remounts
  the row and no draft, suggestion highlight or pending confirmation typed
  against the last school survives into this one. _The pool:_ `OpponentPool`
  in `static/opponent-popup.tsx`, built only by `opponentPoolFor()`, which
  hands candidates on only while their fetch stamp matches the school on
  screen — empty the same render the target changes, and the school name and
  its roster arrive as one value so the popup cannot dedupe against another
  school's pool. Why it matters is unchanged: `contribute_opponent_player`
  matches by name WITHIN the target program, so a name carried across a
  re-target can attach to a real, different person there. The rail does not
  yet offer a re-target — today the key changes only between mounts — but
  both halves are in place for when it does.
- **Opponent-player contribution** — two callers now, and they do not
  duplicate each other. `createDual`'s best-effort loop at submit contributes
  every opposing name once the lines are safely written, and that is still the
  backstop. `static/opponent-popup.tsx`'s "Save as a different player" card
  calls `saveOpponentPlayer` in `lib/schedule/actions.ts` per-pick, the way
  the dormant `opponent-name-cell.tsx` did — the same converging RPC run
  earlier, so the coach is told the truth while the answer is still on screen.
  It was left uncalled through the re-wiring for want of a popup that earned a
  real confirmation; the picker-parity pass is that popup. The confirmation
  splits three ways because there are three outcomes and `2e` drew one card
  for all of them: `On {school}'s saved roster` for a name the pool already
  held (nothing was written), `Saved to {school} roster` only once
  `saveOpponentPlayer` reports `{ saved: true }`, and `Added to this lineup`
  when there was no program to save to or the RPC refused — every arm of
  `contribute_opponent_player` can legitimately refuse, and a refusal costs
  the pool an identity, never the coach their typed name.
- **The opponent picker** — `static/opponent-popup.tsx` is a roster picker
  over `pool.candidates`, not the three-name near-duplicate warning `2d`
  drew: with saved names it lists them on open and filters as you type (up to
  eight rows, scrolling), and the keyboard is `hooks/use-listbox-nav.ts` over
  a real `combobox`/`listbox`/`option` tree — the same hook and the same ARIA
  shape as `team/invite-target-picker.tsx`, so two pickers on one screen
  cannot drift on what a key does. A school with no pooled roster gets no list
  at all and the field alone; free text stays the fallback, unchanged.
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
