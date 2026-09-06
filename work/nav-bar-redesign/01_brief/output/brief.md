# Brief — nav-bar-redesign

Five small refinements to the dashboard sidebar, from one round of walking
the nav. They share a surface but not a theme: two icon swaps, an honesty
marker on unbuilt destinations, moving sign-out out of the chrome, and a
focus fix in the workspace switcher.

## Goal

The sidebar should read accurately and behave predictably: icons that match
what the destination actually is, no silent dead ends, no destructive action
sitting in permanent chrome, and a switcher that opens with the keyboard
already on the right row.

## Scope

1. **Statistics icon → `chart-line`.** Both nav sets (personal and team)
   currently use `BarChart3`. Swap to Lucide `ChartLine` in
   `src/lib/dashboard/nav.ts`.
2. **Roster icon → `users-round`.** Team nav currently uses `Users`. Swap to
   Lucide `UsersRound`, same file.
3. **"Coming soon" in the rail tooltip only.** The destinations that render
   `ComingSoon` — Statistics, Ask, Opponents (both workspace kinds where they
   exist) — get the marker in the collapsed-rail tooltip. The expanded nav
   label stays clean. *(Decided in chat; the alternative — a chip beside the
   expanded label — was rejected as noise on several rows at once.)*
4. **Sign-out moves to Settings → Account.** Remove the sign-out control from
   the sidebar `ViewerFooter`; surface it as an action on
   `/dashboard/settings/account`. No fallback control stays in the sidebar.
   *(Decided in chat.)*
5. **Workspace switcher opens focused on the current workspace.** When the
   switcher opens, the row for the active workspace receives focus and shows
   a visible focus ring, so ↑/↓ and Enter work from a known position.

## Non-goals

- No change to nav item order, labels, hrefs, or which items appear per
  workspace kind.
- No redesign of the rail/panel geometry, widths, or the expand/collapse
  affordance.
- No change to what the `ComingSoon` page itself says or to which routes are
  coming soon.
- No change to the logout confirmation dialog's own behaviour — only where it
  is triggered from.
- No new nav destinations, and no Settings page restructuring beyond adding
  the sign-out action.

## Constraints

- Lucide icons only; three approved motion curves; no bounce. Read
  `.skills/advantage-analytics-design/SKILL.md` before building.
- `docs/ui-revamp-guardrails.md` applies — this is dashboard UI.
- Sign-out must remain reachable in at most two clicks from any dashboard
  page, and must keep its confirmation step.
- The tooltip marker must not change the collapsed rail's width or the
  tooltip's timing.
- Focus handling must not trap focus or break Escape-to-close; it must be
  keyboard-visible, not mouse-visible (`:focus-visible` semantics).

## Success criteria

- Statistics shows `chart-line` and Roster shows `users-round` in both the
  collapsed rail and the expanded panel, in every workspace kind that has
  them.
- Hovering a coming-soon item in the collapsed rail shows the item name plus
  a "Coming soon" marker; the expanded label is unchanged; built items are
  unmarked.
- No sign-out control anywhere in the sidebar; a working sign-out exists on
  Settings → Account and still confirms before signing out.
- Opening the workspace switcher by keyboard puts a visible focus ring on the
  current workspace's row; ↑/↓ moves from there and Enter selects.
- `npm run lint` and `npm test` pass.

## Open questions

- Exact tooltip wording for item 3 — `"Statistics · Coming soon"` vs a
  second dimmed line under the name. Stage 02 should pick one and show it.
- Whether the Opponents item counts as "coming soon" for the tooltip marker:
  its page renders `ComingSoon` today, but its nav treatment may have been
  deliberate. Confirm during design.
- Placement and register of the sign-out action on Settings → Account
  (its own row, a destructive-styled button, position on the page) — stage 02.

## Also consulted

Read to ground the scope in what actually exists, beyond the declared inputs:

- `src/lib/dashboard/nav.ts` — current icons and nav item sets
- `src/components/dashboard/app-sidebar.tsx` — where sign-out lives today
- `src/components/dashboard/coming-soon.tsx` and the five routes that render it
- `src/components/dashboard/workspace-switcher.tsx` — current focus handling
- `src/components/dashboard/sidebar/` — rail item and tooltip components
