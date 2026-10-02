# Start-over guardrails review (T5)

- **Date:** 2026-09-23
- **Reviewed:** the uncommitted working-tree diff for T5 on
  `claude/upload-wizard-trimming-design-4629a3`. It covers `startOver()` in
  `useUploadMatchWizard.ts`, the window seed in `handleFileContinue`, the new
  `StartOverDialog.tsx`, its wiring in `UploadMatchFlow.tsx`, the open-dialog
  guard in `useWizardKeys.ts`, and `tests/upload-start-over.spec.ts` plus
  `tests/upload-subject-bar.spec.ts`. Reviewed against
  `docs/ui-revamp-guardrails.md`.
- **Reviewer:** `pipeline-guardrails-reviewer` subagent
- **Verdict:** PASS. No violations were raised, so no re-run was needed.

---

All 11 tests pass. Verdict below.

## Verdict: PASS

### Misattribution check (§4 of guardrails) — clean

Traced all three inputs through the diff:

1. **"Your end at video start" (`initialTopPlayerIsPlayer1`)** — in `START_OVER_FIELDS` (`src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts:139-171`), reset to `DEFAULT_FORM_DATA.initialTopPlayerIsPlayer1`, which is `undefined` (`types.ts:222`) — never coerced to `false`. `startOver()` also resets the drift-tracking refs (`topPlayerAnswerStartRef`, `topPlayerAnswerRef`, `topPlayerAnswerStale`) so no stale baseline survives into the new player's answer (`useUploadMatchWizard.ts:2242-2246`). Verified by the "drift rule starts fresh" test.
2. **Set scores (top-player-first ordering)** — `playerScores`/`opponentScores`/`playerTiebreaks`/`opponentTiebreaks` are all in `START_OVER_FIELDS`, cleared to `DEFAULT_FORM_DATA`'s `[null, null, null]` arrays (copied, not shared — `useUploadMatchWizard.ts:2260-2264`).
3. **Tiebreak game count** — covered by the same score fields above; no separate binding.

The subject itself (which decides `player1_id`) is written **only** by `chooseMatchSubject` (`useUploadMatchWizard.ts:1802-1827`, called from step 1's For field) and by the initial-state seed. `startOver()` writes `applyMatchSubject(null)` (`useUploadMatchWizard.ts:2239`) and nothing else touches `matchSubject`/`matchSubjectRef`. `playerName` is written only inside `chooseMatchSubject` and is itself in `START_OVER_FIELDS`, so it can't outlive the subject that named it. `fixedCamera` and `initialTopPlayerIsPlayer1` stay `boolean | undefined` throughout — `DEFAULT_FORM_DATA` never sets them, and `handleTrimChange` writes `undefined`, never `false`, when clearing (`useUploadMatchWizard.ts:2124`). Confirmed by `npx tsc --noEmit` (clean) and by the new `startOver returns to step 1...` test asserting `toBeUndefined()` on both.

### §3.1 trim window / billable-seconds invariant — holds

The new seeding in `handleFileContinue` (`useUploadMatchWizard.ts:1920-1938`) only fires when `videoStartSeconds`/`videoEndSeconds` are both `undefined` — exactly the state `startOver()` leaves on a kept file — and reproduces the same "default to the whole video" behavior the existing on-pick handler already uses at line 2062-2063. It does not fabricate a partial or previously-typed window; it re-derives `[0, duration]` from the current `videoProbe`, same as a fresh pick would. `billable_seconds`/vendor `StartTime`/`EndTime` derivation downstream is untouched.

### `attachedLine`/`event_entry_id` handling — correct, and consistent with the exception in §2

`startOver()` drops `attachedLineRef`, `detachSnapshot`, and `attachedLine` state outright rather than running Detach's restore (`useUploadMatchWizard.ts:2251-2257`), which is appropriate: the slot belonged to the old player, and `handleCreateMatch` reads `attachedLine` for `event_entry_id` only at insert time — with it nulled, the new player's match will not be filed under the old player's scheduled line. The event/date/format/court values the line filled are deliberately left in place as freeform match facts (not reset), matching the doc comment's reasoning that those describe the match "whoever played it." No `event_entry_id` write happens outside the documented `attach_match_to_event_line` exception; this path is pre-insert form state only. Verified by the "attached lineup slot... is dropped" test.

### Other checks

- **Workspace scoping / role gating / `canSubmitVideo`** — not touched; diff is confined to wizard client state and dialog UI.
- **Analysis-state short-circuit** (`matches/[matchId]/page.tsx`) — not touched.
- **Provider naming** — no `splitstep` string appears anywhere in the diff (`git diff | grep -ni splitstep` empty); `StartOverDialog.tsx` copy is player-facing English only.
- **`SubjectBar` gating on `subject.kind === "roster"`** — initially looked like it could leave `onNotSubject` armed with no dialog to open for a personal-workspace ("self") subject, but `SubjectBar` itself returns `null` for non-roster subjects and is documented as team-only by construction, so the button that triggers `startOver` is never reachable for a personal-workspace subject. Not a bug.

Relevant files reviewed: `/Users/cjgimena/Desktop/vscode/advantage-dashboard/.claude/worktrees/upload-wizard-trimming-design-4629a3/src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts`, `.../StartOverDialog.tsx`, `.../UploadMatchFlow.tsx`, `.../useWizardKeys.ts`, `.../SubjectBar.tsx`, `.../types.ts`, `/Users/cjgimena/Desktop/vscode/advantage-dashboard/.claude/worktrees/upload-wizard-trimming-design-4629a3/tests/upload-start-over.spec.ts`.
