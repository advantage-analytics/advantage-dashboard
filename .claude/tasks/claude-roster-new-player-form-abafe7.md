# Tasks — claude/roster-new-player-form-abafe7

> Scope: Roster page (`/dashboard/team/roster`) — the new-player form and the drawer/table polish around it.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Add neutral icons to the roster drawer's Options menu

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/team/player-drawer.tsx (guess — the Options popover inside `PlayerDrawer`, ~lines 353–455)
- **done when:**
  - [ ] In the drawer's Options popover, each of the three setting rows carries a leading Lucide glyph already in the Glyph Registry: `Upload` on "Can send video", `Pencil` on "Edit player", `Trash2` on "Remove from roster". The "No account yet…" note and the hairline divider get no glyph.
  - [ ] Every added glyph renders `size-[13px]`, `strokeWidth={1.5}`, `aria-hidden`, and `text-[var(--ink-400)]` — none carries `--blue` or `--danger`, at rest or on hover (the Remove row's label may still turn `--danger` on hover; its icon does not).
  - [ ] The glyphs sit in one `shrink-0` fixed-width leading column with `gap-2.5` to the text, so the three labels start on the same x; on "Can send video" the description still stacks under the label and the `AdvSwitch` stays at the trailing edge.
  - [ ] Behaviour and gating are untouched: `canToggleSend`/`canEdit`/`canRemove`, the switch's optimistic write, `onEdit`, the archive-vs-remove branch and `w-[248px]` all read the same in the diff — only the three rows' JSX and the `lucide-react` import change.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** "Neutral" is deliberate: `FloatMenuItem`'s icon slot defaults to `--blue` and `schedule/static/event-actions-menu.tsx` paints `Trash2` in `--danger` — do not copy either. This menu is hand-built on `Popover`; migrating it to `FloatMenu` (chrome.md says every dropdown should be) is out of scope here and belongs on its own branch.

## T2 · Drop the event/school suffix from the drawer's recent-match rows

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/team/player-drawer.tsx (recent-matches row, ~line 758), src/lib/data/team-roster-server.ts (`RosterRecentMatch.event`, `DbRecentMatch.tournament_name`, the select at ~367, the map at ~575), tests/team-roster-ids.spec.ts (fixture at ~163) — guess
- **done when:**
  - [ ] In the drawer's Recent matches list, each row's middle cell renders only `match.opponent`; the ` · {match.event}` suffix and its conditional are gone, and no row shows a trailing or leading "·"
  - [ ] Result mark, `ScoreLine`, date and chevron in that row are unchanged (same grid, same classes)
  - [ ] `RosterRecentMatch` no longer declares `event`, and the roster loader no longer selects or maps `tournament_name` for recent matches; `tests/team-roster-ids.spec.ts`'s recent-match fixture is updated to match and `npm run typecheck` passes
  - [ ] The `SetupLine`/identity line ("#3 singles · Freshman") and the chart tooltip ("opponent · date") in the same drawer still render their "·" — nothing outside the recent-matches row changes
- **notes:** `match.event` is `matches.tournament_name`, which for a dual holds the opposing program's name (`src/lib/schedule/actions.ts:896`) — that is the "school name". The player-profile page uses its own loader and is out of scope. Not a duplicate of T1; both touch player-drawer.tsx but different sections.
