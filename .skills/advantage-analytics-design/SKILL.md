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
> the activity tray, workspace switcher — plus locked rules for future work
> (the Round 15 table laws, new data primitives). **It changes no existing
> token value**; the only additions are five chrome-dimension tokens
> (`--rail-width`, `--panel-width`, `--rail-row`, `--rail-icon-col`,
> `--header-h`, in [`spacing.css`](../../src/styles/design-system/spacing.css))
> and 9 new component primitives (`DataTable`, `Delta`, `ResultMark`,
> `InsightCard`+`EngineChip`, `Notice`, `Avatar`+`StatePill`, `Radio`,
> `EntitySelect`, `ActivityTray`). Rules folded in below are marked **(v3)**;
> where a v3 rule contradicts a pattern printed elsewhere in this file (nav
> active state, notably), **v3 wins** — the contradicted pattern has been
> corrected in place, not left standing.

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

**Banned**: Bounce/elastic animations, glassmorphism, neon accents, gradient-heavy surfaces, playful illustrations, gamification badges, warm/earthy tones, non-Inter fonts, non-Lucide icons. **(v3)** Colored left-border stripes, nested cards, font weights 800+, hover-peek sidebars (the rail toggles, it never expands on hover), bare unlabeled icon buttons (every icon-only control needs an `aria-label` **and** a dark tooltip), invented ETAs or fake progress, center-aligned table cells, tinted/bannered result cells, filter chips (a filter cut reads as one sentence in a strip, never a chip row).

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
| text-accent | `text-[#3B82F6]` | Links, active nav, primary actions |
| text-accent-hover | `text-[#2563EB]` | Hover state for accent text |
| text-success | `text-[#5DB955]` | Wins, positive changes |
| text-error | `text-[#E51837]` | Losses, negative changes |
| text-inverse | `text-white` | Text on dark backgrounds |
| text-muted-alt | `text-[#71717A]` | Tertiary metadata, match detail timestamps |
| text-muted-dim | `text-[#777777]` | KPI change labels |
| text-inverse-muted | `text-white/50` | Muted text on dark backgrounds |

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
- Second serve dot: `rgba(129,140,248,0.5)` — **retired (v3, Round 14).** Second
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

- Card internal: `p-5` (20px)
- Page container: `px-8 py-10`
- Compact horizontal: `px-4`
- Medium horizontal: `px-6`
- List item vertical: `py-2.5` to `py-3`
- Button: `px-3 py-1.5`
- Card header: `h-14 px-5` or `px-6 py-4`

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

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | Micro-feedback, colour swaps |
| `--duration-hover` | 200ms | Hover and colour transitions (`advButton()` uses this; its press is a separate hard-coded 80ms — 200ms there reads as a bounce) |
| `--duration-enter` | 300ms | Page and section enter — reserved, no call sites yet |
| `--duration-reveal` | 400ms | Larger reveals — reserved, no call sites yet |

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
> blue; people-state chips are grey, never blue.

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

### Status Badge (Win/Loss)

```
px-1.5 py-1 rounded-[6px] text-[10px] font-semibold
// Win
bg-[rgba(115,230,104,0.15)] text-[#5DB955]
// Loss
bg-[rgba(229,24,55,0.15)] text-[#E51837]
```

### Form Pill (Win/Loss)

```
w-5 h-5 rounded-[3px] flex items-center justify-center text-[9px] font-semibold
// Win: bg-[rgba(115,230,104,0.15)] text-[#5DB955]
// Loss: bg-[rgba(229,24,55,0.15)] text-[#E51837]
```

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

Tooltips over visualizations (court dots, heatmap cells, serve zones) use a consistent floating box — no caret/arrow.

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

### Empty State

```
flex flex-col items-center justify-center py-12 px-6 text-center
// Icon container: bg-[#F5F5F5] p-4 rounded-full
// Icon: h-8 w-8 text-[#888888]
// Title: text-[#0D0D0D]
// Description: text-[12px] text-[#888888]
```

### Keyboard Shortcut Chip (`<kbd>`)

Always render keyboard hints inside a semantic `<kbd>` element, marked `aria-hidden="true"` when an `aria-label` already conveys the shortcut. Use `inline-flex` so the chip aligns with adjacent text/icons.

**Light surface (default)** — search trigger, dismiss hints, back-to-list affordances:

```
inline-block px-1 py-0.5 rounded
text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]
```

Let the chip auto-size from its text + padding rather than imposing a fixed height. This is what makes the contents sit in their natural type-metric position — fixed heights center the line-box geometrically, but lowercase letters with no ascenders/descenders (like `esc`) appear visually low inside that box. With `py-0.5` the chip hugs the actual cap-height/x-height of the rendered text, matching the cadence of `⌘K` and `esc` chips throughout the app.

**Inverted surface** — on accent (`#3B82F6`) buttons or other dark backgrounds:

```
inline-block px-1 py-0.5 rounded
text-[10px] font-medium leading-none bg-white/20 text-white
```

**Lowercase word-named keys** (`esc`, `tab`, `enter`) — append `[font-variant-caps:small-caps]` to the chip className. Inter at 10px renders lowercase letters at x-height only, which sit visually low inside the chip because they don't fill the line-box like cap-height letters do; small-caps renders them as small uppercase glyphs at cap-height so they center alongside modifier+letter combos like `⌘K`. Source text stays lowercase; the variant only changes the visual form.

**Inline (in body copy)** — for "or press ⌘S" style hints, no chip background:

```
text-[#525252] font-medium
```

**Symbol conventions**

- macOS modifiers: `⌘` (⌘), `⌥` (⌥), `⌃` (⌃), `⇧` (⇧). Concatenate without a `+` (`⌘K`, not `⌘+K`).
- Windows/Linux modifiers: spell out and join with `+` (`Ctrl+S`, `Alt+K`).
- **Letter keys in modifier combos stay UPPERCASE** (`⌘U`, `⌘K`, `⌘S`, `Ctrl+S`). They read as a hotkey, not a label.
- **Standalone word-named keys are lowercase** (`esc`, `enter`, `tab`, `space`). They read as a label, not a glyph.
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
page scopes itself).

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

### Activity Tray (v3)

Header icon (Lucide `activity`, 15px) + 6px Signal-Blue dot at top-right —
presence, not arithmetic: **no numeric badges anywhere in the chrome**, the
count lives only in the tooltip ("2 in flight") and matching `aria-label`.
Opens a 326px "Notifications" panel: unread-dot rows, 3px progress tracks
(live sheen only while something is actually running), settled
"Report ready — {match}" rows. No "mark all read" control — the badge counts
moving work and clears itself when nothing is in flight. Only the upload
shows a measured ETA; queued work says "In line" — never an invented number.
Empty state: "Nothing in flight."

### Header (v3)

```
sticky top-0 z-30 h-[var(--header-h)] px-4 bg-white
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
hover wash, 260px menu.

**Workspace title** (Round 11g) — the header's leading slot on
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

---

## Dialog (v3 — Round 11 anatomy)

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

```
// Container (p-1 gives inset gap for rounded item highlights)
absolute right-0 top-full mt-1.5 w-44 rounded-xl
overflow-hidden border border-[#E5E5EA] bg-white p-1
shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]

// Item (inset rounded — matches sidebar nav highlight pattern)
flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[#1D1D1F]
hover:bg-[#F5F5F5] focus-visible:bg-[#F5F5F5] focus-visible:outline-none active:bg-[#EBEBEB]
transition-colors duration-100

// Divider
h-px bg-[#E5E5EA] mx-2 my-1
```

**EntitySelect (v3)** — the "For" field, picking a person or someone new.
Float menu radius 12, 6px padding; rows 38px (radius 8, hover surface-subtle,
selected keeps the wash + a 13px ink-900 check). Person row = 22px avatar +
12/500 name + 11px ink-500 middot-joined meta. "Someone new" is always first,
above a hairline, dashed-ring avatar. Section labels are quiet sentence case
(11px ink-400) — no uppercase eyebrows inside menus, no nested menus.

---

## Data Table (v3 — the Round 15 table laws)

Governs **every** table in the product — Matches, Roster, Events, Schedule —
not a page-specific treatment. Generalizes `matches/match-card-list.tsx` +
`match-actions/match-actions-menu.tsx`.

1. **Column order is a decision sequence, left to right: outcome → who →
   measure → context → when.** Never fence a column with rules or washes to
   signal importance — priority is position, not a border. Canonical orders:
   Matches = Result · Opponent · Score · Event · Analysis · Date · chevron;
   Roster = ResultMark · Opponent · Score · Date · Delta; Schedule = Date ·
   Event · Site · State · Team score. Text and its header flush left;
   numeric measures and headers flush right; scores flush left in one fixed
   column (116px in Matches) at one precision, tabular. **Never
   center-align anything.** Exactly one fluid cell per table (Analysis in
   Matches, State in Schedule) — everything else fixed/bounded so scores and
   dates start at the same x on every row.
2. **The result cell has no container.** A tinted "banner" was built and
   rejected. `Badge` stays bare tracked uppercase text (10/500, 2.5px
   tracking, success/danger) — the word already carries the meaning, and a
   tint makes the outcome louder than the Score beside it. If bare reads
   faint: widen the Result column, or use `ResultMark`'s glyph instead in
   headerless dense rows. Word under a labeled "Result" header, glyph in
   headerless rows — **never both in one row, never a bare W/L letter** (it's
   standings shorthand and doesn't translate).
3. **The row end encodes behavior.** The 13px trailing column is never
   empty: `chevron-right` (ink-300) when the row opens a destination;
   `chevron-down` when it expands in place, rotating 180° on open (200ms).
   Held resting AND hovered — it never moves or hides, so nothing shifts
   between states.
4. **Row state pills.** "New" joins Shared/Private as a grey 18px `StatePill`
   (10/500 ink-700 on surface-subtle) beside the row's primary name.
   **Unread is not a dot and not a column** — the dot-column pattern retired
   from data tables (the 6px blue dot stays the activity tray's mark alone).
   Mark the exception, not the norm. Max one state pill per row.
5. **Row actions on hover:** surface-muted wash on the rounded
   `radius-element` row, inset 8px from the card edge; the lifecycle cell
   swaps for a `⋯` trigger (`MoreHorizontal`, stroke 1.75 — the one
   exception to strokeWidth 1.5 in the product) in a 28px radius-element
   square, opening a 12px-radius float menu with destructive last.
6. **Filter panel + applied strip.** One panel, sectioned: facets about the
   record first, facets about the counterparty below a hairline under an
   "Opponent" heading. 2–3 options → segmented row with an "Any" default;
   longer lists → checkboxes. Live match count in the footer beside a quiet
   "Clear all". On apply the panel **closes** and a note strip states the cut
   in words — plain sentence · middot · "N of M" · one quiet "Clear filter" —
   **never chips, never a badge**. Engaged trigger uses the nav-active
   grammar (surface-subtle wash + ink-900, no border/dot/count).
7. **Table page states.** Day zero renders title, primary action and usage
   footer identically to the populated page — the frame never moves; chips
   and table are absent, not skeletoned; the middle carries one 24px light
   line, one sentence, two quiet paths. The resting view is never
   pre-filtered — it carries lifecycle chips (All · New · In progress ·
   Estimates) **with counts inside the chip itself** (this is the one place
   a count lives outside a tooltip — it's page content, not chrome), and the
   long tail lives in the filter panel. A filtered view is its own screen,
   never a mutation of the resting one — the resting frame must keep
   showing its in-flight and estimate rows regardless of what's filtered.
   Lifecycle cell copy:
   "View report" when ready · `StatusChip` while running (no elapsed time —
   the tray owns progress) · "Estimate · Review data" for low confidence
   (grey fact + blue action, never yellow, never red).
8. **8a is the default row treatment** — 52px fixed rows, hairline under the
   header only, none between rows; hover = surface-muted wash on a rounded
   radius-element row inset 8px. Eyebrow headers over 8a rows is the
   sanctioned combination. *(Erratum, Aug 24 2026: an earlier v3 DataTable
   spec called for hairlines between every row — 8a's site-wide lock above
   supersedes that for every dense result list; the labeled Result-header
   register survives only where a table keeps column headers at all.)*

---

## New Data Primitives (v3)

**`Score`** — tiebreak scores are superscripts, never parentheses: `7-6⁴`,
digit at 0.6em raised 1.05em, 0.5px off the score. Applies to any score
anywhere, not a roster-page treatment.

**`ResultMark`** — `CircleCheck`/`CircleX` at 14px stroke 1.5, the outcome
pair (green/red). The glyph register for headerless dense rows, paired with
`Badge`'s word register for labeled-column rows — see Data Table rule 2. The
only green/red in a row besides form ticks; icon rather than a letter so it
survives translation.

**`Delta`** — compared-number changes color by direction: `↑` viz-good ·
`↓` viz-bad · `→` ink-500. The numeral itself stays ink-900 — direction
carries the color, not the number.

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
never gets one.

**`Avatar` + `StatePill`** — profile ≠ account, and the avatar says which:
self-managed = unmarked initials (default, no chip); coach-managed = border
ring + grey pill; invited = dashed ring (no person yet, only an email);
"Claimed today" = a transition-receipt pill that decays after a session (a
one-time acknowledgment, not a permanent state). State chips are 18px pill,
10/500 ink-700 on surface-subtle — **never blue**. The avatar is the system's
one circle everywhere except the account menu.

**`Radio`** (check-dot) — single-choice selection is a solid Signal Blue 14px
dot + white 9px check (stroke 2.5); unselected is a 1px ink-300 ring; disabled
is a 1px ink-200 ring at 50% opacity. One glyph means "chosen" everywhere:
dot for single-choice (`Radio`), 4px-radius square for multi-select
(`Checkbox`). `card` variant renders the option as a full card; selection
also sets border `--blue` + `--blue-tint-08` wash — the dot marks the
selected item, it never appears on hover.

---

## Personal Home Recipes (v3, Round 13)

Page-specific recipes from the Personal Home & Matches canvas — not general
primitives, but locked patterns for that page's own cards.

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
across Serve/Return/Other. Card-header counts retire — no bare numeral beside
an eyebrow, no count inside an "All matches" link; counts live in sublines
and tooltips only. Low-confidence path: "Estimate · Review data" — grey fact
+ blue action, never yellow (charts-only amber) or red (outcomes/form errors
own the two reds). Cross-workspace scope is named out loud in greeting
sublines ("Friday's dual is in your team workspace") and KPI subtexts
("personal matches only").

---

## Layout Patterns

### Page Heading (Label + Title)

```
flex flex-col gap-3
// Label
text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]
// Title
font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px]
```

Used on Home (date + greeting), Matches (count + title), Statistics (count + title). The `gap-3` (12px) between label and title is required.

### Page Container

```
px-8 py-10
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

- Text: `hover:text-[#2563EB]` or `hover:text-[#525252]`
- Background: `hover:bg-[#F5F5F5]` or `hover:bg-[#FAFAFA]`
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
(`settings/settings-inline-select.tsx` is a third case that stays on
`focus-within`: its `<select>` is `opacity-0`, so there is no second ring to
collide with and no opt-out to set.)

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

Common sizes: `size-3` (12px), `size-3.5` (14px), `size-4` (16px), `size-5` (20px), `size-8` (32px empty states).

### Glyph Registry (v3)

From `nav.ts` + chrome. StrokeWidth 1.5 everywhere except the row-menu
trigger's `MoreHorizontal` (1.75, the one exception).

| Glyph | Use | Size |
|---|---|---|
| `Home`, `Video`, `BarChart3`, `MessageSquare`, `Users`, `Swords`, `Settings`, `HelpCircle` | Nav — Home / Matches (both workspaces) / Statistics / Ask / Roster / Compare / Settings / Help | 16px (`size-4`) |
| `PanelLeftClose`/`PanelLeftOpen`, `ChevronsUpDown`, `Activity`, `Search`, `ChevronDown`/`ChevronRight`, `Check`, `Plus`, `Loader2` | Chrome — rail toggle, workspace switcher, tray, search, menus | 15px header, 14px inline |
| `MoreHorizontal`, `Pencil`, `Trash2` | Row actions | 14px / 1.75 stroke on `MoreHorizontal` |
| `SlidersHorizontal`, `Timer`, `CircleHelp`, `LogOut` | Profile menu — Preferences / Usage / Help / Sign out | 13px |
| `CircleCheck`, `CircleX` | `ResultMark` — match outcome ONLY, never repurposed for analysis lifecycle (that's `StatusChip`'s dot + text) | 14px |
| `Calendar`, `MapPin`, `Swords`, `Film`, `Target` | Fixture/event metadata (`Target` = practice; the crosshair icon it replaced is retired) | 13px, `--ink-400` |

`Video` covers Matches in **both** workspaces; `Calendar` belongs only to the
fixtures list (Schedule/Events) — the two must not swap.

