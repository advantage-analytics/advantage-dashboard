# Run log — claude/tournament-wizard-fixes-ed4c95

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Default the tournament builder's format to No-Ad — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** `static-tournament-builder.tsx` `DEFAULT_FORMAT` now looks up the `"bo3-no-ad"` row of `FORMATS` (doc comment updated to say no-ad, matching the dual builder); the private `formatFor` helper is exported so the derived object can be asserted; new `tests/tournament-format-default.spec.ts` (2 cases: no-format seed → adScoring false / bestOf 3; `"bo3-ad"` seed → Ad); `tests/schedule-static-copy.spec.ts` pinned literal moved from `"bo3-ad"` to `"bo3-no-ad"` with its comment corrected.
- **follow-ups:** 1. `event-fact-fields.tsx` `formatOptions(FORMATS)` order — now that both builders default to no-ad, consider listing the no-ad rows first.

## T2 · Default lets to Play On for college matches — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** `recordResult` (`writes-server.ts`) writes `format.play_on_lets: true` on both the singles and doubles branch; the wizard's preset seed (`useUploadMatchWizard.ts` ~1436) sets `playOnLets: true` when `preset.eventKind` is `dual` or `tournament`, leaving `bestOf`/`adScoring` lines untouched and `DEFAULT_FORM_DATA.playOnLets` false for personal uploads. Specs: `tests/schedule-outcome-actions.spec.ts` (writer, both disciplines) and `tests/upload-validation.spec.ts` (hook harness: dual, tournament, no-preset).
- **follow-ups:** 1. The `attachLine`/`attachedLine` path in the same hook does not seed `playOnLets` from `eventKind` — if attached-line college matches should also default to Play On, that is a separate small change. 2. No hint near the Lets toggle explains why it defaults on for college matches; add one if it surprises coaches.

## T3 · Carry tiebreak points from a recorded result into both score seeds — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** `EventPreset.score` now declares optional `player1_tiebreaks`/`player2_tiebreaks` (games in `player1`/`player2`, points against the loser per guardrails §4.3); `seedScoreForm` copies each side's tiebreak cells instead of writing nulls; the wizard's preset seed gains a `presetTiebreaks()` helper spread beside `numberOfSets` (no arrays → no override, so today's nulls stay). `presetFor` needed no change (passes `match.score` whole). Specs: score-seed (7-6(5), 6-4 → 5 in `opponentTiebreaks[0]`; round-trip to `recordResult`), upload-score-state (hook seed with and without arrays), upload-line-swap (swap clears a tiebreak-bearing recorded score), line-choices (forwarding pinned).
- **follow-ups:** 1. Re-seeding the same line (effect dep change, not a swap) overwrites typed games and now typed tiebreaks too; a single guard for both may be worth it. 2. Seeded tiebreak rows are padded to 3 while `playerScores` seeds unpadded; align the lengths. 3. `sameRecordedScore` compares games only; the new swap case relies on that.

## T4 · Keep the upload success screen on /dashboard/team/upload after the row is written — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** New pure resolver `src/lib/schedule/upload-target.ts` (`resolveUploadTarget(schedule, entryId, matchId)` → preset | redirect; keeps the old refusals — not in program, forfeit, doubles, foreign match, all outcomes recorded — and stops refusing lines that have video). The team upload page's `?entry=` branch now reads `getProgramSchedule` + the resolver instead of the videoless queue, with a comment explaining why the queue filter must not gate it; the bare picker still uses `getUploadQueue`. Specs: `tests/upload-target.spec.ts` (the five required cases + forfeit, clicked-round-with-video, prefers-videoless, no-match, queue-list-still-excludes-video) and two trail cases in `tests/upload-page-trail.spec.ts`. `useUploadMatchWizard.ts` and `uploadQueueFrom` untouched.
- **follow-ups:** 1. The personal route's `?match=` add-video branch (`getAddVideoTarget` in `src/lib/data/add-video-server.ts`) likely shares the fault: once the wizard creates the job, the refresh finds a non-failed analysis and redirects to the match page — from code reading, not reproduced; needs its own task and spec. 2. A browser spec driving `/dashboard/team/upload?entry=&match=` through create and asserting "Uploading your video" stays visible after the refresh; current specs pin the server tree only.

## T5 · Re-sync the wizard's line preset when the event's format changes — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** `writes-server.ts` gains `revalidateEventEdit(eventId)` (schedule paths + `/dashboard/team/upload`), used by `updateDual` and `updateTournament`. `types.ts` now exports `presetLineKey` (moved from the hook) and a pure `followServerPreset(held, incoming)` that returns a merged preset only for the same line when `bestOf`/`adScoring` differ (adScoring copied as-is, never defaulted). `UploadMatchFlow` compares the incoming `initialPreset` with the last one seen during render and calls `setPreset` with the followed preset; the hook's seed effect then re-seeds format for the same line without touching `LINE_SWAP_FIELDS`, file or score. Specs: `tests/schedule-write-errors.spec.ts` (2 revalidation cases), `tests/upload-line-swap.spec.ts` (7 cases: hook harness Ad→No-Ad and best-of, pure helper, source check on the flow).
- **follow-ups:** 1. A format re-sync on a draft-resumed line re-spreads `draft.formData` (the known `test.fail` case) — same root as the resume regression. 2. Same-line re-seed writes `preset.score` over a score typed over the record; seed the score only on first seed, swap, or when the preset's score object changed. 3. Only the held line follows; after a bar swap to line B the URL still names A, so B keeps its old format until reload. 4. Only `bestOf`/`adScoring` follow; name, date, surface edits are not re-synced.

## T6 · Change round on "The result." without losing what was typed — done

- **gate:** mechanical GATE PASS (lint, typecheck, full suite); completion review VERDICT: pass
- **changed:** `score-seed.ts` gains pure `RoundSeed`, `presetAtRound`, `scoreFormDirty` (compares against what was last seeded, trailing nulls equal) and `reseedForRound` (untouched form reseeds via `seedScoreForm` incl. tiebreaks; typed form kept whole). `score-only-flow.tsx`: `changeRound` no longer navigates — it moves `current` to `presetAtRound`, reseeds/keeps the form, updates `savedOutcome`, and rewrites `?entry=&round=` with `history.replaceState`; `scoreHref` prop removed; `ScoreForm` keyed `${entryId}#${lineSwitches}` (counter bumps on the PinnedLineBar Change menu and "Save and next", so line switches still remount). The page keys the flow on `entry.id` only and builds `roundSeeds` per tournament entry through `presetFor`. Harness gained `?recorded=true` (entry-t1 at R16 with a recorded R32 6-3 7-6(4) vs Casey Chen). Specs: outcomes harness (3 tournament cases replaced/added; dual untouched), score-seed (5 cases).
- **follow-ups:** 1. Line switch in the flow + round change + save: the post-save `router.refresh()` carries the URL's new `entry=` and remounts at the saved entry/round, dropping the footer's "saved · Add video" offer; decide whether the page should key on the entry at all. 2. The Round menu's "Recorded — saving replaces it." note only marks the current round; `recordedRounds` could mark every recorded round. 3. Any doc that still says "the Round control navigates" (guardrails or schedule README) should be refreshed.
