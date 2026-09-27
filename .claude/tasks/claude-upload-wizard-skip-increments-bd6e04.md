# Tasks — claude/upload-wizard-skip-increments-bd6e04

> Scope: Upload wizard trim step — seek increments

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

## T1 · Retune the trim step's seek scale to ±1s / ±10s

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx, tests/trim-step-navigation.spec.ts (guess — both confirmed to hold every current reference to the trim increments)
- **done when:**
  - [ ] `TrimStepContent.tsx` no longer imports `JUMP_STEP_SECONDS` from `../match-video-attachment/use-attachment-alignment`; it declares its own two module-level constants for the short (1) and long (10) jump, and `use-attachment-alignment.ts` / `AttachmentAlignmentStep.tsx` are not in the diff.
  - [ ] The under-video control row still renders exactly seven transport controls plus the mute button, in this order and with these `aria-label`s / visible glyphs: "Back ten seconds" (`−10s`), "Back one second" (`−1s`), "Back one frame", Play/Pause, "Forward one frame", "Forward one second" (`+1s`), "Forward ten seconds" (`+10s`). No "Back one minute" / "Forward one minute" button remains, and the buttons still go through the existing `JumpButton` primitive with no class changes.
  - [ ] In the step-root keydown handler, plain `ArrowLeft`/`ArrowRight` seek by the 1s constant and `Shift+Arrow` by the 10s constant; the `Kbd` hint row reads `← →` "1 s" and `shift ← →` "10 s" (was "10 s" / "1 min"). The handle-level arrow handler (one frame, a second with Shift) is unchanged.
  - [ ] `tests/trim-step-navigation.spec.ts` asserts the new scale: the test titled "the arrow keys jump the same ten seconds, and Shift jumps a minute" is renamed to describe 1s / Shift 10s and asserts that a plain `ArrowRight` from the top of the 2s fixture lands near 1.0 (e.g. `toBeCloseTo(1, 1)`, i.e. NOT clamped at the end) while `Shift+ArrowRight` clamps `> 1.5`; a new or extended test clicks "Forward one second" from 0 and expects a playhead near 1.0, then "Back one second" and expects `< 0.1`. The existing "Forward ten seconds" / "Back ten seconds" click tests keep passing unchanged.
  - [ ] Every comment in `TrimStepContent.tsx` that names the old scale is updated to the new one: the `LONG_JUMP_SECONDS` doc comment (≈ line 164–168, "a minute is what it takes to cross a game"), the `seekLatest` clamp comment (≈ lines 573–575, "+1m near the end … next −10s"), the control-row comment (≈ line 1096, "from a minute down to a frame"), and the handle-arrow comment (≈ line 1341, "±10s / ±60s seek"). `grep -n "minute\|60s\|1m" TrimStepContent.tsx` returns no hit that describes the trim step's own jump.
- **notes:** Spec chosen: ±10s and ±1s buttons, arrows = 1s, Shift+arrows = 10s. The gap in the current scale is between one frame (~0.03s) and 10s — nothing nudges by a second, which is what landing a cut on a serve needs; the ±1m buttons go because the filmstrip rail is already the coarse navigator. Author's alternative was 5s + 10s (or 5s + 1s) — if the author prefers 5s, swap the "1"/"one second" values and labels for "5"/"five seconds" throughout; the criteria hold shape-for-shape except the ArrowRight assertion becomes a clamp (`> 1.5`) since 5s exceeds the 2s fixture. Do NOT change `JUMP_STEP_SECONDS` in `use-attachment-alignment.ts` — it is the SwingVision alignment step's Page Up/Down hop and has its own spec (`tests/match-video-alignment-step.spec.ts`). `tests/match-video-trim-window.spec.ts` "the pad is ten seconds" is `ATTACHMENT_TRIM_PAD_SECONDS`, a different thing — leave it. Run `npx playwright test tests/trim-step-navigation.spec.ts` before committing. Eyes-on check in a browser happens after this lands, outside the gate.
