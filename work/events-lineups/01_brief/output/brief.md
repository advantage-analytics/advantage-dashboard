# Brief — Schedule day-zero states by role (designs 5a & 5b)

## Goal

Replace the schedule page's single, role-agnostic empty state with the two
role-differentiated day-zero states from the Claude Design project
(`Events & Lineups.dc.html`, artboards **5a** and **5b**):

- **5a — coach/staff:** the empty body points at creating. Calendar icon,
  "No events yet" headline, one sentence ("Create a dual and the lineup card
  builds itself — S1–S6, D1–D3, each slot a real match from the moment you
  set it."), then two quiet text links: **New event** (opens the existing 3b
  chooser at `/dashboard/team/schedule/new`) and **Add a one-off match in
  Matches**.
- **5b — player:** no create action, ever. Calendar icon, "Nothing scheduled
  yet" headline, a sentence naming who schedules and what arrives ("Your
  coach adds the duals and tournaments. Once a lineup is set, your line
  appears here with the opponent, site and time."), two quiet links (**Add
  your own match**, **How events work**), and a note strip (bell icon,
  `--surface-subtle` background): "The schedule is coach-managed — you'll be
  notified when your line is set." with a **Notifications** link.

Both keep the *same page frame as the populated page* (design note r15.7):
title, subline and — for staff only — the primary action, identical to the
non-empty schedule.

## Scope

- `src/components/dashboard/schedule/schedule-list.tsx` — the `EmptySchedule`
  component (currently one headline + one sentence, left-aligned, identical
  for every role) and the zero-rows branch of `ScheduleList`.
- `src/app/dashboard/team/schedule/page.tsx` — only if the empty state needs
  to know the viewer's role beyond the existing `canCreate` prop (it likely
  suffices: `canCreate === true` ⇒ 5a, `false` ⇒ 5b).
- Empty-state layout per the design: centered in the remaining page body,
  icon 28px `--ink-300`, headline 24px light, body ~46–48ch `text-body-sm`,
  links 11px/500, 16px gaps with a 1px hairline divider dot between links.

## Non-goals

- The populated schedule (4c master-detail) — already implemented; untouched.
- The 3b New-event chooser (`/dashboard/team/schedule/new`) — exists; 5a only
  links to it.
- Any other artboard in `Events & Lineups.dc.html`.
- The personal-workspace experience (`/dashboard/team/schedule` already
  redirects non-team workspaces).
- A notifications feature — 5b's note strip references it; wiring real
  notification preferences is out of scope (link target is an open question).

## Constraints

- **Header and CTA stay as the codebase has them** (explicit in the seed):
  the existing `Header` in `schedule-list.tsx` with `advButton("primary",
  "sm")` for "New event". Do not restyle them to the mock's raw markup, and
  do not adopt the mock's subline copy ("nothing scheduled for 2026–27")
  unless the human says otherwise — the current
  "0 events · 0 upcoming" subline is part of that header.
- Role gating must reuse the existing `canCreate = isProgramStaff(active)`
  path — no new role plumbing unless it proves insufficient.
- Design-system rules: Lucide icons only, Inter, existing tokens
  (`--ink-*`, `--surface-subtle`, `--border-medium`, `--radius-element`);
  primary buttons only via `advButton()`.
- `docs/ui-revamp-guardrails.md` must be read before the build stage touches
  dashboard UI (standing repo rule).
- Copy comes from the design verbatim unless it states something false about
  the product (per prior feedback: layout is copied literally, stale/false
  copy gets flagged and fixed).

## Success criteria

- With zero events, a coach/staff viewer sees the 5a body; a player sees the
  5b body, and no "New event" button anywhere on the page.
- With ≥1 event, nothing changes — populated schedule renders exactly as
  before.
- The header (eyebrow, "Schedule" h1, count subline, staff-only `advButton`
  CTA) is visually unchanged from the current codebase in both states.
- 5a's "New event" link navigates to `/dashboard/team/schedule/new`.
- Lint and build pass; the page renders correctly at desktop and narrow
  widths (empty state centers in the available body, no horizontal scroll).

## Open questions

1. **5b link targets.** The mock's hrefs are stubs. Where should "Add your
   own match", "How events work", and "Notifications" actually point?
   Plausible: `/dashboard/matches/new`, `/dashboard/help`, and
   `/dashboard/settings/preferences` — but each is a guess. Links with no
   honest destination could be dropped rather than pointed somewhere wrong.
2. **5a "Add a one-off match in Matches" target.** Presumably
   `/dashboard/matches/new` — confirm.
3. **Subline copy.** Keep the codebase's "0 events · 0 upcoming" (header
   consistency constraint) or adopt the design's season-flavored "0 events ·
   nothing scheduled for 2026–27"? Defaulting to the former per the seed's
   consistency instruction.

## Also consulted

Beyond the seed and `references/` (empty), to verify specific facts:

- `Events & Lineups.dc.html` (via DesignSync, project afde9116…) — what 5a/5b
  actually depict, including exact copy and layout.
- `src/app/dashboard/team/schedule/page.tsx` — role prop (`canCreate`) and
  page frame.
- `src/components/dashboard/schedule/schedule-list.tsx` — current `Header`,
  `EmptySchedule`, and zero-rows branch.
- `src/components/dashboard/schedule/` and `src/app/dashboard/team/schedule/`
  listings — 3b chooser exists at `schedule/new`.
