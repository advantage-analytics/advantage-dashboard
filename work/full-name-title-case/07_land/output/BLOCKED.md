# BLOCKED — stage 07 (land)

Nothing was merged. Two of the three preconditions this stage checks are not
met, and neither is mine to satisfy.

## 1. Sign-off is `pending`, not `approved`

`../06_review/output/review.md` line 3 reads:

```
**Sign-off: pending**
```

The contract is that this line must read `approved`. This is the one stage that
blocks on a human word, and invoking the runner is deliberately not that word —
if re-invocation counted as sign-off, the line would be decoration.

## 2. The pr-check receipt says `not-ready`

```
4f21fc4  not-ready  2026-09-02T16:51:17Z  claude/full-name-title-case-2efeba
    note: titleCaseName R1b uppercases short real surnames (Xi->XI, Vi->VI);
          fix verified, awaiting sign-off
```

A receipt exists, so the stage's step-2 check ("none → stop and say the gate has
not run") passes on its letter. But the verdict it records is `not-ready`, and
merging past a `not-ready` receipt would make the receipt meaningless. The
recorded reason is the open finding below.

The receipt also notes the tree was dirty when recorded — the quality-pass fixes
were uncommitted at that moment. They are committed now, in `2da7bb0`, so a
re-run of the gate on a clean tree would produce a cleaner receipt regardless of
how the finding is resolved.

## What would unblock this

One decision, then one edit.

**The decision: `titleCaseName` uppercases short real surnames.**
`Xi → XI`, `Vi → VI`, `Vivi → VIVI`. R1b fires on any token built only from
`i`/`v`/`x`, and R1 cannot protect a two-letter token because it requires an
uppercase letter *after* the first character. An owner surnamed Xi reads as
"Wei XI manages Advantage here" on a page anonymous visitors can reach.

Either:

- **Apply the fix** — gate R1b on a uniformly-cased token, since a generational
  suffix is typed `III` or `iii` while a name is typed `Xi`. Verified: all 15
  cases the spec pins still pass, `III`/`iii`/`ii`/`xii` still work, and every
  affected surname is left as typed. Then re-run `/pr-check` on the clean tree
  for a `ready` receipt, and set sign-off to `approved`.
- **Or accept it** — widen the doc comment's disclosure at
  `src/lib/data/person-name.ts:122` to name `Xi` and `Vi` rather than only
  `Vivi` and `Ivi`, re-run `/pr-check`, and set sign-off to `approved`. The
  trade-off is then recorded honestly instead of being narrower on paper than in
  the code.

Either path is legitimate. What is not legitimate is merging with the sign-off
line reading `pending` and the receipt reading `not-ready`.

## Branch state, for whoever picks this up

- 13 commits ahead of `splitstep-integration`; working tree clean.
- Base `fd13c75`. Nothing has been merged, nothing pushed.
- The queue pair and this workspace are both still present, as they should be
  until the merge happens — stage 07 deletes them on the integration branch.

## Not blocking, but queue it before or after the merge

The branch created a seam it did not close: the invite email prints the
inviter's name raw (`team-actions.ts:209` passes `viewer.name` from `toViewer`,
which does not case) while the join page it links to prints the same name cased.
A coach stored as `ELENA`/`VASQUEZ` sends mail whose subject reads "ELENA
VASQUEZ invited you to…" over a landing page reading "Elena Vasquez invited
you to…". Left out of scope deliberately — the brief names email templates and
dashboard settings as non-goals — but it is the most user-visible loose end.
