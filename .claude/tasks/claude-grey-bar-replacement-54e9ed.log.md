# Run log — claude/grey-bar-replacement-54e9ed

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Replace the court-guide box with a help-centre link — done

- **gate:** mechanical GATE PASS (typecheck, lint, tests); completion review VERDICT: pass
- **changed:** `src/components/dashboard/matches/new-match-wizard/VideoRequirements.tsx` — deleted the `CourtGuide` function (inline SVG + `bg-[var(--surface-subtle)]` wrapper) and its call site; added a `next/link` "View all requirements" link to `/dashboard/help#advantage-intelligence` styled with the DS link treatment; moved the framing rule copy ("both baselines and the far service line in frame, with some space beyond the court on every side") into the existing "Elevated, centered, behind one baseline" REQUIREMENTS row; removed the "A guide, not a check" disclaimer; rewrote the file's top doc comment to match.
- **follow-ups:** 1. Consider adding camera-framing guidance to the `/dashboard/help#advantage-intelligence` section itself, since it currently only lists spec requirements (resolution/fps/singles/complete games), not framing. 2. Consider aligning `useUploadMatchWizard`'s probe/validator thresholds with the framing copy now on this row.

## T2 · Keep the trim rail from painting over the wizard footer — done

- **gate:** mechanical GATE PASS (typecheck, lint, tests); completion review VERDICT: pass
- **changed:** `WizardShell.tsx` — sticky footer gets `z-10` (was unset, letting the rail's `z-[1]`/`z-[3]` bracket/handles paint over it once scrolled into its band); content column bottom padding raised `pb-10` → `pb-24` (96px, ≥16px clear of the 64px footer at any viewport). `TrimStepContent.tsx` — rail's `relative` wrapper gets `py-0.5` so the bracket's/handles' `-top-0.5 -bottom-0.5` overhang lands inside the wrapper's own box instead of bleeding past it; no `overflow-hidden` added. Verified via the repo's dev-only `/wizard-reproduction` harness against a live `next dev` server: footer z-index confirmed non-`auto`, `elementFromPoint` on the overlap region returns a footer descendant (reverting z-index to `auto` reproduces the original bug), overhang containment and 96px gap confirmed via `getBoundingClientRect` at 1440×900 and 375×812, and both trim handles remained draggable (START/END and header timecode updated correctly).
