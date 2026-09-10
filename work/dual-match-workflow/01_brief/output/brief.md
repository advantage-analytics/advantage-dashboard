# Dual-match workflow brief

## Goal

Make the Team Workspace Schedule experience understandable and dependable for
all team roles while setting up, viewing, maintaining, and scoring dual-match
and tournament events.

## Scope

- Audit the schedule drawer's role-based states, including what a player sees
  when they can view a dual match but cannot create events.
- Make schedule events and matches maintainable from the schedule page or its
  drawer, including edit and deletion capabilities where permitted.
- Improve Lineup interaction clarity, including row hover treatment, the
  selected-state indicator, pairings, player selection, and forfeit handling.
- Allow score-result recording for either participant, including defaults,
  withdrawals, and forfeits.
- Resolve the non-working Import affordance and assess its proper role in the
  schedule workflow.
- Clarify dual-match setup: venue label casing, prevention of accidental
  duplicate players, doubles pairings, roster-player selection for a
  user-created tournament, and draw-type selection.

## Non-goals

- Redesign personal-workspace scheduling.
- Change match video analysis, statistics, or the underlying roster model
  beyond what the schedule workflow requires.
- Decide implementation details or UI treatments before the design stage.

## Constraints

- The work is limited to the Team Workspace Schedule Page and its related
  schedule drawer, lineup, score, and event-creation surfaces.
- Permissions must preserve the distinction between viewing an event and
  creating or maintaining one.
- Any outcome action must support either side of a matchup consistently.

## Success criteria

- Each team role has a deliberate, comprehensible schedule-view and schedule-
  action state.
- A user can understand what actions are available to them without encountering
  a dead or misleading control.
- Authorized users can maintain schedule matches/events and record applicable
  outcomes for either participant.
- Event creation does not permit accidental duplicate players and makes
  pairings, player identity, venue, and draw type clear.
- The Import affordance has a defined, working purpose or is removed from the
  workflow.

## Open questions

- Which roles may create, edit, delete, or record outcomes for schedule events
  and matches, and do any of these permissions differ by event type?
- Does “Open Dual-Match” open an existing event detail, a dedicated dual-match
  workflow, or something else; and is it expected to be visible only to
  view-only players or to every non-creator?
- Is deletion available for events, individual matches, or both; what state
  restrictions and confirmation/recovery rules apply?
- Which score-result labels are permitted in the product taxonomy, and can a
  result be reversed or edited after recording?
- What workflow should Import serve, and which source(s) should it accept?
- How are a tournament's participants meant to relate to the team roster,
  especially when a user creates the tournament?
