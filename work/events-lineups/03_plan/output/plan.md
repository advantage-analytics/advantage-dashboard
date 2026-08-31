# Plan — events-lineups

Eleven steps. Each is sized for one fresh subagent context: **one surface per
step**, and no step reads more than one artboard's worth of the design file.

## Decisions taken at this stage

Stage 02 carried two questions forward. Both were put to the human on
2026-08-31 and answered:

- **Role variants (design Q4) → `canCreate` prop.** `static-schedule.tsx`
  takes `canCreate`; a player gets the same coach artboard minus the
  drawer-footed **New event** CTA — exactly what the route does today. No
  undesigned player surface is invented, and no player loses the page. The
  `isProgramStaff` gate on the three create routes is unchanged.
- **`4c` report links → real links, 404 on fixture ids.** Each resolved line
  renders `<Link href={`/dashboard/matches/${matchId}`}>` against its fixture
  id. Hover and focus states are real, the design's structure stays honest,
  and the later re-wiring is a no-op. Clicking one lands on the existing
  not-found; that is accepted and goes in the PR note (step 11).

## Rules that bind every build step

These are stated once here rather than repeated in eleven step bodies.

1. **Read `docs/ui-revamp-guardrails.md` first.** Repo convention for any
   dashboard UI change. The schedule area is §3.5 "safe to redesign freely";
   the one live seam is `adScoring`, handled in step 1.
2. **Read only your own artboard.** `Events & Lineups.dc.html` lives in the
   Claude Design project `afde9116-328b-445c-aeff-8b3c2a702d6f`, read via the
   claude_design MCP. A step reads the frames named in its own row and no
   others — reading all ten is what blows the context.
3. **Copy is verbatim, including typographic characters** — curly quotes, en
   and em dashes, `·` separators. The brief makes the design authoritative
   where it disagrees with the current app.
4. **Copy that is factually false about the app gets flagged, not fixed.**
   Reproduce it as drawn, and note it in the step's report for the human.
   Silently "correcting" the design is the divergence the brief forbids;
   silently shipping a false claim is the thing the human has objected to
   before. Flagging satisfies both.
5. **No database.** No Supabase import, no server action, no `await` on a
   loader anywhere under `static/`. Fixtures only.
6. **Routes keep their guards.** Every re-pointed route keeps
   `getWorkspaceContext()`, `redirect("/login")`, the `active.kind !== "team"`
   redirect and its role gate. Only the data fetch and its imports go.
7. **Tokens: nothing to add.** `--shadow-card` is declared at
   `src/app/globals.css:63` (the brief's "sole missing token" was wrong; stage
   02 corrected it). Every token and utility class the design uses exists.
8. **`advButton()`** from `src/lib/ui/adv-button.ts` for primary CTAs; Lucide
   icons only, stroke width 1.5.
9. **Desktop only.** 1280px is the target. Narrow viewports need only not
   break.

---

## Step 1 — Fixtures module

**Files:** create `src/lib/schedule/fixtures.ts`

**Change.** One module exporting the design's own sample content: Meridian
State, Elena Vasquez, Ridgeline University, the 09-26 dual, the 10-03→10-05
tournament, `"3–1 in duals · 31 of 36 lines analyzed"`, and the nine dual
lines (six singles, three doubles) with results for `4c`.

Everything is typed against the **existing** `src/lib/schedule/types.ts` —
`ScheduleRow`, `EventDetail`, `ProgramEvent`, `EventEntry`, `EntryMatch`,
`EventFormat`. No new shapes, no `as` casts, no structural widening. This is
the whole concession to the deferred re-wiring: swapping a fixture import for
the loader call that already returns these shapes must not mean rewriting
props.

**The one live seam.** `EventFormat.adScoring` is `boolean | null`, and null
is a real state — the vision pipeline refuses a job without it, and
`tournament-form.tsx`'s header records the outage that followed the last time
it went missing. Fixtures carry `{ bestOf: 3, adScoring: false }` objects.
The `"3|false"` string is the *form control's* value encoding used by the
dormant forms; step 6's format selector reproduces that encoding, and it must
match, but it is not the fixture type.

**Verification.** `npx tsc --noEmit` clean with no casts in the file; a grep
confirms no `adScoring` field is omitted or defaulted to `false` where the
design shows a format the fixture cannot know.

**Depends on:** nothing. Blocks steps 2–8.

---

## Step 2 — `3b`, the event-type chooser

**Artboard:** `3b` (1280×840)

**Files:** create `src/components/dashboard/schedule/static/static-event-chooser.tsx`;
edit `src/app/dashboard/team/schedule/new/page.tsx`

**Change.** Two cards — dual vs tournament — each stating what it creates, with
the one-off-matches line pointing at Matches. Selection is `useState`. Footer
bar: Cancel · "Dual selected" · Continue, inside `EventShell`'s `footer` slot.
The route drops its `NewEventChooser` import and renders the static component;
it reads nothing today, so only the import line changes below the guards.

This step goes first among the components because it is the smallest complete
artboard and it proves the pattern the other three routes follow.

**Verification.** Dev server, Browser pane at 1280px, `/dashboard/team/schedule/new`
screenshotted and compared side by side against `3b`: spacing, type scale and
weight, colour, radii, borders, icon choice, grid. Copy diffed character for
character. `npx tsc --noEmit` clean.

**Depends on:** step 1.

---

## Step 3 — `7e` and `7d`, the schedule shell and drawer

**Artboards:** `7e` (1280×620), `7d` (1280×620)

**Files:** create `static/static-schedule.tsx` and `static/event-drawer.tsx`;
edit `src/app/dashboard/team/schedule/page.tsx`

**Change.** `static-schedule.tsx` owns the 340px drawer + detail pane split and
the selection state, and takes `canCreate` (per the decision above).
`event-drawer.tsx` renders the Upcoming/Completed groups, the "None yet"
reading in the `7e` branch, and the drawer-footed **New event** CTA — which
renders only when `canCreate`.

Two of the four schedule states land here: `7e` is the no-events branch (empty
state over its nine-line scaffold), `7d` is events-but-nothing-selected (the
pane prompts and carries the season facts). The selected states are step 4;
this step's pane renders the `7d` prompt for every selection until then.

The route drops `getProgramSchedule`, `scheduleRowsFrom`, `eventDetailFrom`
and the `details` map it builds, keeps its guards, and keeps
`canCreate={isProgramStaff(active)}`. `canAddOwnMatch` goes unless the design
draws its control — check `7d`/`7e` before deleting it, and say which.

**Verification.** Both branches reachable — a fixture flag or two exported
fixture sets, whichever the component reads more plainly — and each
screenshotted at 1280px against its artboard. Confirm the sidebar and 44px
topbar render **once**: the artboards draw the app's chrome for context, and
reproducing it is the failure mode this architecture exists to avoid.

**Depends on:** step 1.

---

## Step 4 — `7c` and `4c`, the dual widget

**Artboards:** `7c` (1280×620), `4c` (1280×860)

**Files:** create `static/dual-widget.tsx`; edit `static/static-schedule.tsx`
(pane wiring only)

**Change.** The nine-line detail pane — six singles, three doubles, results,
and a per-line report link. `7c` and `4c` are **the same pane at two heights**,
not two components: `7c` is the scoped detail header with its inset hairlines
in a 620px frame, `4c` is that same chrome at full height with all nine lines
resolved. Whatever differs between them is height-driven, and if something
turns out not to be, that is a finding for the human, not a second component.

Report links are real `next/link` hrefs to `/dashboard/matches/${id}` on
fixture ids, per the decision above.

`static-schedule.tsx` changes only where the `7d` prompt was: a selection now
renders `dual-widget`.

**Verification.** Select the dual in the drawer; screenshot at both frame
heights against `7c` and `4c`. Walk `7d → 7c → 4c` as one moving selection and
confirm they read as states of one thing (success criterion 5). Hover and
focus a report link and confirm the affordance matches the design.

**Depends on:** step 3.

---

## Step 5 — `2c`, find the school

**Artboard:** `2c` (1280×900)

**Files:** create `static/static-dual-builder.tsx` and
`static/dual-school-step.tsx`; edit `src/app/dashboard/team/schedule/new/dual/page.tsx`

**Change.** `static-dual-builder.tsx` is the shell: it owns the step state
(`"find-school" → "build"`) and nothing else, so steps 6 and 7 extend it
without re-reading it whole. `dual-school-step.tsx` is `2c` — conference first,
then all programs, then free text.

The route drops all four parallel loaders (`getLadder`, `getTeamSettings`,
`getConferenceTable`, `getProgramSchedule`), the `toDirectoryRow` helper,
`opponentDualHistory`, `divisionLabel` and the whole `DualForm` prop wall,
keeping its guards. This is the largest single deletion in the run.

The build step is a placeholder until step 6 — choosing a school advances the
step state to a stub. Say so in the step report so the reviewer does not read
the stub as the finished screen.

**Verification.** `/dashboard/team/schedule/new/dual` screenshotted at 1280px
against `2c`. `npx tsc --noEmit` clean — confirm the dropped loaders left no
unused import behind, which is where the lint baseline usually moves.

**Depends on:** step 1.

---

## Step 6 — `2b`, the master-detail builder

**Artboard:** `2b` (1280×900)

**Files:** create `static/dual-build-step.tsx`; edit
`static/static-dual-builder.tsx` (replace the stub)

**Change.** Step two: conference rail on the left, date / site / format / nine
lines on the right, inside `EventShell` with `flush` — the prop that exists for
this artboard by name. Format renders as the design draws it
("Best of 3 sets · No-ad scoring"), and its control's value encoding matches
the dormant `dual-form.tsx:266` `"<bestOf>|<adScoring>"` shape (step 1).

The opponent cells are inert here; their popup is step 7.

**Verification.** Advance from `2c` to this step and screenshot at 1280px
against `2b`. Confirm the master-detail body scrolls as two panes edge to edge
and not as one padded column — `flush` is the difference and it is easy to
miss.

**Depends on:** step 5.

---

## Step 7 — `2d` and `2e`, the add-opponent popup

**Artboards:** `2d` (1280×900), `2e` (1280×900)

**Files:** create `static/opponent-popup.tsx`; edit
`static/dual-build-step.tsx` (opponent cell wiring only)

**Change.** One popup with two states — `2d` is "similar saved name found",
`2e` is "name saved, line resolved". Per brief decision 6 these are one
component whose local state moves, not two screens. Saving in `2e` resolves the
line in the row behind the popup; that resolution is part of this step.

**Verification.** Open the popup, screenshot `2d`, take the save action,
screenshot `2e`, and confirm the transition reads as one thing (success
criterion 5). Confirm the row behind updates.

**Depends on:** step 6.

---

## Step 8 — `3c`, the tournament builder

**Artboard:** `3c` (1280×900)

**Files:** create `static/static-tournament-builder.tsx`; edit
`src/app/dashboard/team/schedule/new/tournament/page.tsx`

**Change.** Roster rail on the left feeding entries on the right — the same
master-detail shape as `2b`, in `EventShell` with `flush`. No lineup and no
matches until played, as the artboard states. Format renders "Bo3 · ad" and
carries the same encoding as step 6.

Route drops `getLadder` and `getTeamSettings`, keeps its guards.

**Verification.** `/dashboard/team/schedule/new/tournament` screenshotted at
1280px against `3c`. Confirm the two master-detail screens (`2b`, `3c`) share
their structure rather than having drifted apart.

**Depends on:** step 1. Independent of steps 5–7 — may run in parallel with
them if the branch is worked concurrently.

---

## Step 9 — Label the dormant tree

**Files:** create `src/components/dashboard/schedule/README.md`; edit the
header comment of `schedule-list.tsx`, `new-event-chooser.tsx`,
`dual-form.tsx`, `school-search.tsx`, `tournament-form.tsx`,
`event-detail-pane.tsx`, `dual-detail.tsx`, `opponent-name-cell.tsx`

**Change.** The README names which tree the routes actually render; each
dormant entry point gets a header line pointing at its `static/` replacement
and saying it is dormant, not dead. Comments only — **no logic changes in any
dormant file.**

This does not remove the `docs/ui-revamp-guardrails.md` §3.5 hazard (a dead
near-duplicate beside working code is how the wrong one gets edited later). It
labels it. Only deleting the dormant tree removes it, and the brief says not to.

**Verification.** `git diff --stat` shows comment-only changes in the eight
dormant files. `npx tsc --noEmit` clean.

**Depends on:** steps 2, 3, 5, 8 — the routes must actually be re-pointed
before a README can claim they are.

---

## Step 10 — The copy-fidelity spec

**Files:** create `tests/schedule-static-copy.spec.ts`

**Change.** Assert each of the four routes renders its artboard's
distinguishing copy **verbatim**, typographic characters included. The strings
are the fidelity contract, and copy drift is precisely the failure a
reviewer's eye slides over. It is also the cheapest guard against a fixture
being silently emptied.

Assert on the characters the design actually uses — the en dash in `3–1`, the
`·` separators, curly quotes — not on normalized ASCII, or the spec passes
against the drift it exists to catch.

**Verification.** `npm test` green. Then mutate one fixture string by a single
character locally and confirm the spec fails; revert. A copy spec that cannot
fail is not a copy spec.

**Depends on:** steps 2, 3, 4, 5, 6, 7, 8.

---

## Step 11 — Gates, full-set fidelity pass, and the regression note

**Files:** no source changes expected; `work/events-lineups/` notes only

**Change.** The whole-set pass that no single step can do:

1. All ten artboards side by side at 1280px in one sitting — the check for
   drift *between* screens, which per-step checks cannot see.
2. Both stateful sequences walked end to end: `2d → 2e`, and `7d → 7c → 4c`.
3. Confirm no screen issues a query or mutation — grep the `static/` tree and
   the four route files for `supabase`, `getProgram`, `getLadder`,
   `"use server"`.
4. Confirm a player (`canCreate` false) sees the schedule without the New
   event CTA, and that the three create routes still redirect them.
5. **Write the regression note for the PR**, plainly: which working, DB-wired
   behaviour these four routes lost, that the dormant components are retained
   for the re-wiring, and that `4c`'s report links 404 on fixture ids. Brief
   constraint 1 and success criterion 7 — the deliberate loss of function must
   never ship looking like nothing regressed.
6. Collect anything flagged under rule 4 (design copy that is false about the
   app) into one list for the human.

**Verification.** `npx tsc --noEmit` clean · `npm run lint` at or under the
43-warning baseline · `npm run build` green · `npm test` green.

**Depends on:** steps 1–10.

---

## Order dependencies

```
1 ──┬─→ 2 ──────────────────────────┐
    ├─→ 3 ──→ 4 ───────────────────┤
    ├─→ 5 ──→ 6 ──→ 7 ─────────────┼─→ 10 ──→ 11
    └─→ 8 ──────────────────────────┤
              (2,3,5,8) ──→ 9 ──────┘
```

Steps 2, 3, 5 and 8 are mutually independent once step 1 lands — one route
each. Steps 4, 6 and 7 are strictly sequential behind their own route.

## Test strategy

**What already exists stays untouched.** `team-home-schedule-reads.spec.ts` and
`weekend-dual-reads.spec.ts` exercise the data layer (`getProgramSchedule` and
friends), which this run does not modify. Those loaders simply stop being
called by these four pages; the specs must stay green **without edits**, and a
step that needs to change one has broken something it was not asked to touch.

**One new spec**, step 10, guarding copy fidelity — the contract of this run.

**The primary verification is visual and per-step**, not automated: a
screenshot at 1280px against the artboard, at the step that built it, while the
design detail is still in that subagent's context. A fidelity sweep deferred to
the end is a fidelity sweep done from memory. Step 11 adds only the checks that
are genuinely cross-screen.

**`npm run map` is not needed** — no route is added or removed.

**Gates at step 11, and after any step that changed a route file:**
`npx tsc --noEmit` clean · `npm run lint` no worse than the 43-warning baseline
· `npm run build` green · `npm test` green.

## Also consulted

Beyond the declared inputs (`../02_design/output/design.md`,
`../01_brief/output/brief.md`; `references/` was empty):

- `src/app/dashboard/team/schedule/{page,new/page,new/dual/page,new/tournament/page}.tsx`
  — to state exactly what each re-pointed route drops and keeps.
- `src/lib/schedule/types.ts` — to confirm the fixture typing targets and that
  `EventFormat.adScoring` is `boolean | null`.
- `src/components/dashboard/schedule/event-shell.tsx` — to confirm the `flush`
  prop and what it changes.
- `src/components/dashboard/schedule/` (file listing and line counts) and
  `src/lib/schedule/` — to size the steps and confirm `fixtures.ts` and
  `static/` do not already exist.
- `src/app/globals.css`, `src/styles/design-system/effects.css` — to confirm
  stage 02's `--shadow-card` correction at `globals.css:63`.
- `tests/` listing — to confirm which specs touch this area.
