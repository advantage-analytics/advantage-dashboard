# BLOCKED — stage 07 (land)

## Why

`../06_review/output/review.md` line 3 reads:

```
Sign-off: pending
```

Stage 07's contract makes that line the gate: it must read `approved`, and
this is the one stage in the pipeline that blocks on a human word. Invoking
`/feature-next` is not the sign-off — every other stage treats re-invocation
as approval, and this stage deliberately does not, because the act it gates is
a merge into the integration branch.

Nothing was merged. Nothing was deleted. The branch is exactly where stage 06
left it.

## What would unblock it

Edit that line in `../06_review/output/review.md` to:

```
Sign-off: approved
```

Then run `/feature-next input-fields-dropdowns-consistency` again. Annotating
it instead — a condition, a caveat, a request for changes — is also a valid
answer; this stage will read whatever is there and act on it rather than
merging past it.

**Before signing off, the review's "Consciously left" section is the part
worth a second look.** It records that the feature shipped a narrowed scope:
nine pages of the claim, join and onboarding flows, with twelve tasks
deferred by your own decision and the drift they describe still present in the
dashboard. Approving lands that as the finished state of this branch.

## Every other precondition is already satisfied

Recorded so the next run does not re-derive them, and so nothing else is
mistaken for the blocker.

| Contract step | State |
|---|---|
| 1 · sign-off reads `approved` | **BLOCKED** — reads `pending` |
| 2 · full-branch pr-check receipt exists | Satisfied — `2557c8e`, verdict `ready`, reviewed as a branch range against base `fd13c75` |
| 3 · this tree is clean | Satisfied |
| 3 · integration branch is checked out elsewhere | Satisfied — `splitstep-integration` at the repo root, `/Users/cjgimena/Desktop/vscode/advantage-dashboard`, sitting at `fd13c75` |
| 3 · branch is mergeable | Satisfied — 14 ahead, 0 behind, so `--no-ff` needs no rebase and can produce no conflict |
| 4 · cleanup targets exist | Satisfied — the queue pair `.claude/tasks/claude-input-fields-dropdowns-consistency-41813d.{md,log.md}` and this workspace `work/input-fields-dropdowns-consistency/` |

## What the next run will do, once approved

1. Merge `claude/input-fields-dropdowns-consistency-41813d` into
   `splitstep-integration` with `--no-ff`, executed in the root worktree via
   `git -C`, after re-confirming that tree is clean.
2. Commit a cleanup on the integration branch deleting this branch's queue
   pair and this workspace. Git history is the archive.
3. Report both commit SHAs. **It will not push** — pushing stays a separate,
   explicitly authorized act.

One judgement call it will have to make, flagged now rather than at merge
time: the twelve `later` tasks live in the queue pair that step 4 deletes.
Deleting them is what the contract says and git history preserves them, but if
you intend to actually run any of them, say so and they should be carried to
a new branch's queue **before** the cleanup rather than recovered from history
afterwards.

## Also consulted

Beyond the declared inputs: `.claude/hooks/pr-check-receipt.sh show` for the
receipt, `git worktree list` and `git rev-list --left-right --count` for the
integration branch's location and this branch's position, and
`.claude/tasks/` for the cleanup targets.
