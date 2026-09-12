---
name: advantage-analytics-design
description: The authoritative design system for the Advantage Analytics dashboard — tokens, primitives and the rules that outrank taste. Use before writing or reviewing ANY UI in this repo: pages, tables, dialogs, menus, forms, wizards, settings, empty and loading states, the icon rail and header chrome. Also use when choosing a colour, type size, spacing, radius, shadow, easing, icon or focus treatment, when deciding whether to wrap Radix or hand-build a primitive, or when checking whether shipped code drifted from spec. Carries the banned-pattern list, the v3 table laws and the row-click/peek-drawer law. Not for backend, data-layer or non-UI work.
---

# Advantage Analytics Design System

The canonical source of truth for all UI across the app. This file is
deliberately short — read it in full, then load only the `reference/` file
your surface needs from the routing table below. Never grep a `reference/`
file in isolation: this file carries the Banned list and the precedence rule
that decides which of two conflicting patterns wins.

> **v2 note.** A formalized version of this system exists as the Claude Design
> project _Advantage Design System v2_, rebuilt from this codebase. Its tokens
> are imported at [`src/styles/design-system/`](../../src/styles/design-system/)
> and its full documentation is [`DESIGN.md`](../../DESIGN.md).
>
> This skill remains accurate and is the practical reference. What v2 changed:
> **dark mode now exists** (v1 was light-only), **Roboto Mono** joins Inter for
> machine values, the ad-hoc grays became a numbered `--ink-900…100` ramp,
> eyebrows lost their rules (whitespace separates instead), violet was retired
> from player attribution in favour of cool slate, and `StatusChip` was added
> for the Advantage Intelligence job lifecycle. Both corrections are inline
> below. Where the two disagree on anything else, `DESIGN.md` is newer.

> **v3 note.** Claude Design project _Advantage Design System v3_
> (`abcb65f6-4e66-44bc-b9de-b3b47f4313c1`) reverse-documents the icon-first
> chrome that shipped after v2 — collapsible icon-rail sidebar, dark tooltips,
> the activity tray, workspace switcher — plus locked rules for future work:
> the table laws, the row-click law and peek drawer, the list-page shape, the
> upload-wizard anatomy, and 15 primitives v2 did not have. **It changes no
> existing token value**; the only token additions are five chrome-dimension
> tokens (`--rail-width`, `--panel-width`, `--rail-row`, `--rail-icon-col`,
> `--header-h`, in [`spacing.css`](../../src/styles/design-system/spacing.css)).
> v3 ships 36 primitives against v2's 21: `DataTable`, `Score`, `Delta`,
> `ResultMark`, `InsightCard`+`EngineChip`, `Notice`, `Avatar`+`StatePill`,
> `Radio`, `EntitySelect`, `ActivityTray`, `SlotLine`, `ScoreGrid`, `FieldRow`,
> `StepBar`, `InlineFacts`. Two more were added in-repo on 2026-09-07 and are
> not in the project yet: `FloatMenu` and `MenuSelect` (`ui/float-menu.tsx`,
> `ui/menu-select.tsx`) — see [Dropdown / Menu](reference/chrome.md).
>
> In the project, `readme.md` is the current-state rulebook and `CHANGELOG.md`
> the decision trail (the v2→v3 diff, then Rounds 10–20 and a platform audit;
> last read 2026-09-04). Round numbers are that changelog's own sequence and
> live only there — this skill cites v3 rules marked **(v3)** without them.
>
> **Precedence.** Where a v3 rule contradicts a pattern printed anywhere in
> this skill — this file _or_ any file under `reference/` — **v3 wins**, and
> the contradicted pattern has been corrected in place, not left standing. A
> rule in a `reference/` file is not weaker authority than one here: this file
> is the shorter surface, not the higher one. Where this skill and
> `DESIGN.md` disagree on anything v3 did not touch, `DESIGN.md` is newer.
> The supersessions so far: nav active is a neutral wash; the Matches column
> order is Date-first; container rows (events, players) peek in a drawer and
> carry no chevron; "New" is the one blue-tinted state pill; status pills
> carry no counts; the page title is the first thing in the scroll body with
> no eyebrow above it; the selected-row check is Signal Blue site-wide. "New"
> is joined by exactly one further blue-tinted pill — `You` — ruled on in
> [Settings Pages](reference/settings.md); nothing else may take a third.
> Where the shipped code still draws the old pattern, the owning section says
> so under _Shipped:_ — that is drift to migrate, not a second style.
>
> **Supersession notes** quote the retired rule verbatim —
> `_Supersedes (v3): "<the old rule, in full>"._` — and never say "see above".
> A reader who lands in one `reference/` file with nothing else loaded must
> still be able to tell what it replaced.
>
> **Re-syncing.** When applying a new round from the v3 project's
> `CHANGELOG.md`: find the owning file in the routing table below, then
> `grep -rn` the whole `.skills/advantage-analytics-design/` directory for the
> pattern before writing — never assume the file you opened is the only place
> a rule is printed. If a round's rule genuinely spans two files, the rule
> goes in the file that owns the topic and the other file gets a one-line
> pointer, never a second copy. It never changes a token value.

---

## Reading this skill

Read this file, then the one or two `reference/` files your surface needs:

| File                                                               | Load it for                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`reference/foundations.md`](reference/foundations.md)             | Any raw value — type, colour, spacing, radius, shadow, motion — plus the page-layout skeletons that consume them. The one reference nearly every UI task loads.     |
| [`reference/components.md`](reference/components.md)               | Card, section label, the button variant set, Chrome Icon Button, list rows, `ResultMark`, `FormPills`, tooltips, `Kbd`, `DateField` — generic component vocabulary. |
| [`reference/empty-and-loading.md`](reference/empty-and-loading.md) | Loading Skeleton and Empty State — first-run and zero-state work.                                                                                                   |
| [`reference/chrome.md`](reference/chrome.md)                       | Icon rail, dark tooltip, activity tray, header, breadcrumb, Dialog (v3), Dropdown/Menu, and the icon Glyph Registry.                                                |
| [`reference/tables.md`](reference/tables.md)                       | The Data Table laws (v3), peek drawer, roster row, reorder mode — any list or table page.                                                                           |
| [`reference/primitives.md`](reference/primitives.md)               | Events & Matches vocabulary, the v3 primitive set, wizard and task primitives.                                                                                      |
| [`reference/home-recipes.md`](reference/home-recipes.md)           | Personal Home page recipes.                                                                                                                                         |
| [`reference/settings.md`](reference/settings.md)                   | Settings pages, including the `You`-pill ruling.                                                                                                                    |
| [`reference/focus.md`](reference/focus.md)                         | The focus-ring rulebook — building any interactive control.                                                                                                         |

---

## Brand & Users

**Users**: Competitive tennis players — college athletes, serious club players, coaches, parents tracking juniors. Not casual players. They want confidence in their data.

**Personality**: Modern. Athletic. Innovative.

**Feel**: Premium and exclusive — built for high-level players trying to improve, not a mass-market consumer app. Think pro-level training room, not "for everyone and their grandma."

**Theme**: Light is the default and the product's primary face. Cool-neutral palette (grays + blue). No warm tones, browns, or earthy colors. **A dark scope now exists** — v2 ships a full `.dark` token ramp (WCAG-AA verified on `#0E0E10`) in `src/styles/design-system/colors.css`. It is opt-in per surface, not a mode the app ships in yet: most components still carry hardcoded light hexes.

**Accessibility**: WCAG 2.1 AA — 4.5:1 contrast (normal text), 3:1 (large text).

## Design Principles

1. **Data speaks first** — Layouts prioritize legibility of match data. No ornamental elements competing with numbers.
2. **Earned trust through precision** — Aligned tabular numbers, consistent spacing, exact token usage. Players trust tools that feel meticulously crafted.
3. **Quiet confidence** — Light font weights, subtle borders, restrained color. Confidence through clarity, not volume.
4. **Pro-level exclusivity** — Design for the player who knows what second-serve percentage means. Density is acceptable when it serves understanding.
5. **One accent, one purpose** — Blue (#3B82F6) = action/emphasis. Green (#5DB955) = winning/positive. Red (#E51837) = losing/negative. No other semantic colors. No decoration colors.
6. **The dashboard is white; separation comes from the hairline, not the ground** (ratified Sep 2026, supersedes v3's grey/white split) — every dashboard surface is `--surface-card`: Home, Matches, Roster, Schedule, Team Home, the report and its rail, the wizard, the chrome. A card is told from the page by its `--border-card` hairline and `--shadow-card`, never by a tint underneath it. `--surface-page` keeps the surfaces outside the dashboard — auth, admin, the claim flow — plus inset wells inside a card (a drop zone, a notice). _The retired rule read "grey is a page you scan, white is chrome or a task you're inside"; the product went all-white by decision and the rule stayed on the page describing something that had not been true for months. Ratifying it costs the tint as a grouping device, which is why the hairline is now load-bearing: a borderless card on a white page is invisible._ Cards never nest.

**Banned**: Bounce/elastic animations, glassmorphism, neon accents, gradient-heavy surfaces, playful illustrations, gamification badges, warm/earthy tones, non-Inter fonts, non-Lucide icons. **(v3)** Colored left-border stripes, nested cards, font weights 800+, hover-peek panels of any kind (the rail toggles and the drawer opens on click — nothing expands under a crossing cursor), bare unlabeled icon buttons (every icon-only control needs an `aria-label` **and** a dark tooltip), invented ETAs or fake progress, numeric badges anywhere in the chrome, center-aligned table cells, tinted/bannered result cells, the outcome as a word (`Badge` "Won"/"Lost" is retired — see **Data Table rule 2**, `reference/tables.md`), type swatches (an event's type is a word; its mark is the program's or the tournament's), accumulating filter chips (a filter cut reads as one sentence in a strip — a fixed 3–4-view status-pill row is a view switcher and is allowed), a second search on any screen.

---

## Choosing how to build a component

### Building a primitive — wrap Radix, wrap native, or hand-build

Decide by **where the difficulty is**, not by what a library offers.

| The hard part is…                                                 | Do this                           | Shipped examples                              |
| ----------------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| **Behavior** — portals, focus traps, dismissal, positioning, ARIA | Wrap Radix, style it in DS tokens | `Popover`, `Tooltip`, `Dialog`, `AlertDialog` |
| **Platform** — the OS already does it better                      | Wrap the **native** control       | `AdvSelect` (native `<select>`)               |
| **Appearance** — geometry the DS specifies exactly                | Hand-build                        | `AdvSwitch`, `advButton()`, `Card`            |

**Never adopt shadcn's styling layer.** Radix is unstyled behavior and earns
its place; shadcn's styled components are a _second design system_ — its own
palette, radii and geometry — and it loses every time it meets this one. That
is not a prediction, it is the record: `Select`, `Tabs`, `Switch` and `Checkbox`
were all installed, all abandoned, and all replaced by hand-built equivalents,
because the primitive hard-codes internals you cannot reach from the outside.
`AdvSwitch`'s docstring names the moment — shadcn's `Switch` is 32×18.4 where
the DS says 36×20, with the thumb fixed inside the primitive.

The colour half of that layer caused a quieter failure: it resolved through
oklch CSS variables, so no hex ever appeared in the source and no colour review
could see it. `Tooltip` painted `bg-primary` — **black** — where this document
specifies `--ink-900`, and shadcn's `Button` shipped a black primary against
`advButton()`'s Signal Blue. Both were removed;
`scripts/check-design-drift.mjs` check 4 now fails if any shadcn utility class
returns.

**One question settles it:** would you be fighting the primitive to match this
document? Then hand-build. A card is pure appearance with no behavior, so it is
hand-built — which is why the shadcn `Card` sat unused for the life of the repo.

The rest of the component catalog lives in [`reference/components.md`](reference/components.md).

---

## Interaction States

### Hover

- Text: blue words `hover:text-[#2563EB]` (`--blue-hover`, from a `--blue` rest — see **Text Colors**, `reference/foundations.md`); ink text `hover:text-[#525252]` or `hover:text-[#0D0D0D]`. A blue word never hovers to ink.
- Background: `hover:bg-[#F5F5F5]` or `hover:bg-[#FAFAFA]` — washes and text darkening only; never underlines, never inversions
- Row actions and menus reveal on hover / `focus-within`, 200ms opacity **(v3)**
- Duration: `duration-200`

### Active / Press

- `active:scale-[0.97]` (buttons) or `active:scale-[0.998]` (rows)
- `active:bg-[#EBEBEB]`

### Focus

The full focus-ring rulebook, including the wrapper-ring pattern and the
underline opt-out, is [`reference/focus.md`](reference/focus.md).

### Disabled

- Background: `bg-[#F7F7F7]`
- Text: `text-[#888888]`

**A primary that commits a draft stays disabled until committing would change
something**, and the database is not the reason. An enabled primary is the
page's promise that there is something to save, and a page making that
promise from the moment a mode opens teaches people to ignore the button; and
a no-op commit still writes an audit row for an edit nobody made, so the
trail grows phantom entries. Measure against the **saved record, field by
field**, never draft against draft: a draft that normalises a malformed
record (two players parked on one line, a gap in the numbering) IS a change
though nothing was dragged, and a row dragged away and back is not. Keep that
arithmetic in a pure module so a test can hold it. _Shipped:_
`lib/data/lineup-draft.ts` → `lineupChanged`, gating Save lineup.

---

## Accessibility

- `aria-label` on all interactive elements
- `aria-hidden="true"` on decorative icons
- `tabIndex={0}` + `onKeyDown` (Enter/Space) on custom interactive elements
- Semantic roles: `role="grid"` (heatmap), `role="menu"` (dropdowns), `role="alert"` (errors), `role="status"` (processing)
- Focus management with refs
- Respect `prefers-reduced-motion`

---

## Icons

**Lucide React only**. Standard props:

```tsx
<Icon className="size-3.5 text-[#8A8A8E]" strokeWidth={1.5} />
```

Sizes **(v3)**: 16px rail nav (`size-4`) · 15px header chrome · 14px
inline/actions (`size-3.5`) · 13px menu items and metadata glyphs (ink-400) ·
12px chevrons (`size-3`) · 28–32px empty states (`size-8`).

The full icon Glyph Registry is in [`reference/chrome.md`](reference/chrome.md).
