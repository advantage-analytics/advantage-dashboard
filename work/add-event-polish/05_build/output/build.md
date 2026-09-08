# Build — add-event-polish

Queue drained on 2026-09-08. All four feature tasks are `done`; none is
`blocked`.

## Task statuses

| Task | Status | Commit | Gate |
|---|---|---|---|
| T22 · Chooser centred on the vertical axis too | done (second run) | `d112680` | lint/tsc/test pass · completion `pass` · guardrails no findings · RLS skipped (no data surface) |
| T23 · School rows: 32px mark, subtle wash, Signal Blue check | done | `4c501d6` | lint/tsc/test pass · completion `pass` · guardrails no findings · RLS skipped |
| T24 · Facts step: MenuSelect for Site, Surface and Format; the Date rule answers focus | done | `f8e332b` | lint/tsc/test pass · completion `pass` (own live re-check) · guardrails no findings (traced `adScoring` end to end) · RLS skipped |
| T25 · Harness down, full suite green | done | `2a86f09` | lint/tsc/test pass (658) · completion `pass` · both guardrails skipped (deletions + MAP.md only) |

## Commit range

Feature commits on `claude/dual-match-tournament-designs-26cc2f`, oldest first
(`git log --oneline 01a6b92..2a86f09`):

```
2316cba add-event-polish: scaffold the dev-preview harness (removed in T25)
6debd3a T22: blocked
4c501d6 T23: School rows: 32px mark, subtle wash, Signal Blue check
f8e332b T24: Facts step: MenuSelect for Site, Surface and Format; the Date rule answers focus
3d99c10 task: amend T22 criteria 3 and 4 — measure against the body, probe with real content
d112680 T22: Chooser centred on the vertical axis too
2a86f09 T25: Harness down, full suite green
```

`8afca6e` (`pipeline(date-field): scaffold workspace`) follows in history but
belongs to a different feature.

## Blocked items

None outstanding. T22 was blocked once (`6debd3a`) and re-run:

- **Why it blocked.** Two criteria were defects in the task, not the work.
  Criterion 3 measured vertical centring against `[data-content-area]`, which
  includes the shell's fixed ~75px footer — the column was exactly centred in
  the body above it (35.5px above the whole-area centre). Criterion 4's
  invariant probe used an empty 1000px child, whose flex minimum size is 0,
  so it shrank and proved nothing.
- **How it resolved.** The author viewed the stashed diff on the harness and
  approved body-centring; criteria 3 and 4 were amended (`3d99c10`); the
  same diff re-applied and passed with the body-centre offsets at 0/2px and
  a real-content probe overflowing and scrolling as required.

## Deviations from the plan, recorded

- The harness routes were **committed** (`2316cba`) rather than left
  untracked as the plan assumed — the task gate's `npm test` fails on any
  route missing from `MAP.md`, so untracked routes would have failed every
  task before its work was judged. T25 removed them and the map row count
  returned to 62.
- T24 touched `src/styles/design-system/focus.css` (outside its `files:`) to
  correct a comment naming the two native selects it deleted, and added a
  34px trigger height; both accepted by the completion reviewer as
  consequences of the change.

## Follow-ups surfaced (in the run log, not queued)

1. The chooser's "Add a one-off match" link points at
   `/dashboard/team/schedule/new/single`, a route `splitstep-integration`
   retired — a dead link, its own task.
2. The Format menu lists two rows "Best of 3 sets" and two "One set",
   distinguished only by their description line — a design call.
3. `EventMark`'s 32px case rides an inline ternary; a fourth size wants a
   switch.
4. `focus.css`'s comment still names `settings/settings-inline-select.tsx`,
   deleted upstream — a stale sentence.
5. `static-tournament-builder.tsx`'s `FieldCell` keeps the native-select
   pattern T24 retired — the natural next consumer of `MenuSelect`, and the
   `date-field` feature (scaffolded, `8afca6e`) will take its two date cells
   and the dual flow's Date cell.
6. The Browser pane's `key` tool delivers Enter/Space as blank keydown
   events in this environment — the reviewers judged those criteria
   structurally, and future tasks should not rely on injecting them.
