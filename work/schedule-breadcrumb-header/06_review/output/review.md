# Review — schedule-breadcrumb-header

**Sign-off: pending** ← edit this line to `approved` (or annotate) after the
visual walk below.

## The one check only a human can do

No runner in this pipeline had an authenticated browser session, so the
result is verified by construction and by four independent reviewers — but
not by rendered DOM. Walk it once, logged in:

1. `/dashboard/team/schedule/new` → exactly one breadcrumb row, reading
   **Schedule › New event**, with "Schedule" clickable.
2. Open any event page → exactly one breadcrumb row (just **Schedule**,
   linked), the event named by the big h1 in the body.

## Success criteria (from the brief)

- **One header/breadcrumb trail at every step** — met by construction: one
  breadcrumb render site (`header.tsx`), the in-page bar deleted; visual
  confirmation is the sign-off item above.
- **New event appears in the existing schedule view as today** — met: no
  data flow, query, or handler changed anywhere in the range; the full
  Playwright suite (227/227) is green.
- **No other schedule-page functionality visibly changes** — met: call-site
  changes are prop removals only. One nuance: the "Created just now" note
  was ultimately *deleted* rather than relocated — review found it had no
  producer and has never rendered, on any version. Nothing visible changed.

## pr-check results (range 039a4bb..a52a9e3, receipt recorded)

- Mechanical: lint · tsc · build · test — all green.
- simplify: applied — crumb label now resolves through `nav.ts`
  (`scheduleLeaf` + `navLabel`) instead of a second list in the header;
  dead `createdJustNow` plumbing removed (commit `8daea52`).
- code-review (medium, 8 angles → verify): 2 confirmed cleanups, both fixed
  (commit `a52a9e3` — note-removal residue unwrapped, schedule-path literal
  closed over `SCHEDULE_HREF`); 1 altitude observation, no change needed
  (below).
- pipeline-guardrails-reviewer over the whole range (it includes hand-made
  commits): nothing to flag — navigation is §3.5 "redesign freely" territory,
  and no guarded surface is reached.
- Skipped with reason: rls-boundary-reviewer (no data surface),
  vercel-react-best-practices (no trigger), postgres best practices (no SQL).

## Consciously left

- **Detail pages show a lone linked "Schedule" crumb** while match detail
  shows a full trail with a non-link leaf. Divergence noted by review;
  kept — it is the stage-02 approved design (the body h1 owns the page's
  identity). Revisit only if the two-patterns feel wrong in use.
- **Static crumb arrays allocate per header render** — nanoseconds, and it
  matches the file's existing style. Not worth churn.
- **This review covers the feature range only.** The branch's ICM pipeline
  infrastructure (factory, skills, spec — all markdown) was not part of this
  gate; run a full-branch `/pr-check` before merging to
  `splitstep-integration`.
