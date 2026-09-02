# Review — eyebrow-text-wrap

Sign-off: pending

*(The human edits this line to `approved` — or annotates it otherwise — and
that word is stage 07's gate. Nothing merges until it changes.)*

Range reviewed: `fd13c75..HEAD`, the whole feature branch, picked because the
working tree was clean. Five code files; everything else in the range is
pipeline markdown.

## Success criteria, from the brief

**1. "The eyebrow occupies exactly one line at every viewport the pages
support."** — Met at 768px and above, on all sixteen verified loads. **Not met
as literally worded**, and deliberately so: the claim flow mounts no mobile
gate, so phones are a supported viewport, and at 390px roughly a third of
programs still wrap. No composition of real fields avoids that — the longest
school name alone is 495px against a 342px frame. Stage 02 narrowed the
guarantee to ≥768px with that measurement in hand, and the human accepted it
there. Flagged here so the sign-off is given against what shipped rather than
against the original sentence.

**2. "It still identifies the program unambiguously."** — Met for 1,937 of
1,941 programs. Four rows lose their only distinguishing field: Glendale
Community College, men's and women's, exists twice — California's Western
State Conference and Arizona's ACCAC — and conference was what told them
apart. Accepted at stage 02 as a 0.2% ambiguity on a screen reached by program
key from a search result that shows conference.

**3. "The gap still reads as one unit; no new vertical space above the
title."** — Met, and measured rather than eyeballed. The eyebrow-to-title
distance is exactly 2px on all sixteen loads, matching the unchanged
`gap={2}`, at four decimal places.

**4. "Verified against the real long tail, not a short fixture."** — Met. The
regression spec composes every row of the live table, cross-checked against an
exact count so PostgREST's 1,000-row cap cannot hide half of it. The browser
pass used the three worst real programs plus one ordinary one.

**5. "No change to the `.eyebrow` token or to claim screens outside the two
named."** — Met, and strengthened during this review. The token is untouched.
The shell's heading wrapper was initially unconditional, so the fourteen claim
screens that pass no heading each gained a wrapper div; that is now conditional,
and a no-heading screen renders exactly the markup it did before the branch —
verified in the browser, one child under the shell, the column itself.

## Findings and resolutions

Mechanical gates green throughout: lint 0 errors (37 pre-existing warnings in
unrelated files), `tsc --noEmit` silent, `npm test` 304 passed.

**Fixed in response to this review — four changes, all re-gated:**

1. *Simplification.* `ClaimShell` wrapped every caller in a flex div to serve
   the two that hoist a heading. The body is now named once and the wrapper is
   conditional, so fourteen screens render their original markup and no grid
   markup is duplicated to achieve it.
2. *Correctness (the one `code-review` finding, low).* The spec asserted
   `rows.length > 1000` to prove paging was exercised, which coupled it to the
   table holding more than a page. A pruned directory or a smaller staging
   project would have turned a healthy feature into a red suite. The assertion
   is now guarded by the exact count, and the unconditional equality check
   still proves paging completeness on its own.
3. *Efficiency.* The spec's exact-count query and its paged read are
   independent until compared, and now run concurrently rather than one after
   the other.
4. *Simplification.* Both data assertions re-derived all 1,941 eyebrows
   independently; they are now derived once and shared.

Also applied, from the altitude pass: the 97-character budget now names the
three files that must move together — the `.eyebrow` token in
`typography.css` and the two shells whose `width` it assumes — since nothing
links them automatically and the spec cannot notice when the arithmetic goes
stale.

**Reviewers that ran clear:**

- `rls-boundary-reviewer` over the whole range — clear, no findings. It
  confirmed the service-role client stays inside the shared test fixture, the
  claim screens' `.select()` column lists are untouched, and the eyebrow reads
  a strict subset of the anon-readable directory fields.
- `code-review` at medium — one finding, fixed above.

**Reviewers skipped, with reasons:**

- `pipeline-guardrails-reviewer` — surface not touched. Nothing under
  `src/app/dashboard/`, `src/components/dashboard/` or the upload wizard
  changed. This is "surface not touched", not "covered per-task".
- `vercel-react-best-practices` — none of its three triggers fired: no
  `"use client"` added, no new component file, no change to data fetching
  inside a component.
- `supabase:supabase-postgres-best-practices` — no SQL, migration, table,
  column, index, policy or function in the range.

Note on gate economy: the range is **not** all task-gated — six pipeline
commits sit in it alongside the six `T<n>:` commits — so the guardrail
reviewer was run over the whole range rather than reported as covered
per-task, fail-closed as the skill requires.

## Consciously left

**The same bug still exists on other claim screens, and this is the finding
worth your attention.** The altitude pass established that the two root causes
are reproduced verbatim elsewhere:

- `object/page.tsx` and `request/page.tsx` compose the same four-field,
  conference-carrying eyebrow and render it in a 720px shell — a budget of
  roughly 83 characters against a worst case of 136.
- The `active` and `claim_pending` states inside the status route share that
  same eyebrow, also at 720px.
- `ready/page.tsx` has an aside at 840px and still passes its heading as a
  child, so its eyebrow sits in the narrowed column the whole change exists to
  escape.

I did not verify those in the browser: they redirect to sign-in, and a first
attempt measured the login page by mistake. The reasoning is from string
lengths and shell widths, which is how the in-scope screens were sized too, but
it is inference rather than measurement and should be treated that way.

Left alone deliberately. The brief's non-goals name these screens and say they
get their own branch, and widening here would put unreviewed screens into a
range whose whole point was two. **This wants a follow-up branch**, and the
helper and the slot it would use both exist now.

Also left:

- **Folding the inline four-field composition into a shared helper.** Four
  files build it by hand. Same reason: it reaches screens this branch excluded.
- **`setup/page.tsx` computes `teamLabel` twice** — once for `squad`, once
  inside `programEyebrow`. A one-line ternary; restructuring the helper's
  signature to save it would cost more than it returns.
- **The status route computes its shared eyebrow even on the branch that no
  longer reads it.** Fixing it means touching the two states T3 kept
  byte-identical on purpose.
- **Phone widths below 768px**, per criterion 1 above.
- **The four Glendale rows**, per criterion 2 above.

## Also consulted

Beyond the declared inputs (`build.md`, the range diff, `brief.md`,
`pr-check/SKILL.md`):

- `src/components/claim/claim-shell.tsx`, `tests/claim-eyebrow-width.spec.ts` —
  edited in response to findings.
- `src/styles/design-system/typography.css` — to name the token in the budget
  comment's cross-reference.
- `.claude/hooks/pr-check-receipt.sh` — to record the gate receipt.
- The running dev server for this worktree on port 3011, to verify the shell
  change: the two hoisted screens still report one client rect, a 2px gap and a
  full-width heading block (840 and 1000), and a no-heading screen renders a
  single child under the shell.
