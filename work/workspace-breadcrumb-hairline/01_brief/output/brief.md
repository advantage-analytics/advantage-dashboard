# Brief — workspace-breadcrumb-hairline

Two defects in the dashboard header's chrome, filed together and living in one
file: `src/app/dashboard/header.tsx`. They are independent — either could ship
without the other — but they share a surface, a reviewer and a screenshot.

## Goal

Make the dashboard header say the same kind of thing on every page, and make
its bottom edge actually visible.

1. **The left slot is unpredictable.** The workspace name ("Personal · CJ", or
   a program's name) appears on three pages and vanishes on the rest, so
   moving between pages feels like moving between two different products. The
   name should appear — or not — by a rule a person can state, rather than by
   an allowlist that stopped where the last design round stopped.
2. **The header's bottom hairline is invisible at rest.** It only becomes
   visible once the page has scrolled. It should be visible at all times.

## Scope

### 1. The workspace title / breadcrumb rule

Today the header's left slot has three treatments, chosen by
`WORKSPACE_TITLE_PATHS` — a hardcoded set of three exact paths:

| Treatment | Fires on |
|---|---|
| Greeting (`HeaderGreeting`) | `/dashboard`, personal workspace only |
| Workspace title | `/dashboard`, `/dashboard/matches`, `/dashboard/team` |
| Breadcrumb trail | everything else |

The set is not a rule, it is a record of which design rounds have run. The
header's own comment says so outright: *"Statistics, Ask and Help stay on
crumbs — no design round has covered them."* That is the inconsistency the
seed reports. Statistics, Ask, Help, Roster, Schedule and Opponents are all
top-level rail destinations that behave like Matches, and all of them show a
trail where Matches shows the workspace.

**The decision (delegated to Claude in the /feature-next Q&A, and the first
thing to push back on if it reads wrong):** replace the allowlist with the
principle it was reaching for —

> **The left slot names the workspace on a destination, and traces the path on
> a position within a flow.**

Operationally: a path that is *exactly* a rail destination in
`src/lib/dashboard/nav.ts` (`PERSONAL_NAV`, `TEAM_NAV`, `*_BOTTOM`) gets the
workspace title. Everything deeper — match detail, the match wizard, the
schedule create screens, Settings sub-pages, `team/upload` — keeps its trail.
The greeting keeps its Pa2 exception on the personal Home.

This was chosen over the two alternatives on offer because it is the only one
that changes no design decision already made:

- *Workspace name always leads, with the trail after it* would overturn the
  rule this file argues for at length across rounds 9g and 1a–1g — that a
  title and a trail in one slot read as "two competing answers to 'where am
  I'". Rejected as reopening a settled question to fix an unsettled one.
- *Trail everywhere, no title* would undo Platform Audit Pa2 and Pb2, which
  deliberately moved the greeting and the workspace title into this slot.
  Rejected as walking back shipped work.

The chosen rule keeps both, and only makes the boundary between them
statable. It is also the smallest diff: one predicate, replacing one `Set`.

### 2. The header hairline

`--border-hairline` resolves to `#F3F3F3`. Against the header's white
background that is roughly **1.05:1** — not a faint line, effectively no line
at all. The header only becomes separable from the page once `scrolled` swaps
the border to `#EBEBEB`.

In scope: the header's resting bottom edge must be visible against white
before any scrolling has happened.

## Non-goals

- **Not a token change.** `--border-hairline` is used by the settings save
  bar, the profile menu's dividers and card borders. Retuning the token
  changes surfaces across the whole dashboard and belongs to its own brief;
  this one is about the header.
- **Not a sidebar or rail change.** The rail already names the workspace when
  expanded, and its trigger carries `aria-label="Workspace: <name>. Switch
  workspace"` in every state. Nothing here should need it to change.
- **Not new destinations, labels or routes.** The rule reads the existing
  `nav.ts` table; it does not add to it.
- **Not a redesign of the crumb itself** — the chevrons, the truncation, the
  match-detail three-part trail and its loading skeleton all stay as they are.
- Not the greeting. Pa2's personal-Home treatment stays exactly as shipped.

## Constraints

- **`nav.ts` stays the single register.** The whole reason that file exists is
  that labels were once defined three times and had already drifted ("Help
  Center" in the rail vs "Help" in the crumb). The new rule must read the
  table, not restate a second list of paths beside it.
- **A page moved onto the title treatment loses its name from the chrome**, so
  its body must name itself. Verified for the candidates: Statistics, Ask and
  Opponents render `<h1 class="text-display">{title}</h1>` via
  `ComingSoonPage`; Help has its own `text-display` h1; Roster has one.
  `team/schedule` delegates to `StaticSchedule` and was **not** confirmed —
  design stage must check it.
- **`/dashboard/settings` is a rail destination that redirects** to
  `/settings/profile`, so the title branch can never fire for it. Harmless,
  but the rule should not read as if it does.
- The header is a 44px sticky bar at `px-6` with `shrink-0`, all three
  load-bearing per Platform Audit; height, padding and flex behaviour are
  fixed points.
- Dashboard UI: `docs/ui-revamp-guardrails.md` applies, and the design system
  reference is `.skills/advantage-analytics-design/SKILL.md`.
- Dark mode is deferred repo-wide, but `--border-hairline` has a dark-theme
  value (`#1F1F1F` on dark surfaces); whatever replaces it should not be a
  bare light-mode hex that will read as a bug the day dark mode lands.

## Success criteria

1. Walking the rail top to bottom in a personal workspace — Home, Matches,
   Statistics, Ask — the left slot carries the workspace on every one of them,
   and the greeting still leads on Home.
2. Same walk in a team workspace — Team Home, Schedule, Matches, Roster,
   Opponents, Statistics, Ask — carries the program name on every one.
3. Opening a match, the match wizard, a schedule create screen or a Settings
   sub-page still shows a trail, unchanged from today.
4. No page ends up with neither a name in the chrome nor a title in its body.
5. The header's bottom edge is visible against white on an unscrolled page, at
   normal viewing distance on a standard display.
6. Whatever the header does on scroll, it does not *lose* the edge or make it
   jump distractingly.
7. `npm run lint`, `npm run build` and `npm test` pass; no unrelated surface
   moves.

## Open questions

1. **Does the scroll state survive?** The seed asks for "visible at all
   times", which the resting state satisfies. Whether the header still darkens
   its edge (or gains a shadow) once scrolled is a design call, not a
   correctness one — stage 02 decides, and "one edge, one value, no state"
   is a legitimate answer.
2. **What is the visible value?** Design's job. Worth noting that `#EBEBEB` —
   today's *scrolled* colour — is itself only about 1.2:1 on white, so
   "just use the scrolled value at rest" may not clear criterion 5.
3. **Does `team/schedule`'s body name itself?** See Constraints. If it does
   not, either it stays on the trail as an explicit exception or the page
   gains a title — the design stage picks.
4. **`/dashboard/opponents`** sits outside `/dashboard/team` by design but is a
   team-rail destination. It should follow the same rule as its neighbours;
   flagged only because its path shape makes it easy to miss.

## Also consulted

Files read beyond this stage's declared inputs, to ground the two items in
what the code actually does:

- `src/app/dashboard/header.tsx` — the three treatments, `WORKSPACE_TITLE_PATHS`,
  and the `scrolled` border swap
- `src/lib/dashboard/nav.ts` — the destination register the rule would read
- `src/styles/design-system/colors.css` — `--border-hairline` → `--ink-100` → `#F3F3F3`
- `src/components/dashboard/coming-soon.tsx` — confirms stub pages render their own `text-display` h1
- `src/app/dashboard/{statistics,ask,help,opponents}/page.tsx`,
  `src/app/dashboard/team/{roster,schedule}/page.tsx` — whether each body names itself
- `src/components/dashboard/settings/settings-save-bar.tsx` — the other
  `--border-hairline` consumer, checked to scope the token out
