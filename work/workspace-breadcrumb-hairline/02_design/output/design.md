# Design — workspace-breadcrumb-hairline

Two changes, two files: `src/lib/dashboard/nav.ts` and
`src/app/dashboard/header.tsx`. No data layer, no schema, no route table
change — so nothing here needs `npm run map` or a Supabase check.

---

## Read this first — item 2 contradicts the design system

The brief did not know this; it surfaced on reading the DS reference. **DS v3,
`Navigation Patterns → Header (v3)`, specifies the resting header as having no
edge at all:**

```
border-b transition-colors duration-200
// Default: border-transparent
// Scrolled: border-[#EBEBEB]
```

and `Colors → Border Colors` names `#EBEBEB` **"border-scroll — Header scroll
indicator."** The bottom edge is not specified as a divider that happens to be
faint. It is specified as a *signal that the page has scrolled*, and its
absence at rest is the point.

The seed calls that a bug, and you restated it directly when asked: *"the
implementation before was if it was at the top of the page it would not be
visible and only be visible on scroll. Make it visible at all times."* That is
a clear product call, so this design implements it. But it is a **deliberate
divergence from DS v3**, not a defect fix, and it should be recorded as one.

Two things soften it:

1. **The shipped code already diverges.** It draws
   `border-[var(--border-hairline)]` (`#F3F3F3`) at rest where the DS says
   `border-transparent`. So the slot has been drifting from the spec already —
   in the same direction, just not far enough to see. Nobody is being
   overruled who was previously right.
2. **A permanent edge and a scroll signal are not the same requirement.** The
   DS optimised for the second. Everyday use asks for the first: a sticky bar
   with no bottom edge reads as unfinished on a short page that never scrolls
   at all — and several dashboard pages (Ask, Statistics, day-zero states)
   never do.

Recorded as open question 1 below: whether this gets a DS CHANGELOG amendment
or just a code comment is your call, not something this stage should decide
unilaterally.

---

## Approaches considered

### Item 1 — where the workspace title fires

The brief already chose the *rule* (destination → workspace title; position
within a flow → trail). These are three ways to express it in code.

| | Approach | Trade-off |
|---|---|---|
| **A1** | Predicate local to `header.tsx`, importing the nav arrays and testing membership there | Smallest diff. But it puts route-shape knowledge back in the header — the exact split `nav.ts` was created to end — and it cannot be unit-tested without rendering a client component that calls `usePathname`, `useWorkspace` and Supabase. |
| **A2** ✅ | `export function isDestination(pathname)` in `nav.ts`, called by the header | The register keeps its own membership question. Pure function → testable in the repo's established spec style. One import, one call site. |
| **A3** | Add a `slot: "title" \| "trail"` field to every `NavLink` | Most expressive, and would let one destination opt out later. But every rail destination takes the same value, so the field is a column of identical cells — and it invites per-route bespoke answers, which is precisely the drift the brief is fixing. YAGNI. |

**A2.** It satisfies the brief's binding constraint (*"`nav.ts` stays the
single register… must read the table, not restate a second list of paths"*),
and it is the only one of the three that can be tested the way this repo tests
things — every spec in `tests/` imports a pure function and asserts on it,
none render a component.

### Item 2 — the hairline

| | Approach | Trade-off |
|---|---|---|
| **B1** ✅ | One edge, one value, no state. Draw `--border-medium` always; delete the scroll machinery. | Exactly what was asked, and it deletes real code: `scrolled` state, `handleScroll`, a scroll listener bound to the parent element, `headerRef`, and two now-unused React imports. Satisfies success criterion 6 trivially — nothing changes on scroll, so nothing can jump. Loses the DS's scroll signal outright. |
| **B2** | Two values, both visible: `--border-medium` at rest, something darker scrolled. | Keeps the DS's intent *and* satisfies "visible at all times". But it keeps a scroll listener and a re-render to move a 1px line between two grays a person will not notice — the affordance survives in name only. |
| **B3** | Raise `--border-hairline` itself. | Explicitly a non-goal in the brief: the token also draws the settings save bar, the profile menu's three dividers and card borders across the dashboard. |

**B1.** B2 pays the full cost of the scroll state to buy a difference below
the threshold of noticing. If the scroll indicator is genuinely wanted back
later, it returns as a shadow — which is what actually reads as depth — and
that is a DS question for whenever v2 shadows stop being deferred.

**The value: `--border-medium` (`#E5E5EA`).** Measured against white:

| Value | Contrast on `#FFFFFF` | |
|---|---|---|
| `--border-hairline` `#F3F3F3` | **1.11:1** | today's resting edge |
| `#EBEBEB` | **1.19:1** | today's scrolled edge — the DS `border-scroll` |
| `--border-medium` `#E5E5EA` | **1.26:1** | proposed |

(The brief estimated 1.05:1 for `#F3F3F3`; 1.11:1 is the accurate figure. It
changes nothing — both are invisible — but the value choice below is sized off
the real numbers.)

`--border-medium` is chosen over a new hex because:

- **It is already this header's own gray.** The 1×14 divider between the
  activity tray and the account button is `bg-[var(--border-medium)]`, and the
  profile popover's border is `border-[var(--border-medium)]`. The bar ends up
  drawing its edges in one value instead of two.
- **It has a dark-mode value** (`#2E2E2E`), which the brief made a constraint:
  no bare light-mode hex that becomes a bug the day dark mode lands.
- **It is the DS's token for an edge that must read as an edge**
  ("Dropdown/modal borders") — the closest sanctioned value to what is being
  asked for, without inventing one.

Note honestly: 1.26:1 is a *soft* line, not a strong one. It is a real, visible
step up from nothing, and it is the darkest existing token that belongs in this
design language — the next stop that would clear WCAG 1.4.11's 3:1 for a
meaningful boundary is around `#949494`, which is a rule, not a hairline, and
would look wrong in a system with no shadows and no heavy borders. See open
question 2.

---

## Chosen design

### Architecture

**`src/lib/dashboard/nav.ts`** — one new const and one new exported predicate,
placed with `activeHref` / `navLabel` (the other path-question functions):

```ts
/**
 * Every destination the rail can send you to — deliberately NOT ALL_LINKS,
 * which folds in UNLISTED. `team/upload` is named there so the crumb can say
 * "Upload video", but it is a step inside a flow, not a place; it belongs on
 * the trail.
 *
 * PERSONAL_BOTTOM and TEAM_BOTTOM are identical today, so this holds
 * duplicate hrefs. `some()` does not care, and de-duplicating would couple
 * the two lists that nav.ts keeps separate on purpose.
 */
const DESTINATIONS: readonly NavLink[] = [
  ...PERSONAL_NAV,
  ...TEAM_NAV,
  ...PERSONAL_BOTTOM,
  ...TEAM_BOTTOM,
];

/**
 * Is this path a rail destination itself, rather than somewhere inside one?
 *
 * Exact match, never prefix: `/dashboard/matches` is a destination,
 * `/dashboard/matches/[matchId]` is a position within it. That distinction is
 * the whole rule — the header names the workspace on a destination and traces
 * the path on a position within a flow.
 */
export function isDestination(pathname: string): boolean {
  return DESTINATIONS.some((link) => link.href === pathname);
}
```

**`src/app/dashboard/header.tsx`** — three edits:

1. **Delete `WORKSPACE_TITLE_PATHS`** (the three-path `Set`) and its comment
   block. Replace the `title` computation:

   ```ts
   const title =
     !showGreeting && isDestination(pathname)
       ? workspaceTitle(active, viewer)
       : null;
   ```

   Order is load-bearing and unchanged: `showGreeting` still wins, so Pa2's
   personal-Home greeting is untouched.

2. **Rewrite the block comment** above it. The current one is ~35 lines of
   design-round provenance justifying an allowlist that is going away. It
   should be replaced — not deleted — with the rule and why the boundary sits
   where it does: a destination already highlights its row in the rail and
   names itself in its body, so the slot's one useful fact is the workspace; a
   position inside a flow has a path worth tracing and no other place showing
   it. Keep the pointer to rounds 9g / 1a–1g and Pa2 — that history is why the
   greeting exception exists and a future reader will need it.

3. **Collapse the header's className to one border value:**

   ```ts
   className="sticky top-0 z-30 flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-medium)] bg-white px-6"
   ```

   `h-11`, `shrink-0` and `px-6` all stay — the brief lists them as fixed
   points and Platform Audit calls each load-bearing. `transition-colors
   duration-200` goes with the state it was animating.

4. **Delete the scroll machinery it made dead:** `scrolled` / `setScrolled`,
   `handleScroll`, the `useEffect` that binds and unbinds the parent scroll
   listener, `headerRef`, and the `ref={headerRef}` attribute. `useRef` and
   `useCallback` then have no other consumer in the file — narrow the React
   import to `useState, useEffect`.

### Components

| File | Change |
|---|---|
| `src/lib/dashboard/nav.ts` | `+ DESTINATIONS`, `+ isDestination()` |
| `src/app/dashboard/header.tsx` | `- WORKSPACE_TITLE_PATHS`, title predicate, comment rewrite, single border value, scroll machinery deleted |
| `tests/header-slot.spec.ts` | new |

Nothing else. Not the sidebar, not `workspace-provider.tsx`, not
`header-greeting.tsx`, not any page.

### Data flow

Unchanged. `isDestination` is a pure string test over a module-level array;
the header already has `pathname` from `usePathname()` and `active` / `viewer`
from `useWorkspace()`. No fetch, no query, no state added — the change removes
state.

The one behavioural delta: **the workspace title now renders on ten paths
instead of three.**

| Path | Today | After |
|---|---|---|
| `/dashboard` (personal) | greeting | greeting — unchanged |
| `/dashboard` (team) | title | title |
| `/dashboard/matches` | title | title |
| `/dashboard/team` | title | title |
| `/dashboard/statistics` | trail "Statistics" | **title** |
| `/dashboard/ask` | trail "Ask" | **title** |
| `/dashboard/help` | trail "Help Center" | **title** |
| `/dashboard/opponents` | trail "Opponents" | **title** |
| `/dashboard/team/roster` | trail "Roster" | **title** |
| `/dashboard/team/schedule` | trail "Schedule" | **title** |
| `/dashboard/team/statistics` | trail "Statistics" | **title** |
| `/dashboard/team/ask` | trail "Ask" | **title** |
| `/dashboard/matches/new` | trail | trail |
| `/dashboard/matches/[matchId]` | trail | trail |
| `/dashboard/team/schedule/new/*` | trail | trail |
| `/dashboard/team/schedule/[eventId]` | trail | trail |
| `/dashboard/team/upload` | trail | trail |
| `/dashboard/settings/*` | trail | trail |
| `/dashboard/opponents/[programId]` | trail | trail |

Every page moving to the title treatment was audited for a body title —
the brief's criterion 4, "no page ends up with neither a name in the chrome
nor a title in its body":

- Statistics, Ask, Opponents → `ComingSoonPage`, which renders
  `<h1 className="text-display">{title}</h1>`
- Help → its own `<h1 className="text-display">Help center</h1>`
- Roster → `<h1 className="text-display">`
- **Schedule → `StaticSchedule` renders `<h1 className="text-display">Schedule</h1>`.**
  This was the brief's open question 3, and the answer is yes: no exception
  needed.

### Error handling

There is no failure mode to handle — the change adds no I/O — but three edge
cases are worth being explicit about, because each looks like a bug in review:

- **An unknown path** returns `false` and falls through to
  `getStaticBreadcrumbs`, which already returns `[]` for anything it does not
  recognise. Empty slot, exactly as today.
- **`/dashboard/settings` and `/dashboard/team/settings` never render either
  treatment.** Both are `redirect()` calls — verified — so `/dashboard/settings`
  being a member of `DESTINATIONS` has no runtime effect. Leave it in the array
  rather than special-casing it; a special case would be dead code defending
  against a state that cannot occur.
- **`/dashboard/matches` is in both `PERSONAL_NAV` and `TEAM_NAV`, and the two
  `*_BOTTOM` arrays are identical.** `some()` short-circuits. Do not
  "optimise" this into a `Set` keyed on href — the duplication is the two
  products keeping separate menus, which `nav.ts` documents at length.

### Testing

**`tests/header-slot.spec.ts`** — a pure spec on `isDestination`, in the shape
every other file in `tests/` takes (import the function, assert; no rendering,
no browser):

- every href in `PERSONAL_NAV` and `TEAM_NAV` is a destination
- `/dashboard/settings` and `/dashboard/help` are destinations
- `/dashboard/team/upload` is **not** — the `UNLISTED` guard, and the one that
  regresses silently if someone later reaches for `ALL_LINKS`
- `/dashboard/matches/new`, `/dashboard/matches/abc123`,
  `/dashboard/team/schedule/new/dual`, `/dashboard/settings/usage`,
  `/dashboard/opponents/p1/pl2` are not
- `/dashboard/matches/` (trailing slash) and `/dashboard/match` are not —
  exact match, not prefix, not `startsWith`
- an unknown path is not

**Manual verification** — the brief's criteria 1–3 and 5, which no unit test
reaches:

1. Personal workspace: Home → Matches → Statistics → Ask. Greeting on Home,
   workspace title on the other three.
2. Team workspace: Team Home → Schedule → Matches → Roster → Opponents →
   Statistics → Ask. Program name on all seven.
3. A match detail page, `/dashboard/matches/new`, a schedule create screen and
   `/dashboard/settings/usage` still show their trails, unchanged.
4. On an unscrolled page, the header's bottom edge is visible; scrolling does
   not change it.

Local dev needs the worktree's own `npm ci` and `.env.local`, and a port Azure
CORS knows about (3000 or 3101) if any upload path is exercised — not needed
for this change.

**Gates:** `npm run lint`, `npm run build`, `npm test`. `npm run map` is not
needed — no route is added or removed.

**Guardrails:** `docs/ui-revamp-guardrails.md` §3.5 lists navigation as safe to
redesign freely; nothing here touches the wizard's five vendor fields, the
analysis-status predicates, the match-detail short-circuit or the deletion
path.

---

## Open questions

1. **How is the DS divergence recorded?** Implementing this puts the header's
   resting edge in conflict with DS v3's `Header (v3)` block and orphans the
   `border-scroll` token's stated purpose. Options: (a) a comment at the
   `border-b` explaining that the permanent edge is a deliberate product call
   and the scroll indicator was dropped — cheap, local, and enough for the next
   reader; (b) that plus an amendment to the DS v3 project's CHANGELOG via
   DesignSync, so `SKILL.md` stops shipping a rule the code contradicts.
   **Recommend (a) now**, and raise (b) at the next DS re-sync — but this is a
   house-style question and yours to answer.
2. **Is `#E5E5EA` visibly enough?** 1.26:1 is a soft line. It is the darkest
   token that belongs in this design language, and it should read as a real
   edge on a normal display — but "visible" is a judgment made with eyes, not
   a ratio, and this is the one thing in the design that can only be settled by
   looking at it. If it still reads as absent at review, the fix is a **new
   token** (`--border-chrome`, say, around `#DCDCDC`) rather than a bare hex in
   the header — the brief's dark-mode constraint applies either way.
3. **Should the personal Home greeting eventually extend to Team Home?**
   Out of scope and not proposed. Flagged only because after this change the
   greeting is the last remaining per-path exception in the slot, so it is
   the next thing anyone auditing this file will ask about.

### Carried forward from the brief — resolved

- *"Does the scroll state survive?"* — **No.** B1: one edge, one value.
- *"What is the visible value?"* — `--border-medium` `#E5E5EA`, with open
  question 2 as the escape hatch.
- *"Does `team/schedule`'s body name itself?"* — **Yes**,
  `static-schedule.tsx:321`. No exception needed.
- *"Does `/dashboard/opponents` follow the same rule?"* — **Yes**, it is a
  `TEAM_NAV` destination and gets the title; its `[programId]` and
  `[playerId]` pages are deeper paths and keep their trail, unchanged.

### Noticed, deliberately not fixed

`/dashboard/settings/subscription` is a real route absent from
`SETTINGS_SECTIONS`, so `settingsSection()` misses it and its crumb falls back
to a bare "Settings" with no leaf. Pre-existing, unrelated to either item here,
and per the branch-scope rule it belongs to its own branch rather than riding
along.

---

## Also consulted

Beyond this stage's declared inputs (`01_brief/output/brief.md`, `MAP.md`,
`docs/ui-revamp-guardrails.md`, `.skills/advantage-analytics-design/SKILL.md`):

- `src/app/dashboard/header.tsx` — the treatments, the `scrolled` swap, and
  which of `useRef`/`useCallback` survive its deletion
- `src/lib/dashboard/nav.ts` — `ALL_LINKS` vs the rail arrays, `UNLISTED`,
  `activeHref`, `settingsSection`
- `src/lib/workspace/types.ts` — `workspaceTitle()`, to confirm the title
  renders for both workspace kinds on the newly-covered pages
- `src/styles/design-system/colors.css` — `--border-hairline`,
  `--border-medium`, `--border-card`, `--border-subtle` and their dark values
- `src/components/dashboard/schedule/static/static-schedule.tsx` — resolves
  brief open question 3
- `src/app/dashboard/settings/page.tsx`,
  `src/app/dashboard/team/settings/page.tsx` — both `redirect()`
- `tests/safe-next.spec.ts`, `playwright.config.ts` — the spec shape
  `header-slot.spec.ts` should match
