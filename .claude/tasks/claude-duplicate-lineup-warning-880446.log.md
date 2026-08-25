# Run log — claude/duplicate-lineup-warning-880446

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Warn when a lineup spot is already taken — done
- **gate:** mechanical — `npm run lint` exit 0 (0 errors, 38 pre-existing
  `react-hooks/set-state-in-effect` warnings, none in the touched files),
  `npx tsc --noEmit` exit 0, `npm test` 66 passed. Completion review —
  `VERDICT: pass`, all five criteria met, no out-of-scope changes.
  Guardrails — `pipeline-guardrails-reviewer` ran (diff touches
  `src/app/dashboard/` and `src/components/dashboard/`) and reported no
  findings. `rls-boundary-reviewer` skipped: the diff touches none of
  `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or
  `supabase/migrations/`, and adds no table, view or query — `page.tsx`
  only filters and maps `roster.members`, which the existing loader had
  already fetched for the active workspace.
- **changed:** The Roster page derives `lineupSpotHolders` from the roster it
  already loads and threads it page → `RosterHeaderButtons` →
  `AddPlayerDialog`. The dialog renders a `role="status"` line naming whoever
  already holds the picked spot — neutral ink, `Users` glyph, no fill —
  deliberately distinct from `DialogProblem`, which stays red, `role="alert"`
  and reserved for `add_program_player`'s refusals. Nothing blocks: no option
  is disabled, the submit gate is untouched, and `submit()` is unchanged.
  Plural-aware copy, since spots are legitimately shareable mid-reshuffle.

## T2 · Warn on a name already on the roster before submit — done
- **gate:** mechanical — `npm run lint` exit 0 (0 errors, 38 pre-existing
  warnings, none in the touched files), `npx tsc --noEmit` exit 0, `npm test`
  66 passed, `npm run build` compiled. Completion review — `VERDICT: pass`,
  all five criteria met; it stress-tested the extracted normalizer across
  ASCII, tabs, NBSP and Unicode case-folding (İ, ß, final sigma) and confirmed
  the reordering is output-identical, so `getRosterData`'s existing "Likely
  duplicates" block is unchanged in behaviour. Guardrails — both ran, both
  reported no findings: `pipeline-guardrails-reviewer` (diff touches
  `src/app/dashboard/` and `src/components/dashboard/`) and
  `rls-boundary-reviewer` (diff touches `src/lib/data/`). The runner also
  checked T1's four criteria by hand, because this task reshaped the prop T1's
  note reads from — the lineup-spot note still renders, still names the holder,
  still blocks nothing.
- **changed:** T1's `lineupSpotHolders: {spot,name}[]` prop was generalized to
  one `roster: RosterPerson[]` carrying name, email, lineup spot and whether
  the member is a player — one prop path, as T2's notes required, not a second.
  The dialog gains a `role="status"` note when the typed first + last name
  matches a live roster player, naming them with their email or "no email on
  file", using the `GitMerge` glyph the roster table's Possible duplicate chip
  already uses for this question. The rule itself moved to
  `src/lib/data/person-name.ts` (new) so the dialog and `getRosterData` call
  one function instead of two copies of an expression — outside the task's
  `files:` guess, and justified: `team-roster-server.ts` imports the Supabase
  server client and cannot be reached from a client component. Nothing blocks,
  and no client-side email check was added — `add_program_player` still owns
  that refusal and its messages still render in `DialogProblem`.
