# Tasks — splitstep-integration

> Scope: the integration trunk. Anything landing on `splitstep-integration`
> before it merges to `main`.

Renamed from `claude-workspace-setup-repo-1389c6.md` on 2026-08-24, when that
branch merged here. T1 ran on the old branch and is kept for its history; the
queue file is named after the branch it serves, so the tasks moved with the
work rather than staying with the branch that happened to create them.

Run one with `/task-next`. Drain the file with `/loop /task-next`.
Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so `/loop /task-next`
drains straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Replace the boilerplate README
- **status:** done
- **files:** README.md
- **done when:**
  - [ ] No `create-next-app` boilerplate text remains
  - [ ] States what Advantage Analytics is in two sentences, matching PRODUCT.md
  - [ ] Lists the three required env vars by name, with no values
  - [ ] Links MAP.md, CLAUDE.md and docs/README.md
  - [ ] `npm run dev` and `npm run build` are documented and both still work
- **notes:** Untouched since 2025-09-06. It is the repo's front door.

## T2 · Reconcile DATABASE_PRD.md with the live schema
- **status:** todo
- **files:** DATABASE_PRD.md
- **done when:**
  - [ ] Every table it documents is verified against the live database via the
        Supabase MCP `list_tables`, not against supabase/migrations/
  - [ ] Tables that exist live but are undocumented are listed
  - [ ] Fields it documents that no longer exist are removed or marked removed
  - [ ] Carries a dated header saying current-state or point-in-time, per the
        convention in docs/README.md
- **notes:** 778 lines stamped February 2026. supabase/migrations/ runs about
  100 migrations behind live, so the folder is not a source of truth. CLAUDE.md
  cites this file as "Schema reference" — Task 7 of the plan qualifies that.

## T3 · Add a docs-freshness reviewer
- **status:** later
- **files:** .claude/agents/docs-freshness-reviewer.md
- **done when:**
  - [ ] Reads docs/README.md first and honours its current-vs-point-in-time marks
  - [ ] Flags a doc whose described behaviour the diff contradicts
  - [ ] Does not flag a point-in-time doc merely for being old
  - [ ] tools and model match the other agents in .claude/agents/
- **notes:** Phase 2. docs/README.md already states the house rule that a doc
  drifting silently is worse than no doc; this enforces it.

## T4 · Vitest over the pure logic layer
- **status:** later
- **files:** package.json, vitest.config.ts, src/lib/services/upload/, src/lib/data/
- **done when:**
  - [ ] Vitest runs alongside Playwright without either claiming the other's files
  - [ ] The SwingVision parser has tests over a real fixture
  - [ ] statistics-server and statistics-client are asserted to produce the same
        shape from the same input
  - [ ] `npm test` runs both runners
- **notes:** Phase 2, and deliberately scoped. Blanket unit tests across all 419
  files are rejected: the runner is Playwright, most files are React components,
  and the cost/benefit does not hold. Target the logic that fails silently.

## T5 · Notion task ingestion
- **status:** later
- **files:** .claude/skills/task-import/
- **done when:**
  - [ ] Pulls open items from Notion via MCP
  - [ ] Rewrites each into the schema in this file, with a `done when:` list
  - [ ] Appends to the current branch's queue without touching existing entries
  - [ ] An item too vague for acceptance criteria is reported, not guessed at
- **notes:** Phase 3. The rewrite is the point: a Notion line like "fix the
  matches page" has no criteria, and a task without criteria cannot be gated.
