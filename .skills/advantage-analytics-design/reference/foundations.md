# Foundations — Type, Color, Spacing, Radius, Shadow, Motion, Layout

> Part of the Advantage Analytics design system. Read
> `.skills/advantage-analytics-design/SKILL.md` first — it carries the Banned
> list, the precedence rule and the routing table into this directory.

## Typography

**Fonts**: Inter carries everything. Weights: 300 (light), 400 (normal), 500 (medium), 600 (semibold), 700 (bold — scores only). **Roboto Mono** (400–700) is the second face, for **machine values only** — timestamps, quota readouts, job ids. Never stats, never prose. Both load via `next/font`; the `font-mono` utility resolves to Roboto Mono.

### Type Scale

| Token         | Size                                                      | Weight | Use                                        |
| ------------- | --------------------------------------------------------- | ------ | ------------------------------------------ |
| heading-xl    | `text-[30px] font-light tracking-[-0.6px] leading-[36px]` | 300    | Page greeting/hero                         |
| heading-lg    | `text-[28px] font-light tracking-[-0.5px]`                | 300    | KPI values, large numbers                  |
| title-lg      | `text-[24px] font-light tracking-[-0.4px] leading-[1.2]`  | 300    | Page/section titles (`.text-title-lg`)     |
| heading-md    | `text-[16px] font-normal tracking-[-0.4px]`               | 400    | Event/tournament names                     |
| body-lg       | `text-[14px] font-normal`                                 | 400    | Match opponent names, primary body         |
| body          | `text-[13px]`                                             | 400    | Standard body text, nav items              |
| body-sm       | `text-[12px] font-normal`                                 | 400    | Descriptions, activity messages            |
| label-lg      | `text-[11px] font-semibold`                               | 600    | Stat values, emphasis labels               |
| label         | `text-[10px] font-medium uppercase tracking-[2.5px]`      | 500    | Section headers, card headers              |
| label-sm      | `text-[9px] font-normal`                                  | 400    | Metadata labels                            |
| heading-score | `text-[40px] font-bold tracking-[-1px]`                   | 700    | Match result scores (match detail page)    |
| heading-brand | `text-[56px] font-light tracking-[-1px] leading-[1.05]`   | 300    | Brand panel hero heading (auth pages only) |
| caption       | `text-[8px] font-medium`                                  | 500    | Chart labels, minimal text                 |

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

Auth pages style from CSS variables; dashboard pages use Tailwind utilities
directly. The tokens are the same either way — this is about which surface you
are on, not two palettes.

### Text Colors

| Token              | Value            | Use                                                                   |
| ------------------ | ---------------- | --------------------------------------------------------------------- |
| text-primary       | `text-[#0D0D0D]` | Headings, emphasis, primary content                                   |
| text-primary-alt   | `text-[#1D1D1F]` | Dialog titles                                                         |
| text-secondary     | `text-[#525252]` | Descriptions, secondary content                                       |
| text-tertiary      | `text-[#71717A]` | Scores, metadata                                                      |
| text-muted         | `text-[#888888]` | Placeholders, disabled text                                           |
| text-label         | `text-[#AAAAAA]` | Section labels, timestamps                                            |
| text-disabled      | `text-[#CCCCCC]` | Dividers, minimal text                                                |
| text-accent        | `text-[#3B82F6]` | Links, active nav, primary actions — the ONLY resting blue for a word |
| text-accent-hover  | `text-[#2563EB]` | Hover state for accent text, and nothing else                         |
| text-success       | `text-[#5DB955]` | Wins, positive changes                                                |
| text-error         | `text-[#E51837]` | Losses, negative changes                                              |
| text-inverse       | `text-white`     | Text on dark backgrounds                                              |
| text-muted-alt     | `text-[#71717A]` | Tertiary metadata, match detail timestamps                            |
| text-muted-dim     | `text-[#777777]` | KPI change labels                                                     |
| text-inverse-muted | `text-white/50`  | Muted text on dark backgrounds                                        |

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

| Token           | Value                         | Use                                     |
| --------------- | ----------------------------- | --------------------------------------- |
| bg-surface      | `bg-white`                    | Cards, panels, modals                   |
| bg-page         | `bg-[#FAFAFA]`                | Page background, subtle hover           |
| bg-subtle       | `bg-[#F5F5F5]`                | Hover states, icon containers           |
| bg-muted        | `bg-[#F2F2F2]`                | Empty heatmap cells                     |
| bg-skeleton     | `bg-[#F0F0F0]`                | Loading skeleton states                 |
| bg-field        | `bg-[#F7F7F7]`                | Disabled fields                         |
| bg-accent       | `bg-[#3B82F6]`                | Primary buttons, active indicators      |
| bg-accent-hover | `bg-[#2563EB]`                | Primary button hover                    |
| bg-accent-tint  | `bg-[#EBF2FD]`                | Active nav item background              |
| bg-accent-soft  | `bg-[#EFF4FF]`                | Serve court background                  |
| bg-dark         | `bg-[#0D0D0D]`                | Dark surfaces (processing notification) |
| bg-success-tint | `bg-[rgba(115,230,104,0.15)]` | Win badge background                    |
| bg-error-tint   | `bg-[rgba(229,24,55,0.15)]`   | Loss badge background                   |
| bg-success-soft | `bg-[rgba(93,185,85,0.06)]`   | Subtle win background tint              |
| bg-error-soft   | `bg-[rgba(229,24,55,0.06)]`   | Subtle loss background tint             |
| bg-accent-15    | `rgba(59,130,246,0.15)`       | Blue tint backgrounds                   |

**Surfaces.** The dashboard is white end to end (`--surface-card`) — Design
Principles §6. What separates a card from the page it sits on is the
`--border-card` hairline plus `--shadow-card`, so **neither is optional**: drop
the border and the card stops existing. `--surface-page` is for the surfaces
outside the dashboard (auth, admin, claim) and for wells inset _within_ a card
— a drop zone, a note strip — where it reads as recessed rather than as a
page. No imagery, textures or patterns; the only gradients are
the auth mesh and the sparkline's area fill (stroke colour 18%→0, chart-only).

### Border Colors

| Token         | Value              | Use                     |
| ------------- | ------------------ | ----------------------- |
| border-subtle | `border-[#F3F3F3]` | Card borders, dividers  |
| border-medium | `border-[#E5E5EA]` | Dropdown/modal borders  |
| border-scroll | `border-[#EBEBEB]` | Header scroll indicator |
| border-field  | `border-[#EAECF0]` | Button/input borders    |

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
  role-based palette instead of a one-off violet. Done: `serve-placement-widget.tsx`
  imports `VIZ_BLUE` / `VIZ_BLUE_MID` for the first/second pair. The one
  unreachable file that still carried the old value has been deleted. See
  "Match Detail Colors" below.

### Match Detail Colors

Match detail and video sections use additional colors for multi-player differentiation and status:

| Token             | Value     | Use                                                    |
| ----------------- | --------- | ------------------------------------------------------ |
| player-2          | `#64748B` | Secondary player/opponent color in charts (cool slate) |
| player-2-text     | `#475569` | Player 2 text on white or soft-slate bg (WCAG AA)      |
| player-2-soft     | `#F1F5F9` | Player 2 soft pill/highlight background                |
| player-1-text     | `#1D4ED8` | Player 1 text on white or soft-blue bg (WCAG AA)       |
| player-1-soft     | `#EFF4FF` | Player 1 soft pill/highlight background                |
| player-1-bar-tint | `#BFD5FB` | Player 1 non-leader bar fill (on `#F3F3F3` track)      |
| player-2-bar-tint | `#CBD5E1` | Player 2 non-leader bar fill (on `#F3F3F3` track)      |
| alt-success       | `#22C55E` | Progress bar success (Tailwind green-500)              |
| alt-error         | `#EF4444` | Video/inline error states (Tailwind red-500)           |
| alt-error-dark    | `#DC2626` | Darker error emphasis (Tailwind red-600)               |
| warning-bg        | `#FFFBEB` | Warning banner background                              |
| warning-border    | `#FDE68A` | Warning banner border                                  |
| warning-text      | `#92400E` | Warning banner text                                    |

> Violet was retired from player attribution in v2 review decision C, and the
> values above are the slate that replaced it — you own Signal Blue, the
> opponent recedes. The migration landed: `globals.css`, `player-colors.ts` and
> `data-viz.ts` (whose violet ramp is deleted, not repointed) all transcribe
> `colors.css` now, and `scripts/check-design-drift.mjs` check 5 fails if any of
> them drifts from it again.
>
> The two files that still painted violet were both unreachable and have since
> been deleted, so no exclusion is needed: every file the checker reads now
> transcribes `colors.css`.

---

## Spacing

### Standard Gap Scale

| Gap       | Value | Use                       |
| --------- | ----- | ------------------------- |
| `gap-0.5` | 2px   | Tight inline spacing      |
| `gap-1`   | 4px   | Minimal (inline elements) |
| `gap-1.5` | 6px   | Small (icon + label)      |
| `gap-2`   | 8px   | Small-medium              |
| `gap-2.5` | 10px  | Icon + text pairs         |
| `gap-3`   | 12px  | Medium (list items)       |
| `gap-4`   | 16px  | Medium-large              |
| `gap-5`   | 20px  | Match row spacing         |
| `gap-6`   | 24px  | Section spacing           |
| `gap-8`   | 32px  | Major section spacing     |

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
- Every full-viewport dashboard page pads `20px 56px`, the value all six locked Platform Audit frames draw; the sticky header sits _inside_ it at 24px on purpose — full-bleed chrome, inset content. Reading-width pages (settings, help, the wizard) are capped by a max-width instead and do not use it. _(The v2 default `px-8 py-10` is retired: it was referenced by no file, and three pages had drifted to 28/32/40 against it.)_

### Chrome Dimensions (v3)

Sidebar and header sizes, tokenized in `spacing.css`. No layout-grid value
above changed — these are new, additive names for the icon-rail chrome.

| Token             | Value | Use                                                              |
| ----------------- | ----- | ---------------------------------------------------------------- |
| `--rail-width`    | 64px  | Collapsed sidebar width                                          |
| `--panel-width`   | 232px | Expanded sidebar width                                           |
| `--rail-row`      | 40px  | Sidebar row height, both widths                                  |
| `--rail-icon-col` | 40px  | Fixed icon column, both widths — only the edge travels on toggle |
| `--header-h`      | 44px  | Sticky header height                                             |

---

## Border Radius

| Token             | Value                | Use                                                                        |
| ----------------- | -------------------- | -------------------------------------------------------------------------- |
| radius-card       | `rounded-[14px]`     | Cards (primary)                                                            |
| radius-modal      | `rounded-2xl` (16px) | Modals, large cards                                                        |
| radius-dropdown   | `rounded-xl` (12px)  | Dropdowns, smaller modals                                                  |
| radius-element    | `rounded-lg` (8px)   | Nav items, sidebar items, rows                                             |
| radius-button     | `rounded-[6px]`      | All action buttons and CTAs (primary, secondary, outline, danger)          |
| radius-input      | `rounded-[6px]`      | Form inputs, selects, textareas (matches button radius)                    |
| radius-badge      | `rounded-[6px]`      | Change badges, small tags                                                  |
| radius-cell       | `rounded-[4px]`      | Heatmap cells, tiny elements                                               |
| radius-score-card | `rounded-[10px]`     | Score cards, upload modal panels, video section                            |
| radius-pill       | `rounded-full`       | Filter pills, tab pill containers, avatars, dots, indicators (NOT buttons) |

---

## Shadows

| Token                | Value                                        | Use                                                                         |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| shadow-card          | `shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]`  | Default card                                                                |
| shadow-card-emphasis | `shadow-[var(--shadow-card-emphasis)]`       | Lift — hover and selection                                                  |
| shadow-card-raised   | `shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]` | Raised cards (activity)                                                     |
| shadow-dropdown      | `shadow-[var(--shadow-dropdown)]`            | Dropdowns, popovers                                                         |
| shadow-floating      | `shadow-[var(--shadow-floating)]`            | Dark floating UI                                                            |
| shadow-keycap        | `shadow-[var(--shadow-keycap)]`              | Kbd chips — a **detail effect**, not elevation                              |
| shadow-cta-glow      | `shadow-[var(--shadow-cta-glow)]`            | The primary button's glow, applied by `advButton()` — detail, not elevation |

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

| Name               | CSS token         | Value                      | Use                        |
| ------------------ | ----------------- | -------------------------- | -------------------------- |
| EASE_CURVE         | `--ease-primary`  | `[0.25, 0.46, 0.45, 0.94]` | Primary custom easing      |
| EASE (spring-like) | `--ease-out-expo` | `[0.23, 1, 0.32, 1]`       | Header, layout transitions |
| EASE_CHART         | `--ease-chart`    | `[0.2, 0, 0.4, 1]`         | Chart/data transitions     |

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

| Token               | Value | Use                                                                                                                             |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--duration-fast`   | 150ms | Micro-feedback, colour swaps                                                                                                    |
| `--duration-hover`  | 200ms | Hover and colour transitions (`advButton()` uses this; its press is a separate hard-coded 80ms — 200ms there reads as a bounce) |
| `--duration-enter`  | 300ms | Page and section enter (+8px rise) — reserved, no `var()` call sites yet                                                        |
| `--duration-reveal` | 400ms | The dark tooltip's reveal and larger reveals — one call site, `globals.css`'s fadeIn                                            |

The wider scale below is the Framer Motion side, where durations are numbers:

| Duration          | Use                                   |
| ----------------- | ------------------------------------- |
| `0.06s` – `0.08s` | Quick micro-feedback                  |
| `0.12s` – `0.15s` | Fast UI responses                     |
| `0.2s` – `0.25s`  | Button animations, hovers             |
| `0.3s` – `0.35s`  | Page transitions, fade-ins            |
| `0.4s`            | Component transitions, stagger groups |
| `0.5s`            | Slower reveals                        |
| `0.6s`            | Larger reveals, chart animations      |
| `0.8s` – `1s`     | Progress rings, loaders               |
| `1.2s`            | Sparkline path draw                   |

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
