---
name: trace-route
description: Resolve a page name the user mentioned ("the match detail page", "serve placement", "the team roster") to the exact component file that renders it, by following the route's import chain. Use BEFORE editing any dashboard UI, and whenever a component name appears more than once in this repo.
---

# Trace the route before you edit

This project has several components with overlapping names rendering in
different routes. Picking by filename similarity wastes a full cycle and,
worse, silently edits a page the user was not looking at.

**Serve placement exists four times:**

| File | Renders on |
|---|---|
| `src/components/dashboard/home/serve-placement-home.tsx` | `/dashboard` |
| `src/components/dashboard/matches/match-detail/serve-placement-card.tsx` | `/dashboard/matches/[matchId]` |
| `src/components/dashboard/matches/serve-placement/serve-placement-widget.tsx` | matches subtree |
| `src/components/dashboard/statistics/serve-placement-stats.tsx` | `/dashboard/statistics` |

Statistics cards, match cards and score rows have the same problem.

## Procedure

1. **Map the words to a route.** Use the route table in `CLAUDE.md` under
   "Routes". "Match detail" → `src/app/dashboard/matches/[matchId]/page.tsx`.
   "Home dashboard" → `src/app/dashboard/(home)/page.tsx`. If the phrase is
   ambiguous between two routes, ask — do not pick the likelier one.

2. **Open the route file itself.** Not a component that sounds right. The
   `page.tsx`.

3. **Follow the imports down** to the component that actually renders the
   thing named. Check the `layout.tsx` too — on match detail it is the layout
   that fetches data and provides `MatchDataProvider`, so a data question is
   often answered there, not in `page.tsx`.

4. **Check for a context read.** If the component calls `useMatchData()` or
   `useWorkspace()`, its data comes from a provider higher up, and changing
   what it displays may mean changing the provider's input instead.

5. **State the resolved path before proposing any edit.** One line:
   "This renders from `src/components/.../x.tsx`, via
   `src/app/dashboard/.../page.tsx`." Then edit.

## Fast lookups

Find every place a component is rendered:

```bash
grep -rn "ServePlacementCard" src/app src/components
```

Find which route a component belongs to by walking up from it:

```bash
grep -rln "serve-placement-card" src/app src/components
```

## Do not

- Do not assume a `match-detail/` path means it is on the match detail page —
  confirm the route imports it.
- Do not edit two similarly-named components "to be safe". Resolve which one,
  then change that one.
