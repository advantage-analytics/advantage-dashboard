# Review — events-lineups

Sign-off: approved

> Given by the human in chat ("looks good", 2026-08-31) alongside the
> instruction to run stage 07, and transcribed here by the runner rather
> than typed into the file by hand. The word is theirs; the keystrokes are
> not.

pr-check target: branch range `2ac0f00...HEAD` (working tree clean; base =
merge-base with `splitstep-integration`). Range = the feature's commits plus
the two review-fix commits this stage produced.

## Success criteria check (brief)

1. **Coach sees 5a, player sees 5b, no "New event" for players** — met in
   code: `EmptySchedule` branches on `canCreate = isProgramStaff(active)`;
   the header CTA was already staff-gated and is untouched. *Visual
   confirmation as both roles on a zero-event team is the one check this
   stage could not run* (it needs two logged-in roles; left to the human —
   see "Consciously left").
2. **≥1 event → nothing changes** — met: the populated path's markup is
   untouched (diff-verified; the cross-file tracer confirmed its classes are
   unchanged).
3. **Header visually unchanged in both states** — met: the `Header`
   component has no diff.
4. **5a "New event" quiet link → `/dashboard/team/schedule/new`** — met;
   route exists.
5. **Lint and build pass; renders at desktop and narrow widths** — lint,
   tsc, tests and `npm run build` (via T1) all green; the centering chain is
   now verified end-to-end (`h-screen` → … → `EmptySchedule`) by two
   independent reviewers. Narrow-width visual check rides with #1.

## Findings and resolutions

**Stage 1 (mechanical):** lint (37 warnings, under the 43 baseline), tsc,
tests — green on every run, including after each fix commit.

**Stage 2 (simplify, fixes in `4658b5c`):**
- *Fixed:* the vertical-centering flex chain was dead CSS — the page's outer
  div wasn't `display:flex`, so the empty state centered only inside its
  360px floor (browser-verified by the reviewing agent). Fixed by mirroring
  `(home)/page.tsx`'s `flex flex-col` + `w-full` pattern; `min-h-[360px]` is
  now a true short-viewport fallback.
- *Fixed:* headline style object duplicated byte-for-byte across the two
  branches — hoisted to `emptyHeadlineStyle`.
- `vercel-react-best-practices` skipped: no `"use client"` added, no new
  component file, no data-fetching change.

**Stage 3 (code-review `medium` + guardrails, fixes in `7c930c5`):**
- *Fixed (correctness, CONFIRMED):* the player-branch "Add your own match"
  link rendered for every non-staff viewer regardless of upload
  eligibility. An upload-disabled player would walk the whole wizard (video
  provider preselected, Continue never blocked), a `matches` row would be
  written, and only then would `/api/splitstep/upload-url` refuse with a
  403. Team Home already gates its identical link on
  `canUploadForProgram(active)` — the fix threads that same predicate as
  `canAddOwnMatch` and hides the link, matching the documented rule ("it is
  not paused, it is not theirs to do"). **This is a deliberate deviation
  from T1's literal done-when** (which pinned an unconditional link, from
  the mock) — review finding beats task line, recorded here for sign-off.
- *Fixed (simplification, CONFIRMED):* link className tripled verbatim —
  hoisted to `emptyLinkClass`.
- *Refuted:* note-strip values "diverging" from `tournament-detail.tsx`'s
  advisory box — the new strip is the conformant one (mock-pinned values,
  and it matches the design system's 11px text pin that the older sibling
  drifted from at 12px).
- *Dropped:* "min-h/py-16 redundant" (the fixed chain makes min-h a genuine
  short-viewport fallback — altitude reviewer verified the full chain);
  "split ternary into subcomponents" (the dedicated simplify pass had
  already judged that indirection a net loss, consistent with
  `empty-matches.tsx` precedent).
- `pipeline-guardrails-reviewer` ran twice more (full range, then the fix
  commit): **no violations** — §3.5 territory; the new
  `canUploadForProgram` call is the predicate's documented use, no second
  spelling of the rule, and the unbypassable spend gate
  (`explainVideoRefusal` at upload-url/quota) is untouched.
- `rls-boundary-reviewer` skipped: **surface not touched** (no
  `src/lib/supabase/`, `src/lib/data/`, `src/app/api/`, migrations, or new
  queries in the range).
- `supabase:supabase-postgres-best-practices` skipped: no SQL in the range.

## Consciously left

- **Visual role check.** Loading the page as a zero-event coach and player
  needs two authenticated sessions; this stage verified everything
  code-side but did not drive a browser as either role. Reviewer with an
  account: `/dashboard/team/schedule` on a team with no events, once as
  staff, once as a player.
- **Pending-review UX difference.** Team Home shows a *disabled* upload
  button with an explanation for a `pending_review` program's staff; the
  schedule empty state simply omits the player link in refused states. The
  guardrails reviewer called this a UX difference, not a violation. Left
  as-is — the empty state has no button vocabulary to disable.
- **`tournament-detail.tsx` note-box drift** (12px text vs the system's
  11px pin, `ink-600` icon) — pre-existing, other component, other branch
  per scope discipline.
- **Restore path**: if a lineup-set notification ever ships, restore the
  mock's note-strip copy and "Notifications" link (recorded in design.md).

## Also consulted

Beyond the declared inputs (build.md, the range diff, brief.md,
pr-check/SKILL.md): `.claude/skills/simplify` and `code-review` skill flows
(invoked); `src/app/dashboard/(home)/page.tsx` (flex-chain pattern);
`src/lib/workspace/types.ts` (`canUploadForProgram`);
`src/app/dashboard/team/page.tsx` (gating precedent);
`src/components/dashboard/dashboard-shell.tsx` and `page-transition.tsx`
(height-chain contract, via reviewers); `tournament-detail.tsx` (note-box
comparison, via reviewers); design-system tokens
(`spacing.css`/`typography.css`, via reviewers).

## Verdict

**Ready to merge**, pending the human visual role check above. All gates
green; two review fixes landed (`4658b5c`, `7c930c5`); nothing outstanding
blocks.
