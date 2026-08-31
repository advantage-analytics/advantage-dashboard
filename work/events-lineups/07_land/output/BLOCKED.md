# Blocked — stage 07 (land)

**Why:** `06_review/output/review.md` line 3 still reads `Sign-off: pending`.
Stage 07 merges only past the literal word `approved` — invoking the runner
is not itself the sign-off for this stage; the word in the file is.

**What would unblock:**

1. Do the review's one outstanding human check if you haven't (load
   `/dashboard/team/schedule` on a zero-event team as staff and as a player —
   the "Consciously left" section of review.md).
2. Edit `work/events-lineups/06_review/output/review.md` line 3 to
   `Sign-off: approved` (annotate instead if something's wrong).
3. Delete this file (`work/events-lineups/07_land/output/BLOCKED.md`).
4. Run `/feature-next events-lineups` again — stage 07 will then verify the
   pr-check receipt, merge `--no-ff` into the integration branch, and delete
   this workspace + the branch's queue pair there.

Everything else is ready: all gates green, receipt recorded
(`.claude/hooks/pr-check-receipt.sh show`), tree clean.
