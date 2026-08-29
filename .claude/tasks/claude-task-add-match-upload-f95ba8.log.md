# Run log — claude/task-add-match-upload-f95ba8

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Suggest Unfinished for incomplete scores — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer VERDICT: pass · guardrails (pipeline) clean — no guardrail-critical inputs touched; rls-boundary-reviewer skipped (no supabase/, data/, api/, or migration changes)
- **changed:** Extended `deriveOutcome` in utils.ts to return `"Unfinished"` when all rendered sets are filled with legal scores but neither player clinches, or when completed sets are level (e.g. 6-4 / 4-6). Winner branch still checked first so a complete score can never return Unfinished. Updated the auto-fill `useEffect` in DetailsContent.tsx to track what it last wrote via a ref, allowing the decisive third set to overwrite a previously suggested "Unfinished" without ever touching a user's manual pick.
## T2 · Reword "Your end at start" — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer VERDICT: pass · guardrails (pipeline) clean — boolean mapping and field semantics untouched; rls-boundary-reviewer skipped (no supabase/, data/, api/, or migration changes)
- **changed:** Label "Your end at start" → "Your position at video start" in DetailsContent.tsx. Hint text rewritten to use camera-frame language ("top or bottom of the screen", not tennis "ends"). Missing-field summary label in UploadMatchFlow.tsx updated to match. END_OPTIONS and `initialTopPlayerIsPlayer1` semantics untouched.

- **follow-ups:** (1) `swingvision-parser.ts` inline-derives the same three outcomes — it could call shared `deriveOutcome` so typed and imported scores can never disagree. (2) The `suggestedResult` ref resets on remount (e.g. Confirm → back) so a previously auto-suggested value is treated as manual on return; lifting the flag into `formData` would make it exact. (3) `deriveOutcome` and `leadingOnSets` are two similar set-counting loops; a small shared record might carry the distinction better than prose.
