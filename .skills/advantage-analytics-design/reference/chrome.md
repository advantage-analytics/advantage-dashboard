# Navigation Chrome, Dialog, Dropdown/Menu, and the Glyph Registry

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

## Navigation Patterns

### Icon Rail Sidebar (v3)

Two committed widths only — `--rail-width` (64px) ⇄ `--panel-width` (232px) —
moved by a toggle row (`⌘\`), **never a hover peek**: charts must not resize
under a reading cursor. `--rail-icon-col` (40px) holds a fixed column at
_both_ widths, so only the edge travels; labels fade in behind it (out 80ms,
then the edge moves after an 80ms delay, in 120ms) so text never clips
mid-word. Persisted per device; auto-collapses below 1280px without
overwriting the saved preference. Rows are `--rail-row` (40px).

```
h-[var(--rail-row)] rounded-lg text-[13px] whitespace-nowrap
// Resting / hover:
text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5]
transition-colors duration-200
// Active — surface-subtle wash + ink-900 glyph/label, NO stripe, NO blue.
// Blue is reserved for actions; being where you already are is not one.
bg-[var(--surface-subtle)] text-[var(--ink-900)]
```

`rail-item.tsx` is the live implementation of this rule — it predates this
doc entry, so treat any other "active = blue" pattern elsewhere in the repo
as drift to fix, not a second valid style. The workspace-switcher menu's
_current_ row is bare — no wash, no hover — marked only by a blue check
(per the v3 `SidebarNav` bundle, which retired the earlier blue-soft wash
there; the check is the one chroma the sidebar spends). Tabs are unaffected — they keep the 2px
blue underline (`layoutId="activeTab"`): a tab is a choice, a nav row is a
location.

**Workspace row** heads the rail and doubles as the switcher: 26px mark
(initials on a 6px-radius square — blue fill for personal, ink-900 for team),
sub-label flips to "Switch workspace" on hover. Team workspaces swap the nav
list entirely (Team Home · Roster · Compare — no team "Matches" until that
page scopes itself). The collapsed rail shows the workspace mark, not the
logo. Entities are squares, people are circles: workspace, program and engine
marks sit on 6px-radius squares; the `Avatar` is the one circle.

### Dark Tooltip (v3)

The load-bearing primitive for icon-only chrome — every icon-only control
must answer hover with one, plus a matching `aria-label`.

```
bg-[var(--ink-900)] text-white rounded-xl shadow-[var(--shadow-dropdown)]
// No caret. 400ms reveal (the system's one deliberate-reveal duration —
// instant re-show within the same cluster once open), 6px offset.
label: 12px/500 white
detail (optional 2nd line): 11px, white at 64% opacity
shortcut (optional, mono): the keybinding, e.g. "⌘K"
```

Replaces v2's white floating box — v2's `label`+`content` API becomes
`label`+`detail`. At 64px the icons ARE the interface, not a puzzle; the
tooltip is how a collapsed rail keeps every label without keeping the space.

**Icon-first, three rules:** every icon-only control has an `aria-label` and
a dark `Tooltip`; glyphs sit in fixed square hit targets (28 / 32 / 40px) so
nothing shifts when labels come and go; the label is never gone — collapsed,
it moves into the tooltip. `SidebarNav`, `ActivityTray`, `DataTable`'s row
actions and `EngineChip` ship the treatment built in: import the primitive,
never redraw the dark box, never double-wrap those. `side`: top (default) ·
bottom (header chrome) · right (rail rows). It names; it doesn't explain
paragraphs — stat definitions may use `label` + `detail`, and nothing
essential lives only in a tooltip.

**The dark `Tooltip` is the product's only tooltip.** It names a **control**
whose label is not on screen — icon-only chrome, and nothing else. Never
wrap a text link in one: it would sit inches from real ones on icon buttons
and turn the pattern into decoration.

**A native `title` is not a design element and mostly should not be there.**
The browser draws it in the OS's own style — a pale box on one machine, a
dark rounded one on the next — so it lands on a considered page as a foreign
object, and it does not exist at all on touch. Never use it to say what a
control does; a link's destination is carried by the link (ink → blue). For
clipped text, **remove the clipping instead of explaining it**: a name in a
340px drawer wraps to two lines, and the panel scrolls anyway. Where the
frame genuinely cannot give the height — a 52px table row — let it truncate
bare: CSS truncation hides nothing from a screen reader, the text stays in
the DOM and is read in full, and the record's own drawer is one click away
with the name entire. That leaves `title` for the case with no such route,
where the clipped string is the only copy on screen and nothing can open it
— a raw email on an invite row is the shipped example.

### Activity Tray (v3)

Header icon (Lucide `activity`, 15px ink-700 in a 28px radius-8 square) + 6px
Signal-Blue dot at top 3px / right 3px — presence, not arithmetic: **no numeric badges anywhere in the chrome**, the
count lives only in the tooltip ("2 in flight") and matching `aria-label`.
Opens a 360px "Activity" panel on the popover primitive's own 14px hairline
surface, named for the trigger that opens it. One job: what is happening and
what is waiting on you. Rows: invitations (Accept as a two-step text action,
plus Details), in-flight work (3px progress track, live sheen only while
something is actually running, no ETA line — the bar is the estimate),
failures (loss-red circle-x, bordered "Start over" — `analysisAction`'s
word; there is no retry). Settled successes are not rows; the footer
"Everything that finished" opens the matches list. A grey workspace chip in
the header (`WorkspaceScopeChip`, shared with the search palette) names the
scope; a tail row per other workspace says "N uploads running in X" behind a
hairline. The 14px leading column carries state, never air. Trigger: solid
dot = something here is moving or waiting; hollow ring = only elsewhere;
nothing = quiet. No "mark all read" — the mark clears itself.
Empty state: "Nothing running here."

### Header (v3)

```
sticky top-0 z-30 h-[var(--header-h)] px-6 bg-white
border-b transition-colors duration-200
// Default: border-transparent
// Scrolled: border-[#EBEBEB]
```

Right cluster (gap 6): breadcrumbs · page-status slot (11px ink-400, leads
the cluster when a page has something to say, e.g. "Draft saved") · search ·
activity · divider (1×14, `--border-medium`) · account.

**Search trigger drops its keycap.** Ghost control, 28px height, radius 8,
symmetric `0 8px` padding, 14px search icon (`--ink-500`) + "Search" 12px
(`--ink-600`). `⌘K` (`⌃K` on Windows) stays bound but shows only in the dark
tooltip — never as a visible keycap in the bar. A bare magnifier doesn't say
what it searches; naming it does.

**Account**: 26px initials avatar (the chrome's one circle — icon buttons
elsewhere are 8px-radius squares) + 12px chevron rotating 180° on open, pill
hover wash, 288px menu on the popover primitive's own 14px hairline surface
(`MENU_ROW_CLASS`, 9px rhythm). The profile menu carries quiet role/plan capsules
(grey — neither is an action) and the workspace list again.

**On Home the breadcrumb slot carries the greeting:** "Good morning, Jordan"
12/500 + `text-micro` "Personal · Monday, Aug 24" — so the body can open on a
number (Layout Patterns → Title Slot). _Shipped:_ `dashboard/header-greeting.tsx`,
on `/dashboard` in a personal workspace only; the body's greeting h1 is gone.

**One search per screen:** the header owns `⌘K`; a list page never adds a
second search box. Keyboard map: `⌘K` search (the header's one binding) ·
`⌘\` rail collapse (the sidebar's) · `⌘U` upload · `⌘S` save settings. Keep
the `isMac` detection — it feeds the tooltip string, not a keycap.

**Workspace title** (v3) — the header's leading slot on
workspace-level pages: school 12px/500 ink-900 + sport `text-micro`,
baseline-aligned, 8px gap, no dash/dot/divider ("Meridian State · Men's
tennis" is wrong — no separator at all). Used when the leading slot IS the
workspace itself (Team Home, empty states); flow pages keep breadcrumbs
instead — never both on the same page.

### Breadcrumb

```
text-[11px] font-normal
// Inactive: text-[#888888] hover:text-[#525252]
// Active: text-[#0D0D0D]
// Separator: ChevronRight text-[#CCCCCC]
```

The breadcrumb is the return path from a record page: back from a report
restores the list it came from, with its drawer still open **(v3)**.

---

## Dialog (v3)

```
w-[440px]           // forms — w-[520px] for compare dialogs
rounded-[14px] shadow-[var(--shadow-dropdown)]
bg-[rgba(13,13,13,0.4)]   // scrim
top-anchored ~96px
padding: 24px 24px 20px, 18px gaps between fields
title: 16px/500 + one-line 12px ink-600 contract sentence below it
close: 28px (h-7 w-7 modal-chrome pattern, see **Chrome Icon Button**, `reference/components.md`)
```

Footer grammar: quiet blue text action left (`footerLeft`, optional) ·
Cancel + **one** primary right — never two primaries. Fields inside use the
underline vocabulary; the active field's rule thickens to 2px blue (see
Focus → "The underline opt-out").

---

## Dropdown / Menu

**Primitives, not a class recipe** (2026-09-07, in-repo): every dropdown is
built from `ui/float-menu.tsx` — `FloatMenu` (the surface, anchored to the
trigger it wraps, 10px radius, 5px inset, `--shadow-dropdown`),
`FloatMenuItem` (a 7px-radius row: 12px label, optional 11px `--ink-500`
second line saying what the choice means, `--surface-subtle` on hover and on
the chosen row, a 12px Signal Blue check — the one colour that means
"chosen"), `FloatMenuNote` (the closing sentence under a hairline for the
thing the menu will not do) and `FloatMenuDivider`. **Every select is
`MenuSelect`** (`ui/menu-select.tsx`), composed from those with two triggers:
`underline` for a form field (full width, the caption's hairline, no radius)
and `pill` for the control beside a `SettingsCardRow` label (30px, bordered);
both turn their edge blue while open, and the menu matches the trigger's
width under a field.

**No native `<select>` in product UI.** It cannot carry a second line per
option, its popup is the browser's not ours, and drawn as an underline on a
6px-radius box its rule curled at both ends — the bug that retired
`SettingsInlineSelect`. Give an option its second line when the label alone
would not tell a coach what they are choosing ("Staff", "Owner and coaches"),
and leave it off when it would ("Clay").

The header's account menu predates the primitives and still carries its own
classes; migrate it to `FloatMenu` rather than copying them.

**EntitySelect (v3)** — the "For" field, picking a person or someone new.
Float menu radius 12, 6px padding; rows 38px (radius 8, hover surface-subtle,
selected keeps the wash + a 13px `--blue` check — Signal Blue is the one
colour that means "chosen", in menus and cards alike; the earlier ink-900
menu check is superseded). Person row = 22px avatar +
12/500 name + 11px ink-500 middot-joined meta. "Someone new" is always first,
above a hairline, dashed-ring avatar. Section labels are quiet sentence case
(11px ink-400) — no uppercase eyebrows inside menus, no nested menus.

---

### Glyph Registry (v3)

From `nav.ts` + chrome. StrokeWidth 1.5 everywhere except the row-menu
trigger's `MoreHorizontal` (1.75, the one exception).

| Glyph                                                                                                                                                                 | Use                                                                                                                                                                             | Size                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `Home`, `Video`, `Calendar`, `BarChart3`, `MessageSquare`, `Users`, `Swords`, `Settings`, `HelpCircle`                                                                | Nav — Home / Matches (both workspaces) / Schedule / Statistics / Ask / Roster / Compare / Settings / Help                                                                       | 16px (`size-4`)                         |
| `PanelLeftClose`/`PanelLeftOpen`, `ChevronsUpDown`, `Activity`, `Search`, `ChevronDown`/`ChevronRight`/`ChevronLeft`, `ArrowUpRight`, `Check`, `Plus`, `X`, `Loader2` | Chrome — rail toggle, workspace switcher, tray, search, menus, drawer stepping and close; `ArrowUpRight` = "open as page" in a drawer header                                    | 15px header, 14px inline, 12px chevrons |
| `Check`                                                                                                                                                               | Also `TermMark` — the row mark in the join sharing terms and the guardian acknowledgments. Blue where something is gained, ink where nothing moves, never blue above a checkbox | 14px, stroke 1.5                        |
| `MoreHorizontal`, `Pencil`, `Trash2`, `Upload`                                                                                                                        | Row and drawer actions                                                                                                                                                          | 14px / 1.75 stroke on `MoreHorizontal`  |
| `SlidersHorizontal`, `Timer`, `CircleHelp`, `LogOut`                                                                                                                  | Profile menu — Preferences / Usage / Help / Sign out                                                                                                                            | 13px                                    |
| `CircleCheck`, `CircleX`                                                                                                                                              | `ResultMark` — match outcome ONLY, never repurposed for analysis lifecycle (that's `StatusChip`'s dot + text)                                                                   | 14px                                    |
| `Calendar`, `MapPin`, `Swords`, `Film`, `Target`                                                                                                                      | Fixture/event metadata (`Target` = practice; the crosshair icon it replaced is retired)                                                                                         | 13px, `--ink-400`                       |

`Video` covers Matches in **both** workspaces; `Calendar` belongs only to the
fixtures list (Schedule/Events) — the two must not swap.
