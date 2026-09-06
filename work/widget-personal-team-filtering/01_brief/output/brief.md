# Brief — personal-workspace widgets show team matches

## Goal

In the **personal** workspace, the dashboard home widgets must show only the
user's own, non-program matches. Today at least some of them also surface
matches that belong to a team workspace the user is a member of, so a coach or
player sitting in "Personal" sees program data mixed into what is supposed to
be their own record.

## Scope

- **Surface:** the dashboard home page (`/dashboard` — the `(home)` route
  group) and the widgets it renders, in the **personal** workspace only.
- **Scope rule (decided with the human):** a personal match is
  `created_by = <viewer>` **AND** `program_id IS NULL`. A match the user
  uploaded while sitting in a team workspace does **not** belong in Personal.
- Every home widget must agree on that rule — the counts, the recent-match
  list, any KPI/summary figure, the activity feed and any insight or
  commentary derived from matches. A widget that silently uses a different
  scope than its neighbours is part of this bug, not a separate one.
- Fixing the underlying server loader(s) is in scope where the leak lives
  there rather than in the widget.

## Non-goals

- The **team** workspace's scoping. Team widgets are not being changed, and
  nothing here should narrow what a team workspace shows.
- `/dashboard/matches`, `/dashboard/statistics`, and match detail. The human
  reported the home widgets specifically; if the same leak is found in the
  shared loaders those pages use, note it — do not silently widen the fix.
  Adjacent surfaces get their own branch.
- Reconciling the two personal-scope conventions that already exist in the
  data layer as a general refactor (see Constraints) beyond what this fix
  needs.
- Any schema change, backfill, or RLS policy change. `matches.program_id`
  already exists and carries the distinction.
- Visual/design changes to the widgets. This is a data-correctness fix; the
  widgets should look the same, only with fewer rows.

## Constraints

- The codebase currently holds **two conflicting definitions of "personal"**,
  and this is almost certainly where the bug lives:
  - `src/lib/data/personal-activity-server.ts:66` scopes personal as
    `created_by = me AND program_id IS NULL` — the rule the human chose.
  - `src/lib/data/activity-server.ts:100` deliberately does *not* apply the
    `program_id IS NULL` half for personal, with a comment saying so.
  Stage 02 has to establish which loaders the home widgets actually call
  before proposing anything.
- Workspace resolution is already centralised: `getWorkspaceContext()` in
  `src/lib/workspace/active-workspace-server.ts`, resolved once per request in
  `src/app/dashboard/layout.tsx`. The fix belongs inside that existing
  contract, not in a new mechanism.
- `docs/ui-revamp-guardrails.md` applies — any change under
  `src/app/dashboard/` or `src/components/dashboard/`.
- Empty states matter: for a user whose matches are all program-attached, the
  correct result is an **empty** personal home, and it must read as "nothing
  here yet", not as a broken widget.
- Route tracing before editing: overlapping component names are endemic in
  this repo (per `CLAUDE.md`). Stage 02/03 must name exact file paths.

## Success criteria

1. In the personal workspace, every home widget derives from exactly the set
   `created_by = viewer AND program_id IS NULL`.
2. A user who is a member of a team sees zero program-attached matches on
   their personal home — in lists, in counts, in the activity feed, and in any
   generated insight text.
3. Widgets on the same page agree: the "N matches" figure and the list beneath
   it count the same rows.
4. The team workspace's home is unchanged — same rows before and after.
5. A personal workspace with no qualifying matches renders its designed empty
   state rather than zeroes or a spinner.
6. `npm run lint` and `npm test` pass.

## Open questions

- Is the leak in the shared server loaders (making the same bug latent on
  `/dashboard/matches` and `/dashboard/statistics`), or only in a home-specific
  path? Stage 02 answers this by tracing; if it is shared, the brief's non-goal
  stands and the adjacent surfaces get a separate branch with a pointer.
- Does `activity-server.ts`'s existing comment reflect a deliberate product
  decision made earlier that this change reverses? If it does, the comment
  needs to be corrected rather than left contradicting the new rule.
- Is there a real account that reproduces this today (a user with both a
  personal workspace and program-attached matches), or does verification need
  seeded data via the screenshot/preview harness?

## Also consulted

Beyond the declared inputs, these were read to verify specific facts named
above:

- `src/lib/workspace/types.ts` — the personal/team contract.
- `src/lib/data/personal-activity-server.ts`, `src/lib/data/activity-server.ts`
  — grep only, to confirm the two conflicting scope rules exist.
