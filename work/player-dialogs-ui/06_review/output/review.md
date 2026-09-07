# Review — player-dialogs-ui

Sign-off: approved — "looks good, sign off" (2026-09-07), after the
full-branch re-run below covering the four hand commits made since this
review was first written.

Gate run: `.claude/skills/pr-check/SKILL.md` over the branch range, twice —
once at `aba99fa` when this review was written, and again at `f2689dd` after
four further commits (below). The second run is the one the sign-off covers.
**Target picked: the branch range**, working tree clean at the start.
`git merge-base HEAD splitstep-integration` resolves to `8e8d017` — the same
base T8 derived independently, which is a useful consistency check. Note that
`main` is NOT the base: it is far behind, and `main...HEAD` sweeps in roughly
100 unrelated files.

## Success criteria, from the brief

| # | Criterion | Verdict |
|---|---|---|
| 1 | All three dialogs render larger, DS-conformant, as one family | **Met, with a caveat.** The shared shell's default is 520 and Add/Invite/Edit inherit it, so they are wider and remain one object. But the *only* thing that changed is width — padding, rhythm, type, footer grammar and the close button were already v3-conformant and were deliberately left byte-unchanged. If "improve the UI to be more in line with the DS" meant more than size, that has not happened, and the honest reason is that there was little to fix. |
| 2 | Invite → "someone new" lands in Add Player with the email prefilled | **Met**, as an offer rather than a redirect, per your decision. Verified by spec and by source pin. |
| 3 | Add Player warns before an occupied lineup spot | **Met, reinterpreted.** No displacement: spots are deliberately non-unique, so this is an acknowledgement gate, not a warning before an overwrite. |
| 4 | The new player holds the spot, the displaced player is out | **Not met, and deliberately so.** Nothing is displaced. This criterion was written before tracing showed sharing is intentional; you chose "raise the note to a confirm" instead. Recorded here so the brief and the code are not silently in disagreement. |
| 5 | Drawer shows only played sets, no clipping, at real width | **Met and measured** — `scrollWidth <= clientWidth` in a real browser layout, and the spec now genuinely guards the component (see findings). |
| 6 | Stored score values byte-identical before and after | **Met structurally, plus a real row comparison.** No loader, route handler or migration is in the diff and no added line writes to `score`. The operational check (reading either side of a live drawer load) was traded away — see T8's log entry and "consciously left". |
| 7 | Even spacing around the dash | **Met** — one `gap-1.5` produces both sides by construction; 6px each, previously 10px and ~4px. |

## Findings and resolutions

**Stage 1 — mechanical:** `npm run lint` (0 errors), `npx tsc --noEmit`,
`npm run build`, `npm test` (443 passed). All green, re-run after every fix
below.

**Stage 2 — quality (`simplify`, four angles in parallel).** Efficiency
returned clean and said so plainly — the reviewer's own note was that adding
memoization to a 340px drawer over roster-sized data would itself be the
finding. Reuse, simplification and altitude each returned findings; the
overlapping ones are merged below.

**Stage 3 — correctness (`code-review medium`) and guardrails.**

Fixed in this stage:

1. **`roster-invite-dialog.tsx` — the hand-off bypassed the dialog's only
   reset path.** The header's `handOffToAddPlayer` flips `inviting` directly,
   so the hand-off never reached `close()`, the one place that resets. The
   dialog stays mounted, so the handed-off address survived: a coach who hands
   maya@school.edu to Add Player and adds her as a coach-managed row would
   reopen Invite to find that address still loaded, ready to invite somebody
   who now has a profile — the second identity the target picker exists to
   prevent. The file's own comment warns about exactly this class of bug
   ("exactly one place that resets — not four callers each remembering to");
   the hand-off had quietly become the fifth caller. Now routes through
   `close()`, reading `draft` first because `close()` clears it. T7's source
   pin was updated to assert the stronger invariant rather than the old line.
2. **`tests/player-drawer-score.spec.ts` — the regression test could not fail
   on its own regression.** It restated the row's grid template rather than
   importing it. **Verified empirically:** reverting the component to a fixed
   `72px` left the spec green. It now imports the real value and the same
   revert fails with a real measurement (85px into a 72px cell). This also
   corrects something T2's implementer reported and this runner relayed — the
   "I verified it is not vacuous" claim was about reverting the constant
   inside the spec, which proves the assertion works but not that it guards
   the component.
3. **`add-player-dialog.tsx` — a duplicate name-list joiner.** `sharedWith()`
   was byte-identical to `nameList()` in `player-fields.tsx`. The two
   sentences stay separate, but the joiner is a product decision the note and
   the confirm directly beneath it must agree on; two copies could drift with
   nothing binding them. `nameList` is now exported and called from both.
4. **`player-drawer-layout.ts` — a new JSX-free module.** Coupling the spec to
   the real template initially meant importing a `"use client"` component into
   a Playwright spec, pulling its whole module graph into Node to read one
   string. The guardrails reviewer flagged the fragility; the constant now
   lives in a module with no JSX and no client directive, imported by both.

## Added after this review was first written

Four commits landed by hand, outside the task queue, after the `aba99fa`
receipt. They are ordinary work, not corrections to the reviewed range, and
each was gated (lint, tsc, build, 447 tests) when made; the second pr-check
run at `f2689dd` is what covers them properly.

1. **`2a58937` — the lineup save flickered.** After Save the table drew the
   OLD order, animated back to it, then animated to the new one:
   `revalidatePath` only marks the cache stale, so the refreshed `members`
   arrive a render or more after the action resolves, and in that gap the
   table fell back to the old rows under `layout="position"`. A `settling`
   state now holds the saved order until the first refresh after Save.
   Released on `members` identity rather than only on a spot match, so a
   concurrent edit by another coach cannot leave a stale order on screen —
   a hole the guardrails reviewer found in the first version.
2. **`c27ea4f` — the bench divider snapped.** With nobody benched, that ~40px
   row appeared and vanished in one frame, so the card's height jumped while
   the rows slid smoothly. It now grows and collapses on height and opacity,
   with a reduced-motion path.
3. **`0931c32` — required and optional in the dialogs.** `SettingsField` gains
   a `required` prop (red asterisk, `aria-hidden`, with sr-only "(required)"),
   marked only where the submit actually gates. `"Email · optional"` becomes
   `"Email"` with the word moved into the hint as a sentence.
4. **`f2689dd` — the second pr-check's own cleanups.** `held` derived once in
   `roster-table.tsx` where two expressions had re-derived it, `aria-required`
   on the five marked inputs, and a comment corrected that wrongly claimed
   rows never unmount inside the presence wrapper.

**None of the four has been seen running.** They are reasoned from the code
and gated mechanically; this environment cannot drive an authenticated
dashboard. Two are motion changes, where "it passes" and "it looks right" are
genuinely different claims — worth one Save on a real roster with an empty
bench. The correctness reviewer also flagged, at ~55% confidence and without
calling it a defect, that the divider now carries both `layout="position"` and
an animated `height`; `layout="position"` is documented to ignore size, so the
two should not fight, but that is the specific thing to watch.

## Consciously left

- **`dialog-shell.tsx`'s `width` union carries unused `440` and `560`.**
  Flagged independently by three of the four cleanup angles, and they are
  right that it misleads. Left because that exact union is what T4's
  already-passed acceptance criterion specified: narrowing it now would
  falsify the queue's record of what was gated, for a cosmetic gain. Worth a
  one-line follow-up on another branch.
- **The spot confirm gates Add Player but not Edit Player.** The altitude
  reviewer argued this is the wrong instrument for a legal, reversible,
  zero-loss action that already has a note, and that a rule one adjacent door
  does not apply is friction rather than a rule. That is a fair critique of the
  product decision — but it *is* the decision you made after being shown that
  sharing is intentional, and Edit is the mid-reshuffle case the non-unique
  design exists for. Recorded, not overridden.
- **The score track can crush the opponent cell.** `minmax(0,1fr)` has a zero
  minimum, so in the 340px rail a five-set score with superscripts takes width
  without bound. Bounding it needs a visual judgment at real width, and the
  brief scoped this row to the clipping fix.
- **The operational persistence check.** T8 could not read a score either side
  of a live drawer load; no authenticated session is available. Structural
  proof plus a real row comparison stands in. What remains unproven: nothing
  here observes the application running.
- **Other `ScoreLine` callers still render untrimmed scores.** Deliberate
  out-of-scope work for a separate branch, per the design.

## The verdict

**Ready to merge, with two things you should see first.**

The blockers are gone: the invite-reset bug is fixed, and the drawer spec now
actually guards its component. What is left is not blocking, but is the kind of
thing worth knowing before you approve rather than after:

1. **Success criterion 4 is not met and never will be** — nothing is
   displaced, because displacement turned out to be the wrong thing to build.
   The brief still says otherwise. Either annotate the brief or accept the
   divergence knowingly.
2. **The invite path has never been exercised end to end.** No test touches
   `inviteMember`, seat accounting or mail. The hand-off leaves that path
   byte-unchanged and two reviewers confirmed it by reading, but a real
   click-through is the only thing that would actually demonstrate it.

The recurring theme, worth one decision at some point: four of the five specs
on this branch approximate, and T8 could not run its check, all because this
repo cannot render a real client component or drive an authenticated dashboard
session in a test. One harness branch closes all five gaps.

## Also consulted

Beyond this stage's declared inputs (`../05_build/output/build.md`, the range
diff, `../01_brief/output/brief.md`, `.claude/skills/pr-check/SKILL.md`):

- `src/components/dashboard/team/{roster-invite-dialog,add-player-dialog,player-drawer,player-fields,roster-header-buttons,dialog-shell,roster-table}.tsx`
  and `src/lib/ui/score-format.ts` — read in full while reviewing, and edited
  for the four fixes above.
- `tests/{player-drawer-score,invite-add-handoff}.spec.ts` — edited.
- `src/components/dashboard/team/player-drawer-layout.ts` — created.
- `.claude/tasks/claude-player-dialogs-ui-1a007f.{md,log.md}` — the per-task
  gate record, to establish that the committed range was all task-gated and
  that the pipeline-stage commits carry zero source files.
