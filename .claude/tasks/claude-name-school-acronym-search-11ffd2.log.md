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
