# Tasks — claude/workspace-breadcrumb-hairline-211f01

> Scope: the dashboard header's leading slot and its bottom edge. Two defects
> from `work/workspace-breadcrumb-hairline`; nothing else on this branch.

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

## T1 · Add the destination predicate to nav.ts, with its spec
- **status:** done
- **model:** sonnet
- **files:** `src/lib/dashboard/nav.ts`, `tests/header-slot.spec.ts` (new)
- **done when:**
  - [ ] `nav.ts` exports `isDestination(pathname: string): boolean`, backed by a module-level `DESTINATIONS` const spreading `PERSONAL_NAV`, `TEAM_NAV`, `PERSONAL_BOTTOM` and `TEAM_BOTTOM` — **not** `ALL_LINKS`
  - [ ] The match is exact, not prefix: `/dashboard/matches` is true while `/dashboard/matches/new` and `/dashboard/matches/` are false
  - [ ] `/dashboard/team/upload` is false — it is named in `UNLISTED`, which `DESTINATIONS` deliberately excludes
  - [ ] `tests/header-slot.spec.ts` asserts every `PERSONAL_NAV` and `TEAM_NAV` href, the `UNLISTED` guard, at least four flow paths (match detail, `matches/new`, a schedule create screen, a settings sub-page), the trailing-slash case, and an unrecognised path
  - [ ] `npm test`, `npm run lint` and `npm run build` pass, and no file outside `nav.ts` and the new spec is modified
- **notes:** Plan step 1. Lands inert — nothing consumes `isDestination` until T2, which is the point: it is testable before it changes any behaviour. The spec follows the repo's established shape (import the function and assert; no rendering, no browser) — `tests/safe-next.spec.ts` is the model. Two comments matter and should not be dropped: why `UNLISTED` is excluded (`team/upload` is named so a crumb can say "Upload video", but it is a step inside a flow, not a place), and why duplicate hrefs across the four arrays are left alone (`some()` short-circuits; de-duplicating would couple two menus `nav.ts` keeps separate on purpose). Design: `work/workspace-breadcrumb-hairline/02_design/output/design.md`.

## T2 · Switch the header's leading slot to the destination rule
- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** `src/app/dashboard/header.tsx`
- **done when:**
  - [ ] `WORKSPACE_TITLE_PATHS` is deleted and the `title` value is computed from `isDestination(pathname)`
  - [ ] `showGreeting` still takes precedence over `title`, so `/dashboard` in a personal workspace renders the greeting exactly as before
  - [ ] The block comment above the computation states the destination-vs-flow rule, and keeps the pointers to design rounds 9g / 1a–1g and Platform Audit Pa2 that explain the greeting exception
  - [ ] No file other than `header.tsx` is modified
  - [ ] `npm run lint` and `npm run build` pass
- **notes:** Plan step 2. Ten paths gain the workspace title (Statistics, Ask, Help, Opponents, and the team Roster / Schedule / Statistics / Ask); every flow path keeps its trail unchanged. All six pages moving to the title treatment were audited for a body title in design — Statistics, Ask and Opponents via `ComingSoonPage`, Help / Roster / Schedule with their own `text-display` h1 — so none ends up unnamed. The comment being replaced is ~35 lines of provenance for the allowlist that is going away: replace it, do not simply delete it. Shares `header.tsx` with T3 — sequential only, never concurrent.

## T3 · Make the header's bottom edge permanent
- **status:** todo
- **model:** sonnet
- **files:** `src/app/dashboard/header.tsx`
- **done when:**
  - [ ] The header draws `border-b border-[var(--border-medium)]` unconditionally — the `scrolled` ternary and `transition-colors duration-200` are gone
  - [ ] `scrolled` / `setScrolled`, `handleScroll`, the `useEffect` that binds and unbinds the parent scroll listener, `headerRef` and its `ref={headerRef}` attribute are all deleted, and the React import is narrowed to the hooks still in use
  - [ ] A comment at the border records that the permanent edge is a deliberate override of DS v3 `Navigation Patterns → Header (v3)`, which specifies `border-transparent` at rest and treats `#EBEBEB` as a scroll indicator
  - [ ] `h-11`, `shrink-0`, `px-6` and `sticky top-0 z-30` are unchanged
  - [ ] No file other than `header.tsx` is modified, and `npm run lint` and `npm run build` pass
- **notes:** Plan step 3. The override was confirmed by the author in the stage-03 invocation ("yes override it"); recording it as a code comment is the agreed form, and a DS v3 CHANGELOG amendment is explicitly **not** part of this branch. `--border-medium` (`#E5E5EA`, 1.26:1 on white) is chosen over a new hex because it is already this header's own gray — the activity/account divider and the profile popover border both use it — and it carries a dark-mode value. If it still reads as absent when looked at, the fix is a new token, not a bare hex here. Independent of T1/T2 and may run first, but shares `header.tsx` with T2 — sequential only.
