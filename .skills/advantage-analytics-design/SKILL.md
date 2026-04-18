# Advantage Analytics Design System

The canonical source of truth for all UI across the app. Read this before building any interface.

---

## Brand & Users

**Users**: Competitive tennis players — college athletes, serious club players, coaches, parents tracking juniors. Not casual players. They want confidence in their data.

**Personality**: Modern. Athletic. Innovative.

**Feel**: Premium and exclusive — built for high-level players trying to improve, not a mass-market consumer app. Think pro-level training room, not "for everyone and their grandma."

**Theme**: Light mode only. Cool-neutral palette (grays + blue). No warm tones, browns, or earthy colors.

**Accessibility**: WCAG 2.1 AA — 4.5:1 contrast (normal text), 3:1 (large text).

## Design Principles

1. **Data speaks first** — Layouts prioritize legibility of match data. No ornamental elements competing with numbers.
2. **Earned trust through precision** — Aligned tabular numbers, consistent spacing, exact token usage. Players trust tools that feel meticulously crafted.
3. **Quiet confidence** — Light font weights, subtle borders, restrained color. Confidence through clarity, not volume.
4. **Pro-level exclusivity** — Design for the player who knows what second-serve percentage means. Density is acceptable when it serves understanding.
5. **One accent, one purpose** — Blue (#3B82F6) = action/emphasis. Green (#5DB955) = winning/positive. Red (#E51837) = losing/negative. No other semantic colors. No decoration colors.

**Banned**: Bounce/elastic animations, glassmorphism, neon accents, gradient-heavy surfaces, playful illustrations, gamification badges, warm/earthy tones, non-Inter fonts, non-Lucide icons.

---

## Typography

**Font**: Inter only. Weights: 300 (light), 400 (normal), 500 (medium), 600 (semibold), 700 (bold — scores only).

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
- Second serve dot: `rgba(129,140,248,0.5)`

### Match Detail Colors

Match detail and video sections use additional colors for multi-player differentiation and status:

| Token | Value | Use |
|-------|-------|-----|
| player-2 | `#6366F1` | Secondary player/opponent color in charts |
| player-2-text | `#4338CA` | Player 2 text on white or soft-indigo bg (WCAG AA) |
| player-2-soft | `#EEF2FF` | Player 2 soft pill/highlight background |
| player-1-text | `#1D4ED8` | Player 1 text on white or soft-blue bg (WCAG AA) |
| player-1-soft | `#EFF4FF` | Player 1 soft pill/highlight background |
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
| shadow-card-emphasis | `shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]` | Emphasized cards |
| shadow-card-raised | `shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]` | Raised cards (activity) |
| shadow-dropdown | `shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]` | Dropdowns, popovers |
| shadow-floating | `shadow-[0px_8px_32px_rgba(0,0,0,0.25),0px_0px_0px_1px_rgba(255,255,255,0.06)_inset]` | Dark floating UI |

Tailwind utility shadows are also used in specific contexts:
- `shadow-none` — Explicit shadow removal (buttons, flat elements)
- `shadow-xs` — Upload modal cards, subtle elevation
- `shadow-sm` — UI component defaults (shadcn/ui base)

---

## Animation & Motion

### Easing Curves

| Name | Value | Use |
|------|-------|-----|
| EASE_CURVE | `[0.25, 0.46, 0.45, 0.94]` | Primary custom easing |
| EASE (spring-like) | `[0.23, 1, 0.32, 1]` | Header, layout transitions |
| EASE_CHART | `[0.2, 0, 0.4, 1]` | Chart/data transitions |

**Forbidden**: bounce, elastic, glassmorphism effects.

### Duration Scale

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
| `200ms` | Default CSS hover transition (`transition-colors duration-200`) |

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

### Button (Ghost)

```
text-[10px] font-medium uppercase tracking-[1.5px]
rounded-full px-3 py-1.5
border border-[#EAECF0] text-[#525252]
hover:bg-[#F5F5F5] transition-colors duration-200
```

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

---

## Navigation Patterns

### Sidebar Nav Item

```
h-9 rounded-lg text-[13px] whitespace-nowrap
pl-[13px] pr-3.5 py-3 gap-3
text-[#8A8A8E] hover:text-[#3C3C43] hover:bg-[#F5F5F5]
transition-colors duration-200
// Active:
bg-[#EBF2FD] text-[#3B82F6]
```

### Header

```
sticky top-0 z-30 h-11 py-4 px-4 bg-white
border-b transition-colors duration-200
// Default: border-transparent
// Scrolled: border-[#EBEBEB]
```

### Breadcrumb

```
text-[11px] font-normal
// Inactive: text-[#888888] hover:text-[#525252]
// Active: text-[#0D0D0D]
// Separator: ChevronRight text-[#CCCCCC]
```

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

```
focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none
```

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

