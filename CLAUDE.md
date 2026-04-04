# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Advantage Analytics is a tennis analytics dashboard. Players upload SwingVision match data (.xlsx files) and get detailed statistical analysis, court visualizations, and AI-powered match analysis. Built with Next.js 16 (App Router), Supabase, and Tailwind CSS.

## Commands

```bash
npm run dev          # Start dev server (localhost:3000, Turbopack)
npm run build        # Production build
npm run lint         # ESLint (flat config, next/core-web-vitals)
```

Tests use Playwright but no test files exist yet. The scripts (`npm run test`, `test:ui`, etc.) are configured in package.json.

## Architecture

### Data Flow

- **Server Components** (default): Pages fetch data via Supabase server client (`src/lib/supabase/server.ts`), pass props to client components
- **Client Components** (`"use client"`): Handle UI state, filters, real-time updates via browser client (`src/lib/supabase/client.ts`)
- **API Routes**: `/api/upload` (file processing), `/api/validate-file`, `/api/chat` (streaming LLM responses)
- **Edge Function**: `supabase/functions/process-match` processes uploaded files asynchronously

### Supabase

Three client factories:
- `src/lib/supabase/server.ts` — Server Components and API routes (cookie-based auth)
- `src/lib/supabase/client.ts` — Browser (localStorage auth)
- `src/lib/supabase/admin.ts` — Service role (bypasses RLS)

Key tables: `matches`, `match_stats`, `points`, `shots`, `users`. All user data is RLS-scoped. The `match_stats_with_percentages` view provides computed stats with percentages and fractions.

Schema reference: `DATABASE_PRD.md` at repo root.

### Statistics Data Layer

Server/client split pattern for statistics:
- `src/lib/data/statistics-server.ts` — Server-side initial data load (`getStatisticsPageData()`, `getSelectableMatches()`)
- `src/lib/data/statistics-client.ts` — Client-side recomputation (`computeStatistics()`) when match filters change
- `src/lib/data/stat-configs.ts` — Shared stat definitions (24 stats in 3 tabs: Serve/Return/Other)

Both files produce the same `StatisticsPageData` shape. The client version operates on `SelectableMatch[]` to avoid round-trips when users toggle filters.

### File Upload Pipeline

SwingVision .xlsx → `SwingVisionValidator` → `SwingVisionParser` → Supabase storage (`match-data` bucket) → `process-match` edge function extracts points/shots.

Upload code lives in `src/lib/services/upload/` with parsers, providers, and validators subdirectories.

### Court Visualization System

SVG-based tennis court (`src/components/dashboard/matches/visuals/court-visualization.tsx`, ~730 lines). Supports serve (half-court) and return (full-court) modes with dot plots, interactive tooltips, and a filter system.

Filter configs: `src/components/dashboard/matches/visuals/configs/` (serve, return, custom modes).

### LLM Integration

`/api/chat` streams responses from Claude or GPT-4o. Provider abstracted in `src/lib/llm/adapter.ts`. Set `LLM_PROVIDER=anthropic` or `openai` in env. Falls back to mock mode if no API key configured.

## Design System

**Read `.claude/skills/advantage-analytics-design/SKILL.md` before building any UI.** It defines the complete Advantage Analytics design language — typography, color, spacing, and component patterns.

The design blends two internal references: the **auth pages** (refined typography, accent lines, CSS variables, subtle blue tones) and the **home dashboard** (clean cards, structured data, airy spacing). Auth aesthetics lead; dashboard structure supports.

### Typography

- **Font**: Inter only
- **Weights**: 300 (light), 400 (regular), 500 (medium), 600 (semibold)
  - **300 light**: Hero/greeting headings, large display text, page titles on dark backgrounds. Tight tracking (`tracking-[-0.5px]` to `tracking-[-1px]`).
  - **400 regular**: Body text, descriptions, supporting copy, match context labels
  - **500 medium**: Card titles, section headers, navigation labels, metadata, data labels
  - **600 semibold**: Player names, scores, stat values, emphasized data, change badges
- **Type scale** (px): 12, 14, 16, 18, 20, 24, 32, 36, 40 (40 for auth pages only). Pick from this scale — no arbitrary sizes. Use `4px` only for micro-gaps (icon alignment, input padding), never as a primary spacing step.
- **Uppercase labels**: `font-medium uppercase tracking-[1.6px]` for section dividers (e.g., "Performance Breakdown", "Recent Performance")

### Color Palette

The palette extends beyond neutral gray to include **blue accent tones** and **semantic colors** that prevent the UI from feeling flat.

**Neutrals (structure & text)**:
- Primary text: `#0D0D0D`
- Secondary text: `#525252` — data values, strong secondary content
- Tertiary text: `#71717A` — descriptions, supporting copy
- Muted text: `#999999` — timestamps, metadata, inactive labels
- Dim text: `#AAAAAA` — section headers (uppercase), placeholder-adjacent
- Faint text: `#CCCCCC` — disabled states, tertiary UI
- Borders: `#E7E7E7` (cards), `#F0F0F0` (dividers), `rgba(0,0,0,0.06)` (subtle)
- Surfaces: `#FAFAFA` (background), `#F2F2F2` (input fills, inactive chips), `#F5F5F5` (empty states)

**Brand & accent**:
- Blue accent: `#3986F3` — primary actions, active states, progress rings, links
- Blue hover: `#2D6FD9` — hover state for blue accent
- Blue light: `#EBF2FD` — badges, selected chip backgrounds, subtle highlights
- Blue glow: `rgba(57,134,243,0.15)` — focus rings, ambient glow on hover (auth buttons)
- Orange (opponent): `#F38439` — opponent data, secondary player context
- Orange light: `#FEF0E6` — opponent badges

**Semantic (feedback)**:
- Success: `#5DB955`, background `rgba(115,230,104,0.15)` — positive change indicators
- Error: `#E51837`, background `rgba(229,24,55,0.15)` — negative change indicators, form errors
- Auth error: `#FF453A`, background `rgba(255,69,58,0.08)` — auth-specific error alerts

**Hero/dark surfaces**:
- Hero gradient: `linear-gradient(138deg, #000 32%, #666 127%)` — home page hero
- Auth mesh gradient: `.brand-mesh-gradient` class — auth brand panel (blue/indigo radials)
- Dark surface: `#1D1D1F` — icon buttons, dark action circles
- Dark surface card: `bg-white/[0.07] border border-white/[0.1]` — KPI cards, compact widgets on hero
- Dark surface interactive: `bg-white/[0.08]` resting, `bg-white/[0.14]` hover — buttons/inputs on dark backgrounds
- Dark surface text: `text-white/70` resting, `text-white` hover — never solid white at rest

### Dark Surface Conventions

Elements on dark pages (home hero, match detail) use white-alpha values. Use `isDarkPage` to switch between dark and light treatments. Dark surface cards use `rounded-xl` (12px) — one step below standard `rounded-2xl`. See `kpi-cards.tsx` for the reference pattern.

### Header Toolbar

All right-side header elements use `h-8 w-8` (32px). Icon buttons are circular with color-shift hover (no scale). The Create Match button expands from circle to pill on hover with an opacity-faded label. Dropdown menus use `rounded-xl` with `shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)]`. Breadcrumbs use `ChevronRight` (12px) separators, not `/` text. See `header.tsx` for the reference pattern.

### Accent Lines & Visual Punctuation

Borrowed from the auth pages — use thin lines and subtle color to create visual rhythm:
- **Vertical match separator**: `w-0.5 bg-[#DDDDDD]` bar alongside match rows, transitions to `bg-[#6AABFF]` on hover
- **Divider rule**: `h-px bg-[#F0F0F0]` — between list items. Never use heavy borders.

### Cards & Surfaces

- **Standard card**: `bg-white border border-[#E7E7E7] rounded-2xl shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-6`
- **Subtle card** (gallery items): `border border-[rgba(0,0,0,0.06)] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)]`
- **Sidebar widget** (320px): Same as standard card but uses 16px title (one step below main card's 20px)
- Padding: 24px (p-6). No 4px padding as a card-level value.

### Icons

- **Library**: Lucide React only
- **Size**: 16–20px for UI icons, 12px for inline metadata icons
- **Stroke**: `strokeWidth={1.5}` to `strokeWidth={2}`
- Metadata row icons (court, match type, verification) use project SVGs at 16px from `/icons/`

### Interactive Controls

- **`rounded-full` (pill)**: Buttons, filter chips, search inputs, CTAs, view toggles, pagination, tags
- **`rounded-[6px]`**: Auth-style action buttons (sign in, sign up) — used on full-width form buttons
- **`rounded-2xl` (16px)**: Cards only
- **`rounded` (4px)**: Stat badges, player initials
- **Underline tabs**: `border-b-2` with `#3986F3` active, `#999999` inactive — no pill shape for navigation tabs
- **Filter pattern**: Individual chip buttons per category — never a single "Filters" mega-dropdown
- **Duration pills**: `rounded-full px-2 py-0.5 bg-[#F3F3F3] text-[#999999]` with `hover:bg-[#6AABFF] hover:text-white` transition

### Player Initials

- **Neutral initials**: `w-10 h-10 rounded bg-[#F2F2F2] text-xs font-medium text-[#BFBFBF] flex items-center justify-center` — used in match rows, showing first letter(s) of player name. No colored badges for now.

### CSS Variables (Auth Pages)

Auth pages use CSS custom properties defined in `globals.css`. Dashboard pages use Tailwind utilities directly. The variables are:
- `--color-accent-blue: #3B82F6` (auth-specific, slightly different from dashboard `#3986F3`)
- `--color-text-primary: #0A0A0C`, `--color-text-secondary: #71717A`, `--color-text-muted: #888`, `--color-text-dim: #AAA`, `--color-text-faint: #BBB`
- `--color-border-subtle: rgba(0,0,0,0.1)`, `--color-border-faint: rgba(0,0,0,0.05)`
- `--color-error: #FF453A`, `--color-error-bg: rgba(255,69,58,0.08)`

### Animation

- **Easing**: `[0.25, 0.46, 0.45, 0.94]` — the only approved Framer Motion ease curve
- **Auth entry**: `fadeUp` keyframe (opacity + translateY 12px, 0.5s ease-out)
- **Hover**: `scale-[1.005]` to `scale-[1.01]` — subtle, never bouncy
- **Press feedback**: `active:scale-[0.97]` for buttons — quick, tactile, no bounce
- **Transitions**: `transition-colors duration-200` for interactive state changes
- **Banned**: bounce, spring, wobble, decorative particle effects

### Banned

No harsh gradients, glassmorphism, blur backgrounds, non-Inter fonts, non-Lucide icons, heavy animations, or decorative noise. Auth pages may use the `brand-mesh-gradient` (blue/indigo) but dashboard pages must not.

## Key Conventions

- `@/` path alias for all imports from `src/`
- Server-side files: `*-server.ts`, client-side: `*-client.ts`
- Database row types prefixed with `Db` (e.g., `DbStat`, `DbMatch`)
- UI primitives from shadcn/ui live in `src/components/ui/`
- Conditional classes via `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge)
- Framer Motion for animations (subtle easing only: `[0.25, 0.46, 0.45, 0.94]`)
- Recharts for data charts
- Components use `shadcn/ui` + Radix primitives, styled via Tailwind

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
```

Optional:
```
LLM_PROVIDER=anthropic|openai
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
```
