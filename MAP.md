# MAP.md — where things are

`CLAUDE.md` answers *how to work here*. This answers *where things are*.
419 TypeScript files is more than a fresh context can orient in from
conventions alone.

**The route table below is generated.** Run `npm run map` after adding or
removing a route; `npm test` fails if it is stale. Everything outside the
markers is hand-written — edit it as things move.

## Routes

<!-- ROUTES:START -->

| Route | Page file |
|---|---|
| `/check-email` | [`src/app/(auth)/check-email/page.tsx`](src/app/(auth)/check-email/page.tsx) |
| `/error` | [`src/app/(auth)/error/page.tsx`](src/app/(auth)/error/page.tsx) |
| `/forgot-password` | [`src/app/(auth)/forgot-password/page.tsx`](src/app/(auth)/forgot-password/page.tsx) |
| `/login` | [`src/app/(auth)/login/page.tsx`](src/app/(auth)/login/page.tsx) |
| `/sign-up-success` | [`src/app/(auth)/sign-up-success/page.tsx`](src/app/(auth)/sign-up-success/page.tsx) |
| `/sign-up` | [`src/app/(auth)/sign-up/page.tsx`](src/app/(auth)/sign-up/page.tsx) |
| `/update-password` | [`src/app/(auth)/update-password/page.tsx`](src/app/(auth)/update-password/page.tsx) |
| `/admin/claims` | [`src/app/admin/claims/page.tsx`](src/app/admin/claims/page.tsx) |
| `/claim/[programKey]/object` | [`src/app/claim/[programKey]/object/page.tsx`](src/app/claim/[programKey]/object/page.tsx) |
| `/claim/[programKey]` | [`src/app/claim/[programKey]/page.tsx`](src/app/claim/[programKey]/page.tsx) |
| `/claim/[programKey]/request` | [`src/app/claim/[programKey]/request/page.tsx`](src/app/claim/[programKey]/request/page.tsx) |
| `/claim/[programKey]/setup` | [`src/app/claim/[programKey]/setup/page.tsx`](src/app/claim/[programKey]/setup/page.tsx) |
| `/claim/check-email` | [`src/app/claim/check-email/page.tsx`](src/app/claim/check-email/page.tsx) |
| `/claim` | [`src/app/claim/page.tsx`](src/app/claim/page.tsx) |
| `/claim/program/new` | [`src/app/claim/program/new/page.tsx`](src/app/claim/program/new/page.tsx) |
| `/claim/program` | [`src/app/claim/program/page.tsx`](src/app/claim/program/page.tsx) |
| `/claim/ready` | [`src/app/claim/ready/page.tsx`](src/app/claim/ready/page.tsx) |
| `/claim/review` | [`src/app/claim/review/page.tsx`](src/app/claim/review/page.tsx) |
| `/claim/verify/failed` | [`src/app/claim/verify/failed/page.tsx`](src/app/claim/verify/failed/page.tsx) |
| `/dashboard` | [`src/app/dashboard/(home)/page.tsx`](src/app/dashboard/(home)/page.tsx) |
| `/dashboard/ask` | [`src/app/dashboard/ask/page.tsx`](src/app/dashboard/ask/page.tsx) |
| `/dashboard/help` | [`src/app/dashboard/help/page.tsx`](src/app/dashboard/help/page.tsx) |
| `/dashboard/matches/[matchId]` | [`src/app/dashboard/matches/[matchId]/page.tsx`](src/app/dashboard/matches/[matchId]/page.tsx) |
| `/dashboard/matches/new` | [`src/app/dashboard/matches/new/page.tsx`](src/app/dashboard/matches/new/page.tsx) |
| `/dashboard/matches` | [`src/app/dashboard/matches/page.tsx`](src/app/dashboard/matches/page.tsx) |
| `/dashboard/opponents/[programId]/[playerId]` | [`src/app/dashboard/opponents/[programId]/[playerId]/page.tsx`](src/app/dashboard/opponents/[programId]/[playerId]/page.tsx) |
| `/dashboard/opponents/[programId]` | [`src/app/dashboard/opponents/[programId]/page.tsx`](src/app/dashboard/opponents/[programId]/page.tsx) |
| `/dashboard/opponents` | [`src/app/dashboard/opponents/page.tsx`](src/app/dashboard/opponents/page.tsx) |
| `/dashboard/settings/account` | [`src/app/dashboard/settings/account/page.tsx`](src/app/dashboard/settings/account/page.tsx) |
| `/dashboard/settings` | [`src/app/dashboard/settings/page.tsx`](src/app/dashboard/settings/page.tsx) |
| `/dashboard/settings/plan` | [`src/app/dashboard/settings/plan/page.tsx`](src/app/dashboard/settings/plan/page.tsx) |
| `/dashboard/settings/preferences` | [`src/app/dashboard/settings/preferences/page.tsx`](src/app/dashboard/settings/preferences/page.tsx) |
| `/dashboard/settings/profile` | [`src/app/dashboard/settings/profile/page.tsx`](src/app/dashboard/settings/profile/page.tsx) |
| `/dashboard/settings/subscription` | [`src/app/dashboard/settings/subscription/page.tsx`](src/app/dashboard/settings/subscription/page.tsx) |
| `/dashboard/settings/team` | [`src/app/dashboard/settings/team/page.tsx`](src/app/dashboard/settings/team/page.tsx) |
| `/dashboard/settings/usage` | [`src/app/dashboard/settings/usage/page.tsx`](src/app/dashboard/settings/usage/page.tsx) |
| `/dashboard/statistics` | [`src/app/dashboard/statistics/page.tsx`](src/app/dashboard/statistics/page.tsx) |
| `/dashboard/team` | [`src/app/dashboard/team/page.tsx`](src/app/dashboard/team/page.tsx) |
| `/dashboard/team/roster/[playerId]` | [`src/app/dashboard/team/roster/[playerId]/page.tsx`](src/app/dashboard/team/roster/[playerId]/page.tsx) |
| `/dashboard/team/roster` | [`src/app/dashboard/team/roster/page.tsx`](src/app/dashboard/team/roster/page.tsx) |
| `/dashboard/team/schedule/[eventId]` | [`src/app/dashboard/team/schedule/[eventId]/page.tsx`](src/app/dashboard/team/schedule/[eventId]/page.tsx) |
| `/dashboard/team/schedule/new/dual` | [`src/app/dashboard/team/schedule/new/dual/page.tsx`](src/app/dashboard/team/schedule/new/dual/page.tsx) |
| `/dashboard/team/schedule/new/single` | [`src/app/dashboard/team/schedule/new/single/page.tsx`](src/app/dashboard/team/schedule/new/single/page.tsx) |
| `/dashboard/team/schedule/new/tournament` | [`src/app/dashboard/team/schedule/new/tournament/page.tsx`](src/app/dashboard/team/schedule/new/tournament/page.tsx) |
| `/dashboard/team/schedule` | [`src/app/dashboard/team/schedule/page.tsx`](src/app/dashboard/team/schedule/page.tsx) |
| `/dashboard/team/schedule/single/[matchId]` | [`src/app/dashboard/team/schedule/single/[matchId]/page.tsx`](src/app/dashboard/team/schedule/single/[matchId]/page.tsx) |
| `/dashboard/team/settings` | [`src/app/dashboard/team/settings/page.tsx`](src/app/dashboard/team/settings/page.tsx) |
| `/dashboard/team/upload` | [`src/app/dashboard/team/upload/page.tsx`](src/app/dashboard/team/upload/page.tsx) |
| `/join/[token]` | [`src/app/join/[token]/page.tsx`](src/app/join/[token]/page.tsx) |
| `/` | [`src/app/page.tsx`](src/app/page.tsx) |

<!-- ROUTES:END -->

## Which component actually renders a page

A route file is rarely where the work is, and several components here share a
name across different routes. Picking by filename similarity edits a page
nobody was looking at.

**Use the `trace-route` skill before editing any dashboard UI.** It follows the
import chain and carries the full ambiguity table — including serve placement,
which exists four separate times.

## Source layout

| Directory | Holds |
|---|---|
| `src/app/(auth)/` | Auth route group — dual-panel layout, login/sign-up/password flows |
| `src/app/dashboard/` | Protected area: sidebar + header shell |
| `src/app/api/` | Route handlers, one directory per group: `chat` (LLM streaming), `upload`, `validate-file`, `matches/[matchId]`, `home-insight`, `programs/search` — plus money and webhook infra: `create-checkout-session` + `webhooks/stripe` (Stripe payments), `webhooks/splitstep` + `splitstep/jobs` + `splitstep/upload-url` (Advantage Intelligence pipeline), `cron/reclaim-videos` (scheduled job) |
| `src/components/ui/` | shadcn/ui primitives |
| `src/components/dashboard/` | Feature components, mirroring the dashboard routes |
| `src/lib/supabase/` | Three client factories: `server`, `client`, `admin` (service role) |
| `src/lib/data/` | Server-side data layer, one file per domain (matches, activity, roster, team, schedule, statistics, ...); only `statistics` is split `*-server.ts` / `*-client.ts` for client-side recomputation |
| `src/lib/services/upload/` | Provider-strategy upload pipeline: parsers, providers, validators |
| `src/lib/services/email/` | Transactional email: one sender, one HTML shell, templates grouped by family. Auth mail is Supabase's own, in `supabase/email-templates/` — see [`docs/email-system.md`](docs/email-system.md) |
| `src/lib/llm/` | Provider-agnostic streaming adapter |
| `src/hooks/` | Shared React hooks |
| `supabase/functions/` | Edge functions |
| `scripts/` | Repo tooling, not shipped |

## Data layer

- **Three Supabase clients.** `server.ts` (cookie auth, Server Components and
  route handlers), `client.ts` (localStorage auth, browser), `admin.ts`
  (**service role — bypasses RLS entirely**).
- **Statistics are computed twice by design:** `statistics-server.ts` for the
  initial server load, `statistics-client.ts` for recomputation when filters
  change. Both produce the same shape.
- **Schema:** verify against the live database via the Supabase MCP, not
  `supabase/migrations/` — the folder runs well behind.

## Docs

[`docs/README.md`](docs/README.md) indexes every doc and marks which are
current state versus point-in-time. Read it before trusting any doc here.
