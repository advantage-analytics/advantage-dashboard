# Plan — Schedule day-zero states by role (5a & 5b)

The design resolves to one UI surface (`schedule-list.tsx`) plus a one-class
enabler in its route file. That is one subagent-sized step; splitting the
component edit from the page-class edit would leave step 1 unverifiable (the
centering only works with both). A second step covers the repo-wide checks
that need the finished diff.

## Step 1 — Rewrite `EmptySchedule` as the role-branched 5a/5b body

**Files**
- `src/components/dashboard/schedule/schedule-list.tsx`
- `src/app/dashboard/team/schedule/page.tsx`

**Change**
- `page.tsx`: add `flex-1` to the inner container
  (`mx-auto flex max-w-screen-2xl flex-col px-6 py-8 sm:px-10`) so the
  empty state can center vertically. No other page change.
- `schedule-list.tsx`, zero-rows branch: wrapper gains `flex-1`
  (`flex flex-1 flex-col`); pass `canCreate` into `EmptySchedule`.
- `schedule-list.tsx`, `EmptySchedule`: rewrite per the design's component
  spec — signature `{ canCreate: boolean }`; shared centered frame
  (`flex flex-1 flex-col items-center justify-center text-center
  min-h-[360px] py-16`), bare Lucide `Calendar` `size-7` stroke 1.5
  `--ink-300`, 24px/300 headline (`mt-[18px]`, tracking −0.3px, `--ink-900`),
  `.text-body-sm` sentence (`mt-2`, `[text-wrap:pretty]`), quiet-links row
  (`mt-5`, 11px/500 blue links, `h-2.5 w-px` `--border-medium` divider).
  - `canCreate` (5a): headline "No events yet"; body sentence and
    `max-w-[46ch]` per design; links **New event** →
    `/dashboard/team/schedule/new` and **Add a one-off match in Matches** →
    `/dashboard/matches/new`, both `next/link`.
  - player (5b): headline "Nothing scheduled yet"; body sentence and
    `max-w-[48ch]` per design; link **Add your own match** →
    `/dashboard/matches/new`; note strip (`mt-[26px]`, `rounded-lg`,
    `bg-[var(--surface-subtle)]`, `px-3 py-[9px]`, `max-w-[520px]`, Lucide
    `Bell` 13px `--ink-500` `shrink-0`, `.text-micro` `--ink-600` text):
    "The schedule is coach-managed — your line appears here once the lineup
    is set." No "How events work", no "Notifications" link (design's
    resolved copy corrections).
- The `Header` component and the populated-schedule path are not touched.
  Current `EmptySchedule` copy is deleted with the rewrite.

**Verification (in-step)**
- `npx tsc --noEmit` — 0 errors.
- `npm run lint` — no new warnings (43 pre-existing expected).
- `npm run build` — passes.
- Grep-level self-check: no `advButton` change, no new focus classes (the
  focus system covers links/buttons by tag), `Header` untouched in the diff.

## Step 2 — Repo gates on the finished diff

**Files** — none edited; runs against the Step 1 diff.

**Change** — none. This step exists because both gates want the complete
diff, not a partial one.

**Verification**
- `npm test` (Playwright pure-function specs + generated-route-table check)
  — green; this change adds no route, so `npm run map` is not needed.
- `pipeline-guardrails-reviewer` agent over the diff — expected clean: the
  change touches no wizard input, no analysis-status predicate, no deletion
  path; it is §3.5 "safe to redesign freely" territory (empty states, copy).

## Order dependencies

Step 2 needs Step 1's committed diff. Nothing else; there is no step
parallelism to exploit.

## Test strategy

No new automated test: the diff is presentational JSX branching on a boolean
computed and shipped elsewhere (`isProgramStaff` via `canCreate`). Existing
specs are pure-function tests; a component-render spec would only re-assert
React's conditional rendering, and the repo has no component-test harness to
borrow. Coverage comes from: compile/lint/build (step 1), the existing suite
+ guardrails reviewer (step 2), and human visual review of both role
variants in stage 06 — the review stage should load the page as staff and as
player (zero events) and confirm 5a/5b against the mock, plus one populated
smoke check that nothing moved.
