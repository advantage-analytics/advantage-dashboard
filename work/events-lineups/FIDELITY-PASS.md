# Full-set fidelity pass — T11

**Date:** 2026-09-01 · **Task:** T11 · Full-set fidelity pass and gates
**Capture read:** `_full.dc.html`, md5 `045f55b3a44cfa304c7772fd6bddcdaf` (verified
before reading a byte), 125,343 bytes, artboards `7e 3b 2c 2b 2d 2e 3c 7d 7c 4c`.
The stale 87,329-byte capture was not opened.

**Method.** All ten artboards were read in full from the capture and compared
side by side against the nine files under
`src/components/dashboard/schedule/static/`, `src/lib/schedule/fixtures.ts` and
the four route files. Every screen and state was then rendered at its
artboard's 1280px content-region size (1048 wide; 576/796/816/856 tall) through
a temporary unguarded harness at `src/app/harness/page.tsx`, driven and
measured in the Browser pane, **then deleted** — `git status` is clean of it,
`git log --all` has no trace, and the production build's route list has no
`/harness`. Frozen-transition readings were settled with
`getAnimations().forEach(a => a.finish())` per the T4 trap note.

Per-artboard fidelity was **not** re-done — T2–T8 gated that. This pass hunts
drift *between* screens. Findings are recorded, not fixed; no source file
changed.

---

## 1 · New cross-screen findings

Ordered by how much they matter to the re-wiring. "Design-level" means both
sides reproduce their artboards faithfully and the artboards disagree with each
other; "code-level" means the built tree itself diverges between screens.

### N1 — "lines" vs "matches": two words for the same nine things (design-level)
`7d`'s jump row says "**8 of 9 lines** analyzed" and its season strip "31 of 36
**lines** analyzed"; `7e`'s scaffold says "**9 lines** · none set"; `2b`'s
footer "Creates **9 lines**". But `7c`/`4c`'s pane footer counts the very same
Fairmont event as "**9 of 9 matches** · 6 singles, 3 doubles". One concept, two
nouns, on screens one click apart — and the pane footer is the only place the
word "matches" appears for a dual's lines anywhere in the set. Faithful both
ways (`static-schedule.tsx` jump row; `dual-widget.tsx` footer). The vocabulary
should be settled once at re-wiring.

### N2 — "Creates N …" sets its numeral three different ways (design-level)
`3b`'s card meta sets the 9 in `mono tabular` (measured live: Roboto Mono,
tabular-nums); `2b`'s footer ("Creates 9 lines vs Ridgeline University") and
`3c`'s footer ("Creates 3 entries …") set theirs plain `tabular` in Inter
(measured: Inter, tabular-nums). Each is byte-faithful to its artboard — the
capture's own classes are `mono tabular` on `3b` and bare `tabular` on
`2b`/`3c`. T2 flagged `3b`'s mono against the DS rule (Roboto Mono reserved for
timestamps/ids); the cross-screen half — that the design itself uses both
treatments for the same sentence shape — was not recorded. One decision covers
all three.

### N3 — Slot labels S1–D3: mono on the create side, Inter on the schedule side (design-level)
`2b`'s lineup rows and `7e`'s scaffold set slot labels in `mono` (artboard
class, reproduced in `dual-build-step.tsx` and `static-schedule.tsx`), while
`7c`/`4c`'s line rows set the identical S1–D3 identifiers in plain Inter 11px
ink-500 (artboard has no mono class there; `dual-widget.tsx` follows).
`3c`'s rail sublines ("S1 · entered · seed 3") are `text-micro` Inter, but its
seed cells are mono. The same identifier grammar renders in two typefaces
depending on which side of the create/view divide the screen sits.

### N4 — Two selected-row grammars across the four master–detail surfaces (pattern, possibly intentional)
Schedule drawer (`7c`/`4c`) and `2c`'s directory mark the current row with a
`--surface-muted` wash + weight 500 (+ ink-900 score in the drawer). `2b`'s
rail and `3c`'s rail mark theirs with weight 500 + a blue check and **no
wash**. Both reproduce their artboards. The split may be semantic — "what you
are looking at" vs "what is committed/entered" — but nothing records that
reading, and the re-wiring will have to pick one for any surface the design
never drew selected.

### N5 — Cancel is a `<Link>` on three create screens and a `<button>`+`router.push` on the fourth (code-level)
`dual-school-step.tsx`, `dual-build-step.tsx` and
`static-tournament-builder.tsx` render Cancel as
`<Link href="/dashboard/team/schedule">`; `static-event-chooser.tsx` renders it
as `<button onClick={() => router.push(...)}>` (its Continue likewise). Same
drawn control (the DS ghost Button), two mechanisms: `3b`'s Cancel has no href,
so middle-click/new-tab/copy-link behave differently there than on its three
siblings. No artboard states either mechanism. Worth unifying at re-wiring.

### N6 — A player's day-zero pane still advertises event creation (code-level, guards hold)
Rendering `EMPTY_SCHEDULE` with `canCreate={false}` and
`canAddOwnMatch={false}`: the drawer CTA and "One-off match in Matches"
disappear (verified in the render — no "New event", no "One-off match"
anywhere), but the pane's "New dual" and "New tournament" links remain and
point at create routes that will bounce a player back to the schedule
(redirects verified in all three route files). The permission gating is
asymmetric: drawer CTA gated, pane invitation not. Nothing breaks — the routes
are the guard — but a player in a day-zero team workspace is invited to do the
one thing they cannot.

### N7 — `2b` vs `2d`/`2e` disagree about a resting row's hover (design-level, fine-grained)
`2b` gives every non-forfeited resting row a hover wash and a hover-revealed
Forfeit (`opacity:0` → 1). `2d`/`2e` draw the same resting rows (S2, S3) with
an **empty** fifth cell — no Forfeit even hidden — and no row hover at all.
The build follows `2b` for resting rows everywhere and `2d`/`2e` for the
active row (T7's upheld "active vs resting" reading covers the active row;
this is the resting-row half of the same contradiction, one level finer than
the log's item). Consequence: hovering a resting row on the popup screens
would show nothing per the artboards but reveals Forfeit in the build. Both
cannot be satisfied at once.

### N8 — `7c` as drawn is not reachable; the build shows all nine lines at 620 (interpretation consequence, already gated)
The `7c` artboard's pane draws S1–S3, then the "9 of 9 matches" line
immediately after, then empty space to the frame's bottom. Measured live at
the same content height (1048×576): all nine rows render (scrollHeight 513 vs
clientHeight 481) and the count line sits clipped at the container edge —
because nine rows at the artboard's own row metrics *fit* in that frame with
~30px to spare. So T4's stated reason — "7c's markup simply stops after S3
because nothing below it is on screen at that height" — is arithmetically
wrong; the artboard stopped early and left whitespace, it was not clipped by
the frame. The "one component, 7c = 4c clipped" interpretation was reviewed
and upheld and is not re-opened here; what is new is that the drawn 7c
(three rows + footer + whitespace) is a state the build cannot produce, and
the log's stated rationale should not be quoted as fact. Same shape as T10's
comment-stripping correction: the decision stands, its reason did not.

---

## 2 · Already-recorded items — verified this pass

Each checked against the capture's bytes and/or the live render. None was
found false except where noted.

1. **Topbar count line, three spellings, no home** — verified byte-level:
   `7e` "0 events · nothing scheduled for 2026–27", `7d`/`7c` "6 events · 2
   upcoming", `4c` "6 events · 2 upcoming · 4 completed". Grep confirms the
   strings exist only in comments and fixture docs, never in JSX; and
   `SEASON_FACTS` aside, `SEASON_LABEL` is consumed only by the copy spec —
   still exported, still unrendered (T3 follow-up 3 stands).
2. **`7c` vs `4c` differ only in height and that count line** — verified: the
   drawer markup, pane header, rails, row grid and footer line are
   byte-identical between the two frames; `4c` adds S4–D3 and the Doubles
   label; the topbar count is the one non-height difference. (See N8 for the
   S1–S3 stop.)
3. **`2b`'s rail vs `2c`'s conference section** — verified: rail draws
   Ridgeline, Fairmont A&M, Crestwood, Northlake, Ashford, Merritt (six Big
   Ten rows); `2c`'s conference section draws Ridgeline + **Ridgemont Tech**,
   which the rail omits; the five non-Ridgeline rail schools appear nowhere on
   `2c`. `RAIL_SCHOOLS[0]` is `CONFERENCE_SCHOOLS[0]` by reference, as the
   fixtures claim.
4. **Five selectable schools on `2c`, step two always Ridgeline** — walked
   live: selecting any row moves only the footer name; Continue lands on `2b`
   drawing Ridgeline throughout. The shell's doc records this as the
   deliberate reading of a one-path artboard.
5. **S6-forfeit vs D3-Adeyemi self-contradiction (`2b`)** — verified in bytes
   and render: S6 "— no available player"/Forfeited while D3 pairs
   "Moreau / Adeyemi"; "pairs carried from singles" false of its own rows.
6. **`4c` rails vs rows vs score** — verified: rails `good bad good good good
   grey` / `good bad grey` against rows S6=loss, D3=win and score 5–2;
   greyed marks read literally give 4–1. `SINGLES_MARKS`/`DOUBLES_MARKS` are
   transcribed constants; the re-wiring trap note stands.
7. **Name drift `4c` vs `3c`/`2b`** — verified, with one addition: the log
   names "L. Moreau (S4)" and "K. Sato (S6)" vs "Jules Moreau (S5)" and
   "Lena Adeyemi (S6)". The complementary half of the same swap is **Tanaka**:
   `4c` draws S. Tanaka at S5 where `2b` and `3c` both put Sam Tanaka at S4.
   One swap (Moreau↔Tanaka), plus the Sato/Adeyemi substitution.
8. **`7d`'s "8 of 9 lines analyzed"** — verified rendered verbatim; `4c`'s own
   pane supports at most 5 (5 ready + 1 analyzing + 3 doubles the vendor
   refuses).
9. **"Coming soon" on the three doubles** — verified rendered; still false
   about the app (`supportsVideo()`/`job-request.ts`).
10. **`3c`'s conference-seeding callout** — verified rendered verbatim,
    including the ink-900 bold half.
11. **"2026–27" vs 2025 weekdays** — verified: all drawn dates land on their
    weekday labels only in 2025; fixtures hold 2025 dates.
12. **`2e` toast** — measured live: 236px wide, wraps to two lines, text
    "Saved to Ridgeline University roster" after picking a name the roster
    already held. "Ridgeline" (short) in the popup prompt and subline vs
    "Ridgeline University" (full) in the toast, both as drawn.
13. **Blue link substitution rule** — measured: artboard-stated
    `color:var(--blue)` kept (2b Forfeit rgb(59,130,246), caret same; 2c
    Clear/free-text per source), inherited-colour links substituted to
    `--blue-text` (7e's three links, 3b's aside, the report links — all
    rgb(37,99,235)). The rule is applied consistently across all ten
    artboards; the AA failure of true `--blue` at 11px (T8 follow-up 7)
    remains wherever the design states it.
14. **Lint baseline** — the queue/brief/plan/guardrails' "43" is stale;
    measured again this pass: **0 errors / 37 warnings**, unchanged all run.

**Corrections to the record:** (a) T4's stated rationale for the `7c` stop is
wrong arithmetic — see N8; the decision itself was upheld and stands. (b) No
other logged claim checked out false.

---

## 3 · The two stateful sequences, walked live

### `2d → 2e` (inside `2c → 2b`)
`?s=2c` → Continue → `2b` (rail of six, Ridgeline checked/weighted, header
"vs Ridgeline University" + "Big Ten · D-I", 09-26/Home/Hard/Best of 3 sets +
"No-ad scoring", nine lines with S6 forfeited, footer "Creates 9 lines vs
Ridgeline University"). Clicking S1's "Add name" opens the popup **seeded
"Alexis Cast"** — `2d` exactly: 286px dialog, blue caret, prompt "Ridgeline
already has a close name saved. Pick one.", highlighted card "Alexis
Castellano · Saved · Ridgeline #2 · 2 prior meetings" with ↵, second card
"Alexis Cast · Save as a different player" with +; the active row lifts to
z-20 and its Forfeit shows plainly (blue, opacity 1). Picking the saved card
→ `2e` exactly: line resolves to "Alexis Castellano" (13px/400/ink-900 —
the same treatment as our own player's name), popup closed, toast
`role=status` "Saved to Ridgeline University roster" at 236px. Toast
self-clears at 2800ms; the row returns to rest (z auto, Forfeit back to
opacity 0 once the frozen transition is finished). Escape on a fresh popup
reverts — the committed S1 name survives, S2 stays "Add name". Continuous end
to end; the only discontinuities are the recorded design ones (the toast's
false save claim on the pick path, and N7's resting-row hover).

### `7d → 7c → 4c`
`?s=7d` at 1048×576: prompt pane with season strip (✗✓✓✓, "3–1 in duals · 31
of 36 lines analyzed"), Jump to Next/Last. Selecting Fairmont — drawer row or
Jump row, same state — swaps in the dual widget with **nothing else moving**:
scoped header "Sat 20 Sep · Away · hard" / "vs Fairmont A&M" / 5–2 / S+D
rails, inset hairline, rows, footer. At 576 the rows scroll (513>481) with
the count line clipped (see N8); at `?s=4c` (1048×816) the same selection
shows all nine lines and the footer fully visible (721=721, no scroll), 5
"View report" links, the Analyzing chip on S2, 3 "Coming soon". Selected
drawer row measured: `--surface-muted` wash (rgb 250,250,250), name weight
500, score ink-900 — the T4 reconciliation, live. Selecting Ash or Harlow
(no detail fixture) falls back to the prompt pane, as designed. The walk is
one `useState` plus height, and the topbar count line — the one non-height
difference between the frames — exists nowhere to diverge.

---

## 4 · Purity and guard checks

**Criterion 3 grep** (static tree + four route files, patterns `supabase`,
`"use server"`, `'use server'`): **zero matches** (grep exit 1). No loader
call either: the routes import only `redirect`, `getWorkspaceContext`,
workspace type helpers, the static components and fixtures — read directly
from all four files.

**Criterion 4:** `StaticSchedule` rendered with `canCreate={false}` (both
schedules): no "New event" anywhere in the body; the drawer subtree contains
**zero** `<a>` and zero `[href]` (rows are `role=option` buttons moving local
state). With `canAddOwnMatch={false}`, 7e's "One-off match in Matches" is also
gone. And all three create routes retain, verbatim,
`if (!isProgramStaff(active)) redirect("/dashboard/team/schedule")` after the
`/login` and non-team guards (read directly; byte-identical guard blocks).
See N6 for the ungated pane links.

---

## 5 · Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run lint` | 0 errors, **37 warnings** — at the true baseline (the "43" in the queue preamble, brief, plan and guardrails §7 is stale) |
| `npm run build` | green; route list contains the four schedule routes and **no `/harness`** |
| `npm test` | **244 passed** (includes T10's 17 copy-fidelity specs) |

Harness deleted before all four gates; working tree clean apart from the
runner's own `status:` line in the queue file.
