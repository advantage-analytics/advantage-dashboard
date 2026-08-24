# Tasks — claude/update-header-dd0daa

> Scope: header chrome — close out the round-5 final spec (Header.dc.html) in `src/app/dashboard/header.tsx`.

Run one with `/task-next`. Drain the file with `/loop /task-next`.
Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so `/loop /task-next`
drains straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Workspace title in the header's leading slot
- **status:** todo
- **files:** `src/app/dashboard/header.tsx` (leading slot; likely a small
  `workspaceTitle` helper beside `teamLabel` in `src/lib/workspace/types.ts`) — a guess
- **done when:**
  - [ ] On `/dashboard/team`, the header's leading slot renders the active
        workspace name with its squad qualifier beside it ("Meridian State"
        + "Men's tennis") and renders no breadcrumb trail — never both
  - [ ] School name is `12px / 500 / ink-900`, qualifier uses `text-micro`;
        the pair is baseline-aligned with an 8px gap and no dash, dot or
        other separator between them
  - [ ] In a personal workspace, or a team workspace whose `team` is null,
        only the name renders — no empty qualifier element and no stray gap
  - [ ] Flow pages are untouched: `/dashboard/matches/[matchId]`,
        `/dashboard/settings/usage` and `/dashboard/matches/new` still render
        their existing breadcrumb trails
  - [ ] The right cluster is unchanged — search trigger, activity dot,
        divider and account menu are identical in the diff
- **notes:** Design 9g, round 5 final spec (Header.dc.html, project afde9116).
  9b / 9c / 9d already ship in the code, so this panel is the only open delta.
  `teamLabel()` already yields "Men's" / "Women's"; the spec's rendered string
  is "Men's tennis". Scope: Team Home only — the spec's "empty states" wording
  could also pull in `/dashboard`, which today has an empty crumb list.
