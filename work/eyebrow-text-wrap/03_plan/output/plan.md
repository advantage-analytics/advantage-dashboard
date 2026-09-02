# Plan — eyebrow text wrap on the claim status and setup screens

Six steps. Five touch one file each; the last runs the app. Every code step is
small enough for a fresh subagent to hold the whole surface in context.

The design's two changes are independent of each other — a content change on
one screen, a layout slot on the shared shell — so the plan lands the shell and
the helper first, then adopts them one page at a time. Each page is separately
revertable.

---

## Step 0 — Bootstrap the worktree

**Files** — none. Environment only.

**Change** — this worktree has no `node_modules`; `.env.local` is already
symlinked from the main checkout. Run `npm ci`. Nothing else in the plan can be
verified until this succeeds, and a `node_modules` symlink is not an option
here — it panics Turbopack.

**Verification** — `npm run lint` completes on the untouched tree. That proves
the toolchain works before any edit muddies the signal.

---

## Step 1 — Add the `programEyebrow()` helper

**Files** — `src/lib/data/programs-server.ts`

**Change** — add one exported pure function beside the existing label helpers,
composing `school · squad · division` from `teamLabel` and `divisionLabel`,
joined with the same ` · ` separator and the same `.filter(Boolean)` behaviour
the pages use today, so a null division yields `school · squad` rather than a
trailing separator.

Signature per the design: `(schoolName: string, team: string, division: string
| null) => string`. Document in a comment that conference is deliberately
excluded, with the reason — 136 characters of JUCO conference name is 1,134px
and fits no column in this flow — so a later editor does not "restore" it.

Leave `programSubtitle` untouched. Its three other callers still need it.

No caller changes in this step; the helper is dead code until step 3.

**Verification** — `npx tsc --noEmit` passes. `grep` confirms `programSubtitle`
still has its three callers.

---

## Step 2 — Give `ClaimShell` a full-width heading slot

**Files** — `src/components/claim/claim-shell.tsx`

**Change** — add an optional `heading?: React.ReactNode` prop. Wrap the body in
a flex column carrying the shell's existing `gap`, render `{heading}` above the
aside grid (or above the plain column when there is no aside), and leave
everything else as it is.

The gap between the hoisted heading and what follows must be the same `gap`
that already separates blocks inside the column — 16 on both target screens —
so no vertical space is added. Document why the slot exists: the eyebrow needs
the shell's full width, not the width the aside leaves behind.

When `heading` is absent the wrapper holds a single child and nothing moves.
That is what keeps the other five claim screens out of this change.

**Verification** — `npx tsc --noEmit` passes. Read the diff and confirm no
existing prop, class or default changed. No page passes `heading` yet, so the
rendered output of every claim screen is byte-identical at this point.

---

## Step 3 — Adopt both changes on the unclaimed status screen

**Files** — `src/app/claim/[programKey]/page.tsx`

**Change** — the F3.2 branch only, the one titled "No one has set this up yet",
which is the `return` at the end of the file.

1. Compose a second eyebrow for this branch from `programEyebrow()`, leaving
   the shared four-field `eyebrow` const at line 48 exactly as it is for the
   two branches above it. Add a comment saying why the file now has two: the
   other two states are out of this change's scope and would otherwise be
   silently altered.
2. Move that branch's `<ClaimHeading …>` out of `ClaimShell`'s children and
   into its new `heading=` prop, unchanged in every other respect — same
   `gap={2}`, same `titlePadTop={8}`.

**Verification** — `npx tsc --noEmit` and `npm run lint`. Confirm by reading
that the `claim_pending` and `active` branches are untouched, and that
`programSubtitle` is still imported for them.

---

## Step 4 — Adopt the heading slot on the setup screen

**Files** — `src/app/claim/[programKey]/setup/page.tsx`

**Change** — move `<ClaimHeading …>` into `heading=`, unchanged otherwise.

Its eyebrow already omits conference; switch its inline composition to
`programEyebrow()` so both screens share one definition and cannot drift. The
rendered string is identical before and after — the file's own comment already
explains why conference is absent here, and that reasoning now lives in the
helper.

The title is untouched. It can still wrap at 24px for the longest school names,
and titles wrapping is normal — the brief objects to eyebrows wrapping.

**Verification** — `npx tsc --noEmit` and `npm run lint`. Diff shows the
composed eyebrow string is unchanged for this page.

---

## Step 5 — Regression spec for the width budget

**Files** — `tests/claim-eyebrow-width.spec.ts` (new)

**Change** — a node-level Playwright spec following the live-database pattern
in `tests/fixtures/live-db.ts`, including its skip guard so the suite still
passes without credentials.

Read every row of `programs`, compose each through `programEyebrow()`, and
assert:

1. Each result is at most **97 characters** — 840px, the hoisted status
   column, divided by the measured worst case of 8.6px per character. Put the
   measurement and its provenance in a comment beside the constant; today's
   worst is 74, so the assertion has real headroom and fails only when a school
   name arrives that would wrap on the desktop frames.
2. No result contains any program's `conference` value. That is the property
   keeping the 1,134px case from coming back.

On failure the message should name the offending school and its length, so the
next person sees which program broke it rather than a bare number.

**Verification** — `npx playwright test tests/claim-eyebrow-width.spec.ts`
passes against the live database, and skips cleanly when the environment is
absent.

---

## Step 6 — Verify in the browser

**Files** — none.

**Change** — none. This step exists because steps 3 and 4 are visual, and the
whole point of the feature is what the page looks like.

Start the dev server through the `dev` configuration in `.claude/launch.json`
and visit the worst real programs, all three of which are `unclaimed` and so
render the F3.2 branch:

| Program | Status URL | Setup URL |
|---|---|---|
| North Carolina A&T, men's | `/claim/NorthCarolinaATStateUniversityM` | `/claim/NorthCarolinaATStateUniversityM/setup` |
| North Carolina A&T, women's | `/claim/NorthCarolinaATStateUniversityW` | `/claim/NorthCarolinaATStateUniversityW/setup` |
| Mississippi Gulf Coast CC, women's | `/claim/MississippiGulfCoastCCW` | `/claim/MississippiGulfCoastCCW/setup` |

Confirm at 1280px and at 768px, on both screens:

- the eyebrow occupies exactly one line — assert it, do not eyeball it, by
  reading `getClientRects().length === 1` on the `.eyebrow` element;
- the gap between eyebrow and title is unchanged from `main`;
- the grey aside still sits to the right at 1280 and drops below at narrow
  widths;
- no console errors.

Then check one ordinary program — `/claim/IndianaUPurdueUIUPUIM` — so the
common case is seen, not only the pathological one. Capture a screenshot of the
status screen at 1280px for the record.

Expected: the Mississippi Gulf Coast status eyebrow loses its conference and
reads `MISSISSIPPI GULF COAST COMMUNITY COLLEGE · WOMEN'S · JUCO`.

---

## Order dependencies

- Step 0 precedes everything.
- Steps 1 and 2 are independent of each other and can land in either order.
- Step 3 needs both 1 and 2. Step 4 needs both 1 and 2.
- Step 5 needs 1 only, so it can be written any time after it; running it does
  not depend on 3 or 4.
- Step 6 needs 3 and 4.

Steps 3 and 4 are independent of each other. Either can land or be reverted
without touching the other, which is deliberate: they are two screens, and the
brief treats them as one feature only because they share a cause.

## Test strategy

**Automated, new** — the width-budget spec from step 5. It guards the one thing
that can silently regress: a school name, or a restored conference field,
pushing the eyebrow past what the frame can hold. It runs against the live
database because that is the only place the long tail actually lives; a fixture
would freeze today's worst case and stop guarding on the day a longer program
is added.

**Automated, existing** — `npm test` at the end. Nothing here adds a route, so
`generate-map.spec.ts` and `MAP.md` are unaffected and `npm run map` need not
run. No other spec touches the claim flow's rendering.

**Type and lint** — `npx tsc --noEmit` after each code step, `npm run lint`
before the work is committed, and one `npm run build` at the end, which is the
honest typecheck for a Next app.

**Manual** — step 6, at two viewports, on the three worst programs and one
ordinary one. The one-line assertion is scripted rather than eyeballed; a wrap
of a few pixels is exactly the kind of thing a screenshot flatters.

**Explicitly not tested** — phone viewports below 768px, where the design
states the guarantee does not hold and 32% of programs wrap at 390px. Writing a
test that asserts one line there would fail by design.

## Also consulted

Beyond the declared inputs (`design.md`, `brief.md`):

- `package.json` — the real script names used in the verification lines.
- `.claude/launch.json` — the existing `dev` configuration step 6 uses.
- `src/lib/data/programs-server.ts`, `src/components/claim/claim-shell.tsx`,
  `src/app/claim/[programKey]/page.tsx`, `.../setup/page.tsx` — to size the
  steps against what is actually in each file.
- `tests/fixtures/live-db.ts` — the skip-guard pattern step 5 follows.
- The live `programs` table via the Supabase MCP — the three program keys in
  step 6, and confirmation that all three are `unclaimed` and therefore render
  the screen under change.
