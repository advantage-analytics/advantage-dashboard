# Events & Lineups — the schedule area is now static, and that is a regression

**Four routes that read the database now read a fixture file.**
`/dashboard/team/schedule`, `/dashboard/team/schedule/new`,
`/dashboard/team/schedule/new/dual` and `/dashboard/team/schedule/new/tournament`
no longer fetch anything. A coach opening the schedule sees Ridgeline University
and Fairmont A&M whatever program they are actually in; "Create dual" and
"Create tournament" are inert; the four routes cannot show a real team's events
or make a new one.

This was chosen, not stumbled into. The brief's constraint 1 says it plainly —
*replacing working, DB-wired UI with static UI is a deliberate loss of function,
chosen by the human on 2026-08-31 with the cost stated* — and open question 1
records the accepted consequence: **those routes stop working for real teams
until the later re-wiring.** What follows is the specific bill.

Across the four route files: **72 insertions, 125 deletions.** Everything else
in the diff is additive — a new `static/` component tree, a fixtures module, a
copy-fidelity spec and a README.

---

## 1 · What each route lost

### `/dashboard/team/schedule`

Gone: `getProgramSchedule()` — the single read the whole page was built on —
plus `scheduleRowsFrom()`, `eventDetailFrom()` and the per-event `details` map
that let the detail pane swap with no round-trip. Also `teamLabel()` and the
`"<program> · <squad>"` eyebrow. The body is `StaticSchedule` over
`POPULATED_SCHEDULE`; `ScheduleList` and `EventDetailPane` are dormant.

Behaviour lost beyond the data:

- **Grouping is no longer a date question.** `ScheduleList` split Upcoming from
  Completed against today's date. The static drawer splits on `playedCount`,
  because the fixture calendar is pinned to September 2025 so `formatEventDay()`
  reproduces the drawn weekday strings — against a live clock every row would
  file under Completed and the artboard would be unreproducible.
- **The drawer's rows are no longer links.** They were
  `/dashboard/team/schedule/[eventId]`; they are now `role="option"` buttons
  moving local state. The drawer subtree contains zero `<a>` and zero `[href]`.
- **The detail pane's own links went with it** — `[eventId]` and
  `/dashboard/matches/[id]` from `EventDetailPane`.
- **The day-zero pane's "One-off match in Matches" is an inert `<span>`.** The
  DB-wired empty state linked it to `/dashboard/matches/new`.

### `/dashboard/team/schedule/new`

The smallest change: one import and one `return`. This route never fetched.
`NewEventChooser` → `StaticEventChooser`. Onward routing to the two builders is
retained. What is lost is the aside link: the dormant chooser offered
"Add a single match" pointing at `/dashboard/team/schedule/new/single`; the
artboard's own anchor is the placeholder `href="#3b"` labelled "Add it in
Matches", so the static screen renders it as an inert `<span>`. That is a
deliberate fidelity call — see §5, item 1 — and it means the chooser no longer
offers a third path anywhere.

### `/dashboard/team/schedule/new/dual`

The largest single deletion in the run. Gone: **four parallel loaders** —
`getLadder`, `getTeamSettings`, `getConferenceTable`, `getProgramSchedule` —
plus `opponentDualHistory()` over the last of them, `divisionLabel()`, the
`self` lookup out of the conference table, the local `toDirectoryRow()` helper,
and the entire `DualForm` prop wall (`ourName`, `ourTeam`, `ladder`,
`defaultSurface`, `ourConference`, `ourDivision`, `ourProgramKey`,
`conferencePrograms`, `historyEntries`).

With them go: the real conference table and the `/api/programs/search`
directory, the real ladder seeding a lineup, head-to-head sublines computed from
the program's own matches, and the **`createDual` server action** and its push
to the created event. Step one now offers five fixture schools, step two is
always Ridgeline (the artboard draws exactly one path), and "Create dual" writes
nothing.

### `/dashboard/team/schedule/new/tournament`

Gone: `getLadder` and `getTeamSettings` in a `Promise.all`, `TournamentForm`'s
`roster` and `defaultSurface` props, and the **`createTournament` action**.
The roster rail is a fixture; "Create tournament" writes nothing.

One loss here is design-driven rather than fetch-driven: **the Surface cell is
gone**, because `3c` draws Name / Starts / Ends / Site / Format and no surface
or host field. The dormant `tournament-form.tsx` deliberately added one so an
event could not be created without it. This was checked against the video
pipeline and is *not* a submission hazard — `job-request.ts` never asks for
surface; a null surface degrades a statistics grouping (`statistics-server.ts`
already falls back to "Unknown"). It is still a field the create flow used to
capture and no longer does.

---

## 2 · What did **not** change

**Every guard is byte-identical.** `getWorkspaceContext()`, the `/login`
redirect, the `active.kind !== "team"` redirect, and `isProgramStaff(active)`
on all three create routes. This change dropped data, not access control, and
the three create-route redirects were re-read directly at T11 to confirm it.

Both permission answers on the schedule page still come from the live
workspace, never from the fixtures: `isProgramStaff` gates the drawer's
"New event" CTA and `canUploadForProgram` gates the one-off-match affordance —
the same rule the DB-wired empty state applied.

**Three schedule routes were deliberately left out of scope at stage 02 and
still render DB-wired components:** `[eventId]` (`dual-detail.tsx`,
`tournament-detail.tsx`), `single/[matchId]` (`single-detail.tsx`) and
`new/single` (the matches wizard). The schedule area did not go static as a
whole — half of it did. `dual-detail.tsx` in particular is **fully live**, even
though `static/dual-widget.tsx` draws the same `7c`/`4c` artboards: editing the
static one will not change the event page.

---

## 3 · What was gained

- **Ten artboards rebuilt at 1280px fidelity** (`7e 3b 2c 2b 2d 2e 3c 7d 7c 4c`),
  each gated screen-by-screen against the design capture, then swept once more
  cross-screen in `FIDELITY-PASS.md`.
- **A 17-test copy-fidelity spec**, `tests/schedule-static-copy.spec.ts`. The
  expected strings are hand-transcribed from the artboard capture, so no
  assertion compares the code to itself — every one has app code on one side and
  an independent transcription on the other. Suite is now 244.
- **A README that maps the two trees**,
  [`src/components/dashboard/schedule/README.md`](../../src/components/dashboard/schedule/README.md),
  written against a reachability walk rather than by inspection.
- **Fixtures typed against the existing `src/lib/schedule/types.ts`**, composing
  its shapes rather than redeclaring them, so the re-wiring is a swapped import
  and not rewritten props.

---

## 4 · Deliberately unfinished — read before re-wiring

**The dormant tree is retained on purpose.** It is not a discard pile: it is the
half that still knows about the database — `createDual`/`createTournament`,
roster matching and name splitting, the opponent-player contribution and its
re-target `key` contract, and the `"<bestOf>|<adScoring>"` format encoding that
`docs/ui-revamp-guardrails.md` §3.1/§4 govern. Nine files are dormant. Two more,
`lineup-editor.tsx` and `opponent-name-cell.tsx`, are **partly dormant**:
unreachable at runtime but undeletable, because live files (`fixtures.ts`,
`static/dual-build-step.tsx`) `import type` from them and an import is not a
renderer. `dual-detail.tsx` is fully live. The README is the authority on that
partition — read it rather than a paraphrase of it, and do not treat "has a
static counterpart" as evidence a file is dead.

The README says of itself that it *labels* the §3.5 near-duplicate hazard and
does not remove it. Only deleting the dormant tree would, and this run was told
not to.

**`4c`'s per-line report links 404.** Each resolved line renders a real
`<Link href={"/dashboard/matches/" + id}>` against a fixture id, so clicking one
lands on the existing not-found page. **This was chosen at stage 03**, over
inert links, so that the design's structure stays honest, hover and focus states
are real, and the later re-wiring is a no-op rather than a rewrite. It is a
known broken link, not an oversight.

Three more things the re-wiring must not inherit blindly:

- **`dual-widget.tsx`'s `SINGLES_MARKS`/`DOUBLES_MARKS` are transcribed
  constants, not derived.** Point this component at live data without
  re-deriving them and every dual a coach opens renders the same
  `good bad good good good grey` rail with correct rows beneath it and nothing
  looking broken. The file's header carries an explicit exception saying so; two
  separate tasks flagged it.
- **`DUAL_DRAFT_SCHOOL` pins step two to Ridgeline.** Once a real dual is built
  the school genuinely travels; re-pointing the loaders without re-threading it
  would pin every new dual to Ridgeline.
- **`N6` — a gating asymmetry, guards intact.** With `canCreate={false}`, the
  day-zero pane still draws "New dual" and "New tournament" links to routes that
  bounce a player. The redirects hold, so this is a UX inconsistency and not an
  access-control hole, but it wants a decision. `N5` is smaller and adjacent:
  Cancel is a `<Link>` on three create screens and a `<button>` + `router.push`
  on `3b`, so middle-click and copy-link behave differently there.

**`7c` as drawn is a state the build cannot produce.** `FIDELITY-PASS.md`'s N8
corrects this run's own record: at the artboard's 620px frame the nine rows
*fit* — scrollHeight 513 against clientHeight 481, roughly 30px to spare — so
`7c`'s stop after S1–S3 is whitespace in the artboard, not height clipping. The
upheld interpretation (`7c` and `4c` are one pane at two heights) stands; the
rationale recorded for it was wrong arithmetic and should not be quoted as fact.
Worth telling the designer: the frame implies a clip the real content does not
produce.

---

## 5 · Design copy reproduced as drawn, and flagged

The run's standing rule was **reproduce and report** — where a design contradicts
itself or says something untrue of this app, the build draws it anyway and
records it. (One task tried to correct a contradiction instead and was blocked
for it; the same contradiction is item 10 below.) So every string here is
**still in the code, unchanged**. Nothing was quietly fixed.

**50 items across ten artboards.** Tags: **F** — false about the app;
**C** — the design contradicts itself; **U** — asserts a figure this app has no
source for; **D** — drifts between screens.

### `3b` — event chooser
1. **F** — "Add it in Matches" names a destination a team workspace's sidebar
   does not expose; a coach cannot navigate there from the rail. (The dormant
   chooser had silently reworded it to "Add a single match"; that rewording is
   the divergence, and the design wins.)
2. **D** — "Creates 9 lines" sets its numeral in Roboto Mono, which the design
   system reserves for timestamps, quotas and ids; `2b` and `3c` set the same
   sentence's numeral in Inter.

### `7d` / `7e` — schedule shell and drawer
3. **C** — the topbar count line: "6 events · 2 upcoming" (`7d`/`7c`), "…· 4
   completed" (`4c`), "0 events · nothing scheduled for 2026–27" (`7e`). Six
   events are not derivable from the four rows drawn, and the three spellings
   disagree. **This one is not in any rendered output** — it has nowhere to
   live, so T3 left it unrendered; it survives only in comments and fixture docs.
4. **U** — `SEASON_FACTS`: "3–1 in duals · 31 of 36 lines analyzed". The loss
   belongs to a fourth dual no artboard names, and 36 lines implies four
   completed duals; `7d`'s own season marks draw three, all wins.
5. **F** — "8 of 9 lines analyzed" for Fairmont. Three of nine lines are
   doubles, which the vendor cannot analyze at all; `4c`'s own pane supports at
   most 5 (5 ready + 1 analyzing + 3 refused).
6. **C** — "in 4 days" is a clock claim the frozen fixtures cannot produce.
7. **C** — the season label "2026–27" against dates that land on their drawn
   weekdays only in 2025.
8. **C** — "Pick a dual or tournament on the left" while the drawer draws four
   duals and no tournament.
9. **C** — `7d` calls the Ridgeline event "lineup not set" while `2b` draws nine
   lines for that same event before it is created.

### `7c` / `4c` — dual widget
10. **C** — the header rails grey S6 and D3 (reading 4–1) while the rows beneath
    draw S6 a loss and D3 a win and the header reads 5–2. Reproduced as
    constants; see §4 for the trap this leaves.
11. **F** — "Coming soon" on the three doubles lines promises analysis that does
    not exist and is not planned: `supportsVideo()` refuses doubles and
    `job-request.ts` rejects a doubles `match_type` outright.
12. **D** — name drift against `3c`/`2b`: `4c` draws "L. Moreau" at S4,
    "S. Tanaka" at S5 and "K. Sato" at S6, where the other two put "Sam Tanaka"
    at S4, "Jules Moreau" at S5 and "Lena Adeyemi" at S6. One swap
    (Moreau↔Tanaka) plus a substitution; no Sato exists anywhere else.
13. **D** — the pane footer counts the same nine things as "**matches**" where
    `7d`, `7e` and `2b` call them "lines". One concept, two nouns, one click
    apart.
14. **D** — slot labels S1–D3 render in plain Inter here and in mono on
    `2b`/`7e`.
15. **C** — `7c` draws S1–S3, the footer, then whitespace; nine rows actually
    fit that frame (see §4, N8).

### `2c` — find the school
16. **U** — every row asserts the opponent's own season record ("18–4",
    "11–10", "14–7", "9–12", "16–5"). That figure **does not exist anywhere in
    this app**; `opponent-history.ts`'s own header says so, and the dormant
    `SchoolSearch` deliberately omits the slot.
17. **C** — the "Big Ten" pill is drawn active, with "Clear" present, while the
    list below shows Coastal, Mountain West and D-III rows.
18. **F** — "Region ⌄" filters a column that does not exist: `programs` has
    `state`, `division` and `conference`, and no way to derive a region.
19. **F** — "5 of 1,940" is a total `/api/programs/search` cannot return — it
    answers with a capped 8-row page and no count, which is why the dormant
    component says "5 listed".
20. **D** — the last-played column is MM-DD where the app's `formatLastPlayed()`
    renders "12 Apr".
21. **C** — one row's subline carries a division where the other four carry a
    conference.
22. **C** — the free-text row uses straight ASCII quotes where the design's own
    prose uses typographic ones.
23. — the search field is drawn, not wired: the artboard renders a `<span>` and
    a caret rule, not an `<input>`, and there is no directory behind a second
    search term.

### `2b` — dual builder
24. **C** — the lineup contradicts itself: S6 reads "— no available player" and
    is forfeited while D3 pairs "Moreau / **Adeyemi**". Adeyemi is available for
    doubles and not for singles, so any real `seedLineup()` must contradict one
    half of the drawing.
25. **C** — "pairs carried from singles" is false of its own rows; D3's Adeyemi
    appears in no singles line.
26. **C** — doubles use surnames where singles use full names.
27. **F** — "Big Ten · D-I" reverses the app's own `programSubtitle()` order,
    which four claim-flow call sites depend on.
28. — the Forfeit control is an invisible target: `opacity:0` with the hover
    reveal on the span itself, not the row, so it appears only once the pointer
    is already over something unseeable.
29. **U** — the rail's history figures have no source: "you lead 3–1" over
    Fairmont implies four decided duals where the fixtures hold one.
30. **D** — the rail's six Big Ten schools do not match `2c`'s conference
    section and omit Ridgemont Tech, which `2c` lists.
31. **C** — `lastPlayedOn` is unset on four rail rows with decided duals,
    because the rail draws no last-played cell.
32. — `2c` offers five selectable schools and all five land on the same
    Ridgeline step two. That is the one-path artboard reproduced faithfully; the
    design never drew what picking a non-Ridgeline row does.

### `2d` / `2e` — add-opponent popup
33. **F** — `2e`'s toast is false on the path `2e` itself draws: it resolves the
    line to a name the roster **already held** and still says "Saved to Ridgeline
    University roster". Picking an existing name saves nothing. The dormant
    `opponent-name-cell.tsx` splits these into two sentences and toasts the save
    one only after the server confirms a write.
34. **D** — the school's name is inconsistent within the pair: `2d` writes
    "Ridgeline" twice, `2e` writes "Ridgeline University".
35. **C** — `2e` drops a rail row that `2d` lists. Saving a name cannot remove a
    school from the rail, so this is a drawing artefact; the rail was left as
    built.
36. — the toast's own 236px width does not fit its own string at 12px; the
    artboard's CSS produces the same wrap.
37. — `top: calc(100% + 8px)` with no flip clips the popup on the lower rows.
38. **C** — `2d`/`2e` draw Forfeit plainly where `2b` draws it `opacity:0`, and
    give resting rows an empty cell and no hover where `2b` gives them a
    hover-revealed one. Read as active-vs-resting and upheld; both cannot be
    satisfied at once.
39. — `2d`/`2e` draw only S1–S3 and no field row: a truncated draw, not a
    statement about the screen.
40. — the 1px blue bar beside the typed text is a caret a static capture cannot
    render; reproduced as `caret-color: var(--blue)`, the one place markup was
    read as a stand-in rather than a literal.

### `3c` — tournament builder
41. **F** — the big one. The info callout reads "3 Big Ten programs are in this
    field — matches against them count toward conference seeding." Nothing in
    this app records which programs attend a tournament, and nothing models
    conference seeding. `tournament-form.tsx`'s own header says such a callout
    "is not built, and should not be" — a hardcoded one would be a confident lie
    about a field nobody entered. Drawn verbatim anyway.
42. — no Surface and no Hosted-by cell (see §1; checked and not a pipeline
    hazard).
43. **C** — dates are drawn year-less (`10-03`, `10-05`) while `startsOn` /
    `endsOn` are YYYY-MM-DD and the dormant form uses `<input type="date">`,
    which cannot render a year-less value.
44. — no doubles section and no typed-name path, so there is no way to enter a
    walk-on, guest or unrostered recruit — a capability `entry-editor.tsx` calls
    out as necessary.
45. — no draw or seed editing: a re-added player returns as Main draw /
    Unseeded with no way back to "Qualifying".
46. **D** — "Bo3 · ad" is the artboard's shorthand, not the app's label for that
    value ("Best of 3 · ad" in both dormant `FORMATS` tables). The label
    diverges; the encoded value does not.
47. — Site and Format draw chevrons but state one value each; rendered as
    one-option selects rather than inventing options the design never wrote.
48. **C** — every rail row asserts a ladder number, though
    `LadderPlayer.ladderPosition` is nullable and renders "Unranked".
49. — the name field carries a 2px blue focus rule on non-focusable text.

### Across the set
50. **D** — two selected-row grammars on four master–detail surfaces: a
    `--surface-muted` wash + weight in the schedule drawer and on `2c`, a blue
    check + weight and no wash on `2b`/`3c`'s rails. The split may be semantic
    ("what you are looking at" vs "what is committed") but nothing records that
    reading, and the re-wiring will have to pick one for any surface the design
    never drew selected.

Two smaller notes that belong with the list. `--blue` on white at 11px fails
WCAG 1.4.3 AA (3.68:1) wherever the design states it — three separate screens
raised it, and it wants one design-system decision rather than another per-task
note. And two empty-state strings are **invented**, not drawn, because no
artboard covers the state: `3c`'s "Nobody yet — add players from the roster."
and its rail's "No player by that name."

---

## 6 · Gates at HEAD

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, **37 warnings** |
| `npm run build` | green |
| `npm test` | **244 passed** (227 pre-existing + 17 new) |

One correction worth carrying out of this run: **the 43-warning lint baseline is
stale.** This branch measures 37 and has all run. The wrong number appears in
four places — the brief (constraint 7 and success criterion 6), `plan.md`, the
branch queue preamble, and `docs/ui-revamp-guardrails.md` §7 — and should be
fixed in one pass.

---

## 7 · Where to look

| | |
|---|---|
| Which files are live, dormant and partly dormant | [`src/components/dashboard/schedule/README.md`](../../src/components/dashboard/schedule/README.md) |
| The cross-screen fidelity sweep, N1–N8 | [`FIDELITY-PASS.md`](FIDELITY-PASS.md) |
| What each route lost, line by line | `git diff ce173da..HEAD -- src/app/dashboard/team/schedule/` |
| The copy the spec pins, and what it deliberately does not | `tests/schedule-static-copy.spec.ts` |
| Per-task gate results, judgment calls and their evidence | `.claude/tasks/claude-new-session-c3f1ab.log.md` |
