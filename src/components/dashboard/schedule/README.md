# `schedule/` — which tree is live, and which is dormant

**Written:** 2026-08-31, on the `events-lineups` full-page design-copy run.
**Why this file exists:** [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
§3.5 — *a dead near-duplicate beside working code is how the wrong one gets edited later.*
This directory now holds two implementations of the same four screens. This file
says which one a user actually sees.

> This labels the hazard; it does not remove it. Only deleting the dormant tree
> would, and the brief for this run says not to — the dormant files are still
> the only DB-wired implementation, and the re-wire reads from them. Until that
> happens, both trees stay, and the labels are the whole defence.

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

Six files. Each carries a `DORMANT` header naming its replacement.

| Dormant file | Replaced on the live route by |
|---|---|
| `dual-form.tsx` | `static/static-dual-builder.tsx` (shell) → `dual-school-step` + `dual-build-step` |
| `school-search.tsx` | `static/dual-school-step.tsx` |
| `opponent-rail.tsx` | the left pane of `static/dual-build-step.tsx` |
| `tournament-form.tsx` | `static/static-tournament-builder.tsx` |
| `entry-editor.tsx` | drawn inline in `static/static-tournament-builder.tsx` |
| `field-row.tsx` | nothing 1:1 — the static builders each draw their own defaults cells |

Only `dual-form.tsx` and `tournament-form.tsx` were ever mounted by a route
directly — those two are what the remaining re-pointed routes used to
import. (`new-event-chooser.tsx` was the third; it has since been deleted —
see git history.) The rest became unreachable transitively, because the only
things importing them did: `school-search` and `field-row` through the two
forms, `opponent-rail` through `dual-form`, and `entry-editor` through
`tournament-form`.

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
dual-build-step.tsx ─ import type ───────────┘         │ (value import, rendered)
                                                       │
dual-form.tsx (DORMANT) ─── <LineupEditor> ────────────┘
```

`import type` is erased at build, so neither live importer puts
`lineup-editor.tsx` in a route bundle. The only thing that renders
`<LineupEditor>` — and through it `<OpponentNameCell>` — is dormant
`dual-form.tsx`.

So:

- **Do not delete either file.** `lineup-editor.tsx` exports the `LineupLine`
  type that `fixtures.ts` and `dual-build-step.tsx` compile against; removing it
  breaks the static tree's build. `opponent-name-cell.tsx` is what
  `lineup-editor.tsx` imports.
- **Do not treat their components as live** either. Nothing a user can reach
  renders them today.
- Their headers say `PARTLY DORMANT` rather than `DORMANT` for exactly this
  reason.

---

## 5. Re-wiring the static tree later

The dormant tree is not a discard pile — it is the half that knows about the
database. Everything the static screens do not have lives there:

- `createDual` / `createTournament` and their server actions (`dual-form.tsx`,
  `tournament-form.tsx`)
- roster matching and name splitting (`dual-form.tsx`, `entry-editor.tsx`)
- opponent-player contribution and the re-target `key` contract
  (`opponent-name-cell.tsx` — read its own header before touching it)
- the `"<bestOf>|<adScoring>"` format encoding that
  [`docs/ui-revamp-guardrails.md`](../../../../docs/ui-revamp-guardrails.md)
  §3.1 and §4 govern. `static/dual-build-step.tsx` hard-codes `"3|false"` and
  its header explains why an interpolated value corrupts submissions.

Re-wiring means porting those into the static components, then deleting the
rest of the dormant tree — at which point this file's §2 should shrink to
nothing and §4 disappears entirely.

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
