# Design — nav-bar-redesign

The five brief items touch four files. Nothing here needs new data, a new
route, or a schema read; this is chrome.

Route trace, so the components are named once and not guessed:
`src/app/dashboard/layout.tsx` renders `AppSidebar`
([`src/components/dashboard/app-sidebar.tsx`](src/components/dashboard/app-sidebar.tsx)),
which reads its link lists from
[`src/lib/dashboard/nav.ts`](src/lib/dashboard/nav.ts) and renders each row
through [`RailItem`](src/components/dashboard/sidebar/rail-item.tsx) →
[`RailTooltip`](src/components/dashboard/sidebar/rail-tooltip.tsx) →
`ChromeTooltip`. The sidebar's switcher is
[`WorkspaceRow`](src/components/dashboard/sidebar/workspace-row.tsx) (a Radix
`Popover`); the header profile menu has a *second*, plainer list,
[`WorkspaceOptionList`](src/components/dashboard/workspace-switcher.tsx). Sign-out
lives in `AppSidebar`'s `ViewerFooter` and is triggered through
`useRequestLogout()` from
[`logout-dialog.tsx`](src/components/dashboard/logout-dialog.tsx).

---

## Approaches considered

The only item with real design latitude is #3 (the coming-soon marker). Items
1, 2 and 4 have one sane shape each; item 5 has two.

### A. Marker as a per-item flag on `NavLink`, rendered as the tooltip's second line

Add an optional `comingSoon?: true` to `NavLink`, set it on the entries whose
routes render `ComingSoonPage`, and let `RailItem` pass it down as the
tooltip's existing `detail` slot. `RailTooltip`/`ChromeTooltip` already accept
`detail` — the workspace row uses it for "Switch workspace" — so no new
tooltip shape gets invented.

- **For:** one source of truth beside the href it describes; zero new
  components; uses the primitive as designed; the flag is also available to the
  `aria-label`, which is what keeps it out of "essential info lives only in a
  tooltip" territory.
- **Against:** the flag has to be kept in step with the pages by hand. That is
  a two-line edit when a page ships, and the alternative (deriving it) is worse.

### B. Derive "coming soon" from the route

Export a `COMING_SOON_HREFS` set, or have the pages register themselves.

- **For:** cannot drift.
- **Against:** nav is a client module and the pages are separate route files;
  any derivation is either a second hand-maintained list wearing a smarter hat,
  or a build-time scan for `ComingSoonPage` — a generator for four entries.
  YAGNI.

### C. Visible marker beside the expanded label

Already rejected in the brief (chat decision): noise on several rows at once,
and it costs the row a second text element at the one width where the label is
already legible.

**Recommendation: A.**

For item 5, the two shapes are (i) let Radix autofocus and reorder nothing —
i.e. focus lands on the first row, which is only correct for whoever happens to
be in their first workspace — or (ii) intercept `onOpenAutoFocus` and move
focus to the active row, plus arrow-key movement between rows. **(ii)**, which
is what the brief asks for.

---

## Chosen design

### 1 & 2 — icon swaps

`src/lib/dashboard/nav.ts` only. `BarChart3 → ChartLine` on both Statistics
entries (`PERSONAL_NAV`, `TEAM_NAV`); `Users → UsersRound` on `TEAM_NAV`'s
Roster. Both are exported by the installed `lucide-react` ^0.562.0 (verified).
Update the import block; `BarChart3` and `Users` become unused there and must
go with them or lint fails.

Nothing else reads these icons — `PERSONAL_NAV`/`TEAM_NAV` have exactly two
consumers, `app-sidebar.tsx` and `matches/page.tsx`, and neither renders the
glyph itself.

### 3 — "Coming soon" in the rail tooltip

**Type.** In `nav.ts`:

```ts
export type NavLink = {
  name: string;
  href: string;
  icon: …;
  /** Route exists in nav before it exists in full — the page renders
   *  `ComingSoonPage`. Surfaces in the collapsed rail's tooltip and in the
   *  row's `aria-label`; the expanded label stays clean. */
  comingSoon?: true;
};
```

Set on the four entries whose pages render `ComingSoonPage` today:
`PERSONAL_NAV` Statistics + Ask, `TEAM_NAV` Statistics + Ask. **Opponents is
excluded** — see Open questions; it renders `ComingSoonPage` but its nav
treatment is deliberate and the call is the human's.

**Rendering.** `RailItem` gains `comingSoon?: boolean` and:

- passes `detail={comingSoon ? "Coming soon" : undefined}` to `RailTooltip`
  (the second-line slot the primitive already has: 11px white at 64%; the
  tooltip also switches to `align="start"` on its own when `detail` is set);
- widens its `aria-label` to `` `${label}, coming soon` `` when the flag is on,
  at **both** widths. This is the accessibility half of the DS's "nothing
  essential lives only in a tooltip": the marker is never visible in the
  expanded panel, so the name has to carry it for anyone not hovering.

`AppSidebar` passes `comingSoon={link.comingSoon}` in the `mainLinks` map. No
change to `ChromeTooltip`, `RailTooltip`, tooltip timing, offsets, or the rail's
64px width — nothing here is laid out inside the row.

### 4 — sign-out moves to Settings → Account

**Remove.** In `app-sidebar.tsx`: delete the `expanded && <button>` sign-out
from `ViewerFooter`, its `onSignOut` prop, the `requestLogout` call, and the
now-unused `LogOut` and `useRequestLogout` imports. `ViewerFooter` becomes a
single `Link` to `/dashboard/settings/profile` and takes only `expanded`; its
doc comment ("Sign-out and the workspace sub-label are the only things dropped
on collapse") is now false and must be rewritten, not left.

`LogoutProvider` stays exactly as it is — the header profile menu
(`src/app/dashboard/header.tsx:565`) still calls `useRequestLogout()`, so the
context has a consumer and the confirmation dialog is untouched.

**Add.** `src/app/dashboard/settings/account/page.tsx`, section **02 · Where
you're signed in** — the section that already exists for exactly this, holding
"Sign out everywhere". It becomes two rows in one bordered group:

| row | copy | action |
|---|---|---|
| This device | "Ends this session only. Other devices stay signed in." | `Sign out` (`SettingsButton variant="outline" size="sm"`) |
| All devices | existing copy: "Signing out everywhere ends every other session too — phones included." | `Sign out everywhere` (unchanged) |

The new row's handler is `useRequestLogout()` — the same confirmation dialog
the header uses, which is how the brief's "keeps its confirmation step" is met
without a second dialog. `LogoutProvider` wraps the dashboard layout, so the
hook is available on this page.

Existing rows use `Monitor` for the device row; the new pair keeps `Monitor` on
"This device" and gives the global row `MonitorSmartphone`. The section's
current markup is a single `flex` row with `border-y`; it becomes a `flex-col`
of two rows sharing the `FactRow`-style hairline rhythm already defined lower
in the file. Reuse `FactRow` if it fits; do not invent a third row shape.

**Reachability.** Sidebar → Settings → Account is two clicks, and the header
profile menu keeps its one-click sign-out, so the brief's constraint holds.

### 5 — switcher opens focused on the current workspace

In `WorkspaceRow`'s `PopoverContent`:

- keep a `Map<string, HTMLButtonElement>` in a ref, populated by each row
  button's `ref` callback;
- `onOpenAutoFocus={(e) => { e.preventDefault(); activeRef?.focus(); }}` —
  Radix otherwise focuses the first focusable child. Programmatic `.focus()`
  inherits the browser's modality heuristic, so a keyboard-opened menu shows
  the blue ring and a mouse-opened one does not, which is the wanted behaviour
  and needs no extra state;
- `onKeyDown` on the content: `ArrowDown`/`ArrowUp` move focus to the next/prev
  row button (clamped, not wrapping — a 2–3 item list that wraps reads as
  broken), `preventDefault()` so the popover does not scroll. Home/End are not
  worth it at this list length.

**Write no focus classes.** `src/styles/design-system/focus.css` already rings
every `<button>` with `--focus-ring` on `:focus-visible`; a
`focus-visible:ring-*` utility here would be silently discarded. The rows'
existing `focus-visible:bg-[var(--surface-subtle)]` wash stays for non-active
rows; the active row keeps its bare treatment plus the ring, which is enough —
it is the focused row *and* the checked one.

Escape-to-close, click-outside, and the `Create team workspace` link are Radix's
and stay untouched. Focus is not trapped beyond what `Popover` already does.

`WorkspaceOptionList` (header profile menu) is **not** changed — it is a list
inside an already-open menu, not a switcher that opens. Carried as an open
question.

### Data flow

None. Every change is presentational or local component state. No server
action, no Supabase read, no schema involvement — so no live-DB verification
was needed.

### Error handling

- Sign-out failure is already handled inside `LogoutProvider` (`hasError`
  state); the new call site inherits it and adds nothing.
- `onOpenAutoFocus` must no-op safely when the active row's ref is absent
  (first paint, or an `available` list that somehow lacks `active`): fall
  through to Radix's default rather than throwing.
- Arrow handling must ignore keys when `pendingId !== null`, since rows are
  disabled mid-switch and focusing a disabled button is a dead end.

### Testing

- **`npm run lint`** catches the unused-import half of items 1, 2 and 4, which
  is most of the mechanical risk.
- **New spec, `tests/nav-icons.spec.ts`** (node-style, matching the existing
  `tests/*.spec.ts` register): assert `PERSONAL_NAV`/`TEAM_NAV` Statistics
  carries `ChartLine`, Roster carries `UsersRound`, and that exactly the
  intended entries carry `comingSoon`. This is the one thing that can silently
  regress — it is data, and data is cheap to assert.
- **`npm run map`** is not needed: no route added.
- **Manual, via the unauthenticated preview harness** (see
  `reference_unauth_preview_harness`): collapsed-rail tooltip on Statistics
  shows the second line; expanded label unchanged; sidebar has no sign-out;
  Settings → Account §02 shows two rows and the confirm dialog opens; opening
  the switcher with Enter puts a visible ring on the current workspace and ↑/↓
  moves. Delete the harness route before `npm test`.
- **`npm test`** last, to confirm nothing else regressed.

---

## Open questions

1. **Opponents.** `/dashboard/opponents` renders `ComingSoonPage` today, but
   `nav.ts`'s own comment treats the entry as a considered placement rather than
   a stub. This design leaves it unmarked; say so if it should be marked.
2. **Header profile menu's workspace list.** Left unchanged. If the current
   workspace should also be focus-marked there, it is a separate small change
   to `WorkspaceOptionList` and belongs in this branch or none.
3. **Copy of the new Account row.** "Sign out" / "Ends this session only. Other
   devices stay signed in." — proposed, not sacred. The section heading "Where
   you're signed in" now leads a group where the first row is an action rather
   than a fact; if that reads wrong, the alternative is a fourth section
   (`04 · Sign out`) and a renumber.

## Also consulted

Beyond the declared inputs, read to verify specific facts:

- `src/lib/dashboard/nav.ts` — current icons, link sets, `NavLink` type
- `src/components/dashboard/app-sidebar.tsx` — `ViewerFooter`, sign-out call site
- `src/components/dashboard/sidebar/rail-item.tsx`, `rail-tooltip.tsx` — the
  existing `detail` second-line slot
- `src/components/dashboard/sidebar/workspace-row.tsx` — the Popover switcher
- `src/components/dashboard/workspace-switcher.tsx` — the header's second list
- `src/components/dashboard/logout-dialog.tsx` — `LogoutProvider`, confirmation
- `src/app/dashboard/settings/account/page.tsx` — section 02, `FactRow`
- `src/app/dashboard/header.tsx` (line 565) — the other `useRequestLogout()`
  consumer
- `src/components/dashboard/coming-soon.tsx` and the five routes rendering it
- `package.json` + a `lucide-react` export check — `ChartLine`, `UsersRound`
- `tests/` listing — existing spec register
