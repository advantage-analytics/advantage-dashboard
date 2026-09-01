# BLOCKED — stage 07 (land)

**Why:** `06_review/output/review.md` line 3 still reads `Sign-off: pending`.

Stage 07's contract makes this the one stage that blocks on a human word:

> 1. The sign-off line must read `approved`. Anything else → `output/BLOCKED.md`
>    naming what is missing. This is the one stage that blocks on a human word.

Re-invoking `/feature-next` is the ordinary approval between stages, but stage
06 deliberately created a stronger, explicit gate for the last one — because
landing is the irreversible step: it merges 25 commits into
`splitstep-integration` and then deletes this workspace and this branch's queue
pair. "Ran the command again" and "read the review and approved it" should not
be the same signal there.

## To unblock

Edit `work/events-lineups/06_review/output/review.md` line 3 to:

```
**Sign-off: approved**
```

Annotate instead if something is wrong. Then delete this file and re-run
`/feature-next events-lineups`. The previous run did exactly this — see
`e89981a`, *"pipeline(events-lineups): sign-off approved, unblock stage 07"*,
which flipped the line and removed its own `BLOCKED.md` in one commit.

## Everything else is ready

| Precondition | State |
|---|---|
| Sign-off reads `approved` | ❌ **`pending`** — the only blocker |
| Full-branch pr-check receipt | ✅ `6ec2305 ready`, base `e89981a`, recorded against a clean tree |
| Working tree clean | ✅ |
| Branch position | ✅ 25 commits ahead of `splitstep-integration` |
| Integration worktree located | ✅ `/Users/cjgimena/Desktop/vscode/advantage-dashboard` |

## What the merge will meet — checked now, so landing is not a surprise

**`splitstep-integration` has moved two commits since this branch diverged**, and
neither touches a file this branch touches (verified: the intersection of
`git diff e89981a..HEAD -- src tests` and `git diff e89981a..splitstep-integration -- src tests`
is empty). The two:

- `7bd33eb Merge claude/new-session-c3f1ab: schedule day-zero states by role (5a/5b)`
- `d01d1cb pipeline(events-lineups): delete landed workspace and queue pair`

Two consequences worth knowing before the merge:

1. **`d01d1cb` already deleted `work/events-lineups/` and this branch's queue
   pair from the integration branch.** This branch rebuilt both. The merge will
   re-introduce them, and stage 07's own cleanup step then deletes them again —
   which is the intended end state, not a conflict. Expect the cleanup commit to
   remove files the merge just added.

2. **`work/events-lineups/CONTEXT.md` is now stale on one point.** It says the
   earlier 5a/5b run *"reached sign-off but was never landed"*. Git says
   otherwise: `7bd33eb` merged it into `splitstep-integration`. That does not
   change anything this run did — the wider scope supersedes it either way, and
   there is no file overlap — but the sentence should not be trusted by anyone
   reading the workspace later. Since stage 07 deletes the workspace, this is a
   correction that matters only if the workspace is kept as the worked example.

## Also consulted

Beyond the declared inputs (`../06_review/output/review.md`, the branch state):

- `.claude/hooks/pr-check-receipt.sh show` — to confirm precondition 2.
- `git worktree list`, `git rev-list`, `git log HEAD..splitstep-integration`,
  and a `comm` over the two file lists — to establish where the integration
  branch stands and whether the merge overlaps this branch's files.
- `git show e89981a` — to confirm how the previous run's sign-off was recorded,
  and that removing `BLOCKED.md` in the same commit is the established shape.
