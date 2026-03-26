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

**Read `.claude/skills/advantage-analytics-design/SKILL.md` and `.claude/skills/advantage-analytics-design/references/tokens.md` before building any UI.** These define the complete Advantage Analytics design system.

### Critical Rules

- **Font**: Inter only (weights 400, 500, 600)
- **Icons**: Lucide React only (strokeWidth 1.5–2, size 16–20px)
- **Colors**: Neutral palette with blue accent (#3986F3) and orange for opponent (#F38439)
- **Cards**: `border border-[rgba(0,0,0,0.06)] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)]` with 24px padding
- **Column headers**: `text-[10px] font-medium text-[#D9D9D9] uppercase tracking-[0.5px]`
- **Text**: Primary #0D0D0D, secondary #999999, tertiary #CCCCCC, muted #D9D9D9
- **Dividers**: #F0F0F0
- **Player badges**: Blue `bg-[#EBF0FE] text-[#4A8AF4]`, Orange `bg-[#FEF0E6] text-[#F38439]`

### Interactive Controls — Shape Rules

Not every interactive element is a button. Use the right shape for the right context:

- **`rounded-full` (pill shape)**: Buttons, filter pills/chips, search inputs, select dropdowns, CTAs, view toggles, tags/chips, pagination controls, and any standalone clickable control.
- **Underline-indicator tabs**: Navigation tabs (like `match-navigation-tabs.tsx`) use `border-b-2` with blue accent (`#3986F3`) for the active state — no pill shape. Inactive tabs use `text-[#999999]` with transparent border.
- **`rounded-2xl` (16px)**: Cards only.
- **`rounded` (4px)**: Stat badges only.
- **Filter UI pattern**: Individual chip buttons per category (e.g., Result, Match Type, Court Type, Source) — NOT a single "Filters" mega-dropdown.

Reference components: `filter-pills.tsx` (pill-shaped filter chips with blue active state) and `match-navigation-tabs.tsx` (underline tab navigation with blue accent).

### Banned

No glowing effects, harsh gradients, purple gradients, glassmorphism, blur backgrounds, non-Inter fonts, non-Lucide icons, heavy animations (bounce/spring/wobble), or decorative noise.

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
