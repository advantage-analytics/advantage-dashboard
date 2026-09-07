# Stage 07 — blocked

Two of the stage's gates fail. Nothing was pushed and no PR was opened.

## Gate 1 — sign-off: NOT given

`work/player-dialogs-ui/06_review/output/review.md` line 3 reads
`Sign-off: pending`. This is the one stage that blocks on a human word, and
the word has not been written. Edit that line to `approved` (annotate it if
you are approving with reservations — the annotation travels into the PR body
as the approval record).

## Gate 2 — receipt: STALE

The full-branch `ready` receipt exists, but it was recorded at `aba99fa`
(stage 06). Three **source** commits landed after it, by hand, outside the
task queue:

- `2a58937` — Roster lineup: hold the saved order until the server's rows arrive
- `c27ea4f` — Roster lineup: the bench divider grows and collapses as a row
- `0931c32` — Roster dialogs: required asterisks, and 'optional' moves into the hint

Each passed lint, tsc, build and the full test suite at the time, and the first
two were reviewed by `pipeline-guardrails-reviewer`; the third was copy and a
glyph. But none of them faced `code-review`, `simplify`, or a receipt. The
contract's step 4 names this case precisely: anything under `src/` or `tests/`
after the receipt is ungated code that "belongs to a task and a re-run of
`/pr-check`, not to a landing commit". Every check the receipt attests to must
be re-run over the range so the receipt's sha is at or after `0931c32`.

(`668da13`, the stage-07 contract adoption, is markdown only and is fine.)

## What unblocks it

1. Run `/pr-check` over the branch range and record a fresh `ready` receipt.
   If it finds anything, fix it and re-run; the receipt must postdate the last
   source commit.
2. Edit `review.md`'s `Sign-off:` line to `approved`. The review body should
   also mention the three hand commits — its "consciously left" section
   predates them, and a reader of the PR body would otherwise not know they
   exist.
3. Delete this file and run `/feature-next player-dialogs-ui` again.

Order matters slightly: sign off *after* the receipt, so the word covers what
the receipt covers.

## Not a precondition failure

Step 3's checks were not reached, but for the record the branch is on
`claude/player-dialogs-ui-1a007f`, the tree is clean, and HEAD is not an
ancestor of `splitstep-integration`.
