# Run log — claude/new-session-c3f1ab

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Build the schedule fixtures module — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (no new; see follow-up 5),
`npx tsc --noEmit` clean, `npm test` 227 passed. Completion review —
`VERDICT: pass`, all five criteria met, en dash U+2013 and middot U+00B7
verified at byte level, no scope creep. Guardrails — **both skipped, legitimately**:
the diff is one new file under `src/lib/schedule/`, checked against both
`git diff HEAD --name-only` and `git ls-files --others --exclude-standard`.
`pipeline-guardrails-reviewer` covers `src/app/dashboard/`,
`src/components/dashboard/` and the upload wizard — none touched.
`rls-boundary-reviewer` covers `src/lib/supabase/`, `src/lib/data/`,
`src/app/api/`, `supabase/migrations/` and any new table, view or query — none
touched, and the file's only import is `import type … from "./types"` (no
Supabase import, no `.from(`, no `"use server"`, no `await`).

**changed:** New `src/lib/schedule/fixtures.ts` (545 lines), the fixture
foundation T2–T8 render from and T10 asserts against. Exports `PROGRAM_NAME`,
`USER_NAME`, `SEASON_LABEL`, `SEASON_FACTS`, `SCHEDULE_ROWS`, `EVENT_DETAILS`,
`TOURNAMENT_DETAIL`, and two `StaticSchedule` sets — `POPULATED_SCHEDULE` and
`EMPTY_SCHEDULE`. Two sets rather than a flag, because `7e` is not `7d` with
rows removed: it has a different header line, "None yet" drawer sections and a
nine-line scaffold, so a flag would save no branch and could disagree with
`rows.length`. The guardrail seam is held: two `EventFormat` consts,
`DUAL_FORMAT { bestOf: 3, adScoring: false }` and `TOURNAMENT_FORMAT
{ bestOf: 3, adScoring: true }`, referenced by all three `ProgramEvent`s, so no
fixture can reach a `format` without an explicit boolean. `adScoring: false` on
duals is the drawn answer (`2b`'s "No-ad scoring"), not a default. The one new
interface, `StaticSchedule`, composes the existing types and redeclares none.
Artboards read for data only: `4c`, `3c`, `7d`, `7e` — `3b`, `2b`, `2c`, `2d`,
`2e` deliberately never entered context. Design-file provenance: DesignSync was
unreachable, so the bytes came from a same-day cached `get_file` capture
(2026-08-31 14:21, `truncated: false`), with the ten artboard ids confirmed
against a live `list_files`. Worth re-verifying against a live pull if any later
task finds a copy mismatch.

**follow-ups:**
1. `EVENT_DETAILS` is deliberately partial — only Ridgeline and Fairmont have
   panes, because only those two are drawn. T3/T4 must not assume a lookup hit;
   selecting State College of Ash or Harlow Valley has a designed answer already
   (`7d`'s prompt pane).
2. The tournament is not on `SCHEDULE_ROWS` — `TOURNAMENT_DETAIL` is exported
   separately because `3c` is the screen that creates it. Adding a row for
   `BUCKEYE_ID` is a one-line change that would make `7d`'s "dual or tournament"
   copy true and let "2 upcoming" derive. Flagged rather than decided.
3. `SEASON_FACTS` is one flat string; `7d` renders its four numerals in
   `.tabular` spans. T3 will need to split it or rebuild the spans — the parts
   were deliberately not exported, to avoid a second source of the same truth.
4. **Design copy flagged, not fixed (inherited rule 4) — input for T12.** Seven
   items, all reproduced as drawn: (a) the drawer's "6 events · 2 upcoming · 4
   completed" is not derivable from the four rows drawn; (b) "3–1 in duals"
   needs a lost dual no artboard names, and "31 of 36 lines" implies four
   completed duals; (c) `7d`'s "8 of 9 lines analyzed" for Fairmont disagrees
   with `4c`'s own pane (5 reports + 1 analyzing + 3 "Coming soon"); (d) `4c`'s
   header indicator bars contradict its rows — the greyed bars would give 4–1,
   the rows give the drawn 5–2; (e) cross-artboard name drift — `4c`'s "L.
   Moreau" (S4) and "K. Sato" (S6) vs `3c`'s "Jules Moreau" (S5) and "Lena
   Adeyemi" (S6), no Sato anywhere; (f) `7e`'s season label "2026–27" contradicts
   the drawn weekdays, which are correct for 2025 — 2025 dates were used so
   `formatEventDay()` reproduces the drawn strings, and "2026–27" exported
   verbatim; (g) `7d`'s pane says "Pick a dual or tournament on the left" but the
   drawer draws four duals and no tournament.
5. The queue preamble's stated lint baseline is wrong: this worktree reports
   **37** warnings, not 43. The brief and plan both carry the 43 figure. Worth
   correcting by hand — the queue file is the author's, so this run did not
   touch it beyond the `status:` line.

## T2 · Rebuild 3b — the event-type chooser — blocked

**gate:** mechanical **passed** — `npm run lint` 0 errors / 37 warnings (none
added), `npx tsc --noEmit` clean, `npm test` 227 passed. Completion review
**FAILED** — `VERDICT: needs-work`, three findings against `done when:` line 1
(the 1280px fidelity criterion). Guardrails — `pipeline-guardrails-reviewer`
**ran** (diff touches `src/app/dashboard/` and `src/components/dashboard/`) and
returned **clean**: the chooser holds only `choice: EventKind` and neither sets
nor drops `adScoring`, the route's guard block is byte-identical so no player
reaches a builder they could not before, no provider-naming or
misattribution hazard. `rls-boundary-reviewer` **skipped** — no
`src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/`
file in the diff (checked tracked and untracked) and no new query, table or
view; the new component has no Supabase import, no `.from(`, no `fetch` and no
`"use server"`.

**why it failed:** three fidelity divergences from artboard `3b`, all inside
the task's own first criterion.

1. **The "Add it in Matches" link points at a live external route.** The
   artboard's own anchor is the placeholder `href="#3b"`; the implementer wired
   it to `/dashboard/matches/new`. The brief's non-goal is categorical — *"Links
   may be inert or point within the rebuilt set; wiring them to real
   destinations is later work"* — and `/dashboard/matches/new` is outside this
   run's four rebuilt routes. `design.md`'s carve-out for `4c`'s report links is
   a specific, reasoned exception for a different artboard and was never
   extended to this one.
2. **The selected card's inner divider is the wrong colour.** The artboard
   specifies `rgba(59,130,246,0.15)`; the implementer used
   `--blue-tint-12` (0.12), reasoning that no token carries 0.15. **That
   reasoning is factually wrong** — `--blue-glow: rgba(59,130,246,0.15)` is
   declared at `src/styles/design-system/colors.css:72`, the exact value,
   currently unused. Verified independently by the runner. Reusing an existing
   token is not the token work inherited rule 7 forbids, so an exact-fidelity
   option was available and was not taken.
3. **The bottom inset is unreconciled and unflagged.** The artboard's content
   pane is `padding: 36px 48px 0`. The `pt-[10px]` wrapper correctly makes the
   top edge 36px against `EventShell`'s `pt-[26px]`, but `EventShell`'s `pb-8`
   (32px) stands against the artboard's 0. Declining to edit the shared
   `EventShell` — which three other in-flight screens sit in — is a defensible
   scope call; leaving the gap uncommented in the code is what makes it a
   finding rather than a documented trade-off.

**stash:** `29062bef5efd3795ad1e071e5ebad613936d9b95` (`git stash apply
<sha>`, not `stash@{n}` — the stash stack is shared across this repo's
worktrees and the index shifts). The stash holds the full T2 implementation:
the new `static-event-chooser.tsx` and the route re-point. It is close to
passing — the three findings are small, local edits, and the copy check,
the state behaviour, the route-edit shape and every measured spacing/type/
radius value were all verified correct.

**changed:** nothing landed in the tree. This commit carries only the
`status:` line and this log entry.

**follow-ups:**
1. **The route-edit shape T2 established is sound and worth keeping** even
   though the task is blocked — T3, T5 and T8 copy it: change one import line,
   change the `return`, leave the guard block untouched, append a paragraph to
   the route's existing doc comment naming the dormant component, and do not
   touch the dormant file. Net diff per route: two code lines plus a comment.
   Verified byte-identical guards on this attempt.
2. **A signed-in browser session does not exist in this worktree**, so no task
   in this run can load a guarded route directly. T2 worked around it with a
   temporary unguarded harness route sized to the artboard's content region
   (1048×796 = 1280−232 sidebar, 840−44 topbar), measured computed styles
   there, then deleted the harness. That technique works and later tasks will
   need it — but a harness left behind would ship an unguarded route, so it
   must be deleted before the gate every time.
3. **Design copy flagged, not fixed — input for T12.** "Add it in Matches"
   names a destination a team workspace's sidebar does not expose; the coach
   cannot navigate there from the rail. Reproduced verbatim per inherited
   rule 4. Note the dormant `new-event-chooser.tsx` had silently reworded this
   to "Add a single match" pointing at the team single-match route — that
   rewording is a divergence from the design, and the design wins here.
4. **`Creates 9 lines` sets the 9 in `mono tabular`** per the artboard's own
   class list, while the dormant component deliberately dropped `mono` on the
   argument that Roboto Mono is reserved for timestamps, quota readouts and job
   ids — never a count inside a sentence. The design was followed per rule 3.
   Worth settling once in the design system rather than per component; it has
   now been decided in two directions from the same artboard.
