# Build — approach-heatmap

All 13 feature tasks from `../04_tasks/output/tasks.md` are `done` in `.claude/tasks/claude-approach-heatmap-design-1ef8c8.md`. Each ran through `task-next`:
- one subagent on its routed model;
- the mechanical gate (lint, typecheck, full test suite);
- a `task-completion-reviewer` verdict.

The per-task detail and follow-ups are in `.claude/tasks/claude-approach-heatmap-design-1ef8c8.log.md`.

## Task statuses

| Task | Model | Status | Commit |
|---|---|---|---|
| T1 · Add the approach classifier | opus | done | `abe53834c` |
| T2 · Add the approaches cut to the viz model | fable | done | `63c88b1ce` |
| T3 · Compute the Approaches statistics | opus | done | `8dba53768` |
| T4 · Let saved views store the approaches cut | fable | done | `62cf30138` |
| T5 · Add approaches labels, cut kind and URL state | opus | done | `ced4729b2` |
| T6 · Add the full vertical court frame and pair projection | opus | done | `e843fa481` |
| T7 · Draw approach pairs and labels in CourtArt | opus | done | `60e029b07` |
| T8 · Make a pair one interactive mark in the opened court | opus | done | `6739010b5` |
| T9 · Add the Approaches wall card | opus | done | `2df7bf368` |
| T10 · Add approach filters to the panel and sentence | opus | done | `c64f276c4` |
| T11 · Word the point list for approaches | opus | done | `2494c99a8` |
| T12 · Pass lob keys to the Visualizations tab | opus | done | `4dc29184f` |
| T13 · Carry approaches through the season card | fable | done | `d2febc5c6` (blocked first at `9f5258bb5`) |

## Commit range

`abe53834c`…`d2febc5c6`, 14 commits on `claude/approach-heatmap-design-1ef8c8` (13 tasks plus T13's block bookkeeping):

```
d2febc5c6 T13: Carry approaches through the season card
9f5258bb5 T13: blocked
4dc29184f T12: Pass lob keys to the Visualizations tab
2494c99a8 T11: Word the point list for approaches
c64f276c4 T10: Add approach filters to the panel and sentence
2df7bf368 T9: Add the Approaches wall card
6739010b5 T8: Make a pair one interactive mark in the opened court
60e029b07 T7: Draw approach pairs and labels in CourtArt
e843fa481 T6: Add the full vertical court frame and pair projection
ced4729b2 T5: Add approaches labels, cut kind and URL state
62cf30138 T4: Let saved views store the approaches cut
8dba53768 T3: Compute the Approaches statistics
63c88b1ce T2: Add the approaches cut to the viz model
abe53834c T1: Add the approach classifier
```

Nothing is pushed.

**Database change already live:** T4's migration `20261117222932_saved_views_approaches` was applied to the live database through the Supabase MCP, and the re-read constraint confirms `approaches` is allowed.

## Blocked items

None remain.

T13 blocked once. Its first gate failed because `tests/player-season-loader.spec.ts` pins the exact keys of a season match, and the task had added `playerHand` without updating that list. The work was stashed as `task-next` requires. It was then re-applied with the one-line spec fix, re-gated (pass) and reviewed (pass). The stash is dropped.

The same first run also failed `tests/r2-delete-and-fallback.spec.ts:425`. That test touches nothing on this branch, passed in every other gate, and did not recur.

## Gaps the runs reported that no task covers

These came out of the subagents' reports; each is recorded under its task in the run log.

- **Opened court framing (T8):** the lightbox opens framed on the far half, as every landing cut does, so approach contacts start below the stage until "Full court" is pressed.
- **Opened court labels (T8):** the lightbox draws its own court, so the Contact / Placement / wing labels T7 added to `CourtArt` do not appear in the opened view.
- **Season point wording (T11, T13):** the season lightbox has no Points list, so the approach point wording is not shown there.
- **Hand inference (T13):** the season assumes right-handed when a match has no stored hand, while the match report infers it from strokes, so the wings can differ between the two.
- **MCP links (T2):** `src/lib/services/mcp/links.ts` `VISUALIZATION_CUTS` has no `approaches`, so the MCP `open_visualization` tool cannot link to the new card.

Nothing has been checked in a real browser yet: the `routes:` lines (`/dashboard/matches/[matchId]`, `/dashboard/team/roster/[playerId]`) are for `/pr-check` Stage 3b.
