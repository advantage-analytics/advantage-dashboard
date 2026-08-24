# Tasks — claude/name-school-acronym-search-11ffd2

> Scope: finding a program — how the directory is searched, how a school reads
> once found, and what happens when the squad is wrong.

Run one with `/task-next`. Drain the file with `/loop /task-next`.
Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so `/loop /task-next`
drains straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Match any part of a school name or acronym in program search
- **status:** done
- **files:** supabase/migrations/<new>_search_programs_contains.sql (redefines
  public.search_programs), src/lib/data/programs-server.ts,
  src/app/api/programs/search/route.ts — guess
- **done when:**
  - [ ] A new migration redefines `public.search_programs()` to match the term
        anywhere in `school_name` or `school_abbrev`, and its header records the
        version it was applied live as, in the style of the 2026-08-17 file
  - [ ] Against the live database: "angeles" returns University of California,
        Los Angeles; "ucla" still returns it; "nccu" still returns North
        Carolina Central — with prefix matches ordered above mid-string ones
  - [ ] Rows whose `school_abbrev` is null (348 of 1,941, including one of the
        two North Carolina State rows) still match on name substring
  - [ ] The leading-wildcard scan the old header warns about is answered, not
        ignored: a trigram index covers both matched columns, and the new header
        replaces the now-false "Prefix match, not contains" paragraph with the
        measured cost of a two-character query
  - [ ] The two-character floor still short-circuits in both
        `searchPrograms()` and the route, and `programs-server.ts`'s
        "prefix-vs-contains" comment no longer describes behaviour that is gone
- **notes:** Feeds three callers — claim/program-search.tsx, the schedule
  opponent picker, and the wizard's OpponentProgramField — none of which should
  need a change. Player and tournament names are already contains-matched in
  search-command-palette.tsx, so they are out of scope here.

## T2 · Attach the squad to school names in the opponent pickers
- **status:** done
- **files:** src/components/dashboard/schedule/opponent-picker.tsx,
  src/components/dashboard/matches/new-match-wizard/OpponentProgramField.tsx,
  src/lib/data/programs-server.ts (helpers already there) — guess
- **done when:**
  - [ ] Both pickers' result rows carry the squad, so the two Louisiana State
        University rows are told apart on sight — via `teamLabel()` /
        `programDisplayName()`, not a hand-rolled string
  - [ ] Picking a row stores the squad-qualified name: the `onChange` at
        opponent-picker.tsx:121 and OpponentProgramField.tsx:136 no longer pass
        the bare `result.schoolName`
  - [ ] The collapsed states show it too — OpponentProgramField's selected chip
        and the dual form's `theirName`
  - [ ] Typing a free-text opponent is unchanged: the Enter path at
        opponent-picker.tsx:106 still stores exactly what was typed, with no
        squad appended
- **notes:** The claim flow's list is already correct and should stay untouched.
  OpponentProgramField sits in the upload wizard, so the run needs the
  guardrails pass — docs/ui-revamp-guardrails.md.

## T3 · Warn when a dual's opponent is the other squad
- **status:** done
- **files:** src/components/dashboard/schedule/dual-form.tsx,
  src/components/dashboard/schedule/opponent-picker.tsx,
  src/app/dashboard/team/schedule/new/dual/page.tsx — guess
- **done when:**
  - [ ] Picking a directory program whose squad differs from the workspace's
        shows an inline warning at the opponent field that names both squads
  - [ ] It warns and does not block: Create stays enabled, and the `opponent`
        and `opponentProgramKey` sent to `createDual` are unaffected
  - [ ] Nothing appears when the squads match, when the opponent was typed
        free-text (no program key), or when either squad is null
  - [ ] The workspace's own squad arrives as a prop from the page's
        `active.team` — dual/page.tsx passes only `ourName` today
  - [ ] The picked program's squad reaches the form from the search result
        already in hand, with no second lookup
- **notes:** Depends on T2, which rewrites the same `onChange` call. Scoped to
  the dual form; the upload wizard's opponent program field is the other place
  this could fire.

## T4 · Take prefix hits first, and correct the cost the header claims
- **status:** done
- **files:** supabase/migrations/<new>_search_programs_prefix_first.sql
  (redefines public.search_programs) — guess
- **done when:**
  - [ ] A new migration redefines `search_programs()` to take prefix hits
        first — served by the existing `programs_school_name_prefix_idx` —
        and fall through to the contains scan only when prefix returns fewer
        than the limit, with the result order unchanged from today
  - [ ] Its header replaces 20260824165351's "from three characters up the
        scan is gone", which is false, with what the measurement shows: the
        index turns on term selectivity, not term length. Numbers, and how
        they were taken
  - [ ] Live: "angeles", "ucla", "nccu" and "north carolina state" return the
        same rows in the same order as they do now, and "un" and "univ" are
        measurably faster than today's 9.71 ms and 6.61 ms per call, timed the
        same way — a non-constant term, so the plan is the real one
  - [ ] The two-character floor is measured on the trimmed input rather than
        the escaped term, so a lone `%` or `_` no longer doubles in length and
        slips past it; the 20-row cap, SECURITY DEFINER, `search_path = ''`
        and the anon/authenticated grants are all unchanged
  - [ ] `programs_school_name_prefix_idx` is kept, not dropped, and the header
        says why — the prefix branch is what puts it back to work
- **notes:** From /pr-check on 2026-08-24, measured against the live directory:
  the trigram index serves selective terms (`angeles`, 3 rows, 0.09 ms) but not
  common ones at any length (`univ` and `universi` both scan 1,228 rows). By
  each school's own name prefix, 16.3% never reach an index path however much
  the coach types. 20260824165351 is applied live and must not be edited —
  this is a new migration. The route's cookie-bound client, also flagged by
  /pr-check, is a separate concern and deliberately not in scope here.
