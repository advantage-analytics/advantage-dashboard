# Tasks — claude/score-check-stop-reason

> Scope: upload wizard "Did it end early?" — dual and one-set answers, and persisting why a match stopped (matches.stop_reason).

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Stop-reason answers in "Did it end early?"

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/ScoreCheckNotice.tsx, score-state.ts, types.ts (FormData), DetailsStepContent.tsx (~L1444 ScoreCheckNotice usage), useUploadMatchWizard.ts (the `as const satisfies readonly (keyof MatchFormData)[]` reset list that names `result` and `retiredSide`, ~L192), tests/upload-score-state.spec.ts — guess
- **routes:** /dashboard/matches/new
- **done when:**
  - [ ] `score-state.ts` exports `STOP_REASONS = ["clinched", "time_weather", "retired"] as const` and `type StopReason`; `FormData` gains optional `stopReason?: StopReason` (undefined in `DEFAULT_FORM_DATA`, added to the line-swap reset list beside `result`/`retiredSide`), and the `ScoreCheckNotice` answer handlers write it: "Yes, a player retired" → `retired`, time-or-weather → `time_weather`, dual-decided → `clinched`; `onChange` and "No, I'll finish the score" clear it.
  - [ ] The answer "Yes, it wasn't finished (time, weather)" no longer exists anywhere in `src/`; its row reads exactly "Yes, stopped for time or weather" and still records `result: "Unfinished"`.
  - [ ] `ScoreCheckNotice` takes a `dualLine: boolean` prop, passed from `DetailsStepContent` as `(attachedLine?.eventKind ?? line?.eventKind) === "dual"`. When true, the asking state renders answers in this order: "Yes, play stopped once the dual was decided" (records `result: "Unfinished"`, `stopReason: "clinched"`) · "Yes, a player retired" · "Yes, stopped for time or weather" · "No, I'll finish the score". When false: retired · time or weather · finish the score (T2 adds the one-set row between the last two).
  - [ ] The settled `Unfinished` line reads "Marked as unfinished. Play stopped once the dual was decided." when `stopReason === "clinched"` and keeps "Marked as unfinished. The score stays as entered." otherwise (SwingVision imports arrive as `Unfinished` with no `stopReason` and must keep the old line). Both still use `SettledNotice` from `ImportIdentityNotice.tsx`.
  - [ ] `tests/upload-score-state.spec.ts` (offline project, pure functions) covers the new exports — at minimum that `STOP_REASONS` is exactly the three slugs and that `scoreCheckAnswered` is unchanged for `Unfinished` with and without a `stopReason` — and `npm run lint`, `npm run typecheck`, `npm test` pass.
- **notes:** Read docs/ui-revamp-guardrails.md §3.1 and `.skills/advantage-analytics-design/SKILL.md` → `reference/primitives.md` › "Warning question" first; the notice is that primitive's shipped third case (each state its own keyed element, `noticeEnterCls`, inside `AnimatedHeight`). `useScoreCheck`'s `answered`/`started` logic does not change — `stopReason` is extra detail on an answer, never the answer itself. No spec currently pins the string being renamed; `tests/upload-score-regression.spec.ts` pins the neighbouring strings but is an opt-in browser spec (`WIZARD_REPRODUCTION_BASE_URL`), so update it for the new dual answer only if you touch it. `formData.eventKind === "dual"` from a hand-picked event (EventCell, no preset) deliberately does NOT get the dual answer — scoped to `EventPreset.eventKind` / attached lines. Design canvas: https://claude.ai/artifact/FKwyibMuenY2ig6K3yDiiU

## T2 · "No, it was a one-set match" with settled line and Undo

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/matches/new-match-wizard/score-state.ts, useScoreCheck.ts, ScoreCheckNotice.tsx, ImportIdentityNotice.tsx (SettledNotice), UploadWizardProvider.tsx (~L153 useScoreCheck call), UploadWizardSteps.tsx (~L415–428 DetailsStepContent props), DetailsStepContent.tsx, tests/upload-score-state.spec.ts — guess
- **routes:** /dashboard/matches/new
- **done when:**
  - [ ] `score-state.ts` exports `offersOneSet(input: ScoreGames): boolean` — true only when `bestOf` is 3 or 5, exactly one set is finished (`progress().finished === 1`, nobody decided) and no games are entered beyond set 1 (`lastEnteredSet(...) === 1`); false for best of 1, for a 1-1 split, for a half-typed second set, and for an undecided first set. Pinned by pure tests in `tests/upload-score-state.spec.ts`.
  - [ ] In the non-dual asking state, when `offersOneSet` is true AND the match is not from a preset/attached line (`!fromLine` — the event owns the format), a row reading exactly "No, it was a one-set match" renders between "Yes, stopped for time or weather" and "No, I'll finish the score"; it never renders when `dualLine` is true or when `fromLine` is true.
  - [ ] Choosing it calls the wizard's `handleFormatChange("1")` (through `useScoreCheck`, which receives it from `UploadWizardProvider`), clears `result`, `retiredSide` and `stopReason`, and remembers the previous `bestOf` in hook state; the notice stays visible (not hidden by `scoreUndecided` turning false) as a `SettledNotice` reading "Set to best of 1 · <name> wins." where `<name>` is the winner of set 1 via `setWinner` (falling back to "Your player" / "The opponent" for blank names, as the retired lines do), with the button labelled "Undo" — `SettledNotice` gains an optional action-label prop defaulting to "Change" so `ImportIdentityNotice` and the other settled lines are unchanged.
  - [ ] "Undo" calls `handleFormatChange(<previous bestOf>)`, clears the remembered value and reopens the question (`asked = true`) in its pre-switch asking state; the settled line also goes away on its own if `formData.bestOf` stops being `"1"` (the person changed Format by hand). `unanswered` is false while the one-set line is settled, so Save is enabled and saves a decided match (`result` null — the same row every finished match writes today; `determineWinner` already orders winner/loser from the sets).
  - [ ] `npm run lint`, `npm run typecheck`, `npm test` pass.
- **notes:** `handleFormatChange("1")` slices every score array to one set, which is why `offersOneSet` refuses when anything is typed past set 1 — that would silently drop games. `DetailsStepContent.changeFormat`'s "loses a populated set" confirm is for the Format select and does not need to run here, since the guard above makes the switch lossless. The wizard never writes "<player> Wins" into `matches.result` (`deriveOutcome` in utils.ts has no caller; decided matches save `result: null` and readers print "Final Score") — keep that; the "wins" wording lives only in the settled line.

## T3 · Persist matches.stop_reason from the wizard

- **status:** todo
- **model:** fable
- **needs:** T1, T2
- **files:** supabase/migrations/<timestamp>_matches_stop_reason.sql (new), src/components/dashboard/matches/new-match-wizard/types.ts (MatchData), utils.ts (buildMatchData ~L170–215), useUploadMatchWizard.ts (save path ~L3355–3460: insert and the `reusingMatch` update), tests/ (new or existing hook spec using `tests/fixtures/upload-wizard-hook.ts`) — guess
- **routes:** /dashboard/matches/new
- **done when:**
  - [ ] A committed migration under `supabase/migrations/` (timestamp after `20261002044101`) contains exactly `alter table public.matches add column if not exists stop_reason text check (stop_reason in ('clinched','time_weather','retired'));` plus a `comment on column public.matches.stop_reason` saying it is why a match stopped and that `result` keeps its "Unfinished"/"Retired" caption unchanged; no backfill, no index, no policy change. Apply it to the live project with the Supabase MCP (`apply_migration`, project `pouxujkhtbvkdwbzfvka`) after confirming via `list_tables`/`execute_sql` that the column does not already exist; the commit message says whether it was applied.
  - [ ] `MatchData` gains `stop_reason: StopReason | null` and `buildMatchData` fills it from the result the caller settled on: `result === "Retired"` → `"retired"`; `result === "Unfinished"` → `formData.stopReason` when it is `"clinched"` or `"time_weather"`, else `null`; any other result (decided, one-set, empty) → `null`. A SwingVision import therefore writes `null` with no parser change.
  - [ ] In `useUploadMatchWizard.handleCreateMatch`, the insert carries `stop_reason` via `matchRow`, and the `reusingMatch` `.update({...})` writes `stop_reason: matchRow.stop_reason` unconditionally (a refill that no longer stopped clears it, exactly as `result` is cleared today).
  - [ ] A hook spec on `uploadWizardHarness` asserts `h.writes[0]` for four saves: `{ result: "Unfinished", stop_reason: "clinched" }`, `{ result: "Unfinished", stop_reason: "time_weather" }`, `{ result: "Retired", stop_reason: "retired", score: { winner: ... } }`, and a decided 6-4 6-3 → `{ result: null, stop_reason: null }`.
  - [ ] No reader changes: `git diff --stat` touches nothing under `src/lib/data/`, `src/lib/matches/`, `src/app/dashboard/matches/`, or `supabase/functions/`; the repo keeps no generated `Database` types (verified: no `export type Database` and untyped `createClient` in `src/lib/supabase/`), so none are regenerated. `npm run lint`, `npm run typecheck`, `npm test` pass.
- **notes:** The live DB is the schema source of truth (AGENTS.md); `supabase/migrations/` runs ~100 behind it, so do not infer the column list from the folder. If the Supabase MCP is unreachable at run time, commit the migration file and leave "applied" unchecked in the commit body rather than blocking on it. Nullable `text` + check, not an enum, so a fourth reason later is one `alter ... drop constraint / add constraint`, not a type migration. New column, not a function: the `function_default_privileges_no_anon` grant rule does not apply; the existing `matches` RLS covers it. Other `result` writers (`src/lib/matches/patch-match.ts`, `src/lib/schedule/writes-server.ts`) leave `stop_reason` null — follow-up, not this task.
