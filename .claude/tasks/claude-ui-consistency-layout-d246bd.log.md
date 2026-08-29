# Run log — claude/ui-consistency-layout-d246bd

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Remove the keyboard-shortcut chip from the New match button — done

**gate:** lint ✓ · tsc ✓ · tests ✓ · completion-review VERDICT: pass · pipeline-guardrails: no findings (only file touched was `create-match-button.tsx`, a navigation entry point; wizard and five vendor inputs untouched)

**changed:** Removed `"use client"` directive, `useEffect`/`useState`/`useRouter` imports, the `isMac` state, both `useEffect` blocks (platform detection + `keydown` listener for Cmd/Ctrl+U), and the `<kbd>` chip from the JSX. Component is now a plain server-renderable `<Link>`; click navigation to `/dashboard/matches/new` is intact across both call sites.
