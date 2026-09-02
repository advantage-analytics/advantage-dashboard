# `schedule/` — which tree is live, and which is dormant

**Written:** 2026-08-31, on the `events-lineups` full-page design-copy run.
**Why this file exists:** [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
§3.5 — *a dead near-duplicate beside working code is how the wrong one gets
edited later.* This directory held two implementations of the same four
screens. This file says which one a user actually sees.

> **Updated during the re-wiring, and again when it finished.** This file was
> written to *label* the near-duplicate hazard, because deleting the dormant
> tree was out of scope for the run that created it — those files were then
> the only DB-wired implementation, and the re-wire read from them. That has
> now happened in full: §2's list is empty, §4 says where each dormant file's
> knowledge landed, and the last two files — a type-only lifeline that an
> earlier §4 of this file documented — are gone, with `LineupLine` moved to
> `src/lib/schedule/types.ts`. Nothing dormant remains in this directory.

---

## 1. The routes

Seven route files render this directory. **Four were re-pointed this run** to
`static/`, which draws from `src/lib/schedule/fixtures.ts` and touches no
database. **Three were deliberately left out of scope** (stage 02) and still
render the original DB-wired components.

| Route | Renders | Tree |
|---|---|---|
| `/dashboard/team/schedule` | `static/static-schedule.tsx` | static |
| `/dashboard/team/schedule/new` | `static/static-event-chooser.tsx` | static |
| `/dashboard/team/schedule/new/dual` | `static/static-dual-builder.tsx` | static |
| `/dashboard/team/schedule/new/tournament` | `static/static-tournament-builder.tsx` | static |
| `/dashboard/team/schedule/[eventId]` | `dual-detail.tsx`, `tournament-detail.tsx` | **DB-wired, live** |
| `/dashboard/team/schedule/single/[matchId]` | `single-detail.tsx` | **DB-wired, live** |
| `/dashboard/team/schedule/new/single` | `matches/new-match-wizard` (not this directory) | — |

That split is the reason the map below is not simply "old tree dead, new tree
live". Some of the original components lost their route; others kept one.

---

## 2. Dormant — unreachable from any route

**None left.** The re-wiring has caught up with the whole list this section
used to hold, and every file that was on it is deleted:

| Was dormant | Deleted when the live route grew its behaviour |
|---|---|
| `schedule-list.tsx`, `event-detail-pane.tsx` | `static/static-schedule.tsx` + `static/event-drawer.tsx` read the database |
| `new-event-chooser.tsx` | `static/static-event-chooser.tsx` took the route |
| `tournament-form.tsx`, `entry-editor.tsx` | `static/static-tournament-builder.tsx` calls `createTournament` |
| `dual-form.tsx` | `static/static-dual-builder.tsx` → `dual-school-step` + `dual-build-step`, which now call `createDual` |
| `school-search.tsx` | `static/dual-school-step.tsx` |
| `opponent-rail.tsx` | the left pane of `static/dual-build-step.tsx` |
| `field-row.tsx` | nothing 1:1 — the static builders each draw their own defaults cells |
| `lineup-editor.tsx` | the lineup half of `static/dual-build-step.tsx`; its `LineupLine` type moved to `lib/schedule/types.ts` |
| `opponent-name-cell.tsx` | `static/opponent-popup.tsx`, plus the row key in `static/dual-build-step.tsx` — §4 on the `key` contract |

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

## 3. Live — leave these alone

`dual-detail.tsx`, `tournament-detail.tsx`, `single-detail.tsx`,
`single-score-entry.tsx`, `event-shell.tsx`, `line-row.tsx`, `score-entry.tsx`,
`add-result-row.tsx`, `run-strip.tsx`, `row-action.tsx`, and everything under
`static/`.

Note `event-shell.tsx` is shared by **both** trees — the live `[eventId]`
detail screens and three files under `static/`. `row-action.tsx` is not
imported under `static/` at all, but it is used from three separate live
surfaces: `/dashboard/team/roster` directly, `line-row.tsx` (reachable via
`dual-detail`/`tournament-detail`), and `team/dual-sheet.tsx` via
`/dashboard/team`. Neither file belongs to either half of this directory, and
both must survive any future deletion.

### The asymmetry that matters most

One file has a static counterpart **and is still live**:

- **`dual-detail.tsx`** — `static/dual-widget.tsx` draws the same `7c`/`4c`
  artboards, but `[eventId]/page.tsx` renders `dual-detail.tsx`. Editing the
  static one will not change the event page; editing `dual-detail.tsx` will.

Having a static counterpart is therefore **not** evidence that a file is dead.
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
  calls `rosterIdsForLabels` rather than keeping a second rule.
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
  static popup does not (its "saved" confirmation is a statement the design
  draws, not a server's answer — `opponent-popup.tsx`'s `saveNote` says what
  that costs), so **`saveOpponentPlayer` currently has no caller**. It is left
  in place as the ready-made write for a popup that earns a real confirmation.
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
