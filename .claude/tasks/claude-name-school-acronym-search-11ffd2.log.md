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
