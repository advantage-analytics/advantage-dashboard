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
- `matches/[matchId]/` — Match detail page. A single page with **no sub-routes** — the directory holds only `error/layout/loading/not-found/page`. Sections are scroll anchors on the one page, not routes. The layout at `matches/[matchId]/layout.tsx` wraps children in `MatchDataProvider` (see Match Detail Data Sharing below). `page.tsx` short-circuits when the match is still being analysed or has failed: it renders the hero, summary row and `MatchAnalysisProgress` instead of the stat sections, because every one of them would otherwise draw zeroes and an empty serve chart reads as "you hit no serves".
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

`MatchDataProvider` (`src/components/dashboard/matches/match-data-provider.tsx`) is a React Context that holds match metadata, statistics, and points. The layout and `page.tsx` each call `getMatchDetailData()` from `src/lib/data/match-detail-server.ts`, which is wrapped in React `cache()` — so the two calls share one fetch per request rather than duplicating it. The page passes data to its cards as props; client components deeper in the tree (e.g. `ServePlacementCard`) read the context via `useMatchData()` instead of prop-drilling.

### Statistics Data Layer

Server/client split pattern for statistics:
- `src/lib/data/statistics-server.ts` — Server-side initial data load (`getStatisticsPageData()`, `getSelectableMatches()`)
- `src/lib/data/statistics-client.ts` — Client-side recomputation (`computeStatistics()`) when match filters change
- `src/lib/data/stat-configs.ts` — Shared stat definitions (24 stats in 3 tabs: Serve/Return/Other)

Both files produce the same `StatisticsPageData` shape. The client version operates on `SelectableMatch[]` to avoid round-trips when users toggle filters.

### File Upload Pipeline

SwingVision .xlsx → `SwingVisionValidator` → `SwingVisionParser` → Supabase storage (`match-data` bucket) → `process-match` edge function extracts points/shots.

Upload code lives in `src/lib/services/upload/` with parsers, providers, and validators subdirectories. Provider strategy pattern allows adding new data sources without touching core upload logic.

The upload wizard (`src/components/dashboard/matches/new-match-wizard/`) is a full page at `/dashboard/matches/new`, not a dialog. It is a multi-step flow whose step order branches on provider kind: import providers run Provider → Match → Confirm, processing providers insert a Video step (`STEP_ORDER_BY_KIND` in the subtree's `types.ts`). Dashboard layout cleans up upload localStorage when you navigate away from the wizard route.

### Court Visualization System

SVG-based tennis court (`src/components/dashboard/matches/visuals/court-visualization.tsx`, ~730 lines). Supports serve (half-court) and return (full-court) modes with dot plots, interactive tooltips, and a filter system.

Filter configs: `src/components/dashboard/matches/visuals/configs/` (serve, return, custom modes). Filter state managed by `useVisualFilters` hook (`src/hooks/use-visual-filters.ts`).

### LLM Integration

`/api/chat` streams responses from Claude or GPT-4o. Provider abstracted in `src/lib/llm/adapter.ts` with `getLLMStream()`. Set `LLM_PROVIDER=anthropic` or `openai` in env. Falls back to mock mode if no API key configured. LLM SDKs are dynamically imported — only the configured provider is loaded.

### Video analysis (Advantage Intelligence)

A working pipeline carries real athlete video to a third-party vendor and back:
browser → Azure Blob → vendor → webhook → results JSON + trimmed video. It has
processed a real full-length match.

**Before changing any dashboard UI, read [`docs/ui-revamp-guardrails.md`](docs/ui-revamp-guardrails.md).**
It lists what must not be touched, which UI files carry invariants the pipeline
depends on, and the three wizard inputs that — when wrong — attribute every
statistic to the wrong player with nothing looking broken on screen.

The provider is **"Advantage Intelligence"** in every user-visible string.
`splitstep` is internal naming only.

## Design System

**Read `.skills/advantage-analytics-design/SKILL.md` before building any UI.** It defines the complete Advantage Analytics design language — every typography token, color value, spacing unit, border radius, shadow, animation curve, and component pattern extracted from the live codebase. The SKILL.md is authoritative.

Key principles: Inter font only (weights 300/400/500/600), strict type scale (9–56px), blue accent `#3B82F6`, semantic success `#5DB955` / error `#E51837`, Lucide React icons only, two Framer Motion curves (`[0.25, 0.46, 0.45, 0.94]` primary, `[0.23, 1, 0.32, 1]` spring-like), no bounce/glassmorphism.

Auth pages use CSS variables from `globals.css`. Dashboard pages use Tailwind utilities directly — two distinct styling paradigms.

### Widgetless by default

When redesigning pages, default to **flat/widgetless** layouts (hairline dividers, generous whitespace, no card wrappers) unless:
- The user explicitly asks for cards, or
- The surrounding page is dashboard-like (home) where sibling content already lives in cards — then mimic that pattern for cohesion.

If unsure, ask the user "widgetless or card-wrapped?" before starting.

## Workflow

### Trace the route before editing components

When the user references a page (e.g., "the match detail page", "the home dashboard", "the video section"), **open the route file first** and follow the import chain to identify the exact rendered component. State the file path before proposing edits.

Do NOT assume based on filename similarity — this project has multiple components with overlapping names that render in different routes. Serve placement exists three times: `home/serve-placement-home.tsx` on the home dashboard, `matches/match-detail/serve-placement-card.tsx` on match detail, and `statistics/serve-placement-stats.tsx` on statistics. Picking the wrong one wastes a cycle.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
