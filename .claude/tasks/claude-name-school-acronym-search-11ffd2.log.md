# Run log — claude/name-school-acronym-search-11ffd2

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Match any part of a school name or acronym in program search — done
- **gate:** mechanical green (lint 0 errors / 38 warnings, all pre-existing;
  tsc clean; 66/66 tests). `task-completion-reviewer` VERDICT: pass — all five
  criteria met, criteria 2 and 3 re-verified by the reviewer against the live
  database rather than taken from the migration text. `rls-boundary-reviewer`
  ran (the diff touches src/lib/data/, src/app/api/ and supabase/migrations/)
  and reported no findings — projection, grants and `search_path = ''`
  qualification all unchanged; it audited the files statically, having no
  Supabase MCP in its tool set. `pipeline-guardrails-reviewer` skipped: nothing
  under src/app/dashboard/, src/components/dashboard/ or the upload wizard.
- **changed:** New migration `20260824165351_search_programs_contains.sql`,
  applied live as version 20260824165351. `public.search_programs()` now matches
  the term anywhere in `school_name` or `school_abbrev` instead of only at the
  start, with a `case` in the `order by` keeping prefix hits above mid-string
  ones. `pg_trgm` installed into `extensions`, and one GIN index
  (`programs_school_search_trgm_idx`) over both matched expressions, written as
  the where clause writes them. The header replaces the old prefix-vs-contains
  argument with the measured cost: 25 buffers / 0.3 ms for "angeles" on the
  index, and — for the two-character case no trigram index can serve — 168
  buffers / 5.1 ms on the worst term "un", which is what the two-character floor
  exists to keep off the first keystroke. `programs-server.ts` and the route
  changed by doc comment only; both floors and all three UI callers untouched.
  Caveat the diff cannot show: the SQL text recorded in `schema_migrations`
  still carries the draft filename stamp inside a comment, and the header's cost
  paragraph was tightened after applying. The executable SQL is identical.

## T2 · Attach the squad to school names in the opponent pickers — done
- **gate:** mechanical green (lint 0 errors / 38 warnings, the standing
  baseline; tsc clean; 66/66 tests). `task-completion-reviewer` VERDICT: pass —
  all four criteria met, each traced to the call site rather than the stale line
  numbers in the task, and the one unasked-for change (`pickedSchool`) judged
  justified rather than scope creep. `pipeline-guardrails-reviewer` ran (the
  diff is two dashboard components, one of them in the upload wizard) and
  reported no findings: the three misattributing wizard inputs are untouched,
  `programKey` still resolves identity at both call sites, and the squad label
  reuses each component's existing meta token. `rls-boundary-reviewer` skipped:
  nothing under src/lib/supabase/, src/lib/data/, src/app/api/ or
  supabase/migrations/, and no new table, view or query.
- **changed:** Both opponent pickers — the schedule's
  `opponent-picker.tsx` and the wizard's `OpponentProgramField.tsx` — now show
  the squad beside the school in each result row via `teamLabel()`, so the two
  Louisiana State University rows are distinguishable, and store
  `programDisplayName(...)` ("Louisiana State University Men's Tennis") in place
  of the bare school name. `programKey` still travels beside it untouched, and
  the free-text Enter path still stores exactly what was typed. One state,
  `pickedSchool`, was added to keep the schedule picker's "Change" button
  seeding the search box with the bare school name — without it the stored
  squad-qualified string would search the directory and find nothing.
  Consequence worth knowing: for a dual, that string is persisted as
  `program_events.name` and copied into `matches.tournament_name`, so schedule
  rows, breadcrumbs and match headers now read "vs Louisiana State University
  Men's Tennis". Correct and unambiguous, but longer; if a short form is ever
  wanted back, the place to fix it is the render, not the stored value, which is
  the only thing telling the two duals apart. Also noted by the guardrails
  reviewer, and not reachable today: if `OpponentPicker` ever gains an edit path
  for a saved dual, `pickedSchool` starts empty and "Change" would seed the
  qualified string again.

## T3 · Warn when a dual's opponent is the other squad — done
- **gate:** mechanical green (lint 0 errors / 38 warnings, the standing
  baseline; tsc clean; 66/66 tests). `task-completion-reviewer` VERDICT: pass —
  all five criteria, including the stale-state transition criterion 3 invites
  (pick a mismatched row, then replace it by typing) and an explicit check that
  the Create button's `disabled` expression and the `createDual` payload are
  untouched. `pipeline-guardrails-reviewer` ran (the diff is one dashboard route
  plus two dashboard components) and reported no findings: authorization is
  still re-derived server-side by `requireStaff()` rather than trusting the new
  client prop, the capsule reuses tokens already in colors.css and matches the
  parse-warning capsule in UploadContent.tsx, and no vendor-bound wizard input
  is anywhere near this route. `rls-boundary-reviewer` skipped: nothing under
  src/lib/supabase/, src/lib/data/, src/app/api/ or supabase/migrations/, and no
  new table, view or query.
- **changed:** `OpponentPicker`'s `onChange` widened from `(name, programKey)`
  to `(name, programKey, team)` — the directory row was already in hand, so the
  squad costs nothing to pass and the free-text path sends null for all three
  together, which is what keeps a replaced pick from leaving a stale squad
  behind. `dual/page.tsx` passes `ourTeam={active.team}`, which the server
  component already had. `DualForm` compares the two and renders an advisory
  capsule below the opponent field: "Men's squad, Women's opponent. This
  workspace is <ours> and you picked <theirs>. Create the dual anyway if that is
  the fixture — nothing here is blocked." It warns and nothing more: Create
  stays enabled, `createDual` receives exactly what it did before, and
  `CreateDualInput` has no squad field to carry it. Worth knowing: `dual-form`
  imports `teamLabel` from `lib/workspace/types` (null-safe) rather than the
  same-named `programs-server` twin (which answers "Men's" to null); the import
  carries a comment saying why, since the guard means either would work today
  and a future edit outside that guard would not.

## T4 · Take prefix hits first, and correct the cost the header claims — done
- **gate:** mechanical green (lint 0 errors / 38 warnings, the standing
  baseline; tsc clean; 66/66 tests). `task-completion-reviewer` VERDICT: pass —
  all five criteria, and it did not take the migration's word for any of them:
  it confirmed the live function body matches the file, rebuilt the predecessor
  under a temporary shadow function to diff row order term by term, and
  re-measured every timing in the header itself, reproducing each within noise.
  `rls-boundary-reviewer` ran (the diff is a migration redefining a definer
  function granted to `anon`) and reported no findings — projection, grants and
  `search_path = ''` unchanged, `owner_user_id` confirmed unable to reach the
  result through the new CTEs, and the two-branch union proved a subset of the
  old predicate. It could not reach the live database from its tool set, so the
  runner closed that gap directly: `prosecdef`, `proconfig`, the anon and
  authenticated grants and both indexes verified live, and `get_advisors`
  returned nothing new — the only two lints naming `search_programs` are the
  pre-existing definer-executable WARNs every RPC here carries.
  `pipeline-guardrails-reviewer` skipped: no dashboard, component or wizard
  surface in the diff.
- **changed:** New migration `20260824181009_search_programs_prefix_first.sql`,
  applied live as version 20260824181009. `search_programs()` is now two
  branches: prefix hits off `programs_school_name_prefix_idx`, then the contains
  scan only when the prefix cannot fill the page, gated by an uncorrelated
  sub-select so the planner drops the scan entirely as a One-Time Filter. The
  prefix test is written as `~>=~` / `~<~` rather than `like term || '%'`,
  because Postgres only rewrites LIKE into an index range for a constant
  pattern — which is why that btree had been idle since the day it was created,
  including under the prefix-only search it was built for. Measured live, per
  call: "un" 9.90 → 0.49 ms, "univ" 6.78 → 0.38 ms, "universi" 6.56 → 0.36 ms,
  a lone "_" 7.14 → 0.08 ms; "angeles" pays 0.11 → 0.17 ms, stated in the
  header rather than hidden. Row order is preserved by construction (tier,
  school_name, team) and was verified across 6,185 terms. The two-character
  floor now measures the trimmed input instead of the escaped term, so a lone
  `%` or `_` no longer doubles in length and buys a full scan. The header
  replaces its predecessor's false "from three characters up the scan is gone"
  with the reason it was false: the index turns on selectivity, not length.
