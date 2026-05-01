---
name: Advantage Analytics
description: A pro-level training room for tennis competitors, rendered as quiet, data-first interface.
colors:
  signal-blue: "#3B82F6"
  signal-blue-deep: "#2563EB"
  signal-blue-soft: "#EBF2FD"
  signal-blue-pressed: "#EFF4FF"
  win-green: "#5DB955"
  loss-red: "#E51837"
  player-violet: "#A855F7"
  ink: "#0D0D0D"
  ink-dialog: "#1D1D1F"
  ink-secondary: "#525252"
  ink-tertiary: "#71717A"
  ink-muted: "#888888"
  ink-label: "#AAAAAA"
  ink-disabled: "#CCCCCC"
  surface: "#FFFFFF"
  surface-page: "#FAFAFA"
  surface-subtle: "#F5F5F5"
  surface-field: "#F7F7F7"
  surface-dark: "#0D0D0D"
  hairline: "#F3F3F3"
  hairline-medium: "#E5E5EA"
  border-field: "#EAECF0"
  win-tint: "rgba(115,230,104,0.15)"
  loss-tint: "rgba(229,24,55,0.15)"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 300
    lineHeight: "36px"
    letterSpacing: "-0.6px"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 300
    lineHeight: "1.1"
    letterSpacing: "-0.5px"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "-0.4px"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.5"
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "2.5px"
  score:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    letterSpacing: "-1px"
rounded:
  cell: "4px"
  button: "6px"
  element: "8px"
  dropdown: "12px"
  card: "14px"
  modal: "16px"
  pill: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "36px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue-deep}"
    textColor: "{colors.surface}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  input-underline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0 0 10px 0"
    typography: "{typography.body-sm}"
  section-eyebrow:
    textColor: "{colors.ink-label}"
    typography: "{typography.label}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.element}"
    padding: "0 14px"
    height: "36px"
    typography: "{typography.body}"
  nav-item-active:
    backgroundColor: "{colors.signal-blue-soft}"
    textColor: "{colors.signal-blue}"
  badge-win:
    backgroundColor: "{colors.win-tint}"
    textColor: "{colors.win-green}"
    rounded: "{rounded.button}"
    padding: "4px 6px"
  badge-loss:
    backgroundColor: "{colors.loss-tint}"
    textColor: "{colors.loss-red}"
    rounded: "{rounded.button}"
    padding: "4px 6px"
---

# Design System: Advantage Analytics

## 1. Overview

**Creative North Star: "The Pro Training Room"**

Advantage Analytics is a competitor's tool, not a consumer app. The interface is the equivalent of a high-performance training room: clean walls, exact equipment, no decoration. Numbers breathe. Type is light. Lines are hairline. The accent is one shade of blue, used only when the screen needs to issue a command or claim a win. Nothing else fights for attention because there's nothing else to say.

The system is monochrome with a single chromatic voice. Cool neutrals (`#FAFAFA` to `#0D0D0D`) carry every surface, every divider, every body word. Signal Blue (`#3B82F6`) carries action and emphasis only. Win Green and Loss Red carry match outcome and nothing else. Color is functional, never decorative. Density is allowed when it serves comprehension; ornamentation is forbidden everywhere.

This system explicitly rejects: SwingVision's mass-market warmth, gamification badges and streak meters, playful illustrations, glassmorphism and neon, gradient-heavy surfaces, warm or earthy tones. If a player on the WTA bench would feel patronized by it, it does not belong here.

**Key Characteristics:**
- Light mode only, cool-neutral palette, single accent.
- `font-light` (300) for hero numbers; `font-medium` (500) for eyebrows; semibold (600) reserved for stat values; bold (700) reserved for match scores.
- Hairline `#F3F3F3` rules carry hierarchy more than borders or shadows do.
- Tabular numerics throughout (`font-variant-numeric: tabular-nums`).
- Two motion curves only, both ease-out exponential (no bounce, no elastic).
- Inter only. Lucide only.

## 2. Colors: The Cool-Neutral Spectrum

A monochrome system. One accent. Two semantic outcome colors. No tertiary palette.

### Primary
- **Signal Blue** (`#3B82F6`): The single chromatic voice. Used for primary CTAs, the active nav state, focus rings, link text, the upload-match progress bar, the heatmap peak, the radar player line. Nothing else gets blue.
- **Signal Blue Deep** (`#2563EB`): Hover state for Signal Blue surfaces and link text only.
- **Signal Blue Soft** (`#EBF2FD`): The active nav-item background and the welcome-banner tint. The only large-area use of blue in the system.

### Secondary (semantic outcome only)
- **Win Green** (`#5DB955`): Wins, positive deltas, complete-state checks. Not decorative. Not used for "success" buttons or generic confirmations.
- **Loss Red** (`#E51837`): Losses, negative deltas, the danger zone. Not used for inline errors of routine forms (those use the muted text gray plus a small red rule).

### Player attribution (charts only)
- **Player Violet** (`#A855F7`): Secondary player / opponent in multi-line charts. Never appears outside data-viz contexts.

### Neutral
- **Ink** (`#0D0D0D`): Headings, emphasis, primary content. Never `#000`.
- **Ink Secondary** (`#525252`): Descriptions, body copy, ghost button text.
- **Ink Tertiary** (`#71717A`): Scores, metadata.
- **Ink Muted** (`#888888`): Placeholders, disabled-but-readable text.
- **Ink Label** (`#AAAAAA`): The 10px uppercase eyebrow labels everywhere.
- **Ink Disabled** (`#CCCCCC`): Dividers in disabled context, minimal text.
- **Surface** (`#FFFFFF`): Cards, panels, modals.
- **Surface Page** (`#FAFAFA`): Page backgrounds, hover wash on rows.
- **Surface Subtle** (`#F5F5F5`): Hover backgrounds, icon containers.
- **Surface Field** (`#F7F7F7`): Disabled fields.
- **Hairline** (`#F3F3F3`): The system's primary structural rule. Card borders, section dividers, hairline rules between settings sections. This color, more than any other, defines the rhythm.
- **Hairline Medium** (`#E5E5EA`): Dropdown borders, modal borders.
- **Border Field** (`#EAECF0`): Button outlines and the boxed-input variants (rare; underline is preferred).

### Named Rules

**The One Voice Rule.** Signal Blue carries no more than 10% of any screen. The page may have one CTA, one active nav highlight, one focus ring at a time. If two blue elements compete on the same surface, one of them is wrong.

**The Outcome-Only Rule.** Green means winning; red means losing. They never appear as mood, status, or affirmation. A "saved successfully" toast uses Win Green only because complete-state on a profile maps to the same idea: the player got the point.

**The Hairline Rule.** Hierarchy comes from `#F3F3F3` rules and whitespace, not from borders or shadows. If a section needs a card to feel real, the structure is wrong: simplify the page, not the chrome.

## 3. Typography

**Display Font:** Inter (system-ui fallback)
**Body Font:** Inter (system-ui fallback)
**Label Font:** Inter (system-ui fallback)

**Character:** A single sans, used at three weights. Light (300) carries every hero, headline, and large number. Normal (400) and Medium (500) carry body and labels. Bold (700) is reserved for match scores in the match detail view. The voice comes from weight contrast and precise letter-spacing, not typeface variety.

### Hierarchy
- **Display** (300, 30px, 36px line-height, `-0.6px`): Page heading. Home greeting, settings page title, matches list title. Always paired with a 10px uppercase eyebrow above it at `gap-3`.
- **Headline** (300, 28px, 1.1, `-0.5px`): Large numbers, KPI hero values, brand panel hero on auth.
- **Title** (400, 16px, 1.5, `-0.4px`): Event names, tournament names, dialog titles.
- **Body** (400, 13px, 1.5): Standard interface body, nav items.
- **Body Small** (400, 12px, 1.5): Descriptions, helper text, activity messages.
- **Label** (500, 10px, `2.5px`, uppercase): Section eyebrows, card headers, field labels in the auth and upload-modal vocabularies. The most-used token in the system.
- **Score** (700, 40px, `-1px`): Match scores in the match detail view only. The only place 700 weight appears.

### Named Rules

**The Eyebrow Rule.** Every section opens with a `text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]` eyebrow followed by a hairline rule. This is non-negotiable; it is the typographic spine of the product.

**The Tabular Rule.** Any number a player will compare against another number gets `tabular-nums`. Stats, scores, percentages, prices, dates with widths that vary. If columns of numbers are not aligned, the system has lost.

**The 65–75ch Rule.** Body copy never extends past 75 characters per line. Settings descriptions, AI commentary, helper text — all clamped via `max-w-prose` or fixed column widths.

## 4. Elevation

The system is flat by default. Cards lift only when they're a destination (the welcome banner, a modal, a stat hero), not when they're decoration. Most "section" boundaries are carried by hairline rules, not surfaces.

### Shadow Vocabulary

- **shadow-card** (`box-shadow: 0px 2px 8px 0px rgba(0,0,0,0.06)`): Default card. Almost imperceptible; reads as a slight lift from the surface, not a drop shadow.
- **shadow-card-emphasis** (`0px 4px 16px 0px rgba(0,0,0,0.10)`): Cards that earn emphasis (the active plan card with a 3px blue ring, hovered KPI tiles).
- **shadow-card-raised** (`0px 6px 20px 0px rgba(0,0,0,0.12)`): Activity feed and similarly content-heavy cards that need to feel like a discrete object.
- **shadow-dropdown** (`0 8px 30px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)`): Menus, popovers, the profile dropdown in the dashboard header.
- **shadow-floating** (`0px 8px 32px rgba(0,0,0,0.25), 0px 0px 0px 1px rgba(255,255,255,0.06) inset`): Dark floating UI only (the processing toast on `#0D0D0D`).

### Named Rules

**The Flat-By-Default Rule.** Cards begin flat. Shadow is added only when the surface needs to claim attention (an active selection, a hovered KPI, a modal). Never as default decoration.

**The No-Layered-Cards Rule.** Cards inside cards are forbidden. If a section needs an inner container, use a hairline rule and whitespace, not a second card.

## 5. Components

The component vocabulary is **refined and restrained**. Hairline borders, light type, subtle shadow only when earned. Every interactive element has a focus ring. Every shape uses one of seven radii.

### Buttons
- **Shape:** `rounded-[6px]` for action buttons; `rounded-full` for small uppercase pills (filter chips, segmented controls).
- **Primary CTA:** Signal Blue background, white text, `text-[13px] font-medium`, `h-9 px-4`, subtle blue glow `shadow-[0_1px_3px_rgba(57,134,243,0.25)]`. Hover swaps to `#2563EB` with `transition-colors duration-200`.
- **Primary Pill (small):** Signal Blue, `text-[10px] font-medium uppercase tracking-[1.5px]`, `rounded-full px-3 py-1.5`. Used for "Recommended" badges, contextual prompts.
- **Ghost:** White surface, `border border-[#EAECF0]`, ink-secondary text, `rounded-full` for pill ghosts and `rounded-[6px]` for action ghosts. Hover wash to `#F5F5F5`.
- **Outline (action):** Same as Ghost but `rounded-[6px]` with hover-blue text and border. Used for the password reset button.
- **Danger:** Red `text-[#E51837]`, transparent background, `border border-[#E51837]/20`. Confirmed-danger variant is solid `bg-[#E51837]` white text.
- **Press feedback:** `active:scale-[0.97]` on primary; `active:scale-[0.998]` on rows.

### Underline Inputs (canonical input style)
- **Style:** Transparent background, no boxed border. Ink text, `placeholder:text-[#AAAAAA]`. Above each input sits a 10px uppercase eyebrow label. Below each input sits a 1px `#F3F3F3` rule.
- **Focus:** Rule animates to 2px height and `#3B82F6` color over 300ms. The rule color is the focus indicator; no separate ring.
- **Hover:** Rule shifts from `#F3F3F3` to `#E5E5EA`.
- **Error:** Rule is solid `#E51837`.
- **Disabled:** Eyebrow drops to `#CCCCCC`, text drops to `#888888`, rule stays `#F3F3F3`.
- This is the input vocabulary across **auth pages, the upload-match modal, and settings**. Boxed inputs exist (`SettingsInput` legacy variant) but are deprecated.

### Cards
- **Corner Style:** `rounded-[14px]` (radius-card).
- **Background:** `#FFFFFF` on `#FAFAFA` page background.
- **Border:** `border border-[#F3F3F3]`.
- **Shadow:** `shadow-card` by default; promote to `shadow-card-emphasis` on hover or selection only.
- **Internal Padding:** `p-5` (20px) standard; `px-6 py-4` for cards with their own header bar.

### Section Eyebrow + Rule
The signature pattern. A `text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]` label, a `gap-3` (12px) gap, then a `flex-1 h-px bg-[#F3F3F3]` rule. Optional right-aligned action chip on the same baseline. Used to open every settings section, every match detail section, every page heading.

### Sidebar Nav Item
- **Style:** `h-9 rounded-lg pl-[13px] pr-3.5 gap-3`, `text-[13px]` body.
- **Default:** `text-[#8A8A8E]` icon and label, hover wash to `#F5F5F5`, label shifts to `#3C3C43`.
- **Active:** `bg-[#EBF2FD]` background, `text-[#3B82F6]` label and icon, no shadow. The settings sidebar adds a 2px blue left rail at `top-1/2 -translate-y-1/2 h-6` for editorial emphasis.

### Status Badges (Win / Loss)
- **Shape:** `rounded-[6px]` (radius-badge).
- **Win:** `bg-[rgba(115,230,104,0.15)] text-[#5DB955]`.
- **Loss:** `bg-[rgba(229,24,55,0.15)] text-[#E51837]`.
- **Type:** `text-[10px] font-semibold` for inline pills; the small form pills (5×5 squares in match detail) use `text-[9px] font-semibold` and `rounded-[3px]`.

### Tooltip
Floating box, no caret. `bg-white border border-[#F3F3F3] rounded-xl shadow-card`. Anchored visually by hover ring or scale on the trigger element, never by an arrow.

### Keyboard Shortcut Chip
Inline `<kbd>` with `inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]`. macOS modifiers concatenate (`⌘K`). Word-named keys (`esc`, `enter`) get `[font-variant-caps:small-caps]` so the lowercase glyphs sit at cap-height.

## 6. Do's and Don'ts

### Do:
- **Do** lead every section with a 10px uppercase eyebrow + hairline rule.
- **Do** use `tabular-nums` on every number a player will read alongside another number.
- **Do** respect `prefers-reduced-motion`: skip transforms, keep opacity.
- **Do** use Signal Blue exclusively for action and emphasis, on no more than 10% of the screen.
- **Do** use Win Green for winning and Loss Red for losing only. Anywhere else, including form errors and saved confirmations, those colors are a misuse.
- **Do** prefer underline inputs (auth + upload-modal + settings vocabulary) over boxed inputs.
- **Do** keep cards flat at rest. Promote to `shadow-card-emphasis` only on hover, selection, or active state.
- **Do** size icons at `size-3.5` with `strokeWidth={1.5}`. Lucide only.

### Don't:
- **Don't** use bounce or elastic animations. The two custom curves (`[0.25, 0.46, 0.45, 0.94]` primary, `[0.23, 1, 0.32, 1]` spring-like) are the only options.
- **Don't** apply glassmorphism or backdrop blur as decoration. Blur is allowed only as a sticky-bar legibility shield (rare).
- **Don't** use neon accents, gradient text, or gradient-heavy surfaces.
- **Don't** use warm tones, browns, or earthy colors anywhere.
- **Don't** ship gamification — no streak meters, no achievement badges, no celebratory confetti, no "level up" microcopy.
- **Don't** use border-left or border-right greater than 1px as a colored stripe on cards or alerts. Full borders, background tints, leading numbers, or nothing.
- **Don't** nest cards. A card inside a card is always a structural smell.
- **Don't** invent decoration colors. The palette is closed.
- **Don't** use emoji as icons. Lucide vector glyphs only.
- **Don't** apply font weights other than 300, 400, 500, 600, 700. No 800/900. No italics outside long-form quotation.
- **Don't** use SwingVision as a visual reference. It is the named anti-reference for this product.
- **Don't** ship a hero-metric template (big number, small label, gradient accent, supporting stats). The KPI strip is the system's only blessed metric layout.
