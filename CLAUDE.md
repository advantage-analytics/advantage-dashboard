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

### Route Structure

**Auth** (`src/app/(auth)/`): Route group with dual-panel layout (brand panel + form). Pages: `login`, `sign-up`, `forgot-password`, `update-password`, `request-access`, `check-email`, `sign-up-success`, `error`. Auth callbacks: `confirm/route.ts` (email), `callback/route.ts` (OAuth).

**Dashboard** (`src/app/dashboard/`): Protected area with sidebar + header layout.
- `(home)/` — Home dashboard (KPIs, charts, activity feed, recent matches)
- `matches/` — Match list with gallery/list views
- `matches/[matchId]/(tabs)/` — Match detail with tab routing: `overall`, `video`, `analysis`, `visuals`. The layout at `matches/[matchId]/layout.tsx` fetches match data and provides it via `MatchDataProvider` context so all tab pages share the same data without re-fetching.
- `statistics/` — Aggregate stats across matches with match selector filters
- `settings/{account,profile,subscription}/` — Settings sub-pages
- `help/` — Help page

**API Routes**: `/api/upload` (file processing), `/api/validate-file`, `/api/chat` (streaming LLM responses).

### Data Flow

- **Server Components** (default): Pages fetch data via Supabase server client (`src/lib/supabase/server.ts`), pass props to client components
- **Client Components** (`"use client"`): Handle UI state, filters, real-time updates via browser client (`src/lib/supabase/client.ts`)
- **Edge Function**: `supabase/functions/process-match` processes uploaded files asynchronously (fire-and-forget — upload returns immediately)

### Supabase

Three client factories:
- `src/lib/supabase/server.ts` — Server Components and API routes (cookie-based auth)
- `src/lib/supabase/client.ts` — Browser (localStorage auth)
- `src/lib/supabase/admin.ts` — Service role (bypasses RLS)

Auth uses Supabase Auth with middleware session refresh (`src/lib/supabase/middleware.ts`). All user data is RLS-scoped.

Key tables: `matches`, `match_stats`, `points`, `shots`, `users`. The `match_stats_with_percentages` view provides computed stats with percentages and fractions. Schema reference: `DATABASE_PRD.md` at repo root.

### Match Detail Data Sharing

`MatchDataProvider` (`src/components/dashboard/matches/match-data-provider.tsx`) is a React Context that holds match metadata, statistics, and points. The match detail layout fetches everything server-side and passes it into the provider. Tab pages (`overall`, `video`, `analysis`, `visuals`) consume the context — no re-fetching per tab.

### Statistics Data Layer

Server/client split pattern for statistics:
- `src/lib/data/statistics-server.ts` — Server-side initial data load (`getStatisticsPageData()`, `getSelectableMatches()`)
- `src/lib/data/statistics-client.ts` — Client-side recomputation (`computeStatistics()`) when match filters change
- `src/lib/data/stat-configs.ts` — Shared stat definitions (24 stats in 3 tabs: Serve/Return/Other)

Both files produce the same `StatisticsPageData` shape. The client version operates on `SelectableMatch[]` to avoid round-trips when users toggle filters.

### File Upload Pipeline

SwingVision .xlsx → `SwingVisionValidator` → `SwingVisionParser` → Supabase storage (`match-data` bucket) → `process-match` edge function extracts points/shots.

Upload code lives in `src/lib/services/upload/` with parsers, providers, and validators subdirectories. Provider strategy pattern allows adding new data sources without touching core upload logic.

The upload modal (`src/components/dashboard/home/upload-match-modal/`) is a multi-step flow: Provider → Method → Upload → Confirm. Dashboard layout cleans up upload localStorage on route changes.

### Court Visualization System

SVG-based tennis court (`src/components/dashboard/matches/visuals/court-visualization.tsx`, ~730 lines). Supports serve (half-court) and return (full-court) modes with dot plots, interactive tooltips, and a filter system.

Filter configs: `src/components/dashboard/matches/visuals/configs/` (serve, return, custom modes). Filter state managed by `useVisualFilters` hook (`src/hooks/use-visual-filters.ts`).

### LLM Integration

`/api/chat` streams responses from Claude or GPT-4o. Provider abstracted in `src/lib/llm/adapter.ts` with `getLLMStream()`. Set `LLM_PROVIDER=anthropic` or `openai` in env. Falls back to mock mode if no API key configured. LLM SDKs are dynamically imported — only the configured provider is loaded.

## Design System

**Read `.skills/advantage-analytics-design/SKILL.md` before building any UI.** It defines the complete Advantage Analytics design language — every typography token, color value, spacing unit, border radius, shadow, animation curve, and component pattern extracted from the live codebase. The SKILL.md is authoritative.

Key principles: Inter font only (weights 300/400/500/600), strict type scale (9–56px), blue accent `#3B82F6`, semantic success `#5DB955` / error `#E51837`, Lucide React icons only, two Framer Motion curves (`[0.25, 0.46, 0.45, 0.94]` primary, `[0.23, 1, 0.32, 1]` spring-like), no bounce/glassmorphism.

Auth pages use CSS variables from `globals.css`. Dashboard pages use Tailwind utilities directly — two distinct styling paradigms.

## Key Conventions

- `@/` path alias for all imports from `src/`
- Server-side files: `*-server.ts`, client-side: `*-client.ts`
- Database row types prefixed with `Db` (e.g., `DbStat`, `DbMatch`)
- UI primitives from shadcn/ui live in `src/components/ui/`
- Conditional classes via `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge)
- Framer Motion for animations, Recharts for data charts
- `exceljs` is marked as server-external in `next.config.ts` to avoid bundling
- No global state library — Context + server-side data fetching only

## Scripts

- `scripts/user_matches.py` — Python utility to fetch match results from Universal Tennis API and upsert into Supabase (requires `scripts/requirements.txt` deps)

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
