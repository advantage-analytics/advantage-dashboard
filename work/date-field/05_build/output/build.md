# Build report — date-field

The queue drained. All nine tasks are `done`, no task is `blocked`, and no
stash for this branch remains.

## Task statuses

| id | title | model | outcome |
|---|---|---|---|
| T26 | Add the date libraries and the ISO conversion module | opus | done — `9109278` |
| T27 | Build the `DateField` primitive | fable | done — `f9f52fa` |
| T28 | Migrate the statistics from/to dates | sonnet | done — `d7ca000` |
| T29 | Migrate the profile birthdate | sonnet | blocked, then done — `16cbfbc` |
| T30 | Migrate the dual facts Date cell | opus | blocked, then done — `277c017` |
| T31 | Migrate the tournament builder's Starts and Ends | opus | done — `93bbc91` |
| T32 | Migrate the upload wizard's date cell | fable | done — `c4ca71c` |
| T33 | Migrate the match-edit dialog's date | opus | done — `ef7c2e3` |
| T34 | Write the design system's date-field rule | opus | done — `18d2eb5` |

Every task passed three gate stages: mechanical (lint, `tsc`, the full
Playwright suite), `task-completion-reviewer`, and — for the seven diffs that
touched `src/components/dashboard/` — `pipeline-guardrails-reviewer`. No task
touched a data surface, so `rls-boundary-reviewer` never applied.

## Commit range

`28c0a2d..HEAD`, twelve commits: nine task commits, two `blocked` bookkeeping
commits that carry no code, and one queue amendment.

```
18d2eb5 T34: Write the design system's date-field rule
277c017 T30: Migrate the dual facts Date cell
16cbfbc T29: Migrate the profile birthdate
19ea064 task: amend T29 and T30 criteria to what a harness can observe
ef7c2e3 T33: Migrate the match-edit dialog's date
c4ca71c T32: Migrate the upload wizard's date cell
93bbc91 T31: Migrate the tournament builder's Starts and Ends
8d1f77d T30: blocked
c4001b2 T29: blocked
d7ca000 T28: Migrate the statistics from/to dates
f9f52fa T27: Build the DateField primitive
9109278 T26: Add the date libraries and the ISO conversion module
```

Sixteen files, +802 / −201. The primitive is 289 lines; the pure conversion
module 50, with a 56-line spec.

## Blocked items

None outstanding. Two tasks were blocked mid-drain and both were resolved
rather than abandoned, so this section is history rather than a to-do list.

**Both blocks had one cause, and it was in the criteria, not the code.** T29's
fourth criterion ended "Save persists the same `YYYY-MM-DD`" and T30's ended
"Continue stays disabled until the date is set". Each is a single conjunctive
sentence whose last clause needs a logged-in session, which this environment
does not have — and each asserted behaviour in a file its own task never
touches (`saveProfile` for one, `new-dual-flow.tsx` for the other). Both
subagents verified everything a harness reaches, said plainly what they could
not observe, and `task-completion-reviewer` correctly refused to call a
partly-verified claim met. The work was stashed under the runner's fail-closed
rule, with the stash SHA recorded in the run log.

The author amended both criteria on 2026-09-08 (`19ea064`) to ask for the
value reaching the save call, and the value the Continue gate reads — each
directly observable. Both tasks were then re-run, both passed, and both stashes
were applied and dropped.

**The re-runs were not a formality.** T29's first run had reported that
clicking a month segment left focus on the calendar button and dismissed it as
a test-harness quirk. It was the real defect: `SettingsField` wraps its
children in a `<label>`, and a `<label>` forwards clicks from a non-labelable
date segment to the primitive's calendar `<button>` — so on the real profile
page the month and day segments could not be clicked at all, only tabbed to.
The dispatcher caught it before committing and sent the work back. The fix is
an opt-in `labelless` prop used by the date branch alone; both reviewers
confirmed every other `SettingsField` call site keeps its label and its
accessible name.

## What the build found that the plan did not

Six defects surfaced during the work. None was in the plan, and each was
measured rather than reasoned about.

1. **The `<label>` trap, three times.** Same mechanism as above, in
   `FieldCell` (dual builder), `FieldCell` (tournament builder) and
   `SettingsField`. Each needed a different fix: the dual builder's cell
   already passed its label down, so a plain element swap sufficed; the
   tournament builder's cell was also naming two native selects, which needed
   an `aria-label` first; settings needed an opt-in prop because the label is
   shared with every other field on the page.
2. **A Radix dialog made the calendar mouse-dead.** The popover portals to
   `document.body`, where an open Radix `Dialog` sets `pointer-events: none`.
   The calendar rendered perfectly and simply did not respond to clicks.
   Fixed in the primitive with `pointer-events-auto`.
3. **The wizard's "not in the future" bound was a day wrong.** It used
   `toISOString()`, which is UTC, so it was the wrong day for anyone west of
   Greenwich in the evening. Now the local date.
4. **Enter inside a date segment advanced the whole wizard step**, because a
   segment is a `role="spinbutton"` element that `isFormControl` did not
   recognise. Anticipated by the plan and fixed with a spec.
5. **The focus chord stalled on an invisible element.** react-aria renders a
   visually-hidden `<input type="date" tabindex="-1">` for form submission, and
   the walk landed on it. Found in verification, not planned; the fix also
   repairs the same stall in the tournament dates.
6. **The library cannot be trusted to reject an impossible date.**
   `parseDate('2026-02-30')` throws while `new CalendarDate(2026, 2, 30)`
   silently clamps to the 28th, so the conversion module validates by
   round-tripping the fields rather than by either library entry point.

## Consciously left

- **Clearing one segment of a complete date fires no change event**, so the
  field reads `mm/14/2026` on screen while the draft still holds the old date
  and a Continue gate stays enabled. This is react-aria's contract — it reports
  complete dates or an explicit null — and it affects every call site equally,
  so it belongs in the primitive rather than in any migration. It is the one
  finding here that a coach could actually hit.
- **`DateField` has no `emphasis` prop**, so the profile birthdate draws its
  missing-state rule by reaching the primitive's internal `role="group"`
  wrapper with a descendant selector. Reviewed twice as correct and safe; the
  prop would be cleaner.
- **The calendar button keeps its own ring inside rows that answer
  `focus-within`**, which reads as two marks on that one control. It is the
  primitive's documented decision and identical across variants, so it is one
  decision to make there rather than per call site.
- **No `aria-invalid` and no error-message wiring** on the primitive, which the
  match-edit dialog's native input used to carry.
- **The wizard's time input stays native**, restyled to sit level with the date
  field beside it. A segmented time primitive is a separate decision.
- **Three native `<select>`s remain** — two in `schedule/add-result-dialog.tsx`,
  one in `schedule/add-result-row.tsx`. Named in `focus.css`, unrelated to
  dates.
- **`date-field.tsx`'s own header calls a segment a `[tabindex]` div.** It is a
  `<span role="spinbutton">`. Harmless to the mechanism, since the focus
  selector is tag-agnostic, but wrong — and it is what a careful author nearly
  copied into the design system before checking the library source.

## Also consulted

Beyond the declared inputs (the branch queue, its log, and
`../04_tasks/output/tasks.md`):

- `git log --oneline 28c0a2d..HEAD` and `git diff --stat` over the same range,
  for the commit list and the file counts.
- `git stash list`, to confirm no stash for this branch survives.
- `grep -rn 'type="date"' src`, to confirm the three remaining hits are prose
  and each is accurate.
