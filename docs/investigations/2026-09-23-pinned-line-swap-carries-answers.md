# What survives a PinnedLineBar line swap (T6)

- **Date:** 2026-09-23
- **Branch:** `claude/upload-wizard-trimming-design-4629a3`, on top of T5 (`1d06e077`)
- **Spec:** `tests/upload-line-swap.spec.ts`
- **Outcome:** carry-over confirmed for the player-bound answers. **Fix shipped** in the
  seed effect. Two neighbouring carry-overs are left as known failures (`test.fail()`),
  written up under [Not fixed](#not-fixed).
- **Update (T8, 2026-09-23):** the file drop and "Not fixed" #1 (line A's recorded
  score) are **resolved** — see [Resolved in T8](#resolved-in-t8). Only the
  draft-resume regression (#2) and the singles↔doubles follow-up remain open.

Line numbers are for `src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts`
**after** the fix unless marked "at HEAD". At HEAD the seed spread ran from 1287 to 1320.

## How a swap reaches the hook

`PinnedLineBar`'s Change menu calls `onSwitch(line.preset)`. In `UploadMatchFlow.tsx`,
`onSwitchPreset` is `setPreset` (line 202), and `preset` is state (line 80). So a swap
passes the hook a new `preset` prop on the same mounted wizard. Three effects are keyed
on it:

1. **The seed effect** (`useEffect` at 1297, its preset branch at 1310–1396). It re-runs
   because `preset` is one of its dependencies (line 1556). `seededRef.current` is
   already `true`, so the first-seed-only block at 1391–1395 (`setProgressKind`,
   `setStep("file")`) is skipped. The step stays where it was.
2. **The file-generation reset** (1020–1032). This effect is keyed on `preset?.entryId`,
   and it calls `resetFileGeneration()` (915–930). _Since T8 it is keyed on
   `preset?.eventId`, so a swap inside one event no longer runs it._
3. **The eligibility and identity memos.** These are not effects: they read `preset`
   again on every render (`identityAthleteFor` at 949, `eligibilityInput` at ~1812).

The spec models a swap the same way: it sets `h.props.preset = LINE_B`, then
re-renders.

## What the seed rewrites

The spread at 1352–1390 builds the new form in this order: `prev`, then
`draft?.formData` (1353), then the swap clears (1356, new), then the line's facts.

| Field                                              | On a swap                                    | Line      |
| -------------------------------------------------- | -------------------------------------------- | --------- |
| `eventName`                                        | ← `preset.eventName ?? ""`                   | 1357      |
| `eventKind`                                        | ← `preset.eventKind ?? prev`                 | 1358      |
| `round`                                            | ← `preset.round ?? ""`                       | 1359      |
| `playerName`                                       | ← line B's player                            | 1360      |
| `opponentName`                                     | ← line B's opponent                          | 1361      |
| `opponentSource`                                   | ← `"event"` (or `undefined`)                 | 1362      |
| `date` / `dateSource`                              | ← line B's date / `"event"`                  | 1363–1364 |
| `courtType`                                        | ← from `preset.surface`, else `prev`         | 1365–1367 |
| `bestOf`                                           | ← `String(preset.bestOf)`                    | 1368      |
| `adScoring`                                        | ← `preset.adScoring ?? undefined`            | 1369      |
| `matchType`                                        | ← from `eventKind` / `supportsVideo`         | 1370–1377 |
| `opponentProgramKey` / `opponentSchool`            | ← line B's                                   | 1378–1379 |
| `playerScores` / `opponentScores` / `numberOfSets` | ← line B's score, **only if line B has one** | 1380–1388 |
| selected provider                                  | ← from `preset.supportsVideo`                | 1314–1318 |

The seed never writes these fields, so before the fix they all kept line A's values:
`initialTopPlayerIsPlayer1`, `fixedCamera`, `playerHand`, `playerBackhand`,
`playerStyleSource`, `opponentHand`, `opponentBackhand`, `opponentStyleSource`,
`opponentPlayerId`, `playerTiebreaks`, `opponentTiebreaks`, `result`, `retiredSide`,
`videoStartSeconds`, `videoEndSeconds`, `duration`, `time`, `playOnLets`. The score also
stays whenever line B has no score of its own.

## Verdicts

| Field                                                                                      | Before the fix                                                                                 | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | After the fix                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Rests on                                                                                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `initialTopPlayerIsPlayer1`                                                                | **Carried over**                                                                               | **Wrong person.** The answer is camera-relative: "were _you_ at the top at the first frame" (guardrails §4). "You" was line A's player; now it is line B's. The vendor's per-player predictions get mapped onto the wrong person, and nothing on screen looks broken.                                                                                                                                                                                                                                        | Cleared to `undefined`. Never `false` (§3.1).                                                                                                                                                                                                                                                                                                                                                                                                                            | Seed spread at HEAD 1287–1320 never wrote it. The fix is `LINE_SWAP_FIELDS` (191), applied at 1343–1356. |
| `fixedCamera`                                                                              | Kept                                                                                           | **Correct to keep.** It describes the recording ("did the camera stay put"), not who is in it. `handleTrimChange` treats it the same way (comment at ~2190).                                                                                                                                                                                                                                                                                                                                                 | Kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Not in the seed spread. Deliberately left out of `LINE_SWAP_FIELDS`.                                     |
| `playerHand` / `playerBackhand` / `playerStyleSource`                                      | **Carried over**                                                                               | **Wrong person.** These are line A's player's style. The preset flow never runs the profile prefill (the preset branch returns at 1396, before the prefill at ~1500), so nothing replaces them.                                                                                                                                                                                                                                                                                                              | Cleared                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Same as above                                                                                            |
| `opponentHand` / `opponentBackhand` / `opponentStyleSource`                                | **Carried over**                                                                               | **Wrong person.** These are line A's opponent's style.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Cleared                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Same as above                                                                                            |
| `opponentPlayerId`                                                                         | **Carried over**                                                                               | **Wrong person.** It was not on the task's list, but it is the same defect: line A's opponent's roster id would be written as `opponent_player_id` (2875, 3002–3003) next to line B's opponent's name.                                                                                                                                                                                                                                                                                                       | Cleared                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Same as above                                                                                            |
| `playerTiebreaks` / `opponentTiebreaks`                                                    | **Carried over**                                                                               | **Wrong.** They belong to line A's score. When line B has a score, the seed rewrites the games but not the tiebreaks, which leaves line A's tiebreaks attached to line B's sets.                                                                                                                                                                                                                                                                                                                             | Reset to `[null, null, null]`                                                                                                                                                                                                                                                                                                                                                                                                                                            | Seed spread 1380–1388 writes only games and `numberOfSets`                                               |
| Trim window (`videoStartSeconds` / `videoEndSeconds` / `duration`)                         | Kept                                                                                           | **Correct to keep.** The window describes the file: where the first serve and the final point are. It does not describe the players. The swap exists because the coach picked the wrong line, not the wrong video.                                                                                                                                                                                                                                                                                           | Kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Not in the seed spread. `handleTrimChange` (2154) is the only other writer.                              |
| `topPlayerAnswerStale` and its baseline (`topPlayerAnswerStartRef` / `topPlayerAnswerRef`) | **Carried over.** A stale hint stayed up, and the baseline stayed anchored to line A's answer. | Wrong. Both describe an answer that no longer exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Re-armed at 1332–1340. `topPlayerAnswerStartRef` is set to `null`, `answered` to `false`, and `topPlayerAnswerStale` to `false`. `topPlayerAnswerRef.start` is **kept**: it is the live window start, which the swap does not move, and the sync effect (879–884) will not refresh it when neither of its inputs changes. Blanking it would anchor the next answer at 0 through `start ?? 0` (2637). The spec's baseline test caught this in the first draft of the fix. | —                                                                                                        |
| `cameraAnswerFileRef`                                                                      | Kept                                                                                           | Correct. The recording did not change. A re-pick of the same file still counts as `sameRecording` (2118) and keeps `fixedCamera`.                                                                                                                                                                                                                                                                                                                                                                            | Kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                                                                        |
| The picked file (`uploadedFile`)                                                           | **Dropped**                                                                                    | Not a wrong-person carry-over, but it **contradicts the design claim** ("the file you've dropped stays"). The file-reset effect (1020–1032) is keyed on `preset?.entryId`, and its `resetFileGeneration()` sets `uploadedFile` to `null` (918). `videoProbe` is not cleared. The coach has to re-pick the file, and `handleCreateMatch` refuses without it (2709). A re-pick through `onVideoPick` also rewrites the window to `[0, duration]`, so in practice the kept window only lasts until the re-pick. | **Resolved in T8:** kept. The reset effect is keyed on `preset?.eventId`.                                                                                                                                                                                                                                                                                                                                                                                                | Spec: "the picked file itself is dropped…"                                                               |

## Attribution inputs (`matches.player1_id`, `event_entry_id`)

A line swap **does** change the attribution inputs, and it changes them correctly. None
of them is cached from line A:

- `wizardAthleteChoice` (`subject-eligibility.ts` 159–162) and `identityAthleteFor` (287)
  return `preset.playerUserId` whenever a preset is present. `matchSubject` is not
  consulted. Both run on every render from the live `preset` (949, ~1812), and
  `handleCreateMatch` takes `playerUserId` from `freshEligibility.attribution` (2852).
  The spec asserts that attribution moves from `"athlete"` to `"first"`.
- `event_entry_id` (3027) and the "reuse an existing match" decision (2825–2827) read
  `preset ?? attachedLine` at submit time.
- The roster-subject reset effect is disabled while a preset is present (1780), so it
  cannot fire on a swap.
- `pinnedMatchWorkspace` (1062–1071) re-pins or clears on the `matchId` change. Every
  line of a lineup belongs to the same event, so the pinned workspace stays the same.
- The import identity confirmation is reset by the `identityAthleteId`/`Name` effect,
  and again by the file reset.

Nothing here needs a fix. The risk sat in the form answers, not in the ids.

## The fix (shipped)

This is a small change, local to the seed effect's preset branch:

- `LINE_SWAP_FIELDS` (191–202) lists the per-player answers the seed does not rewrite.
  Each goes back to `DEFAULT_FORM_DATA`, and arrays are copied, the same way
  `startOver()` resets `START_OVER_FIELDS`.
- `presetLineKey()` (205) and `seededLineRef` (1238) tell a real swap (a different
  `entryId ?? matchId`) apart from a re-run of the effect for the same line. The effect
  also depends on `draft`, `askWhoPlayed`, `seededPlayerName` and `supabase`, and a
  re-run for any of those must not wipe answers. The spec covers this in "re-running
  the seed for the SAME line clears nothing".
- The clears are spread **after** `draft?.formData`. Without that, a draft-resumed
  flow would bring line A's draft answers straight back.
- First-seed behaviour is unchanged. `swapped` needs `seededRef.current` to be true,
  so a fresh preset and a draft resume seed exactly as before.

A swap is still not a start-over. The event facts, date and format come from line B.
The trim window, `fixedCamera`, the step and the source all stay. Unlike `startOver()`,
nothing about the subject or the step is reset.

## Not fixed

Both were pinned in the spec as `test.fail()`, each annotation pointing at this doc. #1 is
resolved in T8 and its `test.fail()` removed; #2 keeps its annotation.

1. **Resolved in T8.** **An unscored line B keeps line A's score.** The seed writes the score only
   `if (preset.score)` (1380). If line A was already scored courtside and line B was
   not, line A's recorded result stays on the form and gets filed as line B's match.
   `result` and `retiredSide` have the same problem: the seed never writes them, even
   though line B's `score.winner`/`ending` exist. **Proposed fix:** on a swap, when the
   _previous_ preset had a score, reset `playerScores`, `opponentScores`,
   `numberOfSets`, `result` and `retiredSide` to defaults if line B has none. **Why it
   was not shipped:** it is not a clear-on-swap rule. A score the coach _typed_ from the
   video describes the recording, which is the right match, and should arguably stay.
   Only a score that came from line A's courtside record is wrong. Telling the two
   apart needs the previous preset (another ref), and the call is a product decision,
   not a guardrail.
2. **A draft-resumed line flow reverts to the draft on a swap.** The seed re-spreads
   `draft?.formData` (1353) on every run, not only the first. So a swap puts back the
   draft's trim window, `fixedCamera`, event and every other field over anything
   changed since the resume. The player-bound fields are safe, because the swap clears
   are spread after the draft. **Proposed fix:** spread `draft?.formData` only on the
   first seed (`!seededRef.current`). **Why it was not shipped:** it changes the
   draft-resume path, which the task puts out of scope for a trivial fix.

## Resolved in T8

Author decisions (2026-09-23): a swap is a wrong-line fix, not a new video; a score
from line A's record is wrong for line B; a score typed in the wizard describes the
recording and stays; if provenance cannot be told apart, clear it.

- **The file stays.** The file-generation reset effect's `preset?.entryId` dependency
  is now `preset?.eventId`. `open`, the workspace id/kind and `draft?.id` still reset
  the file, and so does an event change. The picked file, its probe, a parsed import
  and the trim window survive a swap between lines of one event. One exception keeps
  the old drop: a swap that changes the source kind (a singles line to a doubles one,
  `supportsVideo` flipping) calls `resetFileGeneration()` from the seed's swap branch,
  because a video cannot ride into an import flow.
- **The import identity answer still resets.** `identityAthleteFor` returns the
  preset's player, so a swap changes `identityAthleteId`/`Name` and the athlete-keyed
  effect clears the answer. The confirmation key also embeds the athlete, so an old
  answer could not match the new key anyway. The spec's "an import-line swap keeps the
  parsed file and re-asks the player-1 check" covers it.
- **Line A's recorded score is cleared.** `seededPresetRef` holds the last seeded
  preset. On a swap, if the form's games (trailing empty sets ignored) still equal
  line A's `preset.score`, the seed resets `playerScores`, `opponentScores`,
  `numberOfSets`, `result` and `retiredSide` to `DEFAULT_FORM_DATA` before line B's own
  score (if any) is written. A score that differs — typed from scratch, or edited over
  the record — stays, and so does its `result`.

## Follow-ups (not in T6's files)

- **Resolved in T8. The file drop on a swap.** Decide whether the `preset?.entryId` dependency of the
  file-reset effect (1029) is intended. If the design's promise ("the file you've
  dropped stays") holds, a swap inside the same event should keep `uploadedFile`, and
  `resetFileGeneration` should run only on a workspace change, an event change or a
  draft change. If the drop is intended, the design copy has to change instead. The
  same claim appears in `UploadMatchFlow.tsx` (77–79) and in `types.ts`
  (`EventPreset.lineup` doc). This investigation only corrected `PinnedLineBar.tsx`.
- **A swap between a singles line and a doubles line.** This was not exercised. The seed
  switches the provider (1314–1318) but calls `setProgressKind` only on the first seed,
  so the progress bar's length can disagree with the new provider kind. The
  "belt as well as braces" guard (1926) stops a doubles line from uploading video
  either way.
