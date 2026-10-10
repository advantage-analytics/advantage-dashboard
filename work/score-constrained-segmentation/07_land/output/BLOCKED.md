# Blocked: stage 07 (land)

**Gate 1, the sign-off, is not given.** `../06_review/output/review.md` reads
`Sign-off: pending`. This stage opens a PR only after a human has signed off. The
pipeline never changes that line itself.

**To unblock:**

1. Read `../06_review/output/review.md`. Before signing off, check:
   - the ITF tie-break rule F3 relies on: change ends after every six points and at the
     end of the tie-break;
   - the follow-ups left consciously, F4–F6.
2. Change the line to `Sign-off: approved`, adding any note on the same line.
3. Delete this file.
4. Run `/feature-next score-constrained-segmentation` again.

**Gate 2 already holds:** pr-check receipt `7a42527 ready`, reviewed as the branch range.
