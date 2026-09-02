# Browser check — claim eyebrows do not wrap

Task T6, plan step 6. Verification only: no source file was changed by this task.

Date run: 2026-09-02.

---

## What was verified, and on what

The feature (T1–T4) stops the program eyebrow on the two claim screens from
wrapping onto a second line. Two mechanisms do it together:

1. `programEyebrow()` composes `school · squad · division` and deliberately
   drops `conference` — a 136-character JUCO conference name is ~1,134px and
   fits no column in this flow.
2. `ClaimShell` now takes a `heading` slot, so the heading renders at the
   shell's **full** width rather than the narrower width the grey aside leaves
   for the body column.

This record checks both: that the eyebrow occupies exactly one line, that it
now renders at the shell's full width, and that nothing else in the layout
moved.

### Origin — read this before trusting the numbers

**Every measurement below was taken against `http://localhost:3011`.**

That server runs **this worktree**:
`/Users/cjgimena/Desktop/vscode/advantage-dashboard/.claude/worktrees/eyebrows-text-wrap-db278e`
— confirmed not by assumption but by resolving the listening PID on 3011 and
reading its working directory (`lsof -a -p <pid> -d cwd`).

**Deviation from the task's stated method, on purpose.** The task said to use
the `dev` configuration in `.claude/launch.json`, which binds port 3000. Port
3000 was already occupied by a dev server for a *different* worktree
(`.claude/worktrees/onboarding-name-step`), which contains none of these
changes. Attaching to it would have measured the wrong tree and very likely
reported a false failure. A separate `eyebrow-worktree` configuration on port
3011 was used instead. The criterion's intent is to verify *this* worktree's
code; the named configuration would have defeated that intent.
(`.claude/launch.json` is gitignored, so this does not appear in any diff.)

### How each fact was measured

Measured in the page with JavaScript, not by eye.

- **The eyebrow element** is `document.querySelector('h1').previousElementSibling`.
  It is deliberately *not* `document.querySelector('.eyebrow')`: the grey aside
  panel carries an `.eyebrow` span of its own, so there are two on every one of
  these pages (`dotEyebrowCount: 2` on all sixteen loads) and the class selector
  can silently measure the wrong element. The measured element was confirmed to
  be `SPAN.eyebrow` on every load.
- **One line** = `eyebrow.getClientRects().length === 1`. An inline element that
  wraps reports one client rect per line box, so `1` is the assertion and `2`
  would be the wrap.
- **Gap** = `h1.getBoundingClientRect().top − eyebrow.getBoundingClientRect().bottom`.
- **Aside position** = bounding-rect comparison against the body column (the
  grid's first child), not against the heading — see the note under the table.
- **Console errors** = `read_console_messages` with `onlyErrors: true`, read
  after each individual load.

---

## Results — 16 loads, all pass

Eight URLs × two viewports. `rects` is the wrap assertion; `gap` is the
eyebrow-to-title distance; `width` is the rendered width of the eyebrow span.

### 1280px viewport

| # | URL | rects | gap | eyebrow width | aside right of column | console errors |
|---|---|---|---|---|---|---|
| 1 | `/claim/NorthCarolinaATStateUniversityM` | 1 | 2 | 840px | yes (col right 712 · aside left 760) | 0 |
| 2 | `/claim/NorthCarolinaATStateUniversityW` | 1 | 2 | 840px | yes (712 · 760) | 0 |
| 3 | `/claim/MississippiGulfCoastCCW` | 1 | 2 | 840px | yes (712 · 760) | 0 |
| 4 | `/claim/IndianaUPurdueUIUPUIM` | 1 | 2 | 840px | yes (712 · 760) | 0 |
| 5 | `/claim/NorthCarolinaATStateUniversityM/setup` | 1 | 2 | 1000px | yes (752 · 800) | 0 |
| 6 | `/claim/NorthCarolinaATStateUniversityW/setup` | 1 | 2 | 1000px | yes (752 · 800) | 0 |
| 7 | `/claim/MississippiGulfCoastCCW/setup` | 1 | 2 | 1000px | yes (752 · 800) | 0 |
| 8 | `/claim/IndianaUPurdueUIUPUIM/setup` | 1 | 2 | 1000px | yes (752 · 800) | 0 |

### 768px viewport

| # | URL | rects | gap | eyebrow width | aside below column | console errors |
|---|---|---|---|---|---|---|
| 9 | `/claim/NorthCarolinaATStateUniversityM` | 1 | 2 | 688px | yes (col bottom 427.3 · aside top 467.3) | 0 |
| 10 | `/claim/NorthCarolinaATStateUniversityW` | 1 | 2 | 688px | yes (427.3 · 467.3) | 0 |
| 11 | `/claim/MississippiGulfCoastCCW` | 1 | 2 | 688px | yes (427.3 · 467.3) | 0 |
| 12 | `/claim/IndianaUPurdueUIUPUIM` | 1 | 2 | 688px | yes (427.3 · 467.3) | 0 |
| 13 | `/claim/NorthCarolinaATStateUniversityM/setup` | 1 | 2 | 688px | yes (col bottom 526 · aside top 566) | 0 |
| 14 | `/claim/NorthCarolinaATStateUniversityW/setup` | 1 | 2 | 688px | yes (526 · 566) | 0 |
| 15 | `/claim/MississippiGulfCoastCCW/setup` | 1 | 2 | 688px | yes (526 · 566) | 0 |
| 16 | `/claim/IndianaUPurdueUIUPUIM/setup` | 1 | 2 | 688px | yes (526 · 566) | 0 |

**Totals: 16/16 with `rects === 1`. 16/16 with `gap === 2`. 0 console errors
across all sixteen loads.**

### On the gap number

`2` was observed exactly — not `2.0 ± ε`, but the integer `2` at four decimal
places on all sixteen loads. It matches the unchanged `gap={2}` on
`ClaimHeading`, which is what `main` uses, so the eyebrow-to-title distance is
untouched by this change. The `titlePadTop={8}` on the `<h1>` is padding inside
the h1's own border box and therefore does not enter this measurement.

### On "the aside is to the right of the heading"

The task phrases the 1280 assertion as *aside to the right of the heading*.
That phrasing predates the change and is no longer the meaningful comparison,
because hoisting the heading to full width **is the feature**. The heading now
spans the whole shell (840px on status, 1000px on setup) and the aside sits
below it and to the right of the body column.

So the honest statement of what was measured:

- At **1280**, the aside is to the right of the **body column** on all eight
  loads (`aside.left >= column.right`), and below the full-width heading block.
  That is the intended post-change layout: same two-column body, heading spanning
  both.
- At **768**, the aside drops below the body column on all eight loads
  (`aside.top >= column.bottom`) — the `lg:` grid breakpoint at 1024px collapses
  to one column.

The structural change was independently confirmed on every load: the heading
block's parent is the same element as the grid's parent (`headingHoisted: true`),
i.e. the heading is a sibling of the aside grid rather than a child of the body
column.

### Eyebrow text as rendered

| Program | Rendered eyebrow | chars |
|---|---|---|
| North Carolina A&T, men's | `NORTH CAROLINA AGRICULTURAL AND TECHNICAL STATE UNIVERSITY · MEN'S · D-I` | 72 |
| North Carolina A&T, women's | `NORTH CAROLINA AGRICULTURAL AND TECHNICAL STATE UNIVERSITY · WOMEN'S · D-I` | 74 |
| Mississippi Gulf Coast CC, women's | `MISSISSIPPI GULF COAST COMMUNITY COLLEGE · WOMEN'S · JUCO` | 57 |
| IUPUI, men's | `INDIANA UNIVERSITY-PURDUE UNIVERSITY INDIANAPOLIS · MEN'S · D-I` | 63 |

The same four strings render on the status screen and its `/setup` counterpart,
which is the point of both screens sharing `programEyebrow()`.

**The Mississippi Gulf Coast status eyebrow's `innerText` is exactly:**

```
MISSISSIPPI GULF COAST COMMUNITY COLLEGE · WOMEN'S · JUCO
```

No conference. That is the string the design predicted, and the one the T5
regression spec now guards.

---

## Screenshot

`status-1280.png`, beside this file — the Mississippi Gulf Coast status screen
at 1280×900, captured from `http://localhost:3011/claim/MississippiGulfCoastCCW`.
The eyebrow runs on one line above the title; the grey "WHAT YOU TAKE ON" aside
sits to the right of the body column. (The dark circle at the bottom-left is the
Next.js dev-mode indicator, not part of the page.)

---

## What was NOT asserted

**Phone widths below 768px.** The design states the one-line guarantee does not
hold there, and it is not claimed here. A 72-character eyebrow cannot fit a
375px frame at any legible size; below 768 the eyebrow is expected to wrap and
that is accepted. 768 is the narrowest width at which this record makes any
claim.

Also out of scope: the `active` and `claim_pending` branches of the status
route. They keep the older four-field eyebrow (school · squad · division ·
conference) on purpose — this change touched only the F3.2 unclaimed branch and
the setup screen — so they were not loaded or measured.

---

## Build and test

Both run in this worktree, after the dev server was stopped.

| Command | Exit status |
|---|---|
| `npm run build` | **0** |
| `npm test` | **0** — 304 passed |

`npm test` includes the T5 regression spec, which ran against the live database
rather than skipping:

```
✓ tests/claim-eyebrow-width.spec.ts › composes an eyebrow for every row in the table
✓ tests/claim-eyebrow-width.spec.ts › every eyebrow fits on one line of the claim shell
✓ tests/claim-eyebrow-width.spec.ts › no eyebrow carries the row conference
```

The task's own diff touches nothing under `src/` or `tests/` — it adds only this
record and the screenshot beside it.
