# Design — events-lineups

Static rebuild of all ten `Events & Lineups.dc.html` artboards, per the brief's
resolved decisions: **replace the routes in place**, **leave the DB-wired
components dormant**, **desktop-only**, and **the paired frames are one
component's moving state**.

## The finding that shapes everything below

**The app shell is already the design's chrome.** Every artboard is a 1280px
frame built from a 232px sidebar plus a 44px topbar, and both already exist,
at exactly those dimensions, as tokens and components:

| Artboard chrome | Already in the app |
|---|---|
| 232px `<dc-import name="Sidebar" active="schedule">` | `app-sidebar.tsx`, `--panel-width: 232px` |
| 44px breadcrumb bar, search · activity · avatar | `src/app/dashboard/header.tsx` (`h-11`), `--header-h: 44px` |
| "Meridian State › Schedule › New event" | `getStaticBreadcrumbs()` — already handles the schedule subtree, with a leaf crumb for the create screens |
| Create-screen body + footer, master-detail variant | `EventShell` (`flush` prop, added for 2b by name) |

So the rebuild owns **only what sits inside the shell**. Reproducing the
sidebar or topbar from the artboards would render the app's chrome twice.
This is the single largest reduction in scope available, and it is not a
compromise on fidelity — the existing chrome *is* the design.

## Approaches considered

### A. New static tree beside the dormant one, routes re-pointed — **recommended**

A new `schedule/static/` component directory plus one fixtures module; the four
covered route files stop calling the data layer and render the static tree. The
21 existing components are not touched at all.

- **For:** the brief's "leave dormant" is satisfied literally — the dormant
  files keep their current bytes, so the later re-wiring reads code rather than
  git history. Every diff outside the four route files is a pure addition.
  Reviving or deleting the dormant tree later is a route-level change.
- **Against:** it puts ~12 new near-duplicates in the same subtree as 21
  dormant ones — precisely the hazard `docs/ui-revamp-guardrails.md` §3.5 names
  ("a dead near-duplicate beside working code is how the wrong one gets edited
  later"). Mitigated below, not eliminated.

### B. Rewrite the 21 existing components in place

Strip the data props from each existing component and feed it fixtures.

- **For:** no duplication; one component per screen; the smallest file count.
- **Against:** it destroys the dormant reference the human explicitly asked to
  keep, so it contradicts brief decision 2. The diff would touch all 5,528
  lines, and the later re-wiring would mean reading a reverted diff instead of
  a working file. Rejected on the brief.

### C. Inline the artboards in the route files, no component layer

Each route file carries its artboard's markup directly.

- **For:** maximal fidelity per screen, nothing to abstract, easiest to diff
  against the design file line by line.
- **Against:** `7e`/`7d`/`7c`/`4c` are four states of one screen and would
  duplicate their shared drawer and pane three times over in a single file; the
  same drawer recurs across routes. It also fights brief decision 6 — states
  that *move* want one component with local state, not four inline copies.
  Rejected on structure.

## Chosen design

### Architecture

Four route files change. Three schedule routes the design does not cover
(`new/single`, `[eventId]`, `single/[matchId]`) are **left exactly as they
are** — they are outside the brief, and touching them is scope growth.

| Route | Artboards | Change |
|---|---|---|
| `/dashboard/team/schedule` | `7e` `7d` `7c` `4c` | renders `StaticSchedule` |
| `/dashboard/team/schedule/new` | `3b` | renders `StaticEventChooser` |
| `/dashboard/team/schedule/new/dual` | `2c` `2b` `2d` `2e` | renders `StaticDualBuilder` |
| `/dashboard/team/schedule/new/tournament` | `3c` | renders `StaticTournamentBuilder` |

Each route stays a Server Component and **keeps its `getWorkspaceContext()`
call, its `redirect("/login")`, its `active.kind !== "team"` redirect and its
role gate**. Only the `getProgramSchedule()` data fetch goes. Dropping the
guards along with the data would turn a UI exercise into an access-control
regression, and "don't worry about the database" does not mean "don't worry
about who is looking".

### Components

New, under `src/components/dashboard/schedule/static/`:

| Component | Artboards | Notes |
|---|---|---|
| `static-schedule.tsx` | `7e` `7d` `7c` `4c` | Owns the 340px drawer + detail pane and the selection state. `7e` is the no-events branch; `7d` is events-but-no-selection; `7c`/`4c` are a selection at two heights — the same pane, not two components. |
| `event-drawer.tsx` | all four | Upcoming/Completed groups, "None yet" in the `7e` branch, drawer-footed **New event** CTA. |
| `dual-widget.tsx` | `4c` `7c` | The nine-line detail pane — six singles, three doubles, results, per-line report links. |
| `static-event-chooser.tsx` | `3b` | Two cards, selection state, footer bar (Cancel · "Dual selected" · Continue). |
| `static-dual-builder.tsx` | `2c` `2b` `2d` `2e` | Step state (`find-school` → `build`) and the add-opponent popup's two states. |
| `static-tournament-builder.tsx` | `3c` | Roster rail feeding entries; same master-detail shape as `2b`. |

Reused unchanged: `EventShell` (with `flush` for the master-detail bodies),
`advButton()` for the primary CTAs, and the `.eyebrow` / `.eyebrow-sm` /
`.text-body` / `.text-body-sm` / `.text-micro` / `.text-title-lg` / `.tabular` /
`.mono` type classes.

**Duplicate-tree mitigation:** a short `src/components/dashboard/schedule/README.md`
naming which tree the routes actually render, and a header comment on each
dormant entry point pointing at its `static/` replacement. This does not remove
the §3.5 hazard, it labels it; deleting the dormant tree is the only thing that
removes it, and the brief says not to.

### Data flow

One module, `src/lib/schedule/fixtures.ts`, exporting the design's own sample
content — Meridian State, Elena Vasquez, Ridgeline University, the 09-26 dual,
the 10-03→10-05 tournament, "3–1 in duals · 31 of 36 lines analyzed".

**The fixtures are typed against the existing `src/lib/schedule/types.ts`**
(`ScheduleRow`, `EventDetail`, `ProgramEvent`, `EventEntry`, `EntryMatch`,
`EventFormat`). This is the design's main concession to the future: when the
re-wiring happens, the change is swapping a fixture import for the loader call
that already returns those exact shapes — not rewriting every component's
props. Typing fixtures loosely would make the deferred work bigger than the
work being done now.

Selection and step state is `useState` in the client components. No fetch, no
server action, no mutation anywhere in the new tree.

### The guardrail seam this feature actually touches

`docs/ui-revamp-guardrails.md` §3.1 and §4: **`adScoring` is one of the five
fields the vision pipeline refuses a job without**, and the *event* owns it —
`dual-form.tsx:266` and `tournament-form.tsx:134-143` both encode format as
`"<bestOf>|<adScoring>"`. `tournament-form.tsx`'s header records what happened
the last time it went missing: format was `{}`, `adScoring` arrived null, and
every tournament video failed submission long after the coach had left.

The design keeps format visible — `2b` shows "Best of 3 sets · No-ad scoring",
`3c` shows "Bo3 · ad" — so **the fixtures must carry the same `"3|false"`-style
encoding the dormant forms use.** A static screen cannot corrupt a job, but a
fixture that invents its own format shape is how the re-wiring reintroduces a
bug this repo has already paid for once.

Nothing else in scope touches a seam. The schedule area is §3.5
"safe to redesign freely" territory: layout, copy, empty states.

### Error handling

There is nothing to fail: no fetch, no mutation, no async boundary in the new
tree. The four routes keep their existing `error.tsx`/`not-found.tsx`
neighbours untouched. The auth and workspace redirects above are the only
failure paths that remain, and they are unchanged.

### Testing

- **Existing specs stay green untouched.** `team-home-schedule-reads.spec.ts`
  and `weekend-dual-reads.spec.ts` exercise the *data layer*
  (`getProgramSchedule` and friends), which this run does not modify. The
  loaders simply stop being called by these four pages.
- **One new spec**, `tests/schedule-static-copy.spec.ts`: asserts each of the
  four routes renders its artboard's distinguishing copy verbatim — the
  strings are the fidelity contract, and copy drift is the failure mode a
  reviewer's eye misses. This is also the cheapest guard against a fixture
  being silently emptied.
- **`npm run map` is not needed** — no route is added or removed.
- Gates: `npx tsc --noEmit` clean, `npm run lint` no worse than the 43-warning
  baseline, `npm run build` green, `npm test` green.

## Open questions

**Resolved from the brief:**

- **5 — `--shadow-card` is not missing.** The brief called it "the sole missing
  token"; that was wrong. It is declared at `src/app/globals.css:63`
  (`0px 2px 8px 0px rgba(0,0,0,0.06)`), and `effects.css:6` deliberately does
  not redefine it. My stage-01 grep covered only `src/styles/design-system/`.
  **Every token and utility class the design uses already exists** — nothing to
  add. (Left standing in the brief per the pipeline's no-upstream-edits rule.)

**Carried forward:**

- **4 — role variants, still open.** The design file has no player-facing
  frame, and the human answered "maybe". The recommendation is to **keep the
  existing `isProgramStaff` gate exactly as it is** on the create routes — a
  player must not reach a builder — and to render the coach design for staff.
  What a player sees at `/dashboard/team/schedule` is genuinely undesigned:
  the honest options are to leave today's player empty state alone as the one
  surviving piece of the abandoned run, or to have the human get a player frame
  designed. **This wants an answer before stage 03**, because it decides
  whether `static-schedule.tsx` takes a `canCreate` prop at all.
- **New — the drawer's report links.** `4c` gives every resolved line "a path
  to each report". Those paths lead to `matches/[matchId]`, which is outside
  this run and still DB-backed. Per the brief's "no external page linking" they
  should be inert, but that makes `4c`'s central promise non-functional.
  Recommendation: render them as real links to the existing route and let them
  404 on fixture ids, rather than as dead text — the design's structure stays
  honest and the re-wiring is nothing.

## Also consulted

Beyond the declared inputs (`../01_brief/output/brief.md`, `MAP.md`,
`docs/ui-revamp-guardrails.md`, `.skills/advantage-analytics-design/SKILL.md`;
`references/` was empty):

- `Events & Lineups.dc.html` — the subject; re-read for artboard structure,
  chrome dimensions and the `3b` markup.
- `src/app/dashboard/layout.tsx`, `src/components/dashboard/dashboard-shell.tsx`,
  `src/app/dashboard/header.tsx` — to establish that the artboards' chrome
  already exists (`getStaticBreadcrumbs`, `h-11` header).
- `src/components/dashboard/schedule/event-shell.tsx` — reusable frame; its own
  comment names 2b.
- `src/components/dashboard/schedule/{dual-form,tournament-form}.tsx` — to
  locate the `adScoring` encoding and the recorded regression.
- `src/lib/schedule/types.ts`, `src/lib/schedule/actions.ts` — fixture typing
  targets and the write surface being dropped.
- `src/styles/design-system/{colors,typography,spacing,effects}.css` and
  `src/app/globals.css` — token and class verification, including the
  `--shadow-card` correction.
- `tests/` listing — to identify which specs touch this area.
