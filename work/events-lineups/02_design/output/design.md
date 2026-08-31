# Design — Schedule day-zero states by role (5a & 5b)

Route trace (per trace-route): the empty state renders from
`src/components/dashboard/schedule/schedule-list.tsx` — private `Header` and
`EmptySchedule` components inside `ScheduleList` — via
`src/app/dashboard/team/schedule/page.tsx`, its only import site. The page
passes `canCreate = isProgramStaff(active)`, and `isProgramStaff` is
`kind === 'team' && role !== 'player'` (`src/lib/workspace/types.ts:194`) —
exactly the 5a (staff) / 5b (player) split. No new role plumbing is needed.

## Approaches considered

**A — role-branch inside the existing `EmptySchedule` (recommended).**
Thread the `canCreate` prop `ScheduleList` already receives into
`EmptySchedule({ canCreate })`; render the 5a body when true, 5b when false.
Everything stays in the one file that owns the page today, matching its
existing private-component structure. Smallest diff, no new exports.

**B — new `schedule-empty.tsx` with two exported components.** Cleaner
file-level separation, but `schedule-list.tsx` is ~280 lines and the repo
pattern keeps page-private subcomponents inline; a new export surface with a
single consumer is YAGNI.

**C — branch in `page.tsx` (server) and keep `ScheduleList` populated-only.**
Would keep empty-state JSX out of the client bundle, but the shared `Header`
lives inside the client `ScheduleList`; splitting it out to render from both
a server branch and the client list is a refactor with no user-visible gain.

Choose **A**.

## Chosen design

### Architecture & data flow

No data changes. `page.tsx` already fetches the schedule and computes
`canCreate`; the zero-rows branch in `ScheduleList` (schedule-list.tsx:69)
keeps rendering `<Header …/>` + `<EmptySchedule canCreate={canCreate}/>`.
The populated path is untouched.

**Header: unchanged.** Same eyebrow, "Schedule" h1, "0 events · 0 upcoming"
subline, and staff-only `advButton("primary", "sm")` "New event" — this is
the seed's consistency constraint, and it already satisfies the design's
r15.7 rule (day zero keeps the populated page's frame). The mock's
season-flavored subline is **not** adopted (brief Q3, resolved: keep
codebase copy).

### Components

`EmptySchedule({ canCreate }: { canCreate: boolean })` — rewritten:

**Shared frame** (both roles), replacing today's left-aligned two-liner with
the mock's centered body:

- Container: centered column — `flex flex-1 flex-col items-center
  justify-center text-center` with `min-h-[360px] py-16` so it reads centered
  even where the flex chain doesn't stretch. To let it actually fill tall
  viewports, the zero-rows branch's wrapper gains `flex-1`, and `page.tsx`'s
  inner container (`mx-auto flex max-w-screen-2xl flex-col`) gains `flex-1`
  — a one-class page change, the only page.tsx edit.
- Icon: Lucide `Calendar`, `size-7` (28px), `strokeWidth={1.5}`,
  `text-[var(--ink-300)]`. Bare — no circle container. (The SKILL.md v2
  "Empty State" recipe puts icons in a `rounded-full` well; the v3 mock
  drops it, and v3 wins. `Calendar` is the sanctioned fixtures glyph.)
- Headline: 24px / 300 / line-height 28px / tracking −0.3px / `--ink-900`,
  `mt-[18px]`.
- Body sentence: `.text-body-sm` (existing global class), `mt-2`,
  `max-w-[46ch]` (5a) / `max-w-[48ch]` (5b), `[text-wrap:pretty]`.
- Quiet-links row: `mt-5 flex items-center gap-4`; links are
  `text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]`;
  divider between them `h-2.5 w-px bg-[var(--border-medium)]`.

**5a — `canCreate` (coach/owner/staff):**

- Headline: **"No events yet"**
- Body: *"Create a dual and the lineup card builds itself — S1–S6, D1–D3,
  each slot a real match from the moment you set it."* (verbatim from the
  mock; true of the shipped dual flow.)
- Links: **New event** → `/dashboard/team/schedule/new` (`next/link`; the
  quiet duplicate of the header CTA is intentional in the mock) ·
  **Add a one-off match in Matches** → `/dashboard/matches/new` (verified:
  route exists, ungated).

**5b — player:**

- Headline: **"Nothing scheduled yet"**
- Body: *"Your coach adds the duals and tournaments. Once a lineup is set,
  your line appears here with the opponent, site and time."* (verbatim.)
- Links: **Add your own match** → `/dashboard/matches/new` ·
  ~~How events work~~ — **dropped** (brief Q1, resolved): the help page has
  no events/schedule section, so the link has no honest destination. If the
  human prefers, it can point at `/dashboard/help` generically — noted, not
  recommended.
- Note strip (v3 `Notice` note-strip register; no `Notice` component exists
  in the repo, so it is hand-built here per the SKILL spec rather than
  invented as a new primitive nobody else uses): `mt-[26px] flex items-center
  gap-2 rounded-lg bg-[var(--surface-subtle)] px-3 py-[9px] max-w-[520px]`;
  Lucide `Bell` 13px `strokeWidth={1.5}` `text-[var(--ink-500)]` `shrink-0`;
  text `.text-micro` `text-[var(--ink-600)]`.
  - **Copy deviation, flagged:** the mock says "The schedule is
    coach-managed — you'll be notified when your line is set." No lineup-set
    notification exists (email templates: analysis, claim, invite-request,
    program-invite, team-digest — nothing fires on lineup set), so that
    promise is false today. Ship instead: **"The schedule is coach-managed —
    your line appears here once the lineup is set."** and **drop the
    "Notifications" link** (its reason to exist was the promise; preferences'
    Notifications section governs other mail). This follows the established
    rule that layout copies literally but false copy gets fixed. If a
    lineup-set notification ships later, restore the mock copy + link
    (→ `/dashboard/settings/preferences`, verified to have a Notifications
    section).

`EmptySchedule`'s current copy ("Start with the next dual. Naming the
lineup creates a line for every court…") is replaced by the above.

### Error handling

None new — the component is pure presentational JSX over a boolean that the
server already computes. Both links are static routes; `next/link` handles
them. No async, no user input.

### Testing

- `npx tsc --noEmit && npm run lint && npm run build` (expect the known 43
  pre-existing warnings, 0 errors).
- Existing Playwright specs are pure-function tests (no component
  rendering); this change is JSX branching with no extractable logic, so no
  new spec — a test would only re-assert React's conditional rendering.
- Manual verification on the dev server: team workspace with zero events as
  staff (5a: header CTA present, coach body, both links navigate) and as
  player (5b: no "New event" anywhere, player body, note strip); one
  populated-schedule smoke check that nothing moved; narrow-viewport check
  (body centers, no horizontal scroll).
- `pipeline-guardrails-reviewer` after the build stage (dashboard UI
  touched; expected clean — no wizard/status/deletion surface involved).

## Open questions

None carried forward. Brief Q1 resolved (drop "How events work"; note-strip
copy corrected and its link dropped — human can override either), Q2
resolved (`/dashboard/matches/new`), Q3 resolved (keep codebase subline).

## Also consulted

Beyond the declared inputs (brief, MAP.md, ui-revamp-guardrails.md, design
SKILL.md, empty `references/`):

- `src/app/dashboard/team/schedule/page.tsx` — route trace, `canCreate`,
  container classes.
- `src/components/dashboard/schedule/schedule-list.tsx` — zero-rows branch,
  `Header`, current `EmptySchedule`.
- `src/lib/workspace/types.ts` — `isProgramStaff` semantics.
- `src/app/dashboard/matches/new/page.tsx` — link target exists, ungated.
- `src/app/dashboard/help/page.tsx` — no events coverage ("How events work"
  has no destination).
- `src/components/dashboard/settings/preferences-form.tsx` — Notifications
  section exists (for the restore-later path).
- `src/lib/services/email/templates/` listing — no lineup-set notification
  (the note-strip copy correction).
- `tests/team-home-schedule-reads.spec.ts` — test-style check (pure-function
  specs, no component rendering).
- `Events & Lineups.dc.html` (via DesignSync, fetched in stage 01) — 5a/5b
  markup, exact dimensions and copy.
