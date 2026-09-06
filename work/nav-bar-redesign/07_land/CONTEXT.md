# Stage 07 — Land

This stage leaves nothing in `output/`: its result is the merge commit and
the cleanup commit, and a workspace that no longer exists on the branch IS a
landed pipeline. It is current when stages 01–06 all have their primary
outputs and this workspace still exists.

## Inputs
- working: `../06_review/output/review.md` — its `Sign-off:` line is the gate
- working: the branch state (clean tree; position vs the integration branch)

## Process
1. The sign-off line must read `approved`. Anything else → `output/BLOCKED.md`
   naming what is missing. This is the one stage that blocks on a human word.
2. A full-branch pr-check receipt must exist
   (`.claude/hooks/pr-check-receipt.sh show`); none → stop and say the gate
   has not run. Never merge past a missing receipt.
3. Merge the feature branch into the integration branch, `--no-ff`. The
   human invoking this stage after signing off is the approval for the merge.
   The integration branch is usually checked out in another worktree — merge
   there (`git -C <path>`), after confirming that tree is clean.
4. Cleanup, committed on the integration branch: delete this branch's queue
   pair (`.claude/tasks/<branch-slug>.md` + `.log.md`) and this workspace
   (`work/<slug>/`). Git history is the archive. Exception: the workspace may
   be kept deliberately as the current worked example — if so, say so in the
   report and delete the previous example instead.
5. Report the merge and cleanup commits. Pushing remains a named,
   human-authorized act: push only if the human has already said to.

## Outputs
- none — the merge commit and the cleanup commit on the integration branch
  are the result.
