# Brief — schedule-breadcrumb-header

## Goal

When creating a new schedule event on the team schedule page, a second
header block with its own breadcrumbs appears, instead of the event-creation
flow living under the page's existing breadcrumb/header. Remove the
redundant header so the page shows exactly one header and one breadcrumb
trail throughout the create-event flow.

## Scope

- The team schedule page (`/dashboard/team/schedule`) and whatever component
  its create-event flow renders (page, dialog, or inline section — stage 02
  traces this).
- Presentation only: de-duplicating the header/breadcrumbs.

## Non-goals

- No change to event-creation behaviour: what gets saved, validation, who
  can create events, or how events render in the schedule afterwards.
- No redesign of the schedule page or its remaining header.
- No changes to other team pages, even if they share the header component —
  unless the fix necessarily lives in a shared component, in which case the
  design must call that out explicitly.

## Constraints

- Dashboard UI: `docs/ui-revamp-guardrails.md` and the design-system skill
  bind in stages 02–05.
- Trace the route to the exact rendered component before naming files;
  overlapping component names are common in this repo.

## Success criteria

- Opening the create-event flow and completing it leaves exactly one header
  and one breadcrumb trail visible at every step — before, during, and
  after creation.
- The newly created event appears in the existing schedule view, under the
  current workspace, as it does today.
- No other schedule-page functionality visibly changes.

## Open questions

1. Does the duplicate header appear when the create-event UI *opens*, or
   only after the event is saved? (Determines which component renders it;
   stage 02 answers this from the code.)
2. Which of the two header instances is the "real" one to keep — assumed:
   the page's existing top-level header. Stage 02 should confirm nothing
   else (e.g. mobile layout) depends on the duplicate.
