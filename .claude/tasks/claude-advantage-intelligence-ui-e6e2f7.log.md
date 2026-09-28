# Run log — claude/advantage-intelligence-ui-e6e2f7

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Lengthen the Advantage Intelligence summary the generator writes — done

- **gate:** mechanical GATE PASS (first run was cut short by the caller's 10-minute tool timeout while three other worktrees ran their suites; the clean background re-run passed); completion review `VERDICT: pass`, all five criteria met, no scope creep.
- **changed:** `generate-insights/index.ts` prompt now asks for a 4-5 sentence summary under 600 characters (one-line change; schema, temperature, model URL and comparison block untouched). New offline spec `tests/generate-insights-prompt.spec.ts` captures the Gemini request body and asserts the new wording, no vendor name, and the unchanged generation config. `tests/insight-text.spec.ts` gains a five-sentence split case. `report-insight-card.tsx` doc comment updated; no code change.
- **follow-ups:** 1. Not live until `supabase functions deploy generate-insights` runs (repo == deployed at v24; this makes v25). Existing matches keep their stored shorter summaries. 2. `player-profile/last-match-card.tsx` clips via `splitClaim` (64/170), so the longer summary is clipped harder there — eyes-on once a new match generates. 3. The prompt spec and the guards spec each hold a private copy of the vm harness; a third spec would justify moving the stubs into `tests/fixtures/`.
