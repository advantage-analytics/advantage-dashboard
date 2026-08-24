# Run log — claude/design-system-updates-850200

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Fold the shipped focus/token work into DESIGN.md and the design skill — done
- **gate:** lint clear (0 errors; 38 pre-existing warnings, none in the touched
  files) · `tsc --noEmit` exit 0, no stale-`.next/` re-run needed · `npm test`
  93/93 passed · task-completion-reviewer `VERDICT: pass`, having re-verified
  every asserted token value, contrast ratio and selector against
  effects.css/colors.css and the three call sites. Both guardrail reviewers
  skipped legitimately: the diff is two documentation files, touching none of
  `src/app/dashboard/`, `src/components/dashboard/`, the upload wizard,
  `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or
  `supabase/migrations/`, and `git ls-files --others` was empty.
- **changed:** SKILL.md's Focus section rewritten — it now opens on "Write
  nothing", names the wrapper-ring pattern, and gives both shipped selectors in
  a table: `focus-within:` where the box holds only the input
  (`claim/program-search.tsx`), `has-[input:focus-visible]:` where it also holds
  focusable children (`team/invite-dialog.tsx`), with the chip-button
  double-ring as the reason. `data-focus-ring="none"` is documented as the
  opt-out, including why it is scoped to `:focus-visible` instead of an inline
  `boxShadow: "none"` that would kill unrelated shadows silently. The two
  icon-button recipes lost their `focus-visible:ring-2 ring-[#3B82F6]/40` line,
  which unlayered focus.css discards — the only surviving occurrence is prose
  explaining that it is dead. Shadow, easing and duration tables extended to
  cover `--shadow-keycap`, `--shadow-cta-glow`, `--ease-chart` and the four
  `--duration-*` tokens. DESIGN.md gained the shipped values of both focus
  rings, the 3:1 floor on `--field-ring`/`--ink-500` (3.55:1 / 3.31:1 against
  the #E5E5E5 it replaced at 1.26:1 / 1.18:1), a wrapper-ring bullet, and an
  "Effects tokens — the shipped set" inventory covering all 14 custom
  properties, with the `.dark` block and `@keyframes adv-status-pulse` marked
  deliberately undocumented (dark mode is staged, not shipped).

## T2 · Correct the stale focus-ring figures in the CSS comments — blocked
- **gate:** lint clear (0 errors) · `tsc --noEmit` exit 0 · `npm test` 93/93 ·
  diff confirmed comment-only, no declaration or token value touched ·
  task-completion-reviewer `VERDICT: needs-work`. Guardrail reviewers skipped
  legitimately: the diff is two files under `src/styles/design-system/`,
  touching none of `src/app/dashboard/`, `src/components/dashboard/`, the
  upload wizard, `src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or
  `supabase/migrations/`; `git ls-files --others` was empty.
- **why:** Four of the five criteria were met and independently re-verified by
  the reviewer, which recomputed every ratio from the hex values rather than
  trusting the task block. The fifth failed on one figure: the task asked for
  `2.12:1` as the ceiling at 30% alpha, and that value is an artifact of
  rounding, not of the formula. Pure black at 30% over white composites to
  exactly 178.5, and the ratio is 2.12:1 / 2.11:1 / 2.10:1 depending on whether
  you round half-to-even, leave it unquantized, or round half-up. The task block
  inherited 2.12 from commit 55087b4, whose script used Python's banker's
  rounding — an arbitrary choice asserted to two decimals. The criterion
  demanding that figure be recomputed from the formula is unsatisfiable as
  written.
- **needs a decision before re-running:** the honest figure is `~2.1:1`, which
  holds under every rounding. Writing that in `colors.css` alone leaves it
  disagreeing with DESIGN.md → Focus and SKILL.md → Focus, which both say
  `2.12:1` and sit outside T2's `files:` list. So T2 should either be widened
  to include those two docs, or the ceiling sentence dropped from the criterion
  — a scope call, not the runner's to make.
- **stash:** 9fa3b7597418a95668d5588458df1773ec704944 (comment-only changes to colors.css and effects.css;
  everything except the 2.12 figure is correct and re-verified, so this is worth
  restoring rather than redoing).
