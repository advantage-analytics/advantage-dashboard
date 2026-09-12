# Stage 07 — Land

This stage leaves nothing in `output/`: its result is a cleanup commit on the
feature branch, that branch pushed to `origin`, and an open PR against the
integration branch. It is current when stages 01–06 all have their primary
outputs and this workspace still exists on the branch.

**This stage opens the PR. It does not merge it.** A PR is a human review
surface, and merging it in the same breath would make it a formality — the
pipeline's whole architecture is that a human between invocations is the gate.
Integration therefore still takes a second human act: the merge click. When
they take it, a merge commit (`--no-ff`, the repo's habit) is the right button
rather than squash — the per-task commits are the build record stage 05 wrote
down — and deleting the remote branch afterwards is theirs to choose, as is
removing the local worktree and branch.

## Inputs

- working: `../06_review/output/review.md` — its `Sign-off:` line is the gate;
  its success-criteria verdicts and "consciously left" become the PR body
- working: `../01_brief/output/brief.md` — its `## Goal` opens the PR body
- working: the branch state (clean tree; position vs the integration branch,
  both locally and on `origin`)

## Authorization

Invoking this stage after signing off IS the authorization to push this
feature branch and open the PR. This replaces the previous contract's rule
that pushing was a separate, named human act — that rule guarded against a
local merge quietly becoming public, and it made sense when the stage's whole
output was local. In a PR flow, publishing IS the deliverable, and a stage 07
that may not push does nothing at all. The invocation does **not** authorize:
pushing to `splitstep-integration` or `main`, force-pushing anything, or
merging the PR. The two gates below are unchanged.

## Process

1. **Gate 1 — sign-off.** The `Sign-off:` line must read `approved`. Anything
   else → `output/BLOCKED.md` naming what is missing. This is the one stage
   that blocks on a human word.
2. **Gate 2 — receipt.** A full-branch pr-check receipt must exist for this
   branch: `.claude/hooks/pr-check-receipt.sh show --branch <branch>`, verdict
   `ready`, reviewed `the branch range` — a `working-tree` receipt does not
   attest that the commit was gated. None → stop and say the gate has not run.
   **Never open a PR past either gate.**
3. **Refuse a branch with nothing to propose.** Fetch, then stop with
   `output/BLOCKED.md` if any of these hold:
   - HEAD is already contained in the integration branch — local or origin
     (`git merge-base --is-ancestor HEAD splitstep-integration`). The work was
     merged the old way; a PR would be empty or a duplicate. Say which of the
     two it is, and that the way to finish such a branch is by hand on the
     integration branch — delete its queue pair and workspace there, there is
     no PR to open. Never try to reverse someone's merge.
   - No commits ahead of `origin/splitstep-integration`.
   - Local `splitstep-integration` is ahead of `origin/splitstep-integration`.
     The PR's diff is taken against the remote, so it would carry those
     unpushed commits and misrepresent its own scope. Name the count and the
     commits; pushing the integration branch is a human act, not this stage's.

   Fail loudly here. An empty or over-scoped PR is public and awkward to undo.

4. **Commit what is left, on the feature branch.** The expected dirt is the
   human's own edit to `review.md` (the sign-off) — commit it. Anything under
   `src/`, `supabase/` or `tests/` is ungated code the receipt does not cover
   → `output/BLOCKED.md` and stop; it belongs to a task and a re-run of
   `/pr-check`, not to a landing commit.
5. **Cleanup, committed on the feature branch, BEFORE the push.** This
   ordering is what the whole stage turns on. Delete this branch's queue pair
   (`.claude/tasks/<branch-slug>.md` + `.log.md`) and this workspace
   (`work/<slug>/`), and commit. The PR then carries the deletion, and merging
   it leaves no residue. Do this _after_ a merge, as the old local flow did,
   and `work/<slug>/` rides into the integration branch through the PR and
   needs a second commit there to remove it. Git history is the archive.
   Exception: a workspace kept deliberately as the current worked example — if
   so, say so in the report and delete the previous example instead.

   Steps 4 and 5 must contain **no source change**. That is what keeps gate 2
   honest across them: `show` will now report "N commit(s) on HEAD since this
   receipt", which is expected and harmless exactly as long as every one of
   those N commits is markdown and queue files.

6. **Push, then open the PR.** `git push -u origin <branch>`, then
   `gh pr create --base splitstep-integration --head <branch> --title …
--body-file <tmp>`. Write the body to a temp file **outside** the working
   tree (`mktemp`) and remove it after — a body file inside the repo is
   untracked residue at the one moment the branch must be clean.

   Title: `<slug>: <the brief's goal, in one line>`.

   Body: step 5 deleted the workspace, so this PR is the only readable record
   of the feature outside git history. It carries, in order:
   - **Goal** — the brief's `## Goal`, condensed to a short paragraph.
   - **Success criteria** — every criterion from `review.md` with its verdict,
     one line each, keeping the review's own qualifications ("met at ≥768px,
     not as literally worded"). Never upgrade a qualified verdict to "met".
   - **Consciously left** — that section of `review.md`, if it has one.
   - **Sign-off** — the `Sign-off:` line verbatim, with the human's annotation
     if they left one. It is the approval record.
   - **pr-check receipt** — the receipt line verbatim: sha, verdict,
     timestamp, `ran:`, and every `skipped:` with its reason.
   - **What this PR deletes** — the queue pair and `work/<slug>/`, why, and
     the sha of step 5's parent commit, so a reader can recover any stage
     output with `git show <sha>:work/<slug>/06_review/output/review.md`.
   - The trailer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

7. Report the PR URL and the cleanup commit, and say plainly that nothing has
   been merged — reviewing and merging the PR, and afterwards removing this
   worktree and branch, are the human's.

## Outputs

- none — the cleanup commit, the pushed branch and the open PR are the result.
  `output/BLOCKED.md` when a gate or a precondition in step 3 fails.
