# Tasks — workspace-breadcrumb-hairline

Appended to `.claude/tasks/claude-workspace-breadcrumb-hairline-211f01.md`,
which **this stage created** — the branch had no queue. Its `.log.md` sibling
was created alongside it, empty, for the runner. `.gitignore` re-includes
`.claude/tasks/`, so both track.

Ids start at T1: neither the queue nor a log existed on this branch, so no id
has ever been used here.

## Routing

| Task | Title | Model | Needs | From |
|---|---|---|---|---|
| T1 | Add the destination predicate to nav.ts, with its spec | `sonnet` | — | plan step 1 |
| T2 | Switch the header's leading slot to the destination rule | `opus` | T1 | plan step 2 |
| T3 | Make the header's bottom edge permanent | `sonnet` | — | plan step 3 |

T1 and T3 are mechanical and fully specified, two files or fewer — `sonnet`.
T2 goes a tier up: the change itself is small, but it replaces a ~35-line
comment carrying design-round provenance, and prose that has to keep the right
history is where a low route actually costs something.

T3 carries no `needs:` — the plan makes it independent and it may run first.
Both T2 and T3 edit `header.tsx`, so they must run sequentially; that is stated
in each task's notes rather than as a false dependency.

## Plan step 4 is deliberately not a task

The plan's fourth step is the visual walk across both workspaces — brief
criteria 1–5. It is not in the queue, and that is not an omission.

`task-completion-reviewer` judges a diff against the `done when:` list. A
verification-only task produces **no diff**, so every criterion it could carry
("the edge is visible", "the title appears on Statistics") would be one the
gate cannot verdict — the exact fabrication task-add's drafting rules forbid.
Padding the list to make a queue entry would gate real work on a criterion no
reviewer can check.

The walks stay where they can actually be performed: T2's and T3's notes carry
what each changes, and stage 06 (review) is where a human runs them. Nothing is
lost — the plan's Step 4 section remains the checklist.

## The block appended

## T1 · Add the destination predicate to nav.ts, with its spec
- **status:** todo
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

## Note on how these were drafted

`task-add`'s step 2 routes drafting to a Fable subagent, on the reasoning that
"shaping and routing is frontier-model work even when this session runs on
something smaller." That rationale does not hold here, so the draft was written
inline instead: the shaping was already done by stages 01–03, and this session
holds the brief, the design and the plan — strictly more context than a fresh
subagent handed `plan.md` cold would have. Re-deriving three tasks from a plan
that already specifies files, order and dependencies would lose fidelity, not
add it.

What was followed to the letter is what this stage's contract names `task-add`
for — its **format and routing authority**: the `## T<n> ·` shape with the
middle dot, the exact field markers, `model:` routing tiers, `needs:`,
three-to-five observable criteria, `files:` as a real guess, and the numbering
rule that scans the log as well as the queue.

`task-add`'s step 3 (show the draft, wait for a yes) is superseded by the
pipeline itself: the review gate is the human reading this output and
re-invoking `/feature-next`, which is why stage 04's contract instructs the
append as a side effect rather than an interview.

## Also consulted

Beyond this stage's declared inputs (`03_plan/output/plan.md`,
`.claude/skills/task-add/SKILL.md`):

- `.gitignore` — confirms `!.claude/tasks/` re-includes the new queue, the
  check task-add step 4 requires before committing a queue created this run
- `.claude/tasks/splitstep-integration.md` — the existing queue, read for the
  header shape a queue file on this repo actually carries
