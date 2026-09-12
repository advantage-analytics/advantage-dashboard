# AGENTS.md

Guidance for coding agents working in this repository — Claude Code, Codex and
Gemini all read this file. `CLAUDE.md` is a one-line `@AGENTS.md` import and
`GEMINI.md` is a symlink to it, so there is exactly ONE copy to keep current.
Edit this file; never edit the other two.

It also hosts the `nextjs-agent-rules` block that `next dev` maintains. Because
this file exists and carries that block, `next dev` skips `CLAUDE.md` entirely
(see `node_modules/next/dist/server/lib/generate-agent-files.js`).

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
npm run format       # Prettier (writes). `format:check` is what CI runs
npm run typecheck    # tsc --noEmit
npm run map          # Regenerate MAP.md's route table
```

## Architecture

**[`MAP.md`](MAP.md) is the code directory** — routes, source layout and the data
layer in one place. Read it before searching for a file, and use the `trace-route`
skill before editing any dashboard UI: several components share a name across
different routes, and picking by filename edits a page nobody was looking at.

### Workspaces — read this before any dashboard work

Every dashboard query runs inside a **workspace**, resolved once per request by
`getWorkspaceContext()` (`src/lib/workspace/active-workspace-server.ts`) in
`src/app/dashboard/layout.tsx`. Two kinds, with different navigation because they are
different products:

- **personal** — one player's own matches; role is always `owner`
- **team** — a collegiate program with members, roles (`owner|coach|staff|player`) and a
  shared monthly video budget

A user may hold several, so this is a switcher, never a flag on the user row. Membership
lives in `program_members`, _not_ `users.role` (nullable free text, nothing validates it).
`src/lib/workspace/types.ts`'s doc comments are the spec.

### Routes

Full table in [`MAP.md`](MAP.md). Three things it does not tell you:

- Session refresh runs in **`src/proxy.ts`**, Next 16's replacement for the
  `middleware` file convention. It refreshes only and deliberately does **not**
  redirect — route protection lives in the Server Component layouts that own each
  area (`dashboard/`, `dashboard/team/`, `admin/`), next to the workspace and role
  lookup it depends on. Webhook and cron routes are excluded from the matcher on
  purpose.
- `/dashboard/statistics`, `/dashboard/team/statistics`, `/dashboard/ask`,
  `/dashboard/team/ask` and `/dashboard/opponents` render `ComingSoonPage`. Their
  shape is not settled, so there is no implementation behind them to revive — the
  loaders in `opponents-server.ts` are the exception and are live elsewhere.
- `/request-access` is a `next.config.ts` redirect to the landing page form, not a page.

### Data flow

Server Components fetch through the Supabase server client and pass props down; client
components (`"use client"`) own UI state and use the browser client. Three client
factories in `src/lib/supabase/`: `server.ts` (cookies), `client.ts` (browser),
`admin.ts` (service role, bypasses RLS). All user data is RLS-scoped.

Server-side loaders live in `src/lib/data/*-server.ts`. Key tables: `matches`,
`match_stats`, `points`, `shots`, `users`, `programs`, `program_members`,
`program_claims`, `program_events`, `processing_jobs`, `processing_usage`. The
`match_stats_with_percentages` view adds computed percentages. Schema: the **live
database is the only source of truth** — verify via the Supabase MCP (`list_tables`,
`execute_sql`). `supabase/migrations/` runs roughly 100 migrations behind it.

Edge functions in `supabase/functions/`: `process-match` (parses uploaded .xlsx
asynchronously — upload returns immediately) and `generate-insights`.

### Match detail

`matches/[matchId]` is a **single page with no sub-routes**; sections are scroll anchors.
`layout.tsx` and `page.tsx` both call `getMatchDetailData()`
(`src/lib/data/match-detail-server.ts`), wrapped in React `cache()` so the two share one
fetch. The layout puts the result in `MatchDataProvider`; deep client components read it
via `useMatchData()` instead of prop-drilling. `page.tsx` short-circuits to the hero +
`MatchAnalysisProgress` while a match is still analysing — otherwise every stat section
draws zeroes, and an empty serve chart reads as "you hit no serves".

### Upload pipeline

SwingVision .xlsx → `SwingVisionValidator` → `SwingVisionParser` → `match-data` bucket →
`process-match` extracts points/shots. Code in `src/lib/services/upload/`; the provider
strategy pattern is how new sources get added.

The wizard is a full page at `/dashboard/matches/new`, not a dialog. Step order branches
on provider kind — import providers run Provider → Match → Confirm, processing providers
insert a Video step (`STEP_ORDER_BY_KIND` in the subtree's `types.ts`). `DashboardShell`
clears upload localStorage when the path leaves `/dashboard/matches/new`.

### Video analysis (Advantage Intelligence)

A working pipeline carries real athlete video to a third-party vendor and back:
browser → **Azure Blob** → vendor → webhook → results JSON + trimmed video. It has
processed a real full-length match.

**IMPORTANT: before changing any dashboard UI, read
[`docs/ui-revamp-guardrails.md`](docs/ui-revamp-guardrails.md).** It lists what must not
be touched and the three wizard inputs that — when wrong — attribute every statistic to
the wrong player with nothing looking broken on screen.
[`docs/README.md`](docs/README.md) indexes the rest and marks which docs are current
state vs. point-in-time.

The provider is **"Advantage Intelligence"** in every user-visible string. `splitstep` is
internal naming only.

### LLM and email

`getLLMStream()` (`src/lib/llm/adapter.ts`) streams for `/api/home-insight` and
`/api/team-insight`; `LLM_PROVIDER=anthropic|openai`, SDKs dynamically imported, mock
mode with no key (`docs/llm-setup.md`).

Product mail renders through `src/lib/services/email/shell.ts` and sends via Resend;
auth mail is Supabase's own, in `supabase/email-templates/*.html`. `shell.ts` is a
hand-copy of that markup — change one and you must change the other. Read
[`docs/email-system.md`](docs/email-system.md) before writing a template or wiring a send.

## Design System

**IMPORTANT: read `.skills/advantage-analytics-design/SKILL.md` before building any UI.**
It is the authoritative build reference — tokens, type scale, colours, motion and
component recipes. Tokens live in `src/styles/design-system/`, imported by `globals.css`.
`DESIGN.md` records v2 provenance and what was deliberately deferred (dark mode, v2
shadows). Primary buttons come from `advButton()` (`src/lib/ui/adv-button.ts`) — don't
hand-roll a near-miss. Re-sync SKILL.md from the v3 Claude Design project's `CHANGELOG.md`
via DesignSync, not the web; it never changes a token value.

## Task queues and the feature pipeline

Each branch has its own queue at `.claude/tasks/<branch-slug>.md` (`/` → `-`), so task
files never conflict. `/task-add` appends; `/task-next` runs one task in a gated subagent
and commits it. Larger features run the staged ICM pipeline in `work/<slug>/` via
`/feature-new` and `/feature-next` — rules in `.claude/pipeline/CONTEXT.md`, spec in
`docs/superpowers/specs/2026-08-30-icm-feature-pipeline-design.md`. Everything else about
them lives in each skill's own SKILL.md and in the queue file's header.

Two rules you need _before_ invoking any of them:

- **IMPORTANT: never present `/task-next`, `/task-add`, `/pr-check` or `/feature-next`
  inside a ```bash fence.** The app renders a fenced shell block as a Run button, and
  running one there fails with `command not found`.
- **Never drive them with `/loop <command>`** — a scheduled fire cannot invoke a skill
  that sets `disable-model-invocation`. To drain a queue, loop a plain-text instruction:
  `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from
this branch's queue, then stop.`

## Conventions

- `MAP.md` is generated — run `npm run map` after adding a route, or `npm test` fails.
- Never hand-format `supabase/migrations/` or `src/styles/design-system/colors.css`.
  `.prettierignore` documents every exclusion and why.
- No global state library — Context + server-side fetching only.
- `@azure/storage-blob` signs vendor SAS URLs and **must never reach a client bundle**;
  it, `exceljs` and the LLM SDKs are `serverExternalPackages` in `next.config.ts`.

## Environment

Copy `.env.example` to `.env.local` — it documents every variable, which are optional,
and what leaving one unset actually does. Only the three Supabase keys plus
`NEXT_PUBLIC_SITE_URL` are needed to boot. In an agent worktree,
`.claude/hooks/bootstrap-worktree.sh` symlinks it from the main checkout.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
