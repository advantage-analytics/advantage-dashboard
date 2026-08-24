# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Advantage Analytics is a tennis analytics platform. Athletes upload match **video**
(processed by a third-party vendor) or **SwingVision .xlsx** exports and get statistics,
court visualizations and AI match commentary. Next.js 16 (App Router), Supabase,
Tailwind v4, deployed on Vercel.

## Commands

```bash
npm run dev          # Dev server on :3000 (Turbopack is the Next 16 default)
npm run build        # Production build
npm run lint         # ESLint (flat config)
npm run test         # Playwright — specs live in tests/
```

## Architecture

### Workspaces — read this before any dashboard work

Every dashboard query runs inside a **workspace**, resolved once per request by
`getWorkspaceContext()` (`src/lib/workspace/active-workspace-server.ts`) in
`src/app/dashboard/layout.tsx`. Two kinds, with different navigation because they are
different products:

- **personal** — one player's own matches; role is always `owner`
- **team** — a collegiate program with members, roles (`owner|coach|staff|player`) and a
  shared monthly video budget

A user may hold several, so this is a switcher, never a flag on the user row. Membership
lives in `program_members`, *not* `users.role` (nullable free text, nothing validates it).
See `src/lib/workspace/types.ts` — the doc comments there are the spec.

**[`MAP.md`](MAP.md) is the code directory** — routes, source layout, and the
data layer, in one place. Read it before searching for a file. Its route table
is generated: run `npm run map` after adding a route, or `npm test` fails.

### Routes

- `src/app/(auth)/` — `login`, `sign-up`, `forgot-password`, `update-password`,
  `check-email`, `sign-up-success`, `error`, plus `confirm/` (email) and `callback/`
  (OAuth) route handlers. `/request-access` is a `next.config.ts` redirect to the landing
  page form, not a page.
- `src/app/dashboard/` — `(home)`, `matches`, `matches/[matchId]`, `matches/new`,
  `statistics`, `ask`, `help`, `team/{roster,schedule,compare,upload,settings}`,
  `settings/{account,profile,plan,preferences,subscription,team,usage}`
- `src/app/claim/`, `src/app/join/[token]`, `src/app/admin/claims` — program claim,
  invite acceptance and claim review flows
- `src/app/api/` — `upload`, `validate-file`, `chat`, `home-insight`, `matches/[matchId]`,
  `programs/search`, `splitstep/{jobs,upload-url}`, `create-checkout-session`,
  `webhooks/{splitstep,stripe}`, `cron/reclaim-videos`

Session refresh runs in **`src/proxy.ts`** — Next 16's replacement for the `middleware`
file convention. It does session refresh only and deliberately does **not** redirect — route
protection lives in the Server Component layouts that own each area
(`dashboard/`, `dashboard/team/`, `admin/`), next to the workspace/role lookup it
depends on. Webhook and cron routes are excluded from the matcher on purpose.

### Data flow

Server Components fetch through the Supabase server client and pass props down; client
components (`"use client"`) own UI state and use the browser client. Three client
factories in `src/lib/supabase/`: `server.ts` (cookies), `client.ts` (browser),
`admin.ts` (service role, bypasses RLS). All user data is RLS-scoped.

Server-side loaders live in `src/lib/data/*-server.ts`; their client-side counterparts are
`*-client.ts`. Key tables: `matches`, `match_stats`, `points`, `shots`, `users`,
`programs`, `program_members`, `program_claims`, `program_events`, `processing_jobs`,
`processing_usage`. The `match_stats_with_percentages` view adds computed percentages.
Schema reference: [`DATABASE_PRD.md`](DATABASE_PRD.md) — **point-in-time, stamped
February 2026.** `supabase/migrations/` runs roughly 100 migrations behind the
live database, so neither is a source of truth. Verify schema against the live
database via the Supabase MCP before relying on either.

Edge functions in `supabase/functions/`: `process-match` (parses uploaded .xlsx
asynchronously — upload returns immediately), `generate-insights`, `upload-video-r2`,
`delete-video-r2`.

### Match detail

`matches/[matchId]` is a **single page with no sub-routes** — the directory holds only
`error/layout/loading/not-found/page`. Sections are scroll anchors. `layout.tsx` and
`page.tsx` both call `getMatchDetailData()` (`src/lib/data/match-detail-server.ts`), which
is wrapped in React `cache()` so the two share one fetch. The layout puts the result in
`MatchDataProvider`; deep client components read it via `useMatchData()` instead of
prop-drilling. `page.tsx` short-circuits to the hero + `MatchAnalysisProgress` while a
match is still analysing — otherwise every stat section draws zeroes, and an empty serve
chart reads as "you hit no serves".

### Statistics

`statistics-server.ts` (`getStatisticsPageData()`, `getSelectableMatches()`) and
`statistics-client.ts` (`computeStatistics()`) produce the same `StatisticsPageData`; the
client version recomputes from `SelectableMatch[]` when filters change, avoiding
round-trips. `STAT_CONFIG` (20 stats, grouped Serve/Return/Other by a `category` field) is
a **private** const inside `statistics/stat-progression-chart.tsx` — extract it before
using it from a second component.

### Upload pipeline

SwingVision .xlsx → `SwingVisionValidator` → `SwingVisionParser` → `match-data` bucket →
`process-match` extracts points/shots. Code in `src/lib/services/upload/`
(`parsers/`, `providers/`, `validators/`); the provider strategy pattern is how new
sources get added.

The wizard is a full page at `/dashboard/matches/new`, not a dialog. Step order branches on
provider kind — import providers run Provider → Match → Confirm, processing providers
insert a Video step (`STEP_ORDER_BY_KIND` in the subtree's `types.ts`). `DashboardShell`
clears upload localStorage when the path leaves `/dashboard/matches/new`.

### Court visualization

`matches/visuals/court-visualization.tsx` (~730 lines) — SVG court in serve (half) and
return (full) modes with dot plots, tooltips and filters. Filter configs in
`visuals/configs/`; filter state in `useVisualFilters` (`src/hooks/use-visual-filters.ts`).

### Video analysis (Advantage Intelligence)

A working pipeline carries real athlete video to a third-party vendor and back:
browser → **Azure Blob** → vendor → webhook → results JSON + trimmed video. It has
processed a real full-length match. Cloudflare R2 is retired but not yet deleted;
`workers/video-access` belongs to that retired path.

**Before changing any dashboard UI, read [`docs/ui-revamp-guardrails.md`](docs/ui-revamp-guardrails.md).**
It lists what must not be touched and the three wizard inputs that — when wrong — attribute
every statistic to the wrong player with nothing looking broken on screen.
[`docs/README.md`](docs/README.md) indexes the rest and marks which docs are current state
vs. point-in-time.

The provider is **"Advantage Intelligence"** in every user-visible string. `splitstep` is
internal naming only.

### LLM

`/api/chat` streams via `getLLMStream()` (`src/lib/llm/adapter.ts`). `LLM_PROVIDER=anthropic|openai`;
SDKs are dynamically imported so only the configured one loads. Falls back to mock mode
with no key. See `docs/llm-setup.md`.

## Design System

**Read `.skills/advantage-analytics-design/SKILL.md` before building any UI** — it is the
authoritative build reference. `DESIGN.md` documents v2 provenance and what was
deliberately deferred (dark mode, v2 shadows). Tokens live in
`src/styles/design-system/`, imported by `globals.css`.

Inter only (300/400/500/600), type scale 9–56px, blue accent `#3B82F6`, success `#5DB955`,
error `#E51837`, Lucide icons only, two Framer Motion curves
(`[0.25, 0.46, 0.45, 0.94]`, `[0.23, 1, 0.32, 1]`), no bounce or glassmorphism.

Auth pages style from CSS variables; dashboard pages use Tailwind utilities directly.
Primary buttons come from `advButton()` (`src/lib/ui/adv-button.ts`) — don't hand-roll a
near-miss.

## Workflow

**Trace the route before editing components.** When the user names a page, open the route
file and follow the import chain to the exact rendered component, and state that path
before proposing edits. Overlapping names are everywhere: serve placement exists four
times — `home/serve-placement-home.tsx`, `matches/match-detail/serve-placement-card.tsx`,
`matches/serve-placement/serve-placement-widget.tsx`, and
`statistics/serve-placement-stats.tsx`.

### Branch task queues

Each branch has its own queue at `.claude/tasks/<branch-slug>.md` (the branch
with `/` replaced by `-`). Distinct filenames per branch mean merge conflicts
on task files are structurally impossible.

- `/task-next` runs one task: a fresh subagent, gated, then committed.
- `/loop /task-next` — no interval — drains the queue, self-paced.
- The queue file is yours; append to it any time, including while the loop
  runs. The runner only ever rewrites a task's `status:` line.
- `.claude/tasks/<slug>.log.md` is the runner's. Do not hand-edit it.
- Status values: `todo`, `next`, `doing`, `done` and `blocked` are the
  runner-driven ones. `later` is a deferred task — `/task-next`'s picker never
  selects it automatically, so a `/loop /task-next` drain skips straight past
  it. Promote it to `todo` by hand when it's actually ready to run.

Every task needs a `done when:` list. It is the contract
`task-completion-reviewer` gates against, and a task without one is skipped.

`/task-next`, `/task-add` and `/pr-check` are typed to Claude, not to a shell.
Never present them inside a ```bash fence — the app renders a fenced shell
block as a Run button, and running one there fails with `command not found`.

## Conventions

- `@/` alias for imports from `src/`
- `*-server.ts` / `*-client.ts` for the server/client split; `Db` prefix on row types
- shadcn/ui primitives in `src/components/ui/`; `cn()` from `src/lib/utils.ts`
- Framer Motion for animation, Recharts for charts
- No global state library — Context + server-side fetching only
- `exceljs`, `@azure/storage-blob` and the LLM SDKs are `serverExternalPackages` in
  `next.config.ts`; `@azure/storage-blob` signs vendor SAS URLs and must never reach a
  client bundle

## Environment

Copy `.env.example` to `.env.local` — it is the source of truth and documents each
variable, including which ones are deliberately optional and what leaving them unset
actually does. Only the three Supabase keys plus `NEXT_PUBLIC_SITE_URL` are needed to boot.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
