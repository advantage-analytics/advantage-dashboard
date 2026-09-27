# Run log — claude/upload-wizard-skip-increments-bd6e04

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Retune the trim step's seek scale to ±1s / ±10s — done

**gate:** mechanical GATE PASS (lint, typecheck, full Playwright suite); completion review `VERDICT: pass` (all five criteria met, diff confined to the two named files).
**changed:** `TrimStepContent.tsx` drops the shared `JUMP_STEP_SECONDS` import for its own `SHORT_JUMP_SECONDS = 1` / `LONG_JUMP_SECONDS = 10`; the under-video row is now −10s / −1s / frame / play / frame / +1s / +10s (the ±1m buttons are gone), arrows seek 1s and Shift+arrows 10s, the Kbd hints read "1 s" / "10 s", and every comment naming the old minute/ten-second scale is updated. `tests/trim-step-navigation.spec.ts` renames the arrow-key test to assert 1s (unclamped on the 2s fixture) / Shift 10s (clamped) and adds a one-second-button test. Widget-states: no loading/empty/error surface touched; check recorded.
