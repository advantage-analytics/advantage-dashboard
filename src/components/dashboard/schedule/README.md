# `schedule/` — which tree is live, and which is dormant

**Written:** 2026-08-31, on the `events-lineups` full-page design-copy run.
**Why this file exists:** [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
§3.5 — *a dead near-duplicate beside working code is how the wrong one gets edited later.*
This directory now holds two implementations of the same four screens. This file
says which one a user actually sees.

> **Updated during the re-wiring.** This file was written to *label* the
> near-duplicate hazard, because deleting the dormant tree was out of scope for
> the run that created it — those files were then the only DB-wired
> implementation, and the re-wire read from them. That has now happened: §2's
> list is empty and §5 says where each dormant file's knowledge landed. What
> remains labelled rather than removed is §4's type-only lifeline.

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

Only `dual-form.tsx`, `new-event-chooser.tsx` and `tournament-form.tsx` were
ever mounted by a route directly. The rest were unreachable transitively:
`school-search` and `field-row` through `dual-form`, `opponent-rail` through
`dual-form` as well, and `entry-editor` through `tournament-form`.

Git history is the archive — what each one knew is recorded in the ported code
that replaced it, and each porting commit names the file it read from.

---

## 3. Live — leave these alone

`dual-detail.tsx`, `tournament-detail.tsx`, `single-detail.tsx`,
`single-score-entry.tsx`, `event-shell.tsx`, `line-row.tsx`, `score-entry.tsx`,
`add-result-row.tsx`, `run-strip.tsx`, `row-action.tsx`, and everything under
`static/`.

Note `event-shell.tsx` is shared by **both** trees — the dormant detail
screens, the live `[eventId]` ones, and three files under `static/`.
`row-action.tsx` is not imported under `static/` at all, but it is used from
three separate live surfaces: `/dashboard/team/roster` directly, `line-row.tsx`
(reachable via `dual-detail`/`tournament-detail`), and
`team/dual-sheet.tsx` via `/dashboard/team`. Neither file belongs to either
half of this directory, and both must survive any future deletion.

### The asymmetry that matters most

Two files have a static counterpart **and are still live**:

- **`dual-detail.tsx`** — `static/dual-widget.tsx` draws the same `7c`/`4c`
  artboards, but `[eventId]/page.tsx` renders `dual-detail.tsx`. Editing the
  static one will not change the event page; editing `dual-detail.tsx` will.
- **`opponent-name-cell.tsx`** — `static/opponent-popup.tsx` draws its `2d`/`2e`
  popup, but see §4: this one is subtler than it looks.

Having a static counterpart is therefore **not** evidence that a file is dead.
Reachability is, and only reachability is.

---

## 4. Two files that are neither — the type-only lifeline

`lineup-editor.tsx` and `opponent-name-cell.tsx` are the trap in this directory.
A naive import-graph walk marks both **live**. Both are in fact unreachable at
runtime, and both must still be kept.

```
fixtures.ts ─── import type { LineupLine } ──┐
                                             ├──▶ lineup-editor.tsx ──▶ opponent-name-cell.tsx
dual-build-step.tsx ─ import type ───────────┘         (value import, but nothing
                                                        renders <LineupEditor> now
                                                        that dual-form.tsx is deleted)
```

`import type` is erased at build, so neither live importer puts
`lineup-editor.tsx` in a route bundle. Nothing renders `<LineupEditor>` — and
so nothing renders `<OpponentNameCell>` — at all any more: the one thing that
did was `dual-form.tsx`, deleted with the rest of §2's list. **The two type
importers are now the whole of why either file is still here**, which is the
question T24 exists to settle.

So, until it does:

- **Do not delete either file.** `lineup-editor.tsx` exports the `LineupLine`
  type that `fixtures.ts` and `dual-build-step.tsx` compile against; removing it
  breaks the static tree's build. `opponent-name-cell.tsx` is what
  `lineup-editor.tsx` imports.
- **Do not treat their components as live** either. Nothing a user can reach
  renders them today.
- Their headers say `PARTLY DORMANT` rather than `DORMANT` for exactly this
  reason.

---

## 5. Where the dormant tree's knowledge went

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
- **The re-target `key` contract** — `OpponentPool` in
  `static/opponent-popup.tsx`, which binds a school to ITS saved roster so the
  popup cannot dedupe against another school's pool. `opponent-name-cell.tsx`'s
  `OpponentTarget` header is still the fullest statement of *why*; read it
  before touching either. Opponent-player contribution itself is `createDual`'s
  own best-effort loop and `saveOpponentPlayer` in `lib/schedule/actions.ts`.
- **The `"<bestOf>|<adScoring>"` format encoding** that
  [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
  §3.1 and §4 govern — **gone, deliberately.** Both builders now carry `bestOf`
  and `adScoring` as literal fields on a `FORMATS` row, typed `boolean` so a
  null cannot be assigned; there is no string left to parse and so no `null`
  left to read as a confident `false`. `static/dual-build-step.tsx`'s
  `DualFormat` header records the outage that rule comes from.

What is left of the re-wiring is §4's lifeline — where `LineupLine` should
live, and whether `lineup-editor.tsx` and `opponent-name-cell.tsx` survive it.

---

## 6. Regenerating this map

Do not trust it after the tree changes. It was produced by a breadth-first walk
of the `@/`-alias and relative import graph rooted at every file under
`src/app/`, then refined by hand for the type-only edges in §4 — which a plain
import walk cannot see. To spot-check one file:

```bash
grep -rn "schedule/<name>\"" src        # who imports it
grep -rn "<ComponentName" src           # who actually renders it
```

The second command is the one that catches §4. An importer is not a renderer.
