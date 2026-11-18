# Stage 06 blocked — the review gate needs a user-started `/pr-check`

## Why

This stage's contract says to run the `pr-check` skill over the feature's commit range, `abe53834c`…`d2febc5c6` from `../05_build/output/build.md`.

`/pr-check` sets `disable-model-invocation`, so only a person can start it. The standing rule here is that its stages are never followed by hand or dispatched through subagents, and that merges rest only on receipts from runs the user started. A review stage that ran the gate any other way would sign off on a receipt that doesn't count, so this stage stops rather than produce one.

## What unblocks it

1. **Start the gate:** in this session, on branch `claude/approach-heatmap-design-1ef8c8`, type `/pr-check`.
   - Its Stage 3b eyes-on pass needs the `EYES_ON_*` verifier credentials, and it opens the queue's `routes:`, `/dashboard/matches/[matchId]` and `/dashboard/team/roster/[playerId]`.
   - Unset credentials make a UI branch `not-ready`.
2. **Delete this file**, then run `/feature-next approach-heatmap` again. Stage 06 will then write `review.md` from that run's receipt:
   - the `Sign-off: pending` line;
   - the brief's success criteria, one by one;
   - findings and resolutions;
   - what was consciously left.

## Already known going into the gate

These gaps come from the build report; `/pr-check` should see them as open items, not new findings:
- **Opened court framing:** the opened court frames the far half, so contacts start off-screen.
- **Opened court labels:** the opened court has no Contact / Placement / wing labels.
- **Season point wording:** the season lightbox shows no approach point wording.
- **Hand inference:** the season and match report can disagree on wings when a match has no stored hand.
- **MCP links:** the MCP `open_visualization` tool cannot link to the new cut.

Nothing on the branch is pushed.

## Also consulted

- `.claude/skills/pr-check/SKILL.md` (its `disable-model-invocation: true` header).
