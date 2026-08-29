# Tasks — claude/ui-consistency-layout-d246bd

> Scope: UI consistency and layout fixes on the dashboard home page

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

## T1 · Remove the keyboard-shortcut chip from the New match button
- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/create-match-button.tsx
- **done when:**
  - [ ] The rendered button contains no `<kbd>` element — only the Plus icon and the label
  - [ ] The `keydown` listener for Cmd/Ctrl+U and the `isMac` state + platform-detection effect are removed from the file (no dead code left behind)
  - [ ] Clicking the button still navigates to /dashboard/matches/new from both call sites (home welcome-message and statistics empty state) — verified in the running app
  - [ ] `npm run lint` passes with no unused-import warnings in the file
- **notes:** Answering the "should I?" — yes: Ctrl+U is the browser's View Source shortcut on Windows/Linux, so hijacking it is hostile there; and the listener only mounts on pages that happen to render this button, so the shortcut silently doesn't work on most routes. Removing only the chip would leave an undiscoverable shortcut, worse than none.

## T2 · Redesign empty-state cards to match design artboard 20a
- **status:** blocked
- **model:** opus
- **files:** src/components/dashboard/home/empty-dashboard.tsx
- **done when:**
  - [ ] The three cards visually match artboard 20a from the design canvas (read via DesignSync on the design project in memory)
  - [ ] All three cards share the same border token and shadow treatment — no per-card branching in the diff
  - [ ] The primary action keeps advButton("primary"); the other two use advButton("outline")
  - [ ] At sm:grid-cols-3 the three cards align at a common bottom edge
  - [ ] No other component is touched by the diff
- **notes:** Prior spec aimed at border/shadow parity only; user direction now anchors the full layout to artboard 20a. Runner: read the canvas via DesignSync before implementing.

## T3 · Pin the usage footer to the bottom of short home pages
- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/dashboard-shell.tsx, src/app/dashboard/(home)/home-content.tsx
- **done when:**
  - [ ] With no matches (empty state), UsageFooter's bottom edge sits at the bottom of the scroll viewport instead of directly under the cards
  - [ ] With content taller than the viewport, the footer renders in normal flow after the content; the diff introduces no `fixed` or `sticky` positioning
  - [ ] The empty state shows no vertical scrollbar when content fits the viewport
  - [ ] Spot-check: /dashboard/matches and /dashboard/statistics render unchanged
- **notes:** Mechanism: `<main>` currently doesn't grow inside its flex-column scroll parent; give it `flex flex-1 flex-col`, let the home page root keep `flex-1`, and push the footer with mt-auto down the chain. Team home already has its own `flex-1` wrapper — leave it alone in this task.

## T4 · Audit and fix the Needs Attention card on team home
- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/team/needs-attention.tsx, src/app/dashboard/team/page.tsx (guess)
- **done when:**
  - [ ] The card either uses DS-standard border/shadow/hover matching surrounding cards, OR is removed entirely — no in-between state
  - [ ] If removed: the file is deleted and its import in team/page.tsx is gone with no remaining references
  - [ ] With team home in empty state, the layout shows no shift relative to adjacent cards
  - [ ] If kept: a single inline comment documents why; no comment needed if removed
- **notes:** User: card causes layout shift on team home empty state and hover/design diverge from DS. Read the component's doc comment (round 44 decisions) before deciding. If the card's data hooks return nothing in empty state, removal is likely correct.
