# Run log — claude/task-add-match-upload-f95ba8

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Suggest Unfinished for incomplete scores — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer VERDICT: pass · guardrails (pipeline) clean — no guardrail-critical inputs touched; rls-boundary-reviewer skipped (no supabase/, data/, api/, or migration changes)
- **changed:** Extended `deriveOutcome` in utils.ts to return `"Unfinished"` when all rendered sets are filled with legal scores but neither player clinches, or when completed sets are level (e.g. 6-4 / 4-6). Winner branch still checked first so a complete score can never return Unfinished. Updated the auto-fill `useEffect` in DetailsContent.tsx to track what it last wrote via a ref, allowing the decisive third set to overwrite a previously suggested "Unfinished" without ever touching a user's manual pick.
## T5 · Visible keep-tab-open warning during video upload — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer VERDICT: pass · guardrails (pipeline) clean — pure display addition, no pipeline logic touched; rls-boundary-reviewer skipped (no supabase/, data/, api/, or migration changes)
- **changed:** Added amber AlertTriangle warning banner in UploadMatchFlow.tsx above the per-file progress bars, visible only while uploading.length > 0. Text: "Keep this tab open — your video is uploading. You can navigate within the app, but closing this tab will stop the upload." submit-match-video.ts beforeunload handler verified correct — no fix needed.

## T4 · Ask whose match this is in team workspaces — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer VERDICT: pass · pipeline guardrails clean · rls-boundary found stale-matchSubject finding (workspace-switch race) → fix applied (useEffect resets matchSubject+teamRoster on activeWorkspace.id change) → re-review CLEAR
- **changed:** Added WhoPlayedPicker in UploadMatchFlow.tsx for team workspaces with no preset (radio: "Myself" + roster members). useUploadMatchWizard.ts: fetches program_roster_full via browser client, gates Continue until answered, writes chosen player's program_players.id to matches.player1_id, pre-fills playerName. Personal and preset flows byte-identical. Also fixed workspace-switch race: useEffect resets matchSubject+teamRoster when activeWorkspace.id changes while wizard is open.
- **follow-ups:** (1) No search box in picker — a 40-player roster scrolls; consider PinnedMatchContent-style search. (2) "Myself" row shows no name when uploader profile lacks first/last name. (3) Hand-editing playerName on Details after picking a roster member doesn't clear the picked id (pre-existing edge).

## T3 · Fix failure toast's "Open the match" action — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer noted criterion 1 ("stated in commit message") as pre-commit-unverifiable but marked all three code criteria met; guardrails (pipeline) clean — no vendor fields, job keying, or upload invariants touched; rls-boundary-reviewer skipped (no supabase/, data/, or migration changes)
- **changed:** Root cause: two of three `match-upload-failed` dispatch sites deleted the match row before dispatching, so the toast link pointed at a deleted row. Added `rollbackCreatedMatch` helper with `.select("id")` projection to distinguish a confirmed delete from an RLS-filtered no-op. Both rollback sites now conditionally omit `matchId` when the row was confirmed gone. Third site (`onTransferFailed`) always includes `matchId` — the row is left standing there. Updated upload-failure-listener.tsx comment to state the contract.
- **follow-ups:** (1) Stale `sessionStorage("match-processing")` flag survives when the match row is rolled back — home page poll spins forever. (2) Toast action is a plain `<a href>` (full page load); switching to next/link is a deliberate decision since the toast would remain visible on the match page.

## T2 · Reword "Your end at start" — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer VERDICT: pass · guardrails (pipeline) clean — boolean mapping and field semantics untouched; rls-boundary-reviewer skipped (no supabase/, data/, api/, or migration changes)
- **changed:** Label "Your end at start" → "Your position at video start" in DetailsContent.tsx. Hint text rewritten to use camera-frame language ("top or bottom of the screen", not tennis "ends"). Missing-field summary label in UploadMatchFlow.tsx updated to match. END_OPTIONS and `initialTopPlayerIsPlayer1` semantics untouched.

- **follow-ups:** (1) `swingvision-parser.ts` inline-derives the same three outcomes — it could call shared `deriveOutcome` so typed and imported scores can never disagree. (2) The `suggestedResult` ref resets on remount (e.g. Confirm → back) so a previously auto-suggested value is treated as manual on return; lifting the flag into `formData` would make it exact. (3) `deriveOutcome` and `leadingOnSets` are two similar set-counting loops; a small shared record might carry the distinction better than prose.

## T6 · "Upload another" opens a new tab — done
- **gate:** lint ✓ · tsc ✓ · tests ✓ · completion-reviewer VERDICT: pass · pipeline guardrails clean — diff confined to UploadMatchSuccess post-submit screen, no vendor fields or pipeline logic touched; rls-boundary-reviewer skipped (no supabase/, data/, api/, or migration changes)
- **changed:** In UploadMatchFlow.tsx, "Upload another" now branches on `busy` (uploading.length > 0 || any upload in "done" phase). When busy: renders Button wrapping a plain `<a target="_blank">` with `newTabHref` (current pathname+search, preserving team-route query params) + ExternalLink icon. When not busy: unchanged `onClick={onUploadAnother}` same-tab remount. Adjacent `<p>` below the button explains the new tab and warns not to close the original, with context-sensitive copy (uploading / finishing). No localStorage collision: `clearStorageData()` fires inside `handleCreateMatch` before the success screen mounts, so the new tab loads a blank draft.
