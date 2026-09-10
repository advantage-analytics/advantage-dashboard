# Dual-match workflow design

## Approaches considered

### 1. Add controls to the existing screens only

Put an “Open Dual-Match” ghost button below the current drawer content, add
more toggles to the lineup and score forms, and leave permissions and outcome
storage as they are.

- **Benefit:** smallest UI change.
- **Cost:** duplicates the drawer’s existing top-bar “Open event” destination,
  retains the current one-bit forfeit UI, and cannot represent a default or
  withdrawal without overloading a forfeit or a played-match score. Rejected.

### 2. Role-aware drawer footer plus an explicit result-outcome model

Keep Schedule as the master-detail page, make the drawer footer the single
next-step affordance for each role, and introduce a dedicated outcome record
for non-played results. Improve the existing dual and tournament builders
without changing their route structure.

- **Benefit:** addresses every reported issue in its existing home, supports
  both sides of every result type, and avoids writing fake scores or analysis
  data for a match that was not played.
- **Cost:** needs a small schema/API addition and a deliberate destructive
  permission policy. **Recommended.**

### 3. Replace Schedule with a new event-management workspace

Build a new all-purpose event editor and move drawer, lineup, scoring, import,
and tournament entry flows into it.

- **Benefit:** a clean conceptual reset.
- **Cost:** discards the established table-and-peek-drawer pattern, duplicates
  the existing event routes, and expands far beyond the reported problems.
  Rejected.

## Chosen design

### Architecture

The Team Workspace Schedule route remains
`src/app/dashboard/team/schedule/page.tsx` →
`src/components/dashboard/schedule/static/static-schedule.tsx` →
`src/components/dashboard/schedule/static/event-drawer.tsx`.

`StaticSchedule` receives an explicit capability object derived on the server,
not a single `canCreate` boolean. The role policy is:

| Role | View / open event | Create / edit / score | Delete event |
| --- | --- | --- | --- |
| Owner | Yes | Yes | Yes |
| Coach | Yes | Yes | Yes |
| Staff | Yes | Yes | No |
| Player | Yes | No | No |

The server action/RPC layer enforces those same capabilities. The current
`isProgramStaff()` gate remains the starting point for create/edit/score; a
separate owner-or-coach check is required for deletion. A player may still use
the separate team-upload entitlement for a one-off match where the program’s
upload policy allows it, but must never be offered a scheduled-line write that
the database rejects.

The Schedule drawer keeps one footer action:

- Owner, coach, and staff: the existing primary **Enter results** while a line
  is open. When no line is open, no substitute primary is invented.
- Player: a full-width ghost **Open dual** or **Open tournament**. It replaces
  the top-bar **Open event** link for that role, rather than duplicating the
  same destination. The label matches the event noun and gives a viewer a
  clear, reachable next step at the end of the drawer.

For staff-capable users, move edit and destructive event actions into the
drawer’s overflow menu. **Edit dual/tournament** continues to use the existing
`[eventId]/edit` route. **Delete event** opens an `AlertDialog` that names the
event and states the consequence. It is available only when the server reports
the event can be deleted; an event with recorded matches is not silently
deleted. The design requires an explicit server-side deletion policy: either
refuse deletion while any entry has a match/outcome, or require a separate,
audited destructive match-removal flow first. The safer default is refusal.

Remove the Schedule title-bar **Import** button. It is intentionally nonworking
today, and Schedule has no defined import format. Match-file import remains in
the Matches upload workflow; a future schedule import needs a separately
specified source, mapping preview, and error model before it returns.

### Components

**Drawer and schedule table**

- Extend `StaticSchedule` and `EventDrawer` with `capabilities`; do not infer
  permission from hidden UI.
- Add a role-aware footer component and an event action menu. All icon-only
  triggers use the existing dark tooltip and accessible label.
- Preserve the Schedule table’s drawer-on-container-row behavior. The detail
  page remains the record destination, reached through the footer for viewers
  and through the existing record link for staff.

**Dual lineup**

- Replace the ambiguous single forfeit toggle with a compact result selector:
  **Played**, **We forfeited**, **Opponent forfeited**. A selected non-played
  outcome clears the editable score/player-opponent fields for that line; a
  saved outcome is read-only until explicitly cleared by an authorized user.
- Model doubles as a structured two-athlete roster selection, not a typed
  slash-separated name. The second choice is limited to a distinct teammate;
  the completed pair is shown as one line assignment.
- Prevent accidental duplicate assignment in context: roster choices already
  used in the same singles slot or same doubles pair are unavailable with a
  reason. Final submit validates server-side as well. A player may appear in a
  singles line and a doubles line; the restriction is only duplicate use within
  a single line and duplicate identical doubles pairs.
- Give the lineup row its standard rounded surface-subtle hover wash. Retire a
  blue underline as a resting selection signal; use the existing neutral row
  selection/focus treatment, reserving blue for a real action or focused field.

**Score flow and non-played outcomes**

The present schema has `program_event_entries.forfeit` (`ours` or `theirs`)
for dual lines only. It cannot express default or withdrawal, and it is too
coarse for a tournament entry containing several rounds. Add a dedicated
per-result outcome record keyed by event entry and, for tournament play, round:

- `kind`: `forfeit`, `default`, or `withdrawal`
- `side`: `ours` or `theirs`
- `round`: nullable only for a dual line
- audit fields for actor and time

The schedule loader merges this outcome with an actual played match to form the
display state. `recordResult` refuses to add a played score where a non-played
outcome exists; clearing the outcome restores the normal score path. This keeps
unplayed results out of `matches`, `match_stats`, video processing, and team
analysis totals. The score UI exposes one **Result** action for either side:
**Score played**, **We forfeited/defaulted/withdrew**, or
**Opponent forfeited/defaulted/withdrew**. It uses the same outcome vocabulary
on the inline row and the full-page score flow.

**Event creation and editing**

- Use `siteTitle()` for every user-visible venue label, including the pinned
  gray event bar, so Home, Away, and Neutral are title case.
- Make the dual builder’s roster assignment identity-based and validate its
  two-member doubles pair before Save.
- In tournament creation, make the roster field an explicit inclusion control:
  choose the team athlete first, then their draw and optional seed in that
  athlete’s row. Keep one row per roster athlete; this preserves the current
  identity-safe data shape and makes it clear who is playing.
- Replace unexplained draw values with a labelled draw selector and a one-line
  description for each available draw (for example, Main draw, Qualifying,
  and Consolation where supported). Do not add unsupported draw types merely
  to fill the menu.

### Data flow

1. The Schedule server page resolves the active team workspace and derives the
   capability object from membership role before passing it to the client table
   and drawer.
2. The drawer selects the one appropriate bottom action without exposing a
   write-only route to a player.
3. Edit routes retain the existing `updateDual` / `updateTournament` planning
   safeguards: settled entries are read-only rather than silently repointed or
   deleted.
4. Scoring writes either a normal match through `recordResult` or an explicit
   non-played outcome through a new authorized action. Both revalidate the
   Schedule list, drawer, and event detail route.
5. A delete request first asks the server whether the event has dependent
   matches or outcome records. The server either refuses with an actionable
   reason or performs the authorized, audited delete and revalidates Schedule.

### Error handling

- Permission changes between render and submit return a capability-specific
  refusal and refresh the page; client visibility is never authorization.
- Duplicate player/pair validation appears beside the affected lineup row and
  is repeated on the server to prevent stale or forged submissions.
- An outcome conflicting with a recorded match, or a score conflicting with a
  saved outcome, is refused before any write and explains which result must be
  cleared first.
- Delete refusal names the blocking condition (recorded matches or outcomes)
  and offers the event detail route; it never presents a successful-looking
  no-op.
- A missing or unsupported schedule-import source has no UI affordance; it is
  not represented by a disabled or tooltip-only button.

### Testing

- Unit-test capability derivation for owner, coach, staff, and player; include
  a player with upload permission to prove Schedule-line writes remain barred.
- Unit-test outcome state derivation for played, each type/side of non-played
  outcome, clearing, and dual versus multi-round tournament entries.
- Unit-test lineup validation: duplicate singles assignment, duplicate member
  in a doubles pair, duplicate pair, permitted singles-plus-doubles appearance,
  and identity collisions from matching display names.
- Test server actions for authorization, conflict rejection, settled-entry
  protection, and deletion refusal with dependent records.
- Add Playwright coverage for player drawer footer, staff drawer footer and
  action menu, owner/coach delete confirmation, title-cased venue text,
  nonworking Import removal, and result selection for both sides.

## Open questions

- Confirm whether coaches may delete events or whether deletion is owner-only;
  this design recommends owner and coach, never staff or player.
- Confirm the product wording for **default** and **withdrawal** and whether a
  recorded non-played outcome can be edited directly or must be cleared first.
- Confirm the supported tournament draw list and whether a doubles tournament
  entry is in scope. The current builder intentionally supports roster singles
  entries only.
- Confirm whether “Open Dual-Match” is preferred product copy. This design
  recommends **Open dual** to match the product’s established event vocabulary.

## Also consulted

- `MAP.md`; `docs/ui-revamp-guardrails.md`; and
  `.skills/advantage-analytics-design/SKILL.md`.
- Route and component trace: `src/app/dashboard/team/schedule/page.tsx`,
  `src/components/dashboard/schedule/static/static-schedule.tsx`, and
  `src/components/dashboard/schedule/static/event-drawer.tsx`.
- Related event routes and surfaces:
  `src/app/dashboard/team/schedule/[eventId]/page.tsx`,
  `src/app/dashboard/team/schedule/[eventId]/edit/page.tsx`,
  `src/app/dashboard/team/schedule/[eventId]/score/page.tsx`,
  `src/app/dashboard/team/schedule/new/dual/page.tsx`,
  `src/app/dashboard/team/schedule/new/tournament/page.tsx`,
  `src/components/dashboard/schedule/dual-detail.tsx`,
  `src/components/dashboard/schedule/tournament-detail.tsx`,
  `src/components/dashboard/schedule/score-entry.tsx`,
  `src/components/dashboard/schedule/score-only-flow.tsx`,
  `src/components/dashboard/schedule/static/dual-build-step.tsx`, and
  `src/components/dashboard/schedule/static/static-tournament-builder.tsx`.
- Permission and write paths: `src/lib/workspace/types.ts` and
  `src/lib/schedule/actions.ts`.
- Live Supabase schema overview for `program_events`,
  `program_event_entries`, `matches`, `program_players`, and
  `program_audit_log`. Direct constraint-catalog lookup was unavailable to
  this session, so deletion cascade behavior remains a design-time validation
  item rather than an assumption.
