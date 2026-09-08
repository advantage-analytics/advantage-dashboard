# Advantage Analytics Design System

The canonical source of truth for all UI across the app. Read this before building any interface.

> **v2 note.** A formalized version of this system exists as the Claude Design
> project *Advantage Design System v2*, rebuilt from this codebase. Its tokens
> are imported at [`src/styles/design-system/`](../../src/styles/design-system/)
> and its full documentation is [`DESIGN.md`](../../DESIGN.md).
>
> This file remains accurate and is the practical reference. What v2 changed:
> **dark mode now exists** (v1 was light-only), **Roboto Mono** joins Inter for
> machine values, the ad-hoc grays became a numbered `--ink-900…100` ramp,
> eyebrows lost their rules (whitespace separates instead), violet was retired
> from player attribution in favour of cool slate, and `StatusChip` was added
> for the Advantage Intelligence job lifecycle. Both corrections are inline
> below. Where the two disagree on anything else, `DESIGN.md` is newer.

> **v3 note.** Claude Design project *Advantage Design System v3*
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
> `ui/menu-select.tsx`) — see *Dropdown / Menu*.
>
> In the project, `readme.md` is the current-state rulebook and `CHANGELOG.md`
> the decision trail (the v2→v3 diff, then Rounds 10–20 and a platform audit;
> last read 2026-09-04). Round numbers are that changelog's own sequence and
> live only there — this file cites v3 rules marked **(v3)** without them.
> Where a v3 rule contradicts a pattern printed elsewhere in this file, **v3
> wins** and the contradicted pattern has been corrected in place, not left
> standing. The supersessions so far: nav active is a neutral wash; the
> Matches column order is Date-first; container rows (events, players) peek in
> a drawer and carry no chevron; "New" is the one blue-tinted state pill;
> status pills carry no counts; the page title is the first thing in the
> scroll body with no eyebrow above it; the selected-row check is Signal Blue
> site-wide. "New" is joined by exactly one further blue-tinted pill — `You` —
> ruled on in *Settings Pages* below; nothing else may take a third. Where the shipped code still draws the old pattern, the section
> says so under *Shipped:* — that is drift to migrate, not a second style.

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
6. **The dashboard is white; separation comes from the hairline, not the ground** (ratified Sep 2026, supersedes v3's grey/white split) — every dashboard surface is `--surface-card`: Home, Matches, Roster, Schedule, Team Home, the report and its rail, the wizard, the chrome. A card is told from the page by its `--border-card` hairline and `--shadow-card`, never by a tint underneath it. `--surface-page` keeps the surfaces outside the dashboard — auth, admin, the claim flow — plus inset wells inside a card (a drop zone, a notice). *The retired rule read "grey is a page you scan, white is chrome or a task you're inside"; the product went all-white by decision and the rule stayed on the page describing something that had not been true for months. Ratifying it costs the tint as a grouping device, which is why the hairline is now load-bearing: a borderless card on a white page is invisible.* Cards never nest.

**Banned**: Bounce/elastic animations, glassmorphism, neon accents, gradient-heavy surfaces, playful illustrations, gamification badges, warm/earthy tones, non-Inter fonts, non-Lucide icons. **(v3)** Colored left-border stripes, nested cards, font weights 800+, hover-peek panels of any kind (the rail toggles and the drawer opens on click — nothing expands under a crossing cursor), bare unlabeled icon buttons (every icon-only control needs an `aria-label` **and** a dark tooltip), invented ETAs or fake progress, numeric badges anywhere in the chrome, center-aligned table cells, tinted/bannered result cells, the outcome as a word (`Badge` "Won"/"Lost" is retired — see Data Table rule 2), type swatches (an event's type is a word; its mark is the program's or the tournament's), accumulating filter chips (a filter cut reads as one sentence in a strip — a fixed 3–4-view status-pill row is a view switcher and is allowed), a second search on any screen.

---

## Typography

**Fonts**: Inter carries everything. Weights: 300 (light), 400 (normal), 500 (medium), 600 (semibold), 700 (bold — scores only). **Roboto Mono** (400–700) is the second face, for **machine values only** — timestamps, quota readouts, job ids. Never stats, never prose. Both load via `next/font`; the `font-mono` utility resolves to Roboto Mono.

### Type Scale

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| heading-xl | `text-[30px] font-light tracking-[-0.6px] leading-[36px]` | 300 | Page greeting/hero |
| heading-lg | `text-[28px] font-light tracking-[-0.5px]` | 300 | KPI values, large numbers |
| heading-md | `text-[16px] font-normal tracking-[-0.4px]` | 400 | Event/tournament names |
| body-lg | `text-[14px] font-normal` | 400 | Match opponent names, primary body |
| body | `text-[13px]` | 400 | Standard body text, nav items |
| body-sm | `text-[12px] font-normal` | 400 | Descriptions, activity messages |
| label-lg | `text-[11px] font-semibold` | 600 | Stat values, emphasis labels |
| label | `text-[10px] font-medium uppercase tracking-[2.5px]` | 500 | Section headers, card headers |
| label-sm | `text-[9px] font-normal` | 400 | Metadata labels |
| heading-score | `text-[40px] font-bold tracking-[-1px]` | 700 | Match result scores (match detail page) |
| heading-brand | `text-[56px] font-light tracking-[-1px] leading-[1.05]` | 300 | Brand panel hero heading (auth pages only) |
| caption | `text-[8px] font-medium` | 500 | Chart labels, minimal text |

### Line Heights

- `leading-[36px]` — Hero headings
- `leading-[24px]` — Subheadings
- `leading-[1.65]` — AI insight / long-form text
- `leading-[1.6]` — Empty state text
- `leading-[1.5]` — Activity messages
- `leading-[1.1]` — Stat values, tight numbers
- `leading-[1.05]` — Brand heading (auth only)
- `leading-none` — Compact inline text

### Letter Spacing

- `tracking-[-1px]` — Brand heading, large scores (tightest)
- `tracking-[-0.6px]` — Hero headings (tight)
- `tracking-[-0.5px]` — Large numbers
- `tracking-[-0.4px]` — Medium headings
- `tracking-[0.3px]` — Score text
- `tracking-[0.5px]` — Button text (CTA buttons)
- `tracking-[1px]` — Legend labels, compact uppercase
- `tracking-[1.5px]` — Button text (uppercase)
- `tracking-[1.6px]` — Performance rating labels
- `tracking-[2.5px]` — Section headers (uppercase)

### Number Styling

Use `tabular-nums` for all numeric data (stats, scores, percentages) to ensure alignment.

---

## Colors

### Text Colors

| Token | Value | Use |
|-------|-------|-----|
| text-primary | `text-[#0D0D0D]` | Headings, emphasis, primary content |
| text-primary-alt | `text-[#1D1D1F]` | Dialog titles |
| text-secondary | `text-[#525252]` | Descriptions, secondary content |
| text-tertiary | `text-[#71717A]` | Scores, metadata |
| text-muted | `text-[#888888]` | Placeholders, disabled text |
| text-label | `text-[#AAAAAA]` | Section labels, timestamps |
| text-disabled | `text-[#CCCCCC]` | Dividers, minimal text |
| text-accent | `text-[#3B82F6]` | Links, active nav, primary actions — the ONLY resting blue for a word |
| text-accent-hover | `text-[#2563EB]` | Hover state for accent text, and nothing else |
| text-success | `text-[#5DB955]` | Wins, positive changes |
| text-error | `text-[#E51837]` | Losses, negative changes |
| text-inverse | `text-white` | Text on dark backgrounds |
| text-muted-alt | `text-[#71717A]` | Tertiary metadata, match detail timestamps |
| text-muted-dim | `text-[#777777]` | KPI change labels |
| text-inverse-muted | `text-white/50` | Muted text on dark backgrounds |

> **A blue word rests on `--blue` and hovers to `--blue-hover`.** Same pair
> as a filled button, so a link and a button read as one accent. Never a
> darker blue at rest: `--blue-text` (#2563EB as a resting colour, added for
> WCAG AA at 11px) was retired on 2026-09-03 at the design owner's call —
> two blues side by side read as a second, off tone. It survives only as an
> alias of `--blue`; write `text-[var(--blue)]`. And never ink on hover: a
> blue word that turns black on hover stops being the accent the moment you
> reach for it. The pattern, in full:
>
> ```
> text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]
> ```
>
> Grey text that hovers to blue (filter chips) is a different thing and stays.

### Background Colors

| Token | Value | Use |
|-------|-------|-----|
| bg-surface | `bg-white` | Cards, panels, modals |
| bg-page | `bg-[#FAFAFA]` | Page background, subtle hover |
| bg-subtle | `bg-[#F5F5F5]` | Hover states, icon containers |
| bg-muted | `bg-[#F2F2F2]` | Empty heatmap cells |
| bg-skeleton | `bg-[#F0F0F0]` | Loading skeleton states |
| bg-field | `bg-[#F7F7F7]` | Disabled fields |
| bg-accent | `bg-[#3B82F6]` | Primary buttons, active indicators |
| bg-accent-hover | `bg-[#2563EB]` | Primary button hover |
| bg-accent-tint | `bg-[#EBF2FD]` | Active nav item background |
| bg-accent-soft | `bg-[#EFF4FF]` | Serve court background |
| bg-dark | `bg-[#0D0D0D]` | Dark surfaces (processing notification) |
| bg-success-tint | `bg-[rgba(115,230,104,0.15)]` | Win badge background |
| bg-error-tint | `bg-[rgba(229,24,55,0.15)]` | Loss badge background |
| bg-success-soft | `bg-[rgba(93,185,85,0.06)]` | Subtle win background tint |
| bg-error-soft | `bg-[rgba(229,24,55,0.06)]` | Subtle loss background tint |
| bg-accent-15 | `rgba(59,130,246,0.15)` | Blue tint backgrounds |

**Surfaces.** The dashboard is white end to end (`--surface-card`) — Design
Principles §6. What separates a card from the page it sits on is the
`--border-card` hairline plus `--shadow-card`, so **neither is optional**: drop
the border and the card stops existing. `--surface-page` is for the surfaces
outside the dashboard (auth, admin, claim) and for wells inset *within* a card
— a drop zone, a note strip — where it reads as recessed rather than as a
page. No imagery, textures or patterns; the only gradients are
the auth mesh and the sparkline's area fill (stroke colour 18%→0, chart-only).

### Border Colors

| Token | Value | Use |
|-------|-------|-----|
| border-subtle | `border-[#F3F3F3]` | Card borders, dividers |
| border-medium | `border-[#E5E5EA]` | Dropdown/modal borders |
| border-scroll | `border-[#EBEBEB]` | Header scroll indicator |
| border-field | `border-[#EAECF0]` | Button/input borders |

### Heatmap Gradient

- 0 matches: `bg-[#F2F2F2]`
- 1 match: `bg-[#B8D4F9]`
- 2 matches: `bg-[#6AABFF]`
- 3+ matches: `bg-[#3B82F6]`

### Court Visualization Colors

- Court fill: `#D6E4F9`
- First serve dot: `rgba(59,130,246,0.5)`
- Second serve dot: `rgba(129,140,248,0.5)` — **retired (v3).** Second
  serves wear `--viz-you-mid` (`#60A5FA`) everywhere, matching the you/opp
  role-based palette instead of a one-off violet. `statistics/serve-placement-stats.tsx`
  still carries the old value and needs the swap — not done as part of this
  token sync, tracked separately.

### Match Detail Colors

Match detail and video sections use additional colors for multi-player differentiation and status:

| Token | Value | Use |
|-------|-------|-----|
| player-2 | `#A855F7` | Secondary player/opponent color in charts (purple-500) |
| player-2-text | `#7E22CE` | Player 2 text on white or soft-purple bg (WCAG AA, purple-700) |
| player-2-soft | `#FAF5FF` | Player 2 soft pill/highlight background (purple-50) |
| player-1-text | `#1D4ED8` | Player 1 text on white or soft-blue bg (WCAG AA) |
| player-1-soft | `#EFF4FF` | Player 1 soft pill/highlight background |
| player-1-bar-tint | `#BFD5FB` | Player 1 non-leader bar fill (on `#F3F3F3` track) |
| player-2-bar-tint | `#DDC7F7` | Player 2 non-leader bar fill (on `#F3F3F3` track) |
| alt-success | `#22C55E` | Progress bar success (Tailwind green-500) |
| alt-error | `#EF4444` | Video/inline error states (Tailwind red-500) |
| alt-error-dark | `#DC2626` | Darker error emphasis (Tailwind red-600) |
| warning-bg | `#FFFBEB` | Warning banner background |
| warning-border | `#FDE68A` | Warning banner border |
| warning-text | `#92400E` | Warning banner text |

> The tokens retired violet from player attribution (v2 review decision C):
> `--player-2` is cool slate `#64748B` in `colors.css`, with `-text` `#475569`,
> `-soft` `#F1F5F9` and `-bar-tint` `#CBD5E1`. The purple values above are what
> `src/lib/design/player-colors.ts` and `visuals/court-visualization.tsx` still
> ship — drift to migrate surface by surface, not a second palette.

---

## Spacing

### Standard Gap Scale

| Gap | Value | Use |
|-----|-------|-----|
| `gap-0.5` | 2px | Tight inline spacing |
| `gap-1` | 4px | Minimal (inline elements) |
| `gap-1.5` | 6px | Small (icon + label) |
| `gap-2` | 8px | Small-medium |
| `gap-2.5` | 10px | Icon + text pairs |
| `gap-3` | 12px | Medium (list items) |
| `gap-4` | 16px | Medium-large |
| `gap-5` | 20px | Match row spacing |
| `gap-6` | 24px | Section spacing |
| `gap-8` | 32px | Major section spacing |

### Padding Patterns

- Card internal, **content card**: `p-5` (20px) — `--pad-card`
- Card internal, **table card**: `px-6` (24px) sides, `pt-0.5 pb-1.5` — not a
  free choice: rows pull back `-mx-4` (16px) for the hover wash, so 24px is
  exactly what leaves the designed 8px inset. At 20px the wash would sit 4px
  from the edge. Vertical stays tiny because the 52px row owns the rhythm and
  card chrome must not add a second one.
- Page container: `px-14 pt-5` (56px / 20px) — `--pad-page-x`
- Compact horizontal: `px-4`
- Medium horizontal: `px-6`
- List item vertical: `py-2.5` to `py-3`
- Button: `px-3 py-1.5`
- Card header: `h-14 px-5` or `px-6 py-4`
- Every full-viewport dashboard page pads `20px 56px`, the value all six locked Platform Audit frames draw; the sticky header sits *inside* it at 24px on purpose — full-bleed chrome, inset content. Reading-width pages (settings, help, the wizard) are capped by a max-width instead and do not use it. *(The v2 default `px-8 py-10` is retired: it was referenced by no file, and three pages had drifted to 28/32/40 against it.)*

### Chrome Dimensions (v3)

Sidebar and header sizes, tokenized in `spacing.css`. No layout-grid value
above changed — these are new, additive names for the icon-rail chrome.

| Token | Value | Use |
|---|---|---|
| `--rail-width` | 64px | Collapsed sidebar width |
| `--panel-width` | 232px | Expanded sidebar width |
| `--rail-row` | 40px | Sidebar row height, both widths |
| `--rail-icon-col` | 40px | Fixed icon column, both widths — only the edge travels on toggle |
| `--header-h` | 44px | Sticky header height |

---

## Border Radius

| Token | Value | Use |
|-------|-------|-----|
| radius-card | `rounded-[14px]` | Cards (primary) |
| radius-modal | `rounded-2xl` (16px) | Modals, large cards |
| radius-dropdown | `rounded-xl` (12px) | Dropdowns, smaller modals |
| radius-element | `rounded-lg` (8px) | Nav items, sidebar items, rows |
| radius-button | `rounded-[6px]` | All action buttons and CTAs (primary, secondary, outline, danger) |
| radius-input | `rounded-[6px]` | Form inputs, selects, textareas (matches button radius) |
| radius-badge | `rounded-[6px]` | Change badges, small tags |
| radius-cell | `rounded-[4px]` | Heatmap cells, tiny elements |
| radius-score-card | `rounded-[10px]` | Score cards, upload modal panels, video section |
| radius-pill | `rounded-full` | Filter pills, tab pill containers, avatars, dots, indicators (NOT buttons) |

---

## Shadows

| Token | Value | Use |
|-------|-------|-----|
| shadow-card | `shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]` | Default card |
| shadow-card-emphasis | `shadow-[var(--shadow-card-emphasis)]` | Lift — hover and selection |
| shadow-card-raised | `shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]` | Raised cards (activity) |
| shadow-dropdown | `shadow-[var(--shadow-dropdown)]` | Dropdowns, popovers |
| shadow-floating | `shadow-[var(--shadow-floating)]` | Dark floating UI |
| shadow-keycap | `shadow-[var(--shadow-keycap)]` | Kbd chips — a **detail effect**, not elevation |
| shadow-cta-glow | `shadow-[var(--shadow-cta-glow)]` | The primary button's glow, applied by `advButton()` — detail, not elevation |

Literal values live in `src/styles/design-system/effects.css` (and are listed
in DESIGN.md's effects-token ledger) — reach for the token, not the literal, so
a change to the value reaches every call site. `shadow-card` and
`shadow-card-raised` are the exception: they are `--shadow-card` and
`--shadow-card-elevated` from `globals.css`, which effects.css deliberately does
not redefine.

Tailwind utility shadows are also used in specific contexts:
- `shadow-none` — Explicit shadow removal (buttons, flat elements)
- `shadow-xs` — Upload modal cards, subtle elevation
- `shadow-sm` — UI component defaults (shadcn/ui base)

---

## Animation & Motion

### Easing Curves

| Name | CSS token | Value | Use |
|------|-----------|-------|-----|
| EASE_CURVE | `--ease-primary` | `[0.25, 0.46, 0.45, 0.94]` | Primary custom easing |
| EASE (spring-like) | `--ease-out-expo` | `[0.23, 1, 0.32, 1]` | Header, layout transitions |
| EASE_CHART | `--ease-chart` | `[0.2, 0, 0.4, 1]` | Chart/data transitions |

Three curves, one set: each row's Framer array and CSS token are the same
curve. Use the token on the CSS side so a component animating in both places
stays in step — today only `--ease-primary` has `var()` call sites, and the
other two are hard-coded as literals wherever they appear.

**Forbidden**: bounce, elastic, glassmorphism effects.

### Duration Scale

Four named tokens in `effects.css` cover the CSS side. Prefer them in new
work; the `duration-200` / `duration-150` utilities in the recipes below are the
same values written the older way, and are not a defect to go fix ad hoc.

**(v3)** 200ms for hovers, the rail width and the drawer slide; the rail
collapse is choreographed (labels out in 80ms, then the edge travels); 300ms
page-enter with an 8px rise; 400ms is the dark tooltip's deliberate reveal.
Press = scale 0.97 on buttons, 0.998 on rows.

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | Micro-feedback, colour swaps |
| `--duration-hover` | 200ms | Hover and colour transitions (`advButton()` uses this; its press is a separate hard-coded 80ms — 200ms there reads as a bounce) |
| `--duration-enter` | 300ms | Page and section enter (+8px rise) — reserved, no `var()` call sites yet |
| `--duration-reveal` | 400ms | The dark tooltip's reveal and larger reveals — one call site, `globals.css`'s fadeIn |

The wider scale below is the Framer Motion side, where durations are numbers:

| Duration | Use |
|----------|-----|
| `0.06s` – `0.08s` | Quick micro-feedback |
| `0.12s` – `0.15s` | Fast UI responses |
| `0.2s` – `0.25s` | Button animations, hovers |
| `0.3s` – `0.35s` | Page transitions, fade-ins |
| `0.4s` | Component transitions, stagger groups |
| `0.5s` | Slower reveals |
| `0.6s` | Larger reveals, chart animations |
| `0.8s` – `1s` | Progress rings, loaders |
| `1.2s` | Sparkline path draw |

### Standard Motions (Framer Motion)

```tsx
// Fade + slide up (cards, sections)
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.3, ease: EASE_CURVE }}

// Stagger children (KPI cards, lists)
transition={{ delay: index * 0.05 }}

// Scale press feedback
whileTap={{ scale: 0.97 }}

// Tab indicator
layoutId="activeTab"
```

### Reduced Motion

Always respect `prefers-reduced-motion` — skip transforms, keep opacity transitions.

---

## Component Patterns

### Card

```
bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]
```

With header:
```
// Header row
flex items-center justify-between h-14 px-5
// Header label
text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]
```

### Section Label

```
text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]
```

### Action button — the variant set

`advButton()` in [`src/lib/ui/adv-button.ts`](../../src/lib/ui/adv-button.ts) is
the transcription. Use it; do not hand-roll a near-miss.

| Variant | Rest | Hover |
|---|---|---|
| `primary` | Signal Blue fill, white label, CTA glow | `--blue-hover` |
| `outline` | card surface, `--border-field`, `--ink-700` | **surface wash only** |
| `ghost` | transparent, `--border-field`, `--ink-700` | **surface wash only** |
| `danger` | transparent, danger-tinted border and label | danger tint fill |
| `danger-solid` | danger fill, white label | `--danger-hover` |

Sizes sm/md/lg = 32/36/44px. Press is `scale(0.97)`, suppressed under reduced
motion. Focus is `--focus-ring`. One primary per surface — a dialog carries one,
never two.

`secondary` is not a variant — a design doc that writes `variant="secondary"`
means `outline`. **(v3)** A page header carries at most one primary; its
companion is `ghost`, never `outline` (on the white page an outline's box
reads as a second card, and its fill says nothing). Task footers use a text-only secondary. `pill`
switches to the 10px uppercase chip form below — filters and "Recommended"
tags, never a CTA.

> **Hover on a secondary button is a wash, never blue.** `outline` and `ghost`
> both shipped turning their border and label blue on hover, which made every
> secondary control read as a second primary sitting beside the real one. Blue
> is the single accent and should stay under ~10% of a screen; spending it on a
> hover state is exactly the leak that rule exists to prevent. The same
> correction applies to `SettingsButton`'s outline variant and to any
> hand-rolled bordered button — grep for `hover:border-[var(--blue` before
> adding one.
>
> The same principle governs elsewhere: nav active state is a neutral wash, not
> blue; people-state chips are grey, never blue — with one sanctioned exception,
> the **`You` pill**, see *Settings Pages › Person row in a card* below.

### Button (Primary, CTA)

```
text-[13px] font-medium
rounded-[6px] h-9 px-4
bg-[#3B82F6] hover:bg-[#2563EB] text-white
transition-colors duration-200
shadow-[0_1px_3px_rgba(57,134,243,0.25)]
```

### Button (Primary, Small)

```
text-[10px] font-medium uppercase tracking-[1.5px]
rounded-full px-3 py-1.5
bg-[#3B82F6] hover:bg-[#2563EB] text-white
transition-colors duration-200 shadow-none
```

### Button (Ghost, pill)

The uppercase pill form, for filters and tags — not a standard CTA.

```
text-[10px] font-medium uppercase tracking-[1.5px]
rounded-full px-3 py-1.5
border border-[#EAECF0] text-[#525252]
hover:bg-[#F5F5F5] transition-colors duration-200
```

### Button (Secondary / outline)

```
text-[13px] font-medium
rounded-[6px] h-9 px-4
bg-[var(--surface-card)] border border-[var(--border-field)] text-[var(--ink-700)]
hover:bg-[var(--surface-subtle)]
transition-colors duration-200
```

### Chrome Icon Button

Square icon-only buttons used for header, modal, and popover chrome — sidebar toggle, search trigger, profile menu, modal/popover back, modal/popover close. Always `rounded-lg` (radius-element); never `rounded-full` (per the radius-pill rule, full-round is reserved for non-button pills, avatars, dots, and indicators).

**Sizes**

- `h-7 w-7` (28×28) — modal chrome (back arrow, close X)
- `h-8 w-8` (32×32) — dashboard header chrome (sidebar toggle, profile, search trigger when expanded)

**Pattern (modal chrome — paired back/close in top bar)**

```
h-7 w-7 rounded-lg flex items-center justify-center
text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5]
transition-colors duration-200
```

**Pattern (dashboard header chrome — slightly cooler greys + press feedback)**

```
h-8 w-8 rounded-lg flex items-center justify-center
text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5]
active:scale-[0.97]
transition-colors duration-150
```

Neither pattern carries a focus class, deliberately. `focus.css` already rings a
`<button>` in blue, and a `focus-visible:ring-*` utility here would be silently
discarded rather than applied — see [Focus](#focus).

**Icon**: `size-3.5` (14px) at `strokeWidth={1.5}` for h-7 buttons; `h-[15px] w-[15px]` for h-8 buttons. Always Lucide.

**Pairing rule**: when a back/close pair appears in modal chrome, both buttons must share size, shape, hover, and focus treatment. Mixing a labeled chip with an icon circle is forbidden — the eye reads them as unrelated controls.

**Close (X) buttons**: Any dismissible surface that renders an explicit close affordance — modals, popovers with form fields or multi-step content, side panels — MUST use the `h-7 w-7` modal-chrome pattern above with a Lucide `X` icon at `size-3.5` `strokeWidth={1.5}`. Do not invent variants per surface; the X on a popover must be visually identical to the X on a modal. Popovers that only contain a single quick action or readout (tooltip-style) should continue to rely on click-outside dismissal — no X needed there.

### List Item (Hoverable Row)

```
hover:bg-[#FAFAFA] active:scale-[0.998]
transition-[background-color,transform] duration-200 ease-out
```

### Stat Display

```
// Label
text-[9px] font-normal text-[#AAAAAA] uppercase tracking-[2.5px]
// Value
text-[13px] font-light text-[#0D0D0D] tabular-nums
```

### Outcome Mark (`ResultMark`) — the one register

`circle-check` / `circle-x` / `circle-minus` at 14px stroke 1.5, in
`--success` / `--danger` / `--ink-500`, with "Won" / "Lost" / "Level" carried
as the accessible name. `src/components/dashboard/result-mark.tsx`.

**There is one outcome register and this is it** — under a labelled Result
header or in a headerless dense row alike. The system used to run two, the
word (`Badge`) under a labelled column and the glyph without one; see Data
Table rule 2 for why that split was retired and what it cost.

The mark takes **no alignment of its own** — it inherits its cell's, exactly as
`EmptyMark` does, because a Result column shows the glyph on a decided row and
the em dash on an undecided one and the two must sit on the same x. Never
centred. Never a bare W/L letter (standings shorthand; it does not translate).
The result cell takes **no container**: the tinted banner was built, evaluated
and rejected (Data Table rule 2), and that rejection stands for the glyph too.

`Badge` (`src/components/ui/badge.tsx`) survives only as a non-outcome label —
`<Badge variant="blue">Pro</Badge>`. Its `win` and `loss` variants are gone
**from the type**, so a future `variant="win"` does not compile. Green and red
do not belong in it at all; they are reserved for winning and losing, which it
no longer says.

### Form Ticks (`FormPills`)

**(v3)** The last five results as bars, not lettered squares: 2.5×12px, 3px
gap, 1px radius, oldest left, `--viz-good` / `--viz-bad`. Shipped as
`FormTicks` in `shared/form-ticks.tsx` (the roster table and the player profile's line history both draw it); pair with a muted summary ("5–2 last
7") where there is room. The pre-v3 treatment — a 20px `rounded-[3px]` square
with a 9px semibold letter on the 15% tint — is retired.

### Activity Indicator Line

```
w-px h-10 rounded-full shrink-0
// Win: bg-[#5DB955]
// Loss: bg-[#E51837]
// Milestone: bg-[#3B82F6]
// System: bg-[#AAAAAA]
```

### Circular Progress Ring

```tsx
// SVG circle, radius = 46, strokeWidth = 8
// Background: stroke-[#D9D9D9]
// Progress: stroke-[#3B82F6], animated strokeDashoffset
```

### Data Tooltip

Tooltips over visualizations (court dots, heatmap cells, serve zones) use a consistent floating box — no caret/arrow. This is the chart-hover box only: every icon-only *control* answers hover with the dark `Tooltip` (Navigation → Dark Tooltip), never this one.

**Ratified 2026-09-07 (design owner), supersedes the white box below for chart marks:** a hovered chart mark — a bar segment, a heatmap or mosaic cell, a sparkline point — opens the **dark readout** the report page's chart cards draw (`matches/match-detail/chart-tooltip.tsx`: `--ink-900`, 12px radius, `--shadow-dropdown`, `px-3 py-2.5`, a 12px white medium title over 11px lines at 64% white; export `DARK_READOUT_CLASS` / `DARK_READOUT_STYLE` for a box that positions itself). *Shipped:* Team Home's court record, the KPI detail chart. *Still white, to be brought in line:* the court-dot and radar tooltips on match detail. The white box below remains the spec for a popover that carries controls or a legend, not for a hover readout.

```
bg-white border border-[#F3F3F3] rounded-xl
shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]
py-2.5 px-3
// No caret. The interaction highlight (ring, hover scale) anchors the tooltip.
// Fixed width per context: w-[168px] (compact), w-[200px] (standard), w-[230px] (wide)
```

When used with Radix `<TooltipContent>`, override defaults with `!` utilities:
```
!bg-white !rounded-xl !px-0 !py-0 !border !border-[#F3F3F3]
!shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] !text-left !w-auto
// Apply padding inside inner wrapper, not on TooltipContent
```

### Loading Skeleton

```
bg-[#F0F0F0] rounded animate-pulse
// Various heights: h-2.5, h-3, h-4, h-5
// Proportional widths: w-24, w-32, w-40
```

**A skeleton is a promise that something is arriving.** It belongs to a
request that will resolve — a fetch in flight, a page mounting. It never
stands in for data that does not exist, because a shape that says "loading"
when the truth is "nothing here yet" is a status message that is not true,
and a reader who waits for it to resolve concludes the page is broken. Empty
is a different state with a different pattern; see below.

### Empty State

**Three things can fill a region with no data, and only one of them is
right.**

1. **Honest zero state — use this.** Render what the region will be, holding
   nothing: the card, its eyebrow, its axis and column labels, and a mark
   where each value goes. Say what will appear here and give one way to make
   it appear. The labels are the payload — a player who reads "break points
   saved" knows what comes back without a figure being invented.
2. **Skeleton — never.** See above. Reserved for loading.
3. **Sample or demo data — never in the user's own workspace.** A fabricated
   number is a claim about this account, and on the day the real one lands at
   a different value the page has already told them a different story. The
   one defensible form is a single, clearly quoted **example** carrying its
   own label in the card header, and it does not scale past one card — a
   marker under a screen of confident-looking figures survives neither a skim
   nor a screenshot. Even at one card it is expensive: it was built for Home's
   Focus card and rejected, because a card showing finished prose sits
   visibly apart from neighbours that all show structure. Prefer the card's
   own anatomy, empty.

**A zero is not a blank.** Write `—` where a value is unmeasured; `0%` is a
statement about the athlete, `—` is not. `0` is correct only when zero is the
measured answer.

**Scale the treatment down as the region does.** One page-level path to first
data beats six illustrated cards; a dashboard of empty widgets goes text-only
rather than repeating an icon per card (see Icons → 28–32px empty states for
the one-icon case).

**Never show an empty state for something that exists but is unavailable.** A
match still analysing gets progress, not an empty chart — an empty serve
chart reads as "you hit no serves". `matches/[matchId]/page.tsx` short-circuits
to the hero + `MatchAnalysisProgress` for exactly this reason.

```
flex flex-col items-center justify-center py-12 px-6 text-center
// Icon container: bg-[#F5F5F5] p-4 rounded-full
// Icon: h-8 w-8 text-[#888888]
// Title: text-[#0D0D0D]
// Description: text-[12px] text-[#888888]
```

This centred recipe is the **small-region** form — a card or a list with
nothing in it, reached from a populated page. A whole personal page with no
data is a different composition — the offer over the page's own dimmed shape:
Personal Home Recipes → Day zero for Home, Data Table → Table page states for
a list.

**Three states, three treatments — never borrow one for another.**

| The page is | Treatment | Shipped |
|---|---|---|
| built, no data yet (**day zero**) | the offer over the page's own shape, dimmed and `inert` | `home/day-zero-home.tsx`, `matches/matches-day-zero.tsx`, `schedule/static/schedule-day-zero.tsx`, `team/roster-day-zero.tsx` |
| built, no data, and its shape is too dense to dim | the offer, then a labelled run naming what arrives | *(no shipped example — Statistics held this slot until the page went back to coming-soon)* |
| **not built yet** | "Coming soon", one statement, one way onward — **no shape at all** | `dashboard/coming-soon.tsx` |

The last row is the one that gets confused. A feature that does not exist has
no shape, so a dimmed mock-up of one invents a layout that may never ship —
the same fabrication these rules exist to prevent — and a reader who cannot
tell "nothing here yet" from "not built yet" will wait for data that is not
coming. **A page counts as not built until it is finalised, not until it
renders**: Statistics ran with every component wired and was still moved back
here, because a day-zero offer on a page whose shape is unsettled promises a
layout it cannot keep.

*The shape* (`dashboard/coming-soon.tsx`): one **48ch** column, centred, the
statement and the sentence sharing that measure. Held narrower — a 22ch
heading over a 46ch paragraph — the block reads pinched: a wide line over a
narrow one over a wide one. At 48ch the statement sits on **one line** and the
sentence on two, and **keeping every heading to one line is part of the
template**, not an accident of the copy. The statement is `text-title-lg`
under the page's own 30px h1, because two headings a hair apart read as a
mistake; the sentence is `text-body` at 1.7, not `text-body-sm`, which was the
fine-print step doing the work of body copy.

*The marker* is a **24px outlined pill** — hairline border, no fill, ink-600 at
11/500 — and the three alternatives were each rejected for a reason worth
keeping. An eyebrow labels a SECTION; this labels the page's condition. Grey
`StatePill` is the right register but is sized for a table row, and 18px alone
above a 24px statement reads undersized. The blue-tinted pill is spoken for:
it belongs to "New" and to nothing else, and a second blue pill costs the
first its meaning.

The middle row is a judgement, not a loophole: Home dims one card and one row
because those are shapes worth previewing, and Statistics does not because
twenty-one stat components as grey rules is a screen of noise (Carbon says the
same — a dashboard of empty widgets goes text-only rather than repeating a
treatment per region). Where the shape is skipped, the labelled run carries
the promise instead — Statistics names serve, return, rally and trends, which
is what a report will hold, with no figure invented.

All three share the offer's own words wherever a match is what is missing:
`DayZeroOffer` takes a headline and measure, and everything beneath the
sentence is byte-identical across Home, Matches and Statistics.

### Keyboard Shortcut Chip (`Kbd`)

`ui/kbd.tsx` is the only keyboard chip in the product. It is a **keycap, not
a code tag**: `--surface-raised` fill, 1px `--ink-200` border, and a 1px
bottom shadow (`--shadow-keycap`) so it reads as a key you could press. Two
fixed sizes, and nothing else:

| Size | Geometry | Where |
|---|---|---|
| `sm` | 16px tall, min-width 16, `px-1`, 10px text, radius 3 | inside a sentence — a mode banner, an inline hint |
| `md` (default) | 24px tall, min-width 24, `px-1.5`, 11px text, radius 5 | a shortcut table or legend, where the chip is the content |

Always a semantic `<kbd>`, `aria-hidden="true"` where an `aria-label` already
says the shortcut. `inline-flex`, so a chip sits on the text baseline beside
the words around it. Combos are separate adjacent chips with a 4px gap
(`⌘` `K`), never one chip containing both — the gap is what makes them read
as two keys.

*This retires the earlier flat recipe* (`bg-[#F0F0F0]`, no border, no shadow,
auto-height, small-caps for lowercase word keys), along with the argument
that fixed heights make `esc` sit low. The keycap centres its legend in a
fixed box and needs no variant trick, and the flat chip had no call sites
left when this was written — `src/` carries `Kbd` alone. Do not reintroduce
a second chip: a keyboard hint that looks like inline code reads as a value
to type rather than a key to press.

**A keyboard path is stated once, where the mode is stated** — in the mode
banner (`Notice` → mode register), never as a hint repeated on every row it
applies to. Sentence and chips share one line: "Drag a row, or focus one and
press `space` then `↑` `↓`".

**Inline (in body copy)** — for "or press ⌘S" style hints where a chip would
be too heavy, no background:

```
text-[#525252] font-medium
```

**Symbol conventions**

- macOS modifiers: `⌘` (⌘), `⌥` (⌥), `⌃` (⌃), `⇧` (⇧). Concatenate without a `+` (`⌘K`, not `⌘+K`).
- Windows/Linux modifiers: spell out and join with `+` (`Ctrl+S`, `Alt+K`).
- **Letter keys in modifier combos stay UPPERCASE** (`⌘U`, `⌘K`, `⌘S`, `Ctrl+S`). They read as a hotkey, not a label.
- **Standalone word-named keys are lowercase** (`esc`, `enter`, `tab`, `space`). They read as a label, not a glyph.
- **Arrow keys are glyphs, never words** (`↑`, `↓`, `←`, `→`).
- Punctuation keys render as-is (`/`, `?`).
- Detect platform via `navigator.userAgentData?.platform ?? navigator.platform` and gate render behind `if (isMac !== null)` to avoid SSR mismatches.

---

## Navigation Patterns

### Icon Rail Sidebar (v3)

Two committed widths only — `--rail-width` (64px) ⇄ `--panel-width` (232px) —
moved by a toggle row (`⌘\`), **never a hover peek**: charts must not resize
under a reading cursor. `--rail-icon-col` (40px) holds a fixed column at
*both* widths, so only the edge travels; labels fade in behind it (out 80ms,
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
*current* row is bare — no wash, no hover — marked only by a blue check
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
number (Layout Patterns → Title Slot). *Shipped:* `dashboard/header-greeting.tsx`,
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
close: 28px (h-7 w-7 modal-chrome pattern, see Chrome Icon Button above)
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

## Data Table (v3 — the table laws)

Governs **every** table in the product — Matches, Roster, Events, Schedule —
not a page-specific treatment. Generalizes `matches/match-card-list.tsx` +
`match-actions/match-actions-menu.tsx`. The full laws and the column recipes
live in the design project's `components/data/DataTable.prompt.md`.

**One list-page shape** — Matches, Roster and Schedule share it, so a coach
moving between them re-learns nothing: title slot · ghost + primary · filter
row (status pills · Filters · sort) · one full-width table card, hairlined
against the white page · optional footer line ("Season 3–1 in duals · 31 of 36 lines
analyzed" + one blue link). Schedule is a list page too — the all-white
master-detail split is retired; its detail is the peek drawer below.

1. **Column order is a decision sequence, never fenced.** Priority is
   position — never a rule or wash around a column to signal importance. One
   reading order for every list: lists are newest-first, so **Date leads**
   (12px tabular ink-700, 72px) · the name at 13/500 ink-900 with its 26px
   mark (program initials for a dual, the tournament mark for a tournament) ·
   context at 12px ink-600 · then the numbers and the outcome, **flush left in
   fixed tracks** (see the alignment clause below). Canonical orders: **Matches** = Date · Opponent · Event (+ mono
   round) · Score · Result · Analysis (the fluid cell, heading nothing) · ⋯ ·
   chevron — the outcome closes the facts, and the lifecycle annotation trails
   them because it is blank on eight rows in ten; **Roster** = # · Player ·
   Record · Form · Last match (Record leads Form: the number a coach ranks
   by first, the five-tick trail that qualifies it second); **Schedule** = Date · Event · Type · Venue ·
   Lines `n / 9` · Score · Result. Text and its header flush left; a numeric
   measure that is compared down its column flush right; **Score and Result
   flush left**, in fixed tracks, at one precision, tabular — in *both* lists.
   Schedule right-aligned that pair while Matches kept it left, which drew the
   two most-scanned cells in the product two ways depending on the page; the
   score's own rule (flush left in a fixed track) settles it and the outcome
   follows the score it belongs to. Header and value then share an x, which is
   the rule `EmptyMark` and `ResultMark` already follow inside a cell. The cost
   is that Schedule's rows no longer close on a hard right edge — Matches gets
   one from its chevron and a container row may not have one (rule 3) — so
   size the Result track to its widest content — "Not played", 60px, not the
   52px heading, which clips it — and let the column, not a gap, hold the
   remaining width. **Never center-align anything.**
   Exactly one fluid cell per table (Analysis in Matches) — everything else
   fixed or bounded so scores and dates start at the same x on every row.
   Where every measure is fixed, **the name takes the slack**: one flex
   spacer after it and the metrics packed to the right, so the only gap in
   the row falls on a column boundary. A flexible last cell with its date
   pinned to the far edge opens ~600px of nothing mid-row and splits one fact
   — opponent and date — into two. No
   column a filter or sort acts on may be merged into another cell; no
   repeated words — noun in the header, qualifier in the cell. Not-yet values
   are an ink-400 em dash — **one mark, one size, and centred under its own
   heading**, never left-aligned in the cell and never a per-column invention
   (a 13px dash, a 12px dash and a sentence read as three unrelated absences
   on one row). A dash carries no words beside it: three across a row already
   say "nothing yet" once, and a sentence in the last column says it a second
   time in a different voice while pulling the eye to the row with the least
   in it. Keep the sentence as `sr-only` — a dash reads as nothing to
   assistive technology. A future event's Result reads "Not played" (11px
   ink-500), never a Badge. Type is a plain word — no type swatch (amber stays
   chart-only).
2. **One outcome register: the glyph.** `ResultMark` draws every match outcome
   in the product — Matches, Schedule, the dual and single detail pages, the
   roster's Last-match cell, Home's result rows, the command palette. Under a
   labelled "Result" header or in a headerless row, it is the same mark.
   *This rewrites the earlier rule* — "word under a labeled Result header,
   glyph in headerless rows, never both in one row" — which was sound in
   isolation and failed in practice: the trigger for a word was a property of
   the *table* rather than of the fact, so the same outcome wore two faces
   depending on which page you were on, and the split was invisible in review
   because each table looked right on its own. Matches drifted to the glyph,
   Schedule kept the word, and the two lists a coach moves between stopped
   matching. A circle also survives translation, which a tracked English word
   does not. **The result cell has no container** — the tinted "banner" was
   built, evaluated and rejected, and that rejection carries over: the mark
   already says the thing, and a tint would make the outcome louder than the
   Score beside it. The mark **inherits its cell's alignment** and is never
   centred — it shares its column with `EmptyMark`'s dash on undecided rows,
   and those two must start on the same x. Never a bare W/L letter. A future
   event's Result still reads "Not played" (11px ink-500), and a level dual is
   the third glyph (`circle-minus`, ink-500) rather than a fourth register.
3. **The row-click law — containers peek, records open.** Decided by the
   noun, not the page. **Record rows** (matches, wherever they appear — Home,
   Matches, inside an event drawer, a player's match list) navigate to the
   report: trailing `chevron-right` 13px, ink-300 → ink-900 on hover, held
   resting and hovered so nothing shifts; the hover wash is transient.
   **Container rows** (events on Schedule, players on Roster) open the peek
   drawer (below) and carry **no chevron** — there is nothing to travel to;
   the wash persists on the selected row. `chevron-down` only when a row
   expands in place, rotating 180° on open (200ms). The same noun never opens
   two ways, and the report's pinned left column is chrome, not a peek. *The
   hover wash and cursor say a row is clickable, but not whether clicking
   leaves the page.*
4. **Row state pills.** Shared / Private / Draft are grey 18px `StatePill`s
   (10/500 ink-700 on surface-subtle) beside the row's primary name — mark
   the exception, not the norm ("Private" under a share-everything policy,
   "Shared" under private-by-default). **"New" is the one blue-tinted pill**:
   18px, 10/500, `--blue` text on a 10% blue tint — emphasis, not neutral
   status; never filled blue (it would compete with the Result badge); gone
   once the report is opened. **Unread is not a dot and not a column** — the
   dot column retired from data tables (the 6px blue dot stays the activity
   tray's mark alone). Max one state pill per row. A pill never truncates:
   the name span takes `min-width:0; overflow:hidden; text-overflow:ellipsis`
   and the pill `flex-shrink:0` — a clipped pill reads like the banned W/L
   letter. *Shipped:* `ui/state-pill.tsx` is the grey register (Draft, Shared,
   Private) and `ui/new-pill.tsx` is the blue one — 18px, 10/500, `--blue` on a
   10% blue tint mixed from the token so it follows into the dark scope.
   `match-card-list.tsx` draws "New" through `NewPill`.
5. **Row actions on hover:** surface-muted wash on the rounded
   `radius-element` row, inset 8px from the card edge; the lifecycle cell
   swaps for a `⋯` trigger (`MoreHorizontal`, stroke 1.75 — the one
   exception to strokeWidth 1.5 in the product) in a 28px radius-element
   square, opening a 12px-radius float menu with destructive last and a
   `detail` line on consequential items ("Coach and teammates lose this
   match"). Keep to 2–3, revealed on hover / focus-within. Container rows
   have no action gutter — the Roster's Upload lives in the drawer.
6. **Filter panel + applied strip.** One panel, sectioned: facets about the
   record first, facets about the counterparty below a hairline under an
   "Opponent" heading. 2–3 options → segmented row with an "Any" default;
   longer lists → checkboxes. Live match count in the footer beside a quiet
   "Clear all". On apply the panel **closes** and a note strip states the cut
   in words — plain sentence · middot · "N of M" · one quiet "Clear filter" —
   **never chips, never a badge**. Engaged trigger uses the nav-active
   grammar (surface-subtle wash + ink-900, no border/dot/count). Lifecycle
   pills stay independent of the panel — a filter cut is not a lifecycle
   bucket. Pagination reads against the filtered set ("4 of 4 in this
   filter") plus an escape link to the full library.
7. **Status pills are a view switcher, not a filter.** A fixed 3–4 set (All ·
   New · In progress · Estimates), 26px, hairline border, **no counts, no
   dots**; active = `--border-medium` + surface-subtle + ink-900. Counts live
   in the title slot's summary line ("6 players · 2 invites pending"), never
   on a pill. The chip ban covers chips that accumulate from user choices;
   this fixed row is sanctioned. Its multi-select cousin on reports is the
   **segmented set switcher**: 22px segments labeled by the set score itself,
   selected = surface-muted, unselected at 42% opacity; scope readout left,
   "Whole match" reset right, both only while filtered.
8. **Table page states.** Day zero on a **personal** list page is the same
   composition as personal Home's (Personal Home Recipes → Day zero): the
   offer, centred, over the page's own shape at 0.32 and `inert` — the
   lifecycle chips at zero, the toolbar, the table card with its column labels
   over ghost rows — and **no title row**, because the offer carries the
   page's one primary and a title-row button beside it would be two. The
   title row, chips and populated table return with the first match. *This
   rewrites the earlier rule* — "title, primary and footer identical to the
   populated page; pills and table absent, not skeletoned" — which had two
   day-zero pages one click apart looking like two products, and whose
   shipped form carried two blue links to the same URL. What is dimmed is the
   list's real anatomy with its labels intact, never grey stand-ins for
   labels; the column headers are the payload (Empty State → labels). The
   **team** list draws the same composition with different words —
   `MatchesDayZero` takes a `scope`, and only the sentence and the action pair
   change. This closes the slot that read "the team list keeps the older shape
   until its own day zero is designed": two day zeros one workspace switch
   apart would be the same drift the rewrite above was for.

   The two other team table pages follow it. **Schedule**
   (`schedule/static/schedule-day-zero.tsx`) draws the offer over its pills,
   toolbar and seven column labels; **Roster** (`team/roster-day-zero.tsx`)
   over its five, and a program has that screen on its first day, because
   staff are not rows in that table. Both drop the title row and the footer
   for the same reason Matches does, and both take their grid and their labels
   by import from the real table — a ghost table never restates its own
   geometry. What differs by role rather than by page: a viewer who may not
   fill the page gets the identical shape with **no pair at all** and a
   conditions line naming who does, never a button that refuses on click.
   The gates are the page's own — `isProgramStaff` on Schedule and Roster,
   `canUploadForProgram` on Matches — so the offer never opens a door the next
   page closes.

   Day zero is the state where **nothing is in flight**, not where the table
   is empty: a draft keeps Matches' list, and an open invitation or a pending
   join request keeps Roster's, because each is a person or a match on the
   way and the page holding it has something waiting on somebody.

   *Shipped:* `matches/matches-day-zero.tsx` — the shared `DayZeroOffer` with
   the page's own sentence ("Every match you send lands here." on a 30ch
   measure, so it holds one line), then the real `LifecycleChips` at zero, a
   drawn toolbar, and the list card with its six column labels over **five**
   ghost rows stepping 1 → 0.8 → 0.6 → 0.45 → 0.3. Five rather than Home's
   three because this card is the whole page below the offer, where Home's
   shares a column; three left it a stub. It renders only when there is
   neither a match nor a draft — a draft is a match in flight and keeps the
   list.

   Once populated the frame never moves again. The resting view is never
   pre-filtered; a filtered view is its own screen, never a mutation of the
   resting one — the resting frame keeps showing its in-flight and estimate
   rows regardless of what's filtered. Lifecycle cell copy: "View report"
   when ready · `StatusChip` while running (no elapsed time — the tray owns
   progress) · "Estimate · Review data" for low confidence (grey fact + blue
   action, never yellow, never red).
9. **8a is the default row treatment** — 52px fixed rows, hairline under the
   header only, none between rows; hover = surface-muted wash on a rounded
   radius-element row inset 8px. Eyebrow headers over 8a rows is the
   sanctioned combination. *(Erratum: an earlier v3 DataTable spec called for
   hairlines between every row — 8a's site-wide lock above supersedes that for
   every dense result list.)*
10. **A table-level action lives INSIDE a column, never beside the
    headings.** As a flex sibling in the header row it takes a column's worth
    of the row and pushes every heading off the cells beneath it — the
    Roster's "Set lineup" moved Record, Form and Last match ~100px left of
    their values, and only when a coach was the one looking, so it read as a
    data problem. Put it at the far end of the last column (`ml-auto` inside
    that column's span, `tracking-normal normal-case` so it does not inherit
    the eyebrow), and measure a heading against its own cell before believing
    it.
11. **Quiet ≠ empty.** Quiet is earned by removing redundancy (a legend under
    every bar), never information: Home result rows keep their three mini
    stats, event headers their 13px metadata glyphs, the KPI strip its five
    tiles.

### Peek Drawer (v3)

The container-row destination — one 340px shell for Roster and Schedule.
`--surface-card`, hairline left edge, `--shadow-dropdown`; slides in 200ms
`--ease-primary` while the table reflows to the remaining width (the flexible
name column absorbs the loss — nothing else moves). **Opens on click, never
hover**: a panel opening under a crossing cursor shifts the table and is
unreachable from a keyboard. Click opens and selects (the wash persists); `↑↓`
step to the next record; Esc, the X, or re-clicking the selected row closes.
No URL of its own — `?player=` / `?event=` deep links are the one case that
lands open. **Closed is the resting state**: full-width table, nothing
selected, no chevrons, no gutter.

- **Header, 44px, 20px inset:** ‹ › stepping · counter "Player 3 / 6" · ⋯ ·
  divider · X — and nothing else. The bridge to the record's page is the
  **name in the body**, ink-900 at rest and blue on hover, the same
  affordance the roster row's name carries; ⌘-click on the row does the same.
  The body scrolls; a full-width primary pins to the bottom ("Upload for
  Rafael" · "Enter results").

  *This retires the header's "Open profile ↗" chip.* Two routes to one page
  cost a 340px header its last breathing room: measured at 340, the flexible
  gap had collapsed to its 8px floor and the chip was the widest item in the
  row at 97px — a third of the header spent on a duplicate. Removing it
  returns the gap to 69px. The name is the better of the two anyway: it is
  the record itself, it costs the header nothing, and it puts the link where
  a reader already looks. **A drawer header holds navigation, position and
  dismissal only** — anything that travels somewhere belongs in the body.
- **The record's name wraps; it never truncates.** A 340px rail clips plenty
  of real names at 22px, and the answer is two lines, not a tooltip — the
  panel scrolls anyway, and a person's name in their own drawer is as
  essential as this surface gets ("nothing essential lives only in a
  tooltip", Empty State). The identity row is therefore `items-start`, so the
  avatar stays level with the first line rather than centring against a block
  that grew. The table row is the opposite case and truncates bare: 52px
  cannot give the height, and this drawer is the one click that shows the
  name whole.
- **Player body:** identity → six-match sparkline with a stat header → four
  24px stat pills that switch the chart → three recent matches as record rows
  (with chevrons — these navigate) → Upload. Upload is never event-level.
  **With no measured figure the chart and the pills are absent, not empty.**
  Gate on "is there a value", never on "has matches" — a player whose only
  match is still analysing has a row and no numbers, which is the same
  nothing to chart. Left in, the header read "—", the sparkline drew empty
  air between two blank dates, and the four pills stayed clickable: a coach
  could press one, watch it select, and watch nothing happen. **A control
  that responds and does nothing is worse than an absent one**, and it is the
  one case where honest-zero's "render the region's own anatomy" loses —
  anatomy is labels and axes, not live buttons wired to nothing. What the
  pills would have told you moves into the empty line under Recent matches
  ("Serve and pressure numbers appear here once one is analyzed"), and the
  way to make it appear is the drawer's own primary. A count link to an empty
  page ("All 0") goes too.
- **Event body:** program mark + name + conference → glyph row (date · venue ·
  surface) → score row (28/300 tabular, winner ink-900, loser ink-500) + nine
  4×18px outcome ticks (singles · gap · doubles) → all nine lines at 36px as
  record rows ("Awaiting result" lines have no chevron; an unset line is a
  blue "+ Set line" row) → Enter results.
- *Shipped:* `schedule/static/event-drawer.tsx` and
  `team/player-drawer.tsx` — the roster's v3 delta (the Record column, the
  drawer, the retirement of the stat column and the action gutter) is closed.
  Both rails use one shell: a CSS width keyframe, never an animated inline
  width, which left the rail invisible.

### Roster Row (v3) — the row compares, the drawer reads

`#` (11px mono tabular ink-500, "—" when unranked) · Player (26px `Avatar` +
name 13/500 ink-900 — a link, blue on hover) · spacer · Record (13px tabular
— what coaches rank by) · Form (`FormPills`) · Last match. Invited people
share the table: dashed-ring avatar, position "—", email as the name,
"Invited Aug 4 by you · player role", Resend (11px blue) · Revoke (11px
ink-500) inline.

**The table is players only.** Staff sat in it once, told apart from players
only by the words under their name, which made a coach read as a player
ranked #7 and put dashes in the `#` column. They are named in a sentence
under the card — "Coached by Elena Vasquez and Jon Abara." + "Manage staff →"
— and managed in Settings › Team. A player sees the sentence and not the
link: knowing who coaches the program is fair, managing them is not theirs,
and a link that refuses on click is worse than no link.

**Last match carries exactly ONE trailing token.** The cell was answering two
questions at once — what happened, and what state the analysis is in — so
every state grew its own trailing element and the column lost its shape. Now:
`ResultMark`, opponent (12px ink-700), and one token in the same place. A
settled row shows its date (`text-micro` tabular), a running row shows a
`StatusChip`, an unscored row shows a "Review score" pill. No score — that
moves to the drawer's recent matches. No elapsed clock — the activity tray
owns running progress.

The two token treatments differ on purpose, and the difference is the rule:
**`StatusChip` is a flat dot-and-label with no container and means *nothing
to do*; the filled grey pill is this table's clickable-question treatment —
the same one "Possible duplicate" wears — and means *your move*.**

### Reorder Mode (v3) — a table that can be re-ranked

Where the order of a table IS the record it holds — the singles lineup — the
table becomes its own editor rather than sending a coach to a form. One mode,
entered from the column-header row. Everything it changes is listed here;
everything else must not move.

- **The toggle rides the column-header row**, not the title slot. It is a
  different kind of verb from Invite / Add player — it changes the page you
  are on rather than adding a person — and the header row already spans the
  card it modifies. 11px blue with a 12px grip glyph, inside the last column
  (law 10). A mode with its own Cancel, not a handle sitting there always,
  because in it a row click grabs instead of opening the drawer.
- **The mode swaps the page's actions, not its shape.** Ghost + primary
  crossfade to Cancel + Save (`AnimatePresence mode="popLayout"`, 120ms) so
  the primary never moves. A banner in the inline-notice register states the
  mode and its keys once, above the table — never a hint per row. Nothing
  else moves: no column shifts, no padding opens, no gutter appears.
- **The grip borrows the `#` cell** of the row under the pointer or holding
  focus — one row at a time, so every other line keeps the number that says
  what the order currently is, and entering the mode moves no column. A grip
  column of its own shifts the whole table on entry; a grip on every row
  hides the thing being edited behind a column of identical glyphs.
- **The row in hand carries its own marks.** A solid 2px `--blue` outline
  says WHICH row; a 20px blue disc in the page margin beside the card, level
  with the row and 10px clear of the outline, says WHERE it lands — the line
  it would take on release, live as the siblings swap. The held row also
  takes `--surface-card` and `--shadow-card-emphasis` so it reads as lifted
  off the list, and it must not take the hover wash the pointer sitting on it
  would otherwise give it.
- **Nothing is drawn between the rows.** A blue rule at the destination slot
  was built and rejected: with a pointer drag the held row already sits at
  that slot, riding the hand a few pixels off it, so rule and row overlapped
  and it read as a cut through the card. The gap the siblings slide open is
  the destination, and costs nothing to draw.
- **Focused and held are two weights of one outline, and only one of them is
  yours to invent.** Focused is the system's `--focus-ring` — this table does
  not get a second focus colour — written on plain `:focus`, not
  `:focus-visible`, because here a mouse click IS a selection and a selection
  nobody can see is the row the keyboard then acts on "for no reason". Held
  is solid `--blue` and rises inside that same outline. The step between the
  two is what tells them apart; making both solid left the difference resting
  entirely on the shadow.
- **The lineup and the bench are ONE sequence** with a sentinel between them
  ("Not in the lineup"). Dragging across it is how somebody enters or leaves
  the lineup — one gesture, no second control, and ↑/↓ cross it the same way.
- **The keyboard is the whole gesture, not an afterthought.** Arrows walk
  focus row to row; Space (or Enter) lifts; the arrows then move the lifted
  row; Space sets it down; Esc cancels the mode before it closes anything
  else. Space is the convention every drag library documents — Enter means
  "open", which is what it does on this row outside the mode. Every move is
  announced on an `aria-live="polite"` line ("Rafael Osei, line 2 of 6").
- **Pointer drag, never HTML5 drag-and-drop.** Native drag events fire at a
  throttled rate, the held row only jumps between slots, and a displaced row
  sliding under the cursor re-fires `dragover` and swaps straight back — a
  flicker loop no easing curve fixes. framer-motion's `Reorder` gives a
  transform that follows the pointer, siblings sliding on `--ease-out-expo`,
  and touch for free.
- **Constrain the drag to the list** (`dragConstraints` + `dragElastic`
  0.08). A table card is a scroll box — `overflow-x-auto` clips on both axes
  — so an unconstrained row dragged past the last slot is cut off outright,
  outline and all, while the card grows a scrollbar. There is nothing below
  the last slot to drop on.
- **A released row settles without a bounce.** framer's default drag snap is
  an under-damped inertia spring, so a row let go with any hand velocity
  overshoots its slot and springs back. `{ bounceStiffness: 600,
  bounceDamping: 50 }` arrives once, in ~130ms. The system bans bounce, and a
  lineup is not a toy.
- **Save is live only when saving would change something** — Interaction
  States → Disabled.
- Two cascade hazards bite any custom row state built this way, and neither
  fails loudly: Interaction States → Focus.

*Shipped:* `team/roster-table.tsx` + `team/roster-view.tsx`; the write is one
`set_program_lineup` RPC, where the order given IS the numbering and anyone
absent from it is taken out of the lineup.

**What this binds elsewhere.** These are table laws, not a roster treatment,
so the next re-rankable order takes them rather than inventing a second
grammar — **Schedule** is the one on the map: its event drawer holds nine
lines in a fixed order, and the day that order becomes editable it is this
mode (toggle on the header row, grip borrowing the leading cell, one sequence,
the same keyboard gesture), not a drag handle column or a set of up/down
arrows. Three of the rules bind Schedule already, whatever it does about
ordering: law 10 (its table-level actions live inside a column, not beside
the headings), law 1's empty mark (Lines `n / 9`, Score and Result all have a
not-yet state), and the disabled-until-dirty rule below — "Enter results" is
a draft-committing primary and should be dead until the draft differs from
what is stored.

---

## Events & Matches — the Vocabulary (v3)

Two nouns, and the copy in every list follows from them. A **match** is the
unit: one player, one opponent, one score, one video. An **event** is an
optional container — Dual · Tournament · Other (opponent program, date range,
home/away) — and a match belongs to 0 or 1. There is no "dual match" record:
a dual is 6 singles + 3 doubles sharing an event.

- **Dual:** creating the event builds the lineup — `S1`–`S6`, `D1`–`D3`, mono
  line labels. Slots are real matches once the lineup is set; an unfilled one
  reads **"Awaiting result"** (5px ink-300 dot + 11px ink-600), an unassigned
  one "Line not set" (a blue "+ Set line" row in the event drawer). The team
  score adds itself up — nobody types 4–3. Video attaches to a line, never to
  the event.
- **Tournament:** no lineup — matches added as played (player · round ·
  opponent), grouped by player in round order, rounds in mono (`R32 · R16 ·
  QF · SF · F`).
- **One-off:** the upload wizard asks "Event — optional"; events are created
  from Schedule, never inside the wizard.
- **No duplicates:** video for a scored line attaches to that match; a player
  uploading their own dual video is offered their open slot. Whoever fills a
  slot is credited. Doubles are SwingVision-only for now.
- **Opponents are scoped to what names them:** personal = a private label
  from your own history; team in a dual = a program-scoped player under the
  opposing school (`opponent_player_id`, name only), reused by every later
  match so head-to-heads aggregate; outside a dual, free text. Named once in
  the Players block, never repeated as a Context field. Program players are
  edited from the roster, never from a match.

Copy conventions the lists lean on: sentence case; middots join suffixes and
counts ("Cardinal · M", "12 matches · 8 won"); waiting states say "In line —
we'll notify you", **never an invented ETA**; chrome copy is one word where
one will do (Profile · Account · Preferences · Usage · Plan · Team). The design
project's sample personas: Jordan Lee · Elena Vargas · Meridian State.

---

## v3 Primitives

**`Score`** — tiebreak scores are superscripts, never parentheses: `7-6⁴`,
digit at 0.6em raised 1.05em, 0.5px off the score. Applies to any score
anywhere, not a roster-page treatment.

**`ResultMark`** — `CircleCheck`/`CircleX`/`CircleMinus` at 14px stroke 1.5,
the outcome triple (green/red/ink-500 for a level dual). **The** outcome
register, labelled column or not — `Badge`'s word register is retired, see
Data Table rule 2. Inherits its cell's alignment, never centred. The only
green/red in a row besides form ticks; icon rather than a letter so it
survives translation.

**`Delta`** — compared-number changes color by direction: `↑` viz-good ·
`↓` viz-bad · `→` ink-500. The numeral itself stays ink-900 — direction
carries the color, not the number. Unicode arrows, never icons, and the arrow
always travels with the colour. `Delta` is the bare in-row form; labeled
evidence stats use `InsightStatChip`.

**`InsightCard` + `EngineChip`** — the one AI-authored card format. Header:
eyebrow "Focus" left + `EngineChip` right (20px ink-900 square, radius-button,
white 12×8 logo swoosh via `brightness(0) invert(1)` — never Signal Blue,
never a circle). Body: claim as a falsifiable ≤30ch sentence (text-title),
evidence at 12px ink-700 with tabular numerals — computed, never invented.
Footer: quiet blue text link + text-micro sample count ("from 12 analyzed
matches"). Renders nothing without real numbers. The engine's name lives in
the dark tooltip + `aria-label`, never as visible chrome text — icon-first
rules apply to the chip too.

**`Notice`** — two registers, both radius 8, no headings, no borders. Note
strip: passive fact (seat counts, policy effects), surface-subtle, one 13px
icon max, 11px text, optional quiet blue action — never buttons. Suggestion:
the system proposes an action — blue-tint-08 wash, bold lead names the
finding, body states the consequence, Accept (blue 500) + Decline (quiet,
never red). A suggestion earns its tint by carrying an action; a passive fact
never gets one. The same object hosts the applied-filter strip (Data Table
rule 6) and the wizard's slot suggestion (`SlotLine`, below) — the latter as a
grey strip, not a suggestion tint, since attaching to a line is reversible.

**Mode** — the third register, and the only one that is not about a record:
the surface below has temporarily become an editor, and this says which
editor and how to work it. `--blue-tint-08` wash inside a `--blue-tint-12`
border at `radius-element`, one line, `px-3.5 py-2.5`: the mode's own 14px
glyph · a bold lead naming the mode ("Setting the lineup.") · the gesture in
plain words with the keyboard path in real `Kbd` chips · and, pushed right, a
quiet 11px line saying what is **not** committed yet ("Nothing is saved until
Save lineup."). It earns the tint the way a suggestion does — by being about
an action — but it proposes nothing and has no buttons of its own; the mode's
Cancel and primary live in the page's action slot, which they have taken over
for the duration. It arrives with the mode from just above its slot and
leaves faster than it came, and the surface below is a layout-animated
sibling so it slides rather than jumps. **Stated once, above the thing it
changes** — never a hint per row, and never a second banner for the same
mode. Reorder Mode's banner is the shipped case.

**`Avatar` + `StatePill`** — profile ≠ account, and the avatar says which:
self-managed = unmarked initials (default, no chip); coach-managed = border
ring + grey pill; invited = dashed ring (no person yet, only an email);
"Claimed today" = a transition-receipt pill that decays after a session (a
one-time acknowledgment, not a permanent state). State chips are 18px pill,
10/500 ink-700 on surface-subtle — grey, never an outcome colour; "New" is the
one blue-tinted exception (Data Table rule 4). 26px in rows, 22px in menus.
The avatar is the system's one circle — entities are squares, people are
circles.

**`Radio`** (check-dot) — single-choice selection is a solid Signal Blue 14px
dot + white 9px check (stroke 2.5); unselected is a 1px ink-300 ring; disabled
is a 1px ink-200 ring at 50% opacity. One glyph means "chosen" everywhere:
dot for single-choice (`Radio`), 4px-radius square for multi-select
(`Checkbox`). `card` variant renders the option as a full card; selection
also sets border `--blue` + `--blue-tint-08` wash — the dot marks the
selected item, it never appears on hover.

**`SlotLine`** — one sentence, two hosts. When a match belongs to a lineup
slot the product says so as: line label (11px ink-500; mono only inside a
lineup list) → `chevron-right` 12px ink-300 → the matchup (12px; the
workspace's own player at 500, the opponent at 400) → a 1×14 `--border-medium`
rule → fixture facts (11px ink-600 with 13px ink-400 glyphs: `calendar` date,
`map-pin` site). The event's name is never in the line — the host already
carries it. Nothing in it is blue. Its two hosts stay separate components:
the **chrome band** (a fact you supplied — 36px, full pane width,
surface-subtle with a hairline bottom, pinned under the step bar, persisting
across the whole flow; trailing "Change" opens the lineup as a float menu) and
the **inline `Notice`** (a guess the system made — "Looks like" lead or a
check receipt, trailing Attach · Not this match, then Detach; grey, not
blue-tint, since it's reversible). They differ in lifetime, width authority
and what the trailing action does (navigate vs mutate). Personal workspaces
render neither — no schedule, no slot to state.

**`TermMark`** — the mark before a row in a short list of facts a person is
asked to read before they commit: the join flow's sharing terms
(`components/join/join-terms.tsx`) and the guardian consent acknowledgments
(`app/onboarding/onboarding-flow.tsx`). A Lucide `Check` at 14px, stroke 1.5,
`mt-[3px]` against `text-body-sm`, `aria-hidden` — the sentence carries the
meaning, the glyph only separates the rows. It replaced a 2 × 12px bar, which
read as a rendering artefact rather than a mark.

Colour is the rule, not the glyph. `--blue` marks a row where something is
gained or granted and `--ink-500` a row where nothing moves — that pairing is
what makes the sharing terms' two columns readable as "they gain this" versus
"you keep this" without a second sentence of policy. **Never `--blue` in a
list that sits above a checkbox**: `AuthCheckbox` fills Signal Blue with a
white check when set, and blue marks above it stack four blue checkmarks in
one column with only the last one meaning anything. The guardian
acknowledgments are ink for exactly that reason. Never `--ink-300` — a stroked
glyph at that weight disappears.

Not `CircleCheck`, which is `ResultMark`'s and means a match outcome. Not the
claim flow's `ArrowRight` (`components/claim/sharing-rows.tsx`), which marks
consequences that follow from an action rather than facts being read.

---

## Wizard & Task Primitives (v3)

Locked from the upload wizard. Everything reuses the tokens above — no new
colours, radii or type.

**Required mark — mark what IS required, never what's optional.** A 12px
`--error` asterisk 4px after the eyebrow, `aria-label="Required"`; the
"— optional" suffix retires everywhere, since an unmarked label is optional by
definition. `Input`, `Select`, `Textarea` and `EntitySelect` all take
`required`. The mark is the only red on a form until an error appears, and
form red (`--error`) and Loss Red never share a surface.

**Fields.** Field text is 13px across `Input`, `Select`, `EntitySelect` and
`Textarea` — never 14px. The rule is the focus indicator (1px hairline → 2px
`--blue`; see Focus → the underline opt-out); `emphasis` keeps a standing 2px
blue rule for the one field a page is asking for; disabled drops the label to
ink-300 and the text to ink-500 with the rule at 1px. `Textarea` is the one
boxed input — everything single-line stays underline.

**`FieldRow`** — one fact with a face: a 40px lead (entity square or person
circle), label, sub-label and a trailing control on a 1px hairline. It is
`EntitySelect`'s menu row grown to field scale, so the row you pick *from* in
a menu and the row you land *on* in the form read as one object at two sizes.
The active row thickens its rule to 2px `--blue` (one active row at a time);
unresolved shows a muted circle/square lead + ink-400 placeholder value.
`chevron="double"` (`ChevronsUpDown`) when the row switches between peers,
`chevron="single"` (`ChevronDown`) when it opens a list — never mixed for one
kind of row. Provenance is a tag, stated once: `text-micro` at the field's
right edge, or in the section subline when a whole section shares a source —
never both.

**`StepBar`** — 2px tall, one flex child per step, never a fixed count with
greyed segments; done and current render Signal Blue, remaining stay
`--border-hairline`.

**`InlineFacts`** — a read-back sentence whose 2–3-option facts become
tappable words (surface-subtle wash + 13px chevron, darkening to `--ink-100`
on hover). The row never grows; Change/Done swap the words, not the layout;
no Cancel — every pick is already saved, so reopening the word is the undo.

**`ScoreGrid`** — the one way a score is typed, anywhere. The header states
the format as a plain fact, never a control (Format / Scoring / Lets are their
own required Context fields upstream). 40×40 `--radius-cell` cells, 16px
tabular; focus = 1.5px blue + 2px `--blue-tint-12` ring; a digit advances
focus you → opponent → next set; a dashed ghost column (13px plus) adds a set
while the format allows one; a `TB` column appears only for a set that needs
a tiebreak score and never auto-advances. `Score`'s superscripts remain the
read-back form; `ScoreGrid` is the entry form.

**Quota meter, footer host.** A 56×3 segmented track (`--ink-100` track;
fills in order `--viz-you-mid` used, `--viz-you-light` this file) + an 11px
mono tabular readout, present **only** in a footer where hours are actually
at stake — never on the export path, never on Team Home. The fill is the one
`--viz-*` use outside a chart (the hours are the player's own); Continue stays
the only Signal-Blue object on the row. Settings · Usage is the ledger; the
footer is the receipt.

**Four rules, written down so they aren't re-decided.** *Dashed means waiting
for something real* (drop zone, invited avatar, ghost column — never for
errors, never decorative). *Provenance is a tag, stated once* (above). *A
draft is a row, not a toast* — a grey Draft `StatePill` beside the name, em
dashes in Result/Score, "Resume · step 3 of 4" in the lifecycle cell; the
header's status slot alone says "Draft saved" (`matches/draft-row.tsx` ships
this). *Opponents are scoped to what names them* (Events & Matches above).

**Selected-row check is Signal Blue, site-wide.** The 13px Lucide `check`
that marks "chosen" in a menu or card is `--blue` everywhere — the same glyph
the check-dot `Radio` carries in white. One colour means "chosen", in menus
and cards alike; the earlier ink-900 menu check is superseded. Single choice
= the check-dot `Radio`, multi-select = the square `Checkbox`; a dialog
carries one primary, never two.

---

## Personal Home Recipes (v3)

Page-specific recipes from the Personal Home & Matches canvas — not general
primitives, but locked patterns for that page's own cards.

**Home opens on numbers.** The greeting moves into the header's breadcrumb
slot; the body opens with "Your season" at 24px (`.text-title-lg`), so the
first screen's display type is a KPI number, not a title — Home is the one
exception to the title slot's 30px. *Shipped:* `dashboard/header-greeting.tsx`
+ `home/season-title.tsx`.

**Day zero is the offer over the page it offers.** Before the account holds a
single match, Home is not the populated frame and not a separate screen of
door cards — it is one centred offer with the real page quietened behind it.

*The offer* (`home/day-zero-offer.tsx`), three elements and no subline: the
sentence at **30px/300**, `-0.5px`, on a **24ch** measure so it breaks over two
lines; the primary; the conditions at `text-micro` on a 52ch measure. **70px
above, 24px gaps, 38px below.** **30px is a deliberate exception** — every
other page title runs 24px, and this is the one screen with nothing competing
for the first glance.

*One primary, one ghost, 12px apart.* "Send match video" (`advButton("primary")`)
beside "Import instead" (`advButton("ghost")`), the ghost linking to
`/dashboard/matches/new?source=swing-vision`, which preselects the wizard's
Source field. The pair is one route with two entrances, not two routes: the
param cannot skip step one, which also asks which workspace the match is filed
under and who played it. **The primary names the artifact, not the outcome.**
It read "Send a match" first; beside "Import instead" its job is to name the
other path, and "a match" is what both paths deliver — an export is a match
too. "Match video" is the product's own term (guardrails: never a highlight or
a condensed cut), and verb + object with no article is how the system writes
"Save changes" and "View report". **The ghost label stays short.** "Import a
SwingVision export" ran to 209px beside a 119px primary and the bigger grey
button stopped the blue one reading as the main action; "Import instead" sits
at 124px, against the primary's 146, and leaves naming the source to the
conditions line beneath — "A SwingVision export needs none of that."

Onboarding has already asked about a team and routed coaches and rostered
players elsewhere, so no "Join a team" belongs on either day-zero page; the
switcher's "Create team workspace" is where that lives.

*`DayZeroOffer` is shared.* Matches renders the same component with its own
sentence and measure — everything under the sentence is byte-identical, so a
player who lands on either page meets one offer. The list page's own recipe
lives with the rule that governs it: Data Table → Table page states.

The generous version is the shipped one. A height study got the same three
elements to 214px by closing the padding to 36px and the gaps to 14px, but
the air is what the block is for: the gap between the sentence and the button
is what gives the action room, and closing it makes the offer read as page
content rather than as the one thing on the screen. Roughly 80px is spent
deliberately here.

*The tail* — the real page, in its real order, each region holding its own
honest zero state (Empty State above), under **one continuous grade**: a mask
running `0.62 → 0.46 at 40% → 0.32`, so a region fades with how far down it
sits. Two dead ends got here. The strip first held full strength, on the
argument that its five labels are the page's most specific promise — but then
it was the only region not reading as background, and the page had an offer,
a solid band and a fade: two treatments for one idea. Fixing that with a
second fixed opacity produced banding, not a grade — a hard edge under the
strip and one flat value for everything below however far down it sat.
Matches had always graded properly (its five ghost rows step 1 → 0.3); this is
the same idea where the regions are cards rather than rows.

**The grade ends at 0.32, never at zero.** That is the value the tail already
sat at, so nothing at the foot of the page is fainter than it has been. It
matters most for the activity heatmap, which lives down there and whose empty
cells are `#F2F2F2` — five per cent off white before any fade — and which a
gradient running to transparent erased once already. No bottom fade to nothing: a
mask running to transparent clips the activity heatmap mid-grid, and a
calendar cut off partway through its last week reads as a fault, not depth.

*The tail is `inert`.* At 0.32 its text is far below usable contrast and its
links would be invisible tab stops. `inert` removes it from the tab order and
the accessibility tree together; `aria-hidden` plus `pointer-events-none`
leaves a link hidden from a screen reader and still reachable by keyboard. A
`sr-only` sentence above it names what will fill the page and says plainly
that nothing below is real data yet.

*No furniture.* Day zero carries no title row, no getting-set-up line and no
usage footer; all of it returns with the first match, and from then on the
frame never moves again. The matches card also drops its own action band —
the centred offer is the page's one action, and the band would be the same ask
twice.

*What each region shows empty:* KPI tile — a 34×2px rule on the value's
baseline, a grey sparkline, and "After your first match" ("When the report
lands" once a match is filed but unanalysed). Matches — three ghost rows at
the shipped 54px, stepping 1 → 0.6 → 0.35, keeping their live stat labels
because what each row will report is real information; only the values become
rules. Focus — its own anatomy holding nothing: two rules at the claim's
measure (a claim runs to about 30ch and wraps once, so full-width over
half-width is the shape it takes), two thinner and lighter ones for the
evidence run, and one line saying what arrives. A quoted example claim,
labelled **Example** in the header, was built and rejected: it demonstrated
more, but it made this the only card in the column carrying finished prose
and the largest prose in the tail, and the card sat visibly apart from its
neighbours. Serve placement — the quiet strip's own anatomy: a rule where the
claim goes, the two labelled 14px tracks holding no serves ("— serves"), the
legend at 0.6, and the caption slot carrying the one line that says what
fills it. (The hairline half court held this slot until Platform Audit Pa2 was
matched in full on 2026-09-07; it was the one region whose empty state was a
different object from its populated one, and the populated card is bars.)
Activity — the real 52×7 grid, all 364 cells empty, because a year with no
sessions genuinely is 364 empty cells; its footer reads "0 sessions · 12
months" from real data. Matches and Focus keep the populated card's hairline
footer with a true zero or the arrival line in it.

*One header grammar across the column (Pa2).* Eyebrow left — or, on the
Focus card, the 16px engine mark beside "Advantage Intelligence" in 12px
ink-700, since that card is named by who wrote it — then the card's one 11px
blue link right: "All matches" on matches, "Session log" on Activity,
"Placement view" on serve placement, "Open Statistics" on Focus. Counts leave
the header for a hairline footer under the body: "Latest 3 shown · 12 matches
· 8 won", "24 sessions · 12 months", the legend row's "Last 4 · 89 in", and
Focus's caption naming the metric the evidence used ("1st serve won · 2nd
serve won") beside "12 matches". Every Home card runs `--pad-card` (20px
all round) — the matches card too, its rows bleeding 12px for the 8px hover
inset rather than the table-card 24/16 pair. The rail is 400px; the grid runs
`items-start` and the columns bottom out where their content does — nothing
is stretched to level them. (The earlier `items-stretch` grid, whose day-zero
court grew to level the columns, went with the court.)

*Claims are 14px/300 on Home, evidence 12px/1.7 ink-600 with its figures in
ink-900* — Pa2's "quiet body" setting. The claim is a size step over the
evidence, not display type, so the largest type on the first screen stays the
KPI numbers; the evidence is something you lean in for. *Shipped:*
`home/focus-card.tsx` (header + footer shell), `home/home-ai-insight.tsx`,
`home/serve-placement-quiet-strip.tsx` (legend, caption from
`lib/ui/serve-placement-caption.ts` — first serves only, since the played
serve is the second when there was one).

**Next fixture card** — the claimed player's one forward-looking object.
Eyebrow middot-joins the stakes ("Next · B1G Conference" only when it's
actually a conference dual, else plain "Next"); grey 18px countdown pill top
right, computed ("in 3 days"), never blue, never invented; title is the
opponent's proper name (the "at/vs" preposition retires — site gets its own
row). One icon fact per row, 13px Lucide at ink-400: `calendar` date·time
(tabular) · `map-pin` site · court mark surface · `swords` "Your line · S2
singles" (mono line label) · `film` "tags itself". Fed by the team schedule
— personal Home never grows a schedule of its own.

**Serve placement quiet strip** — claim-led (the Focus grammar: eyebrow ·
claim title · evidence bars). One bar per court (Deuce/Ad), 14px tall,
radius-cell, 2px segment gaps; segments T · Body · Wide in `--viz-you` /
`--viz-you-mid` / `--viz-you-light`; label rows tabular, serve counts
right-aligned; the drawn court lives one click away on the expanded widget.

**Home result row + in-flight row** — 8a base (rounded surface-muted hover,
no dividers) + fixed columns: `ResultMark` 14px (`flex:0 0 14px`) ·
opponent 170px ("def./l." at 400 ink-600, name at 500 ink-900) · score 110px
scoreboard type with superscript tiebreaks · three right-aligned stat cells
(eyebrow-sm nowrap over 12px tabular — 1st serve · winners · errors) ·
chevron-right 13px closes every row. Rows: min-height 54px, padding 5px 12px,
gap 16. In-flight row: `Loader2` spinning 1.2s linear in the mark column ·
"vs {opponent}" · `StatusChip` Analyzing · chevron — **no elapsed time**, the
tray owns progress. Event group headers: name 13px/500 over an icon-metadata
row (calendar date · type mark — tournament icon / swords dual / `Target`
practice, crosshair retired · court mark · verified), 13px glyphs.

**Small locks** — personal-Home KPI strip defaults to the repo's five serve
cards (1st serve · 1st serve won · 2nd serve won · service games won · break
points saved), each with trend chip + sparkline; customize popover picks 4–5
across Serve/Return/Other — its trigger is hover-revealed (and shown on
focus / while open), because Platform Audit Pa2 draws the strip with an
empty corner and v3 reveals icon actions on hover. **The strip shows fewer
tiles, never narrower ones**: a tile needs 184px to hold "break points saved"
on one line inside its 20px padding, so the fifth tile leaves below 920px of
strip and the fourth below 736px, and the tile's height never changes with the
window. That is a **container** query, not a media query — the sidebar takes
either 64px or 232px, so the same 1280px window fits five tiles with the rail
and four with the panel open. Labels truncate with an ellipsis rather than
clipping: a hard clip turned "service games won" into "service game", which
reads as a different statistic. Hidden tiles stay mounted, so a customised
selection survives a resize. Card-header counts retire — no bare numeral beside
an eyebrow, no count inside an "All matches" link; counts live in sublines
and tooltips only. Low-confidence path: "Estimate · Review data" — grey fact
+ blue action, never yellow (charts-only amber) or red (outcomes/form errors
own the two reds). Cross-workspace scope is named out loud in greeting
sublines ("Friday's dual is in your team workspace") and KPI subtexts
("personal matches only").

**Reports (draft — placement not locked).** The Focus insight follows the
match block in the report's context column — identity → details → claim, from
the top, never `margin-top:auto`. `InsightCard` is the engine's one card on
Home; on a report the evidence stats are bare type (`InsightStatChip`).

---

## Settings Pages

> **Provenance.** Unlike the **(v3)** rules above, this section is not
> transcribed from the Claude Design project — it was decided in-repo while
> designing Settings › Teams (2026-09-06) and generalizes to every settings
> page and every card that lists people or meters a quota. It has no round
> number, because round numbers belong to that project's changelog. When the
> project next moves, reconcile this section rather than assuming it agrees.

### Quota widgets — a meter or a row of boxes

The form follows the quantity, not the habit:

- **Continuous quota → meter.** Analysis hours are a duration, so they get the
  6px/3px bar. The **track is a light step of the fill's own hue**
  (`#E4EEFD` under Signal Blue), never neutral `--ink-100`: a grey track only
  colours the part already spent, so state has to be re-read at the boundary
  instead of across the whole bar.
- **Countable quota, small N → unit boxes.** Seats are 25 discrete things, so
  they are 25 8px squares on 2px radius (the DS keeps circles for avatars).
  You can see "three left" without reading a number, which a bar at 20% cannot
  say. Filled = taken, **outlined = reserved but not yet taken**, `--ink-100`
  = free. That middle state is the reason the form is worth it: a held invite
  is a real thing the data tracks and a sentence buries.
- **Never both on one card.** Two quota visuals stacked read as one measure
  drawn twice; the second becomes a count in the title slot.

**Lead with what is left, and say when it renews.** `11h 48m left of 20h`
above `8h 12m / 20h` — the second makes the reader subtract to answer the
question they actually have. The figure is 24px/300 with **proportional**
figures (`tabular-nums` loosens a standalone number at display sizes; reserve
it for columns), and it stays `--ink-900` until there is something to say.

**Severity rides the fill, not the figure**: Signal Blue → `--viz-key` amber at
80% → `--danger` at 100%, each with a short label and a triangle glyph beside
it (*Running low*, *Spent — uploads pause until Oct 1*). Never colour alone.
At amber and red the figure takes the same colour, because then it *is* the
message.

**Detail unfolds in place.** A per-person breakdown is a disclosure inside the
card, not a link to the page that owns the ledger — those pages are scoped to
the **active workspace**, so a link from a record you have not switched into
shows a different program's numbers. Rows carry an 88px share bar, ordered by
magnitude, plus the in-flight total the meter includes but the list otherwise
omits (*Reserved but not yet finished*).

### Person row in a card

One shape for every person a card lists — members, invitees, usage lines:

```
[22px avatar] [name 12/500] [You] ……… [action or date 11px] [state pill 62px]
```

- **The state pill is a right-aligned column**, `width:62px`, centred text.
  Placed straight after the name it lands at a different x on every row, and a
  long email drags it further than a short name — the column is what makes the
  list scan.
- **Meta is not a biography.** Role is the pill; a position and a joining date
  beneath the name are a second, softer answer to the question the pill already
  answered. Slot the row's one useful variable there instead — a date on an
  invitation, an action on a member.
- **The role is a menu on the rows the viewer may change**, in the pill's
  column: a 28px bordered trigger (`Coach ▾`), a 212px float menu with one
  line per option saying what it lets you do, the current one carrying the
  blue check, and a closing note — *Ownership moves by transfer, not from
  this menu.* Owner is never an option. What the viewer may set mirrors
  `set_program_member_role`: an owner sees coach / staff / player on every
  row but their own; a coach sees staff / player on staff and player rows
  only. A row that is not theirs keeps the flat pill — with a lock glyph
  before it when the viewer is staff, and nothing extra for a player, for
  whom no row was ever a control. Picking commits at once.
- **Pending → outlined pill + dashed-ring avatar.** An `Invited` row is a state
  of the same list, not a different kind of row. The outlined pill deliberately
  matches the outlined seat box representing that same invite.
- **The `You` pill is the one sanctioned blue-tinted pill besides "New"**
  (design owner's call, 2026-09-06, overriding *people-state chips are grey*).
  It marks identity, not standing, so it sits **beside the name** and the role
  stays in the pill column. 18px, `--blue-tint-08` on `--blue`. A third blue
  pill costs both of these their meaning — do not add one.

### Selects on a settings page are `MenuSelect`

The product's own menu (see *Dropdown / Menu* above for the primitives):
`underline` under a `SettingsField` caption, `pill` beside a
`SettingsCardRow` label. Options with something to explain — a role, an
upload policy — get the second line; plain values (a surface) do not. There
is no native select left in settings, and none is to be added.

**Who can upload team matches** is a four-rung ladder, not a switch: *Owner
only · Owner and coaches · All staff · Everyone on the team*
(`programs.upload_policy`; `players_can_upload` is derived from it and keeps
the roster's own switch working).

### A field the viewer may not change

Never a `disabled` input: it still looks like an input, so it reads as broken
rather than as not-yours. The recipe is the field, quieted, plus a reason:

- value on a faint `--ink-100` rule (not `--border-field`, which says *editable*)
- a 11px lock glyph before it, value at `--ink-600`
- **the reason in `SettingsField`'s existing `hint` slot, naming the person**:
  *"Ask Alina Fischer, the owner, to change it."* A lock that does not say who
  holds the key sends the reader to support.

The caption stays plain — no `· owner only` tag, which restates the hint. Note
the cost: the hint makes a locked field taller than its editable neighbours, so
a two-column grid loses its shared baseline. Reserve the hint's line height on
every field in the grid where that matters.

**Field-level gating is presentation only.** The RPC behind the form must
re-check per group, the way `program_invites_role_check` fences `owner` out of
invitations. A greyed field stops nobody with a console.

### Card footnotes and their rule

`SettingsCardFootnote`'s `border-top` earns its place only when the content
above it is **not already hairline-delimited**. Above a field grid, or below a
list whose last row already drew a rule, it is a second line two pixels from
the first. Drop it there and let 14px of space do the work; keep it where the
note closes a figure, a meter, or a paragraph.

### One action, one surface

A settings card must not grow its own copy of an action another page owns. The
Members card carries no invite field: the roster's dialog can bind an
invitation to a player already listed — so their matches and video stay put —
and a second, thinner control produces orphan logins beside existing rows.
Summarize, then hand off. The split is by *what the act is*, not by page:
adding and removing people is roster admin and lives on the Roster; what a
person **is** — their role, and ownership — is decided on their row here,
because that is where the person is.

**A control that leaves the page wears `↗`, not `›`.** The chevron means
*expands* or *next step* and is already spoken for by disclosures; on the same
page as one, an outbound chevron is the same glyph with two meanings. Keep the
outline button and the title slot — only the glyph changes.

### Confirmation is a changed state, not a tick

`--success` is fenced to win/loss (`colors.css`), and a confirmation tick is
exactly the mood use that fence excludes — spend green there and it stops
meaning *won a match* on a match card. A completed action shows **the rows it
changed**, in the vocabulary of the surface behind the dialog:

```
MR  Marcus Reyes          was Coach   [ Owner ]
CG  Cj Gimena  [You]      was Owner   [ Coach ]
```

Closing the dialog then confirms what was just shown, instead of asking the
reader to trust an assertion.

### Dialog steps

**A step that re-asks what the entry point already answered must not exist.**
*Make owner* on a member row names the person; a picker step after it opened a
second copy of the member list to choose them again. Where an action can start
from the row that is its subject, start it there and let the dialog begin at
the consequence.

---

## Layout Patterns

### Title Slot (v3)

The page title is the **first element in the scroll body** — `.text-display`
(30/300 on a 36px line; the rulebook quotes −0.4px tracking, the class ships
−0.6px) with a 32px top margin and **never an eyebrow above it**. The summary
line and the actions sit on its baseline; counts live in the summary line
("6 players · 2 invites pending"), never on pills. A header carries at most
one primary, its companion `ghost`. Home is the exception: it opens on "Your
season" at 24px so the first display type is a KPI number (Personal Home
Recipes). Shipped on `settings/layout.tsx`, `team/page.tsx`,
`team/roster/page.tsx`, `help/page.tsx` and the opponents pages.

```
// Title — first in the scroll body, 32px above it
text-display   // = font-light text-[30px] leading-9 tracking-[-0.6px] text-[var(--ink-900)]
// Summary line, on the title's baseline
text-[13px] text-[var(--ink-600)]
```

The pre-v3 page heading — a 10px eyebrow (a date, a count) 12px above the
title — is retired. Where a page still draws one, it is drift.

### Page Container

```
px-14 pt-5 pb-8        /* 56px sides · 20px top — see Padding Patterns */
```

### Two-Column (Main + Sidebar)

```
grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-8
```

### Stacked Sections

```
flex flex-col gap-6
```

### Icon + Text

```
flex items-center gap-2.5
// Icon: size-3.5 strokeWidth-1.5 text-[#8A8A8E]
```

---

## Interaction States

### Hover

- Text: blue words `hover:text-[#2563EB]` (`--blue-hover`, from a `--blue` rest — see Text Colors); ink text `hover:text-[#525252]` or `hover:text-[#0D0D0D]`. A blue word never hovers to ink.
- Background: `hover:bg-[#F5F5F5]` or `hover:bg-[#FAFAFA]` — washes and text darkening only; never underlines, never inversions
- Row actions and menus reveal on hover / `focus-within`, 200ms opacity **(v3)**
- Duration: `duration-200`

### Active / Press

- `active:scale-[0.97]` (buttons) or `active:scale-[0.998]` (rows)
- `active:bg-[#EBEBEB]`

### Focus

**Write nothing.** `src/styles/design-system/focus.css` is the entire focus
treatment. It gives `<input>`, `<textarea>` and native `<select>`
`--focus-ring-field` by tag, and gives every other tabbable control —
`a[href]`, `button`, `[role="button"]`, `summary`,
`[tabindex]:not([tabindex="-1"])` — `--focus-ring`. Two separate tokens, kept
separate so fields and actionable controls *can* diverge later — not because
they currently do: as of **2026-08-26 both resolve to the same blue** (see the
table below). You add a focus class to nothing, and a hand-rolled `<input>` is
covered as-is. Two families of field opt out of even this ring entirely — see
"The wrapper-ring pattern" and "The underline opt-out" below.

The two shipped rings, defined in `effects.css`:

| Token | Value |
|---|---|
| `--focus-ring` | `0 0 0 2px var(--blue-ring-40)` |
| `--focus-ring-field` | `0 0 0 1px var(--field-ring), 0 0 0 2px var(--field-ring-30)` |

`--field-ring` aliases straight to `--blue-ring-*` (`colors.css`) as of
2026-08-26. It sat on the neutral `--ink-500` for a while — a form that rang
every field in blue "spent the accent" once per field, the argument went — and
was reverted at the design owner's explicit call: one consistent focus colour
across the whole product mattered more. Nothing about the reversion needed new
contrast work — `--blue` already clears WCAG 1.4.11's 3:1 floor against both
surfaces `--ink-500` was measured on: 3.68:1 on white, 3.38:1 on #F5F5F5
(`--surface-field`), both independent of why it lives here now. Do not read
this as license to swap `--field-ring` again casually — it is aliased rather
than hard-coded specifically so the next change is a one-line edit here, not a
grep-and-replace, but it is still a product decision, not a free variable.

The field ring is two layers on purpose regardless of which colour occupies
`--field-ring`: the 30% band alone composites too faint to read on its own —
present in devtools, easy to miss for a keyboard user. The opaque 1px layer is
what you actually see; the band only softens its outer edge. The measurements
are in DESIGN.md → Focus.

`focus.css` is imported outside any `@layer` while Tailwind utilities live in
`@layer utilities`, and unlayered CSS wins regardless of specificity — so
`focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40` on a button, a link or a
field does **not** override the default. It is silently discarded, and you have
written dead classes. Its `:where()` wrapper keeps specificity at 0, but that
only matters against other unlayered rules. To override, change the token or
write unlayered CSS. `advButton()` agrees by value rather than by utility — it
sets `focus-visible:shadow-[var(--focus-ring)]`, the same property the file
uses, so nothing is competing.

**A programmatically focused element does NOT match `:focus-visible`**
(measured on a row focused from its own `pointerdown` handler). Anywhere a
click is a *selection* rather than a navigation — the lineup's rows are the
shipped case — the ring the system gives you never fires, and the component
must write `focus:shadow-[var(--focus-ring)]` on plain `:focus` itself. Do
that **by value, not by invention**: on a keyboard both rules match, the
unlayered one wins, and since it carries the same token nothing is competing
and no `!important` is needed. This is `advButton()`'s approach applied to a
row.

**A third override exists for a state the system has no token for:
`!important`.** An important declaration in a stylesheet beats an unlayered
*normal* one, so `shadow-[0_0_0_2px_var(--blue)]!` lands where the same
utility without the `!` is silently discarded. Reach for it only where the
component genuinely needs a value the system does not define — the lineup's
**held** row, which is a product state and not a focus state — never to
restyle the standard ring, which is a token edit, and never for a focused
state, which should agree by value as above.

**Inline `style` is NOT a safe override on a `motion` component**, though
inline normally wins. framer-motion owns that element's `style` attribute and
does not clear a key that stops being passed: a row that stopped being
focused kept the outline it was last given, and two rows read as selected at
once. framer also writes `z-index` inline on every `Reorder.Item`, which
beats a `z-*` class — flag that too, or the row below paints its hover wash
over the bottom 2px of your outline.

Treat that as a known defect rather than as settled design — it fails silently,
which is how 209 such declarations accumulated across 61 files before anyone
noticed. A few encoded a *different* ring than the system's: `ui/input.tsx` set
`#E5E5E5`, the value retired for measuring 1.26:1. All 209 were deleted in
`247f054`, so `src/` carries none today.

Two structural fixes remain, and neither is done: importing the design-system
CSS into a named layer, so a utility overrides normally and this warning
collapses to "prefer the token"; and a lint rule or test-gated grep that makes
the dead class a build failure. Nothing enforces this today — the repo has no
CI, and the ESLint hook is non-blocking — so the rule below is the only thing
standing between a new author and a silently inert focus treatment. Write no
focus class.

**The wrapper-ring pattern is the first of two exceptions to "write nothing."** When the
input sits inside a bordered box and the box is what reads as the field, the
ring belongs on the box — otherwise it draws inset, floating inside the border.
Put the ring on the wrapper and `data-focus-ring="none"` on the inner control so
it does not draw a second one. Which selector you use depends on what else is in
the box:

| The box holds | Selector on the wrapper | Worked example |
|---|---|---|
| the input and nothing else focusable | `focus-within:shadow-[var(--focus-ring-field)]` | `claim/program-search.tsx` |
| the input **and** other focusable children | `has-[input:focus-visible]:shadow-[var(--focus-ring-field)]` | none in `src/` today — see below |

`focus-within` matches on any descendant, so in a box that holds more than the
input it double-rings: in the bulk-invite dialog that first needed this, each
email chip carried a remove `<button>`, and focusing one drew the wrapper's
neutral ring and the button's own blue ring at the same time — two indicators,
two colours, the larger one on an element that was not focused. Keying on
`input:focus-visible` scopes the wrapper ring to the case it exists for.
(The native-select-over-a-pill that was the third case is gone — every
select is `MenuSelect` now, whose trigger is a plain button and rings itself.)

**The underline opt-out is the second exception to "write nothing."** A field
whose own rule visibly changes on focus — thickens, recolours, or both — needs
no ring at all: that change is already the one indicator WCAG 2.4.7 (AA) asks
for, and the standard's own guidance is that a surrounding ring is not required
once some other on-focus change is clearly visible. Stacking the neutral ring
on top of a rule that already answers the question is redundant chrome, not a
second layer of safety, and it reads on screen as a stray box sitting on a
field that was already fine. Put `data-focus-ring="none"` directly on the
input or select — there is no wrapper here, so nothing else to key the
selector on:

| Component | File |
|---|---|
| `FormField`'s input | `auth/form-field.tsx` |
| `SettingsUnderlineInput` | `settings/settings-card.tsx` |
| `UnderlineSelect` | `team/player-fields.tsx` |
| `ProfileSelect`'s inline `<select>` | `settings/profile-form.tsx` |
| `NameField` | `schedule/lineup-editor.tsx` |
| `UnderlineField`'s children, `PlayerRow`'s name input | `matches/match-actions/edit-match-dialog.tsx` |
| the player/opponent name inputs | `matches/new-match-wizard/DetailsContent.tsx` |

The opt-out is earned by an actual on-focus change, never by looking like an
underline. `schedule/field-row.tsx`'s defaults row draws a hairline that never
changes — no thickening, no recolour, nothing — so it keeps the neutral ring:
remove it there and the field drops from one indicator to zero, which is
precisely the failure this file exists to prevent. Before adding this
attribute anywhere new, find the actual `:focus`/`:focus-within` rule that
changes the control and confirm it fires — do not assume a `border-b` alone
qualifies.

`data-focus-ring="none"` is the opt-out for both exceptions, and it lives in
`focus.css` scoped to `:focus-visible` rather than as an inline
`style={{ boxShadow: "none" }}` on the input. Inline would suppress the focus
ring **and** any shadow the component ever sets for its own reasons,
unconditionally and invisibly to anyone grepping for focus. The attribute
suppresses exactly one rule in exactly one state, and stays inside `:where()`,
so it is still specificity 0.

Three gotchas, in the order you will actually hit them:

- The split is keyed on tag name, so `input[type=checkbox]` and
  `input[type=radio]` take the **neutral** ring even though they are actionable
  controls the rest of the system rings in blue. Two live call sites today.
- `border-color` is not part of the ring, so `focus:border-[var(--blue)]` still
  turns a field blue regardless of `data-focus-ring`. On an underline field
  that recolour IS the indicator the opt-out relies on — pair the two, per the
  table above. On a boxed field with no such opt-out set, the same recolour is
  just a leak.
- Radix's `SelectTrigger` is a `<button>`, so it takes the blue ring rather
  than the carve-out. Latent — that component has no call sites yet — but it
  will bite whoever adds the first one.

The rule exists because the reset leaves `outline: none` on everything, which
left keyboard users with no focus indicator at all (WCAG 2.4.7 AA). Recolour a
ring, or delete it where a control already shows focus some other way — never
delete the only indicator a control has.

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
arithmetic in a pure module so a test can hold it. *Shipped:*
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

### Glyph Registry (v3)

From `nav.ts` + chrome. StrokeWidth 1.5 everywhere except the row-menu
trigger's `MoreHorizontal` (1.75, the one exception).

| Glyph | Use | Size |
|---|---|---|
| `Home`, `Video`, `Calendar`, `BarChart3`, `MessageSquare`, `Users`, `Swords`, `Settings`, `HelpCircle` | Nav — Home / Matches (both workspaces) / Schedule / Statistics / Ask / Roster / Compare / Settings / Help | 16px (`size-4`) |
| `PanelLeftClose`/`PanelLeftOpen`, `ChevronsUpDown`, `Activity`, `Search`, `ChevronDown`/`ChevronRight`/`ChevronLeft`, `ArrowUpRight`, `Check`, `Plus`, `X`, `Loader2` | Chrome — rail toggle, workspace switcher, tray, search, menus, drawer stepping and close; `ArrowUpRight` = "open as page" in a drawer header | 15px header, 14px inline, 12px chevrons |
| `Check` | Also `TermMark` — the row mark in the join sharing terms and the guardian acknowledgments. Blue where something is gained, ink where nothing moves, never blue above a checkbox | 14px, stroke 1.5 |
| `MoreHorizontal`, `Pencil`, `Trash2`, `Upload` | Row and drawer actions | 14px / 1.75 stroke on `MoreHorizontal` |
| `SlidersHorizontal`, `Timer`, `CircleHelp`, `LogOut` | Profile menu — Preferences / Usage / Help / Sign out | 13px |
| `CircleCheck`, `CircleX` | `ResultMark` — match outcome ONLY, never repurposed for analysis lifecycle (that's `StatusChip`'s dot + text) | 14px |
| `Calendar`, `MapPin`, `Swords`, `Film`, `Target` | Fixture/event metadata (`Target` = practice; the crosshair icon it replaced is retired) | 13px, `--ink-400` |

`Video` covers Matches in **both** workspaces; `Calendar` belongs only to the
fixtures list (Schedule/Events) — the two must not swap.

