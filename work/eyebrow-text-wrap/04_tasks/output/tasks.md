# Tasks — eyebrow-text-wrap

Appended to `.claude/tasks/claude-eyebrow-text-wrapping-c359ca.md`, which this
stage created (the branch had no queue). Ids start at T1: neither a queue nor a
run log existed for this branch, so no id has ever been used on it.

Drafted by a Fable planner subagent per `task-add`'s routing rule, from the
approved `03_plan/output/plan.md`. The planner was told to map the plan's steps
faithfully rather than re-plan them.

## Routing

| id | title | model | needs |
|---|---|---|---|
| T1 | Add `programEyebrow()` helper to programs-server | sonnet | — |
| T2 | Add a full-width `heading` slot to `ClaimShell` | sonnet | — |
| T3 | Adopt eyebrow helper and heading slot on the unclaimed status screen | sonnet | T1, T2 |
| T4 | Adopt eyebrow helper and heading slot on the setup screen | sonnet | T1, T2 |
| T5 | Add the eyebrow width-budget regression spec | opus | T1 |
| T6 | Verify the claim eyebrows in the browser and record the result | opus | T3, T4 |

Nothing routed to `fable`: no step is cross-cutting, security-bearing, or a
schema change. T1–T4 are one-file changes with the signature or JSX given
exactly in the plan. T5 and T6 carry judgement — a live-database spec with a
pagination trap, and a browser pass across sixteen loads — so both go a tier up.

## Two plan steps that produce no diff

**Step 0, the `npm ci` bootstrap**, became a `notes:` line on T1 rather than a
task, cross-referenced from T2. It produces no diff, so no `done when:` list
could be verdicted against it and `/task-next` would skip it as malformed.

**Step 6, browser verification**, stayed a task because the plan asks for a
scripted one-line assertion and a screenshot, both of which are observable once
the record has a home. That home is `05_build/references/`, so a reviewer can
verdict the record from the diff.

## Two traps the planner caught, now encoded as criteria

The plan said to assert on `.eyebrow`. That selector also matches the grey
aside panel's own title, so a check could pass while reading the wrong element.
T6 names a selector that cannot pick the wrong one.

A plain `select()` against `programs` returns PostgREST's default first 1,000
rows, and the live table holds 1,941. A spec written the obvious way would pass
having silently skipped half the table, including part of the long tail it
exists to guard. T5 asserts the composed count against an exact head count.

One correction to the design's prose: `programSubtitle` has four call sites,
not three. T1's criterion names all four.

## Appended verbatim

## T1 · Add `programEyebrow()` helper to programs-server
- **status:** todo
- **model:** sonnet
- **files:** src/lib/data/programs-server.ts (guess — beside `divisionLabel`/`programSubtitle` at ~L105–116)
- **done when:**
  - [ ] `export function programEyebrow(schoolName: string, team: string, division: string | null): string` exists in `src/lib/data/programs-server.ts` next to the other label helpers and returns `[schoolName, teamLabel(team), divisionLabel(division)].filter(Boolean).join(' · ')`, so a null division yields `school · squad` with no trailing separator
  - [ ] Its doc comment states that conference is deliberately excluded and why — the worst four-field eyebrow (136 chars, JUCO conference) renders at 1,134px and fits no column in the claim flow — so a later editor does not restore it
  - [ ] `programSubtitle`, `teamLabel` and `divisionLabel` are byte-identical to before, and `grep -rn programSubtitle src` still lists its callers in `claim/[programKey]/page.tsx`, `claim/[programKey]/object/page.tsx`, `claim/[programKey]/request/page.tsx` and `components/claim/program-search.tsx`
  - [ ] `grep -rn programEyebrow src` returns only the definition — no caller is wired in this task
  - [ ] `npx tsc --noEmit` exits 0
- **notes:** Plan step 1. Bootstrap first: this worktree has no `node_modules` (`.env.local` is already symlinked from the main checkout). Run `npm ci` in the worktree before anything else and confirm `npm run lint` passes on the untouched tree — that proves the toolchain before any edit muddies the signal. Do NOT symlink `node_modules` from the main checkout; it panics Turbopack. `npm ci` produces no diff and is not gated.

## T2 · Add a full-width `heading` slot to `ClaimShell`
- **status:** todo
- **model:** sonnet
- **files:** src/components/claim/claim-shell.tsx (guess — `ClaimShell` props and the `maxWidth` body wrapper, ~L36–115)
- **done when:**
  - [ ] `ClaimShell` accepts an optional `heading?: React.ReactNode` prop whose doc comment says why the slot exists: the eyebrow needs the shell's full width, not the width the aside leaves behind
  - [ ] Inside the existing `<div className="mx-auto w-full" style={{ maxWidth: width }}>`, the body is wrapped in `<div className="flex flex-col" style={{ gap }}>` that renders `{heading}` first and then the existing aside-grid-or-`ClaimColumn` branch, so the space between a hoisted heading and what follows is the same `gap` prop the column already uses
  - [ ] The aside grid's classes and `--claim-aside` style, `ClaimColumn`, and every existing prop and default (`width`, `gap`, `back`, `exitHref`, `exitLabel`, `aside`, `asideWidth`) are unchanged in the diff
  - [ ] `grep -rn "heading=" src/app/claim` returns nothing — no page passes the prop yet, so every claim screen renders identically at this point
  - [ ] `npx tsc --noEmit` exits 0
- **notes:** Plan step 2. Independent of T1. If `node_modules` is absent when this runs first, follow the bootstrap note on T1. The deliberate visual consequence, once pages adopt the slot, is that the aside's `items-start` tops out against the body copy rather than the eyebrow — that is expected, not a regression.

## T3 · Adopt eyebrow helper and heading slot on the unclaimed status screen
- **status:** todo
- **model:** sonnet
- **needs:** T1, T2
- **files:** src/app/claim/[programKey]/page.tsx (guess — the F3.2 `return` at the end of the file only)
- **done when:**
  - [ ] The F3.2 ("No one has set this up yet") branch passes its `<ClaimHeading gap={2} … titlePadTop={8} />` through `ClaimShell`'s `heading=` prop instead of as the first child, with every `ClaimHeading` prop otherwise unchanged
  - [ ] That branch's eyebrow comes from `programEyebrow(program.schoolName, program.team, program.division)` via a second const, with a comment beside it saying why the file now has two eyebrows: the `active` and `claim_pending` states are out of this change's scope and would otherwise be silently altered
  - [ ] The shared four-field `eyebrow` const (currently ~L48–54) and the entire `active` and `claim_pending` branches are byte-identical in the diff, and `programSubtitle` is still imported and used by them
  - [ ] The F3.2 branch's body paragraph, `ClaimActions`, micro line, `aside`, `width={840}`, `gap={16}` and `back` are unchanged
  - [ ] `npx tsc --noEmit` and `npm run lint` both exit 0
- **notes:** Plan step 3. Independent of T4 — either page adoption must be revertable without the other. Design: `work/eyebrow-text-wrap/02_design/output/design.md`, "Chosen design › Components".

## T4 · Adopt eyebrow helper and heading slot on the setup screen
- **status:** todo
- **model:** sonnet
- **needs:** T1, T2
- **files:** src/app/claim/[programKey]/setup/page.tsx (guess — the `eyebrow` composition ~L52–58 and the `ClaimShell` JSX)
- **done when:**
  - [ ] `<ClaimHeading gap={2} eyebrow={eyebrow} title={…} titlePadTop={6} />` is passed through `ClaimShell`'s `heading=` prop, unchanged in every other respect, and `<SetupForm …>` is the shell's only remaining child
  - [ ] The inline `[program.school_name, squad, divisionLabel(…)].filter(Boolean).join(" · ")` composition is replaced by `programEyebrow(program.school_name as string, program.team as string, program.division as string | null)`, producing the same string as before for every row (school · squad · division, conference absent)
  - [ ] The `divisionLabel` import is removed if it is no longer referenced; `teamLabel` stays because `squad` still feeds the title and the four-column `programs` select is unchanged
  - [ ] The title expression, `width={1000}`, `gap={16}`, `asideWidth={340}`, `back`, `aside={<SetupAside />}` and `SetupEmailProvider` wrapper are unchanged
  - [ ] `npx tsc --noEmit` and `npm run lint` both exit 0
- **notes:** Plan step 4. Independent of T3. The file's own doc comment already explains why conference is absent here; keep it — the reasoning now also lives in the helper. The title may still wrap at 24px for the longest school names; that is normal and not in scope.

## T5 · Add the eyebrow width-budget regression spec
- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** tests/claim-eyebrow-width.spec.ts (new); pattern from tests/fixtures/live-db.ts and tests/schedule-static-copy.spec.ts (guess)
- **done when:**
  - [ ] `tests/claim-eyebrow-width.spec.ts` exists, imports `programEyebrow` from `@/lib/data/programs-server`, and starts with `test.skip(!HAVE_ENV, SKIP_REASON)` from `tests/fixtures/live-db.ts` so a keyless checkout passes
  - [ ] It reads every row of `programs` (`school_name, team, division, conference`) and asserts the number of rows composed equals a separate `count: 'exact'` head query, so PostgREST's default 1,000-row page cap cannot silently hide part of the table
  - [ ] It asserts each `programEyebrow()` result is at most 97 characters, with the constant defined once and a comment beside it giving the provenance: 840px hoisted status column ÷ 8.6px measured worst-case per character (Inter 500, 10px, 2.5px tracking, uppercase); today's worst is 74
  - [ ] It asserts no result contains that row's non-null `conference` value, and each failure message names the offending school and the result's length rather than a bare number
  - [ ] `npx playwright test tests/claim-eyebrow-width.spec.ts` passes against the live database, and passes (skipped) with the three Supabase env vars unset
- **notes:** Plan step 5. Node-level spec — no browser, no `webServer`; `playwright.config.ts` deliberately configures neither. Can run before T3/T4 land; only the helper matters. Reading needs no session: `programs` is anon-readable, but use the fixture's `createAdminClient()` for consistency with the other live specs. Live table is ~1,941 rows.

## T6 · Verify the claim eyebrows in the browser and record the result
- **status:** todo
- **model:** opus
- **needs:** T3, T4
- **files:** work/eyebrow-text-wrap/05_build/references/browser-check.md and work/eyebrow-text-wrap/05_build/references/status-1280.png (new, guess); no src/ changes
- **done when:**
  - [ ] Using the `dev` configuration in `.claude/launch.json`, each of `/claim/NorthCarolinaATStateUniversityM`, `/claim/NorthCarolinaATStateUniversityW`, `/claim/MississippiGulfCoastCCW`, `/claim/IndianaUPurdueUIUPUIM` and their `/setup` counterparts is loaded at 1280px and at 768px, and for every one the heading eyebrow (`document.querySelector('h1').previousElementSibling`, not the first `.eyebrow` — the aside panel has one too) reports `getClientRects().length === 1`; the 16 results are tabulated in `browser-check.md`
  - [ ] For each load the record also lists: `h1.getBoundingClientRect().top − eyebrow.getBoundingClientRect().bottom` equals 2 (the unchanged `gap={2}`, matching `main`), the aside is to the right of the heading at 1280 and below the column at 768, and the console error count is 0
  - [ ] The record states the Mississippi Gulf Coast status eyebrow's `innerText` is `MISSISSIPPI GULF COAST COMMUNITY COLLEGE · WOMEN'S · JUCO` — no conference
  - [ ] `status-1280.png` is a screenshot of the Mississippi Gulf Coast status screen at 1280px, committed beside the record
  - [ ] `npm run build` and `npm test` both exit 0, noted in the record; the task's diff touches nothing under `src/` or `tests/`
- **notes:** Plan step 6. Verification only — if an assertion fails, do not fix it here: record the failure and stop, so the fix lands as its own task against the right file. Phone widths below 768px are explicitly not asserted; the design states the guarantee does not hold there. Dev server needs the T1 bootstrap (`npm ci`) to have happened.
