# Advantage Analytics Design System

Authoritative reference for every design token in the Advantage Analytics codebase. Read this before building any UI.

---

## Font

**Inter** is the only typeface. Loaded via `next/font` as `--font-inter`.

| Weight | Tailwind class | Usage |
|--------|---------------|-------|
| 300 | `font-light` | Hero, page headings, stat values |
| 400 | `font-normal` | Body text, descriptions |
| 500 | `font-medium` | Section headings, labels, buttons |
| 600 | `font-semibold` | Change indicators, badges |

---

## Typography Scale

| Token | Size | Weight | Line-height | Tracking | Color | Context |
|-------|------|--------|-------------|----------|-------|---------|
| Hero | `text-[56px]` | `font-light` | `leading-[1.05]` | `tracking-[-1px]` | `text-white` | Auth brand panel |
| Page heading | `text-[30px]` | `font-light` | `leading-[30px]` | `tracking-[-0.6px]` | `text-[#0D0D0D]` | Dashboard pages |
| Auth heading | `text-[28px]` | `font-light` | `leading-[1.1]` | `tracking-[-0.5px]` | `text-[var(--color-text-primary)]` | Auth form titles |
| Stat value | `text-[28px]` | `font-light` | `leading-none` | `tracking-[-0.5px]` | `text-[#0D0D0D]` | KPI cards, stats grid |
| Section heading | `text-xl` | `font-medium` | default | `tracking-tight` | `text-[#0D0D0D]` | Card/section titles |
| Body | `text-[16px]` | `font-normal` | `leading-[24px]` | `tracking-[-0.4px]` | `text-[#0D0D0D]` | Paragraph text |
| Body small | `text-sm` (14px) | `font-normal` | default | default | `text-[#0D0D0D]` | List items, table cells |
| Caption | `text-[13px]` | `font-light` | default | default | `text-[#0D0D0D]` | Scores, sidebar nav |
| Description | `text-[12px]` | `font-normal` | default | default | `text-[#71717A]` | Subtitles, helper text |
| Change value | `text-[11px]` | `font-medium` | default | default | `text-[#5DB955]` / `text-[#E51837]` | KPI change indicators |
| Page label | `text-[10px]` | `font-medium` | default | `tracking-[3px]` | `text-[#AAAAAA]` | Uppercase date/count labels above page headings |
| Widget label | `text-[10px]` | `font-medium` | default | `tracking-[2.5px]` | `text-[#AAAAAA]` | Uppercase widget titles (win rate, key stats) |
| KPI label | `text-[9px]` | `font-normal` | default | `tracking-[2px]` | `text-[#AAAAAA]` | Uppercase KPI card labels |
| Micro | `text-[9px]` | `font-medium` | default | `tracking-[2px]` | `text-[#AAAAAA]` | Smallest uppercase labels |

All uppercase labels use the `uppercase` utility.

Stat values add `tabular-nums` for aligned numerals.

---

## Color Palette

### Text

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| Primary | `#0D0D0D` | `text-[#0D0D0D]` | Headings, stat values, body |
| Secondary | `#71717A` | `text-[#71717A]` | Descriptions, helper text |
| Muted | `#AAAAAA` | `text-[#AAAAAA]` | Labels, placeholders |
| Dim | `#888888` | `text-[#888888]` | Auth muted text (CSS var `--color-text-muted`) |
| Faint | `#BBBBBB` | `text-[#BBBBBB]` | Auth faint text (CSS var `--color-text-faint`) |
| Sidebar inactive | `#8A8A8E` | `text-[#8A8A8E]` | Nav items (inactive) |
| Change sublabel | `#777777` | `text-[#777777]` | KPI change period label |

### Accent & Semantic

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| Accent blue | `#3B82F6` | `text-[#3B82F6]` / `bg-[#3B82F6]` | Primary actions, active nav, links |
| Accent blue hover | `#2563EB` | `bg-[#2563EB]` | Hover state for blue buttons |
| Accent blue tint | `#EBF2FD` | `bg-[#EBF2FD]` | Active nav background, badges |
| Success green | `#5DB955` | `text-[#5DB955]` | Positive change, win indicator |
| Error red | `#E51837` | `text-[#E51837]` | Negative change, loss indicator |
| Auth error | `#FF453A` | CSS var `--color-error` | Auth form errors |

### Backgrounds

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| Page | `#FFFFFF` | `bg-white` | Dashboard page background |
| Page alt | `#FAFAFA` | `bg-[#FAFAFA]` | Auth bg, table row hover, nested card bg |
| Subtle | `#F5F5F5` | `bg-[#F5F5F5]` | Empty state circles, nav hover, tags |
| Card | `#FFFFFF` | `bg-white` | All card surfaces |

### Borders

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| Card border | `#F3F3F3` | `border-[#F3F3F3]` | Primary card border |
| Card border alt | `#F0F0F0` | `border-[#F0F0F0]` | Sidebar, dividers, sidebar cards |
| Hover border | `#E7E7E7` | `border-[#E7E7E7]` | Card hover state, dropdowns, sidebar cards |
| Input border | `#E5E5E5` | `border-[#E5E5E5]` | Form inputs, settings |
| Separator | `#F0F0F0` | `border-[#F0F0F0]` | Horizontal rules, tab underlines |

### Auth CSS Variables (used in `globals.css`, consumed by auth pages)

| Variable | Value |
|----------|-------|
| `--color-bg-dark` | `#FAFAFA` |
| `--color-bg-panel` | `#FFFFFF` |
| `--color-accent-blue` | `#3B82F6` |
| `--color-accent-blue-hover` | `#2563EB` |
| `--color-text-primary` | `#0D0D0D` |
| `--color-text-secondary` | `#71717A` |
| `--color-text-muted` | `#888888` |
| `--color-text-dim` | `#AAAAAA` |
| `--color-text-faint` | `#BBBBBB` |
| `--color-border-subtle` | `rgba(0, 0, 0, 0.1)` |
| `--color-border-faint` | `rgba(0, 0, 0, 0.05)` |
| `--color-error` | `#FF453A` |
| `--color-error-bg` | `rgba(255, 69, 58, 0.08)` |
| `--color-accent-blue-glow` | `rgba(59, 130, 246, 0.15)` |

---

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| Page padding | `px-8 py-10` | All dashboard page wrappers |
| Content top margin | `mt-10` | Content below page header |
| KPI-to-content gap | `mt-8` | KPI strip to main grid |
| Column gap | `gap-8` | Between left and right columns |
| Widget stack (home) | `gap-6` | Vertical gap between widgets in columns |
| Widget stack (statistics) | `gap-5` / `gap-6` | Right sidebar uses `gap-5`, left uses `gap-6` |
| KPI card gap | `gap-3` | Horizontal gap between KPI cards |
| Card internal padding | `p-5` | Standard card content padding |
| Label-to-heading | `gap-2` | Page label to page heading |
| Heading-to-description | `mt-1.5` / `mt-2` | Page heading to subtitle text |
| Section header bottom | `mb-8` | Below statistics page header block |
| KPI row bottom | `mb-6` | Below KPI row (statistics page) |

---

## Layout Patterns

### Two-column dashboard (home)

```
<div className="flex flex-row gap-8">
  <div className="flex-1 min-w-0 flex flex-col gap-6">
    {/* Main content widgets */}
  </div>
  <div className="w-[384px] flex-shrink-0 flex flex-col gap-6">
    {/* Sidebar widgets */}
  </div>
</div>
```

Right sidebar is a fixed `w-[384px]`. Left column is fluid `flex-1 min-w-0`.

### Page header

```
<div className="flex items-end justify-between">
  <div className="flex flex-col gap-2">
    <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[3px]">
      {label}
    </p>
    <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[30px]">
      {title}
    </h1>
  </div>
  {/* Optional action button */}
</div>
```

### KPI strip

```
<div className="flex gap-3 w-full">
  {/* flex-1 KPI cards */}
</div>
```

---

## Cards

### Standard dashboard card

```
bg-white border border-[#F3F3F3] rounded-[14px]
shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5
```

Hover (interactive cards):
```
hover:shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]
hover:border-[#E7E7E7]
hover:scale-[1.008]
transition-[box-shadow,border-color,transform] duration-200
```

### Sidebar widget card

```
bg-white border border-[#F0F0F0] rounded-[16px]
shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5
```

### Match detail sidebar card

```
bg-white rounded-[16px] border border-[#E7E7E7]
shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)] px-6 py-4
```

### Nested stat cell

```
bg-[#FAFAFA] rounded-xl p-4 border border-[#F3F3F3]
```

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| Card (primary) | `rounded-[14px]` | Dashboard cards, KPI cards, stats grid |
| Card (sidebar) | `rounded-[16px]` | Home sidebar widgets, match sidebar cards |
| Card (generic) | `rounded-2xl` | Featured match card, overall performance |
| Nested | `rounded-xl` | Stat cells, dropdowns, tooltips |
| Auth button | `rounded-[6px]` | Auth form submit buttons |
| Interactive | `rounded-full` | Buttons, chips, toggles, pills, nav tabs |
| Sidebar nav | `rounded-lg` | Sidebar menu items |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| Card default | `shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)]` | All dashboard cards |
| Card hover | `shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]` | Interactive card hover |
| Card subtle | `shadow-[0px_4px_16px_0px_rgba(0,0,0,0.06)]` | Match detail sidebar cards |
| Dropdown | `shadow-[0px_4px_16px_rgba(0,0,0,0.08)]` | Filter/sort dropdowns |
| Menu | `shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]` | Header user menu |
| Nav pill | `shadow-[0_1px_4px_rgba(0,0,0,0.08)]` | Navigation tab container |
| Button glow | `shadow-[0_1px_3px_rgba(57,134,243,0.25)]` | Blue action buttons |

---

## Motion

Two Framer Motion easing curves. No bounce. No spring physics.

| Token | Value | Usage |
|-------|-------|-------|
| Primary ease | `[0.25, 0.46, 0.45, 0.94]` | Page enter, section stagger, KPI fade-in |
| Spring-like | `[0.23, 1, 0.32, 1]` | Snappy interactive transitions |

Standard animation:
```ts
{
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: i * 0.07, ease: [0.25, 0.46, 0.45, 0.94] },
}
```

CSS transitions use `duration-200` for hover states (box-shadow, border, transform, colors).

Always respect `useReducedMotion()` -- disable animations when the user prefers reduced motion.

---

## Icons

**Lucide React** only. No other icon libraries.

Default icon size in cards: `size-4` (`w-4 h-4`).  
Default stroke width: `strokeWidth={1.5}`.  
Icon color in labels: `text-[#AAAAAA]`.

---

## Interactive Controls

All interactive pill-shaped controls use `rounded-full`:
- Navigation tabs
- Filter chips
- Toggle buttons
- Chat input send button
- Badges and tags

### Auth buttons

```
h-[44px] w-full rounded-[6px]
bg-[var(--color-accent-blue)] text-[13px] font-medium tracking-[1px] text-white
hover:bg-[var(--color-accent-blue-hover)]
hover:shadow-[0_0_20px_var(--color-accent-blue-glow)]
active:scale-[0.97]
disabled:pointer-events-none disabled:opacity-60
```

### Dashboard action buttons

```
h-9 rounded-full
bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#2563EB]
text-[13px] font-medium tracking-[0.5px] text-white
shadow-[0_1px_3px_rgba(57,134,243,0.25)]
active:scale-[0.97]
```

---

## Styling Paradigm Split

| Context | Approach |
|---------|----------|
| Auth pages (`src/app/(auth)/`) | CSS variables from `globals.css` (e.g., `var(--color-text-primary)`) |
| Dashboard pages (`src/app/dashboard/`) | Tailwind utility classes with hex literals (e.g., `text-[#0D0D0D]`) |

Do not mix paradigms. Auth pages consume CSS variables; dashboard pages use direct Tailwind values.

---

## Banned

- Bounce animations
- Glassmorphism
- Icon libraries other than Lucide React
- Fonts other than Inter
- Global state libraries (use Context + server data fetching)
