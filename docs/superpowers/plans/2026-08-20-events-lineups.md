# Events & Lineups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A team workspace can create a dual or a tournament, name every line, and put a match video or a SwingVision import against each line.

**Architecture:** Two new tables (`program_events`, `program_event_entries`) plus `matches.event_entry_id`. An entry becomes a `matches` row the first moment anyone records how it went — a score or a video. Five new routes under `/dashboard/team/`, and a four-step team upload wizard that reuses the personal wizard's submit pipeline through an extracted service.

**Tech Stack:** Next.js 16 App Router, React server components, Supabase (Postgres + RLS), Tailwind v4, Advantage Design System v2 tokens, Framer Motion, Lucide.

**Spec:** [`docs/superpowers/specs/2026-08-20-events-lineups-design.md`](../specs/2026-08-20-events-lineups-design.md)

## Global Constraints

- **No test files exist in this repo.** `package.json` configures Playwright but `CLAUDE.md` records that no test files exist yet. This plan does **not** invent a test harness. Each task's verification cycle is `npx tsc --noEmit` + `npm run lint`, and behavioural tasks add a browser check through the preview tools. `npm run build` runs once at the end (Task 13) — it is slow and every task before it is typechecked.
- **Lint baseline:** `npm run lint` has **39 pre-existing warnings, 0 errors** on this branch, measured at Task 2. Guardrails §7 says 43; that number is stale. A task passes when it adds no errors and no new warnings against 39.
- **Never touch:** `swingvision-parser.ts`, `swingvision-validator.ts`, the `process-match` edge function, `calculate_match_stats`, or any applied migration. Never edit a file under `supabase/migrations/` that already exists.
- **Never rename a user-visible string to "SplitStep".** The provider is **"Advantage Intelligence"** in every user-visible string; `splitstep` is internal naming only.
- **The five vendor-required fields** (guardrails §3.1) must still reach `job-request.ts`: both player names, at least one non-zero set score, `initialTopPlayerIsPlayer1`, `fixedCamera`, `adScoring`. They are typed `boolean | null | undefined` on purpose — never narrow them to `boolean` with a default.
- **`initialTopPlayerIsPlayer1` is camera-relative at the first frame** — "is player 1 at the top of the frame". Not the deuce side, not who served first. Any UI that asks it must keep that meaning exactly.
- **Tiebreak sets send the GAME count.** A 7–6 set is `[7, 6]`, never the tiebreak points.
- **DS class layering:** `.eyebrow`, `.text-micro`, `.text-body-sm`, `.text-title-lg`, `.text-body`, `.text-display` each pin a `color` and are loaded unlayered, so they beat Tailwind utilities. Override colour with `style={{ color: "var(--…)" }}`, never `text-[var(--…)]`, on any element carrying one. `.mono` and `.tabular` are safe to combine (font-family / font-variant-numeric only).
- **`--viz-*` is charts only.** Chrome uses `--success` / `--danger`.
- **Buttons use `advButton()`** from `src/lib/ui/adv-button.ts`. Never hand-roll a near-miss, never a black primary. `rounded-full` is reserved for filter pills, tabs, avatars and indicators.
- **Worktree:** `npm ci` and `.env.local` are already in place. The main repo holds :3000, so any dev server here uses **:3101**.

---

### Task 1: Schema

**Files:**
- Create: `supabase/migrations/20260820090000_program_events.sql`
- Create: `supabase/migrations/20260820090100_program_event_entries.sql`
- Create: `supabase/migrations/20260820090200_matches_event_entry.sql`
- Create: `supabase/migrations/20260820090300_program_member_ladder.sql`

**Interfaces:**
- Consumes: existing `public.programs`, `public.program_members`, `public.matches`, and the helpers `public.user_program_ids()`, `public.is_program_staff(uuid)`.
- Produces: tables `public.program_events`, `public.program_event_entries`; column `public.matches.event_entry_id`; column `public.program_members.ladder_position`.

- [ ] **Step 1: Write `20260820090000_program_events.sql`**

Follow the house style in `20260817073930_program_members.sql`: a header comment saying what the table is and why, `create table if not exists`, named constraints added via `drop constraint if exists` + `add constraint`, then indexes, then RLS.

```sql
-- Events — a dual or a tournament a program shows up to.
--
-- An event owns the facts every one of its matches would otherwise repeat:
-- date, site, surface, and the scoring format. Storing them here rather than on
-- nine match rows means a wrong surface is one edit, not nine, and it is why
-- the upload wizard's details step can shrink to what only the video knows.
--
-- Duals and tournaments share one table because the schedule reads them as one
-- list. What differs is what hangs off them, and that lives in
-- program_event_entries.

create table if not exists public.program_events (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  kind        text not null,
  -- Opponent school for a dual, the tournament's name for a tournament.
  name        text not null,
  starts_on   date not null,
  -- Equal to starts_on for a dual. A tournament is a weekend, and the schedule
  -- prints "4–6 Sep" from these two.
  ends_on     date not null,
  site        text not null,
  surface     text,
  -- "Buckeye State" — who is running it. Tournament only.
  host        text,
  -- { best_of, ad_scoring }. Dual-wide, because a dual's lines are all played
  -- under one agreed format; the wizard reads ad_scoring back from here rather
  -- than asking a coach the same question nine times.
  format      jsonb not null default '{}'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.program_events drop constraint if exists program_events_kind_check;
alter table public.program_events add constraint program_events_kind_check
  check (kind in ('dual', 'tournament'));

alter table public.program_events drop constraint if exists program_events_site_check;
alter table public.program_events add constraint program_events_site_check
  check (site in ('home', 'away', 'neutral'));

alter table public.program_events drop constraint if exists program_events_span_check;
alter table public.program_events add constraint program_events_span_check
  check (ends_on >= starts_on);

-- The schedule's only query: this program's events, newest first.
create index if not exists program_events_program_idx
  on public.program_events (program_id, starts_on desc);

alter table public.program_events enable row level security;
grant select, insert, update, delete on public.program_events to authenticated;

-- Every member reads the schedule, players included. A lineup is a thing a
-- squad is told, not a staff secret.
drop policy if exists "Events are visible to program members" on public.program_events;
create policy "Events are visible to program members"
  on public.program_events for select
  using (program_id in (select public.user_program_ids()));

drop policy if exists "Staff create events" on public.program_events;
create policy "Staff create events"
  on public.program_events for insert
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff update events" on public.program_events;
create policy "Staff update events"
  on public.program_events for update
  using (public.is_program_staff(program_id))
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff delete events" on public.program_events;
create policy "Staff delete events"
  on public.program_events for delete
  using (public.is_program_staff(program_id));
```

- [ ] **Step 2: Write `20260820090100_program_event_entries.sql`**

```sql
-- Entries — somebody on our side, in a slot, at an event.
--
-- One table for both rails because a dual line and a tournament entry are the
-- same shape. What differs is arity: a dual line has at most one match, a
-- tournament entry has as many as the player's run is long — Q1, Q2, R32 and
-- R16 are four matches under one entry. That is why the match points here
-- (matches.event_entry_id) rather than the other way around.
--
-- An entry never stores a result. The moment anyone records how a line went —
-- a score or a video, whichever lands first — a matches row is created and the
-- score lives there and only there. Two homes for one score is two scores.

create table if not exists public.program_event_entries (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.program_events(id) on delete cascade,
  -- Denormalized from the event. Every policy below filters on it, and gating
  -- through a join to program_events would put a subquery in each one.
  program_id       uuid not null references public.programs(id) on delete cascade,
  discipline       text not null,
  -- 'S1'..'S6', 'D1'..'D3' for a dual. NULL for a tournament entry, which has a
  -- draw instead of a court.
  slot             text,
  position         integer not null default 0,
  -- Tournament: 'main', 'qualifying', 'consolation', or a flight label.
  draw             text,
  seed             integer,
  -- Roster members on our side: one for singles, two for doubles. May be empty
  -- when a coach types a name that has no account yet.
  player_user_ids  uuid[] not null default '{}',
  -- Display names, written at create and never re-derived. A lineup has to read
  -- correctly after a roster edit or a player leaving the program; joining
  -- through program_members for a historical lineup would rewrite the past.
  player_labels    text[] not null default '{}',
  opponent_labels  text[] not null default '{}',
  opponent_school  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.program_event_entries
  drop constraint if exists program_event_entries_discipline_check;
alter table public.program_event_entries
  add constraint program_event_entries_discipline_check
  check (discipline in ('singles', 'doubles'));

alter table public.program_event_entries
  drop constraint if exists program_event_entries_seed_check;
alter table public.program_event_entries
  add constraint program_event_entries_seed_check
  check (seed is null or seed > 0);

-- A dual has one S1. Partial, because tournament entries have no slot and would
-- otherwise collide on NULL in some Postgres configurations.
create unique index if not exists program_event_entries_slot_key
  on public.program_event_entries (event_id, slot)
  where slot is not null;

create index if not exists program_event_entries_event_idx
  on public.program_event_entries (event_id, discipline, position);

create index if not exists program_event_entries_program_idx
  on public.program_event_entries (program_id);

alter table public.program_event_entries enable row level security;
grant select, insert, update, delete on public.program_event_entries to authenticated;

drop policy if exists "Entries are visible to program members" on public.program_event_entries;
create policy "Entries are visible to program members"
  on public.program_event_entries for select
  using (program_id in (select public.user_program_ids()));

drop policy if exists "Staff create entries" on public.program_event_entries;
create policy "Staff create entries"
  on public.program_event_entries for insert
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff update entries" on public.program_event_entries;
create policy "Staff update entries"
  on public.program_event_entries for update
  using (public.is_program_staff(program_id))
  with check (public.is_program_staff(program_id));

drop policy if exists "Staff delete entries" on public.program_event_entries;
create policy "Staff delete entries"
  on public.program_event_entries for delete
  using (public.is_program_staff(program_id));
```

- [ ] **Step 3: Write `20260820090200_matches_event_entry.sql`**

```sql
-- Which line this match is.
--
-- NULL for every match that exists today and for every personal upload after
-- it. Non-null means the match was created from an event entry, which is the
-- only thing that makes a dual's score computable and a tournament run
-- readable.
--
-- ON DELETE SET NULL, not CASCADE: deleting a lineup must never delete an
-- athlete's analysed match. The match outlives the line it came from.

alter table public.matches
  add column if not exists event_entry_id uuid
  references public.program_event_entries(id) on delete set null;

-- Partial, matching matches_program_idx: the overwhelming majority of rows are
-- personal and NULL, and this index only ever serves "matches for entry X".
create index if not exists matches_event_entry_idx
  on public.matches (event_entry_id)
  where event_entry_id is not null;

comment on column public.matches.event_entry_id is
  'The event entry this match was created from. NULL = not from an event.';
```

`visible_match_ids()` is deliberately **not** changed: a match created from an entry already carries `program_id`, so the existing program route covers it.

- [ ] **Step 4: Write `20260820090300_program_member_ladder.sql`**

```sql
-- Ladder position — the order a lineup defaults to.
--
-- Nullable, because a program that has never set one should get roster order
-- rather than a fabricated ranking. The new-dual form reads it to seed S1..S6;
-- dragging a line reorders that dual's lineup and never writes back here, so a
-- one-off lineup change is not a ladder change.

alter table public.program_members
  add column if not exists ladder_position integer;

alter table public.program_members
  drop constraint if exists program_members_ladder_check;
alter table public.program_members
  add constraint program_members_ladder_check
  check (ladder_position is null or ladder_position > 0);

comment on column public.program_members.ladder_position is
  'Challenge-ladder rank within the program. NULL = unranked.';
```

- [ ] **Step 5: Apply the migrations**

Apply each one in order with the Supabase MCP `apply_migration` tool, using the file's basename (without `.sql`) as the migration name. Confirm with `list_tables` that `program_events` and `program_event_entries` exist and that `matches` has `event_entry_id`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "Give a program's schedule events, entries and a ladder"
```

---

### Task 2: Badge and StatusChip

**Files:**
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/status-chip.tsx`

**Interfaces:**
- Produces:
  - `Badge({ variant, children, className, style })`, `BadgeVariant = "win" | "loss" | "blue" | "neutral"`
  - `StatusChip({ tone, live, children, className })`, `StatusTone = "blue" | "neutral" | "win" | "loss"`

- [ ] **Step 1: Write `src/components/ui/badge.tsx`**

Transcribed from `_ds_bundle.js` `components/display/Badge.jsx` — inline-flex, 4px gap, 10px/500, uppercase, 2.5px tracking, `line-height: 1`, `white-space: nowrap`, and **no container**: no background, no border, no padding.

```tsx
import { cn } from "@/lib/utils";

export type BadgeVariant = "win" | "loss" | "blue" | "neutral";

const TONE: Record<BadgeVariant, string> = {
  win: "var(--success)",
  loss: "var(--danger)",
  blue: "var(--blue)",
  neutral: "var(--ink-500)",
};

/**
 * The outcome label — bare tracked uppercase text, no container.
 *
 * A transcription of `.adv-badge` from Advantage Design System v2. It is
 * deliberately not a pill: the frames set outcome against a score and a name on
 * one row, and a filled chip there reads as a button. Green is winning, red is
 * losing, and those are `--success` / `--danger` — never the `--viz-*` ramp,
 * which `colors.css` fences to charts.
 */
export function Badge({
  variant = "neutral",
  children,
  className,
  style,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium uppercase leading-none tracking-[2.5px]",
        className
      )}
      style={{ color: TONE[variant], ...style }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Write `src/components/ui/status-chip.tsx`**

`.adv-status`: inline-flex, 6px gap, 11px, `line-height: 1`, nowrap; the dot is 5×5, `border-radius: 50%`, `background: currentColor`, `flex-shrink: 0`. The `live` variant pulses 1.6s on `--ease-primary`, opacity 1 → 0.35 → 1, and is disabled under `prefers-reduced-motion`.

```tsx
import { cn } from "@/lib/utils";

export type StatusTone = "blue" | "neutral" | "win" | "loss";

const TONE: Record<StatusTone, string> = {
  blue: "var(--blue)",
  neutral: "var(--ink-500)",
  win: "var(--success)",
  loss: "var(--danger)",
};

/**
 * A dot and a word — `.adv-status` from Advantage Design System v2.
 *
 * No container, by design: this sits in a table cell beside a score, and a
 * filled pill there competes with the number. `live` pulses the dot for the
 * states where something is actually happening right now — the same
 * distinction `isWorking` draws in `lib/data/match-analysis.ts`, so a state
 * that pulses here is a state that animates there.
 */
export function StatusChip({
  tone = "neutral",
  live = false,
  children,
  className,
}: {
  tone?: StatusTone;
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-none",
        className
      )}
      style={{ color: TONE[tone] }}
    >
      <span
        className={cn(
          "size-[5px] shrink-0 rounded-full bg-current",
          live && "animate-[adv-status-pulse_1.6s_var(--ease-primary)_infinite] motion-reduce:animate-none"
        )}
      />
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Add the keyframes**

Append to `src/styles/design-system/effects.css`:

```css
/* StatusChip's live dot — see src/components/ui/status-chip.tsx. */
@keyframes adv-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/status-chip.tsx src/styles/design-system/effects.css
git commit -m "Port the design system's Badge and StatusChip"
```

---

### Task 3: Types, entry state, and the read layer

**Files:**
- Create: `src/lib/schedule/types.ts`
- Create: `src/lib/schedule/entry-state.ts`
- Create: `src/lib/data/schedule-server.ts`

**Interfaces:**
- Consumes: `resolveAnalysisStatus`, `isInFlight`, `isWorking`, `isAnalysisReady` from `@/lib/data/match-analysis`; `createClient` from `@/lib/supabase/server`.
- Produces:
  - `EventKind = "dual" | "tournament"`, `EventSite = "home" | "away" | "neutral"`
  - `ProgramEvent`, `EventEntry`, `EntryMatch`, `ScheduleRow`, `EventDetail`, `UploadQueueGroup`
  - `entryState(entry): EntryState` where `EntryState = "empty" | "no-video" | "working" | "ready" | "failed"`
  - `dualScore(entries): { us: number; them: number; decided: boolean }`
  - `getScheduleRows(programId)`, `getEventDetail(eventId)`, `getUploadQueue(programId)`

- [ ] **Step 1: Write `src/lib/schedule/types.ts`**

```ts
export type EventKind = "dual" | "tournament";
export type EventSite = "home" | "away" | "neutral";
export type Discipline = "singles" | "doubles";

export interface ProgramEvent {
  id: string;
  programId: string;
  kind: EventKind;
  name: string;
  startsOn: string;   // YYYY-MM-DD
  endsOn: string;
  site: EventSite;
  surface: string | null;
  host: string | null;
  format: { bestOf: number; adScoring: boolean | null };
}

/** A match hanging off an entry, reduced to what a schedule row needs. */
export interface EntryMatch {
  id: string;
  round: string | null;
  /** From `resolveAnalysisStatus` — the shared vocabulary, not a local one. */
  status: string;
  score: { player1: number[]; player2: number[] } | null;
  result: string | null;
  opponentLabels: string[];
  hasVideo: boolean;
}

export interface EventEntry {
  id: string;
  eventId: string;
  discipline: Discipline;
  slot: string | null;
  position: number;
  draw: string | null;
  seed: number | null;
  playerUserIds: string[];
  playerLabels: string[];
  opponentLabels: string[];
  opponentSchool: string | null;
  matches: EntryMatch[];
}

/** One row on the schedule page. */
export interface ScheduleRow {
  id: string;
  kind: EventKind;
  name: string;
  startsOn: string;
  endsOn: string;
  site: EventSite;
  entryCount: number;
  playedCount: number;
  workingCount: number;
  teamScore: { us: number; them: number } | null;
}

export interface EventDetail {
  event: ProgramEvent;
  entries: EventEntry[];
}

/** A group in the upload wizard's step 1 — one event, its videoless entries. */
export interface UploadQueueGroup {
  event: ProgramEvent;
  entries: EventEntry[];
  withVideo: number;
  total: number;
}
```

- [ ] **Step 2: Write `src/lib/schedule/entry-state.ts`**

```ts
import { isAnalysisFailed, isAnalysisReady, isWorking } from "@/lib/data/match-analysis";
import type { EventEntry } from "./types";

/**
 * What a line is waiting for — asked by the schedule row, the event table and
 * the upload queue.
 *
 * Three surfaces reading one line and disagreeing about it is the failure
 * `lib/data/match-analysis.ts` was consolidated to prevent, so this is the one
 * spelling. It defers to `isWorking` / `isAnalysisReady` rather than testing
 * status strings itself: a state that pulses here has to be a state that
 * animates on the match page.
 */
export type EntryState = "empty" | "no-video" | "working" | "ready" | "failed";

export function entryState(entry: EventEntry): EntryState {
  if (entry.matches.length === 0) return "empty";
  if (entry.matches.some((m) => isAnalysisFailed(m.status))) return "failed";
  if (entry.matches.some((m) => isWorking(m.status))) return "working";
  if (entry.matches.every((m) => !m.hasVideo)) return "no-video";
  if (entry.matches.some((m) => isAnalysisReady(m.status))) return "ready";
  return "no-video";
}

/**
 * A dual's team score, computed from the lines.
 *
 * ITA rules: six singles points, and one doubles point to whoever takes two of
 * the three doubles. Never stored — a stored team score is a number that stops
 * agreeing with the rows above it the first time a result is corrected.
 */
export function dualScore(entries: EventEntry[]): {
  us: number;
  them: number;
  decided: boolean;
} {
  const won = (entry: EventEntry) =>
    entry.matches.some((m) => m.result === "win" || m.result === "won");
  const played = (entry: EventEntry) =>
    entry.matches.some((m) => m.result != null);

  const singles = entries.filter((e) => e.discipline === "singles");
  const doubles = entries.filter((e) => e.discipline === "doubles");

  let us = singles.filter(won).length;
  let them = singles.filter((e) => played(e) && !won(e)).length;

  const doublesWon = doubles.filter(won).length;
  const doublesLost = doubles.filter((e) => played(e) && !won(e)).length;
  if (doublesWon >= 2) us += 1;
  else if (doublesLost >= 2) them += 1;

  const decided = entries.every(played);
  return { us, them, decided };
}
```

**Resolved before implementation:** `matches.result` does **not** hold win/loss. It is a context string — `transformDbMatch` reads it as `matchContext: row.result ?? "Final Score"`, and the wizard writes values like `"Unfinished"`. A win is **derived from the set scores**: count sets where `score.player1[i] > score.player2[i]` against the reverse, exactly as `transformDbMatch` does, with `player1` being our side because the wizard always writes `player1_name = playerName`.

So `dualScore` must not test `result` at all. Replace the `won`/`played` helpers above with:

```ts
/** Sets won by each side, from the game counts. `player1` is always our side. */
function setsWon(match: EntryMatch): { us: number; them: number } | null {
  const ours = match.score?.player1 ?? [];
  const theirs = match.score?.player2 ?? [];
  if (ours.length === 0 || theirs.length === 0) return null;
  let us = 0;
  let them = 0;
  for (let i = 0; i < ours.length; i++) {
    if (ours[i] > (theirs[i] ?? 0)) us++;
    else if ((theirs[i] ?? 0) > ours[i]) them++;
  }
  return { us, them };
}

export function matchWon(match: EntryMatch): boolean | null {
  const sets = setsWon(match);
  if (!sets || sets.us === sets.them) return null;
  return sets.us > sets.them;
}
```

`played(entry)` becomes "some match has a non-null `matchWon`", and `won(entry)` becomes "some match has `matchWon === true`". Export `matchWon` — Task 8's row and Task 9's run strip both need it, and deriving a win two ways is how two screens start disagreeing about one line.

- [ ] **Step 3: Write `src/lib/data/schedule-server.ts`**

Three exported readers, each `cache()`-wrapped where a layout and page both call it, following `getMatchDetailData()`'s precedent in `src/lib/data/match-detail-server.ts`.

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import type { EventDetail, ProgramEvent, ScheduleRow, UploadQueueGroup } from "@/lib/schedule/types";
```

- `getScheduleRows(programId)` — one select on `program_events` ordered `starts_on desc`, one select on `program_event_entries` for those event ids, one select on `matches` where `event_entry_id in (…)`, then `loadMatchAnalysis` over the match ids. Three round trips, not N. Assemble `ScheduleRow[]` with `dualScore` for decided duals.
- `getEventDetail(eventId)` — the same three reads scoped to one event, returning `EventDetail`.
- `getUploadQueue(programId)` — every entry in the program whose matches are all videoless, grouped by event, newest event first.

Do **not** pass `reap: true` to `loadMatchAnalysis` here. It is a write, and it belongs to the two surfaces that draw a progress bar big enough for a frozen one to mislead — the matches list and match detail. These draw dots.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule src/lib/data/schedule-server.ts
git commit -m "Read a program's schedule, its events and what has no video yet"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/lib/schedule/actions.ts`

**Interfaces:**
- Consumes: `getWorkspaceContext` from `@/lib/workspace/active-workspace-server`, `isProgramStaff` from `@/lib/workspace/types`.
- Produces:
  - `createDual(input: CreateDualInput): Promise<{ eventId: string } | { error: string }>`
  - `createTournament(input: CreateTournamentInput): Promise<{ eventId: string } | { error: string }>`
  - `upsertEntry(input: UpsertEntryInput): Promise<{ entryId: string } | { error: string }>`
  - `recordResult(input: RecordResultInput): Promise<{ matchId: string } | { error: string }>`

- [ ] **Step 1: Write the module with `"use server"` at the top**

Every action re-resolves the workspace server-side and refuses when `!isProgramStaff(active)`. A hidden control is not authorization — RLS is the real gate, and this is the readable error rather than a silent zero-row write.

`createDual` inserts the event and its 9 entries (6 singles, 3 doubles) in two writes, then `revalidatePath("/dashboard/team/schedule")`.

`recordResult` is the one that mints a match. Its shape:

```ts
export interface RecordResultInput {
  entryId: string;
  /** Tournament only — 'R16'. Null for a dual line, whose slot is the round. */
  round: string | null;
  opponentLabels: string[];
  opponentSchool?: string | null;
  won: boolean;
  /** Game counts, ours first. A 7-6 set is [7, 6] — never tiebreak points. */
  ourGames: number[];
  theirGames: number[];
  ourTiebreaks: (number | null)[];
  theirTiebreaks: (number | null)[];
}
```

It reads the entry and its event, builds the `matches` row with `program_id`, `event_entry_id`, `player1_name` = our label, `player2_name` = the opponent label, `tournament_name` = the event's name, `format.best_of` and `format.ad_scoring` from the event, `source_provider: "manual"`, `analysis_method: "manual"`, `created_by` = the caller, and returns the new match id.

Reuse `buildMatchData` from `src/components/dashboard/matches/new-match-wizard/utils.ts` if its shape fits without contorting the call; if it does not, write the row literally rather than adding parameters to a function the personal wizard depends on.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors, no new warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schedule/actions.ts
git commit -m "Create events, name their lines, and mint a match when one is played"
```

---

### Task 5: The Schedule page (25a)

**Files:**
- Modify: `src/lib/dashboard/nav.ts` — add Schedule to `TEAM_NAV`, rewrite the "No Matches entry" comment
- Create: `src/app/dashboard/team/schedule/page.tsx`
- Create: `src/components/dashboard/schedule/schedule-list.tsx`
- Create: `src/components/dashboard/schedule/new-event-menu.tsx`

**Interfaces:**
- Consumes: `getScheduleRows` (Task 3), `Badge` / `StatusChip` (Task 2).
- Produces: the route `/dashboard/team/schedule`.

- [ ] **Step 1: Add the nav entry**

In `src/lib/dashboard/nav.ts`, insert between Team Home and Roster:

```ts
{ name: "Schedule", href: "/dashboard/team/schedule", icon: Calendar },
```

Rewrite the block comment above `TEAM_NAV`. Its reasoning still holds for `/dashboard/matches` — keep it, and add that `/dashboard/team/schedule` is the workspace-scoped destination it predicted.

- [ ] **Step 2: Write the page**

Server component. `getWorkspaceContext()`, `redirect("/login")` when absent, `redirect("/dashboard")` when `active.kind !== "team"` — the same guard `src/app/dashboard/team/page.tsx` uses. Then `getScheduleRows(active.id)` into `ScheduleList`.

Page frame matches the team home page: `w-full flex-1 bg-[var(--surface-card)]` with `mx-auto max-w-screen-2xl px-6 py-8 sm:px-10`.

- [ ] **Step 3: Write `schedule-list.tsx`**

Client component — it owns the filter pill state.

- Heading "Schedule" at `font:300 30px/34px`, `letter-spacing:-.6px`, `--ink-900`; `New event` primary sm on the right.
- Three pills, `rounded-full`, `padding:5px 13px`, `font-size:11px`. Active: `--blue` on `--blue-soft`, weight 500. Inactive: `--ink-700`, `1px solid var(--border-hairline)`.
- Rows: `grid-template-columns: 92px 1fr 152px 100px`, `align-items: baseline`, `gap: 16px`, `padding: 14px 0`, hairline bottom border on all but the last.
  - date: `.mono`, 11px, `--ink-600`, `"26 Sep"` or `"4–6 Sep"` for a span
  - name: 13px `--ink-900`, with `"Dual · home"` / `"Tournament · away"` beneath in `.text-micro` `--ink-600`
  - state cell, per §5.1 of the spec
  - score: `.tabular` 15px `--ink-900`, right-aligned
- Empty state: "Nothing scheduled yet" heading with the instruction-voice subline.

- [ ] **Step 4: Write `new-event-menu.tsx`**

274px dropdown, `--surface-card`, `1px solid var(--border-medium)`, `--radius-dropdown`, `--shadow-floating`, `padding: 6px`. Rows are 9px/11px with an 11px gap, a 14px Lucide icon at `stroke-width 1.5`, and a `Kbd` on the right. Dual (`swords`, `D`), Tournament (`trophy`, `T`), hairline, Single match (`user`, `M`) with a `--ink-600` sub-label reading "Challenge, practice or an outside event".

Single match links to `/dashboard/matches/new` — the existing personal wizard. The letter keys are bound on `document` only while the menu is open, and unbound on close. Close on Escape and on outside click.

- [ ] **Step 5: Typecheck, lint, and look at it**

Run: `npx tsc --noEmit && npm run lint`

Then start the dev server on :3101 (add a second entry to `.claude/launch.json`, and revert that file before committing so it stays out of the diff), open `/dashboard/team/schedule` in a team workspace, and confirm: heading, pills, the New event menu opening and its keys working, and the empty state.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/nav.ts src/app/dashboard/team/schedule src/components/dashboard/schedule
git commit -m "Give a program a Schedule, and a way to start an event from it"
```

---

### Task 6: New dual (25b)

**Files:**
- Create: `src/app/dashboard/team/schedule/new/dual/page.tsx`
- Create: `src/components/dashboard/schedule/dual-form.tsx`
- Create: `src/components/dashboard/schedule/lineup-editor.tsx`
- Create: `src/components/dashboard/schedule/opponent-picker.tsx`

**Interfaces:**
- Consumes: `createDual` (Task 4), `/api/programs/search`.
- Produces: `LineupRow = { key: string; slot: string; ourIds: string[]; ourLabels: string[]; theirLabels: string[] }`, consumed only within this task.

- [ ] **Step 1: Write the page**

Server component: workspace guard, then read the roster (`program_roster` RPC) ordered by `ladder_position` nulls last then join order, plus program settings for the site/surface/format defaults. Pass into `DualForm`.

- [ ] **Step 2: Write `dual-form.tsx`**

Full-height flex column: a 44px breadcrumb bar (`Schedule › New dual`, `chevron-right` at 12px `--ink-300`), a scrolling body at `padding: 26px 48px 0` with `gap: 20px`, and a footer at `padding: 16px 48px 22px` with a hairline top border.

Sections per spec §5.2. The defaults row is `grid-template-columns: repeat(4, 1fr)`, `gap: 32px`, each cell a label (`.eyebrow`) over a value with `padding: 6px 0 7px` and `border-bottom: 1px solid var(--border-hairline)`, a trailing 12px chevron or calendar icon at `--ink-400`.

Footer: `Cancel` ghost md, spacer, then `Creates 9 lines, every line named — video comes later` at 11px `--ink-600` with the `9` in `.tabular`, then `Create dual` primary md.

The count is computed from the rows, not hard-coded — a coach who removes a doubles line should see 8.

- [ ] **Step 3: Write `lineup-editor.tsx`**

`grid-template-columns: 18px 36px 1.15fr 22px 1fr`, `align-items: center`, `gap: 12px`, `padding: 9px 0` per row. A header row carries the two team names, each behind a 2px×12px rail — `--player-1` for us, `--player-2` for them, with the opponent's label at `--player-2-text`.

Both columns reorder independently. HTML5 drag-and-drop (`draggable`, `onDragStart`, `onDragOver`, `onDrop`), plus a keyboard path: each grip is a `<button>` with `aria-label="Reorder {name}"`, and ArrowUp/ArrowDown on it moves the row. No drag library — the repo has none and nine rows do not earn a dependency.

Below, the bench: `Not in — drag onto a line to sub in` in `.text-micro`, then a pill per unrostered player — `--surface-subtle`, `--radius-pill`, `padding: 4px 11px`, `cursor: grab`, an 11px grip and the ladder number in `.mono .tabular` at 10px.

- [ ] **Step 4: Write `opponent-picker.tsx`**

Debounced search against `/api/programs/search`, results in a floating list, free text accepted for a non-collegiate opponent. Once picked, the school renders at `font-size:22px; font-weight:300; letter-spacing:-.4px` over a hairline, with a blue 11px/500 `Change`.

- [ ] **Step 5: Typecheck, lint, and exercise it**

Run: `npx tsc --noEmit && npm run lint`

In the browser: pick an opponent, drag S3 above S2 and confirm both columns move independently, keyboard-reorder with ArrowUp, drag a bench pill onto a line, then create — and confirm the schedule shows the new dual with `lineup set`.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/team/schedule/new/dual src/components/dashboard/schedule
git commit -m "Build a dual from the ladder, both lineups editable"
```

---

### Task 7: New tournament (25e)

**Files:**
- Create: `src/app/dashboard/team/schedule/new/tournament/page.tsx`
- Create: `src/components/dashboard/schedule/tournament-form.tsx`
- Create: `src/components/dashboard/schedule/entry-editor.tsx`

- [ ] **Step 1: Write the page and form**

Same shell as Task 6. Name at 22px/300 over a **2px `--blue`** bottom border (it is the focused field). Beneath it a facts line: span in `.mono` 12px, then site, surface, and `Hosted by {host}` at `--ink-700`, separated by `--ink-300` middots.

- [ ] **Step 2: Write `entry-editor.tsx`**

`grid-template-columns: 1fr 220px 140px`, `align-items: center`, `gap: 16px`, `padding: 12px 0`, hairline between rows. Player behind a 2px×12px `--blue` rail at 14px; draw + seed in `.text-micro` `--ink-600` (`Main draw · seed 3`); `Edit entry` blue 11px/500 right-aligned.

Two sections — `Who's going · singles` with `Add player`, and `Who's going · doubles` with `Add pair`. Under them, the explainer: *"an entry is a player in a draw — where they start, not what they'll play."* The design's link to 21c for draw moves is dropped — that surface does not exist.

Footer: `Creates {n} entries and no matches — a tournament match exists once it's played`, then `Create tournament` primary md.

- [ ] **Step 3: Typecheck, lint, browser check**

Run: `npx tsc --noEmit && npm run lint`
In the browser: add three singles entries and one pair, create, and confirm the schedule row reads `Add entries`.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/team/schedule/new/tournament src/components/dashboard/schedule
git commit -m "Build a tournament as entries, and no matches until one is played"
```

---

### Task 8: Event detail — the dual (25c, 25d)

**Files:**
- Create: `src/app/dashboard/team/schedule/[eventId]/page.tsx`
- Create: `src/app/dashboard/team/schedule/[eventId]/not-found.tsx`
- Create: `src/components/dashboard/schedule/dual-detail.tsx`
- Create: `src/components/dashboard/schedule/line-row.tsx`
- Create: `src/components/dashboard/schedule/score-entry.tsx`

**Interfaces:**
- Consumes: `getEventDetail`, `entryState`, `dualScore` (Task 3), `recordResult` (Task 4).
- Produces: `LineRow` — the shared row used by both the dual table and the tournament results table in Task 9.

- [ ] **Step 1: Write the route**

Server component: workspace guard, `getEventDetail(eventId)`, `notFound()` when it is null or belongs to another program, then dispatch on `event.kind` to `DualDetail` or `TournamentDetail`.

Empty and filled are the same renderer with different data — no second route, for the reason `src/app/dashboard/team/page.tsx` already records about its own two states.

- [ ] **Step 2: Write `dual-detail.tsx`**

Hero: eyebrow reading `Dual match · Fri 26 Sep · Home · Hard`, with `· final` replacing the surface once every entry has a result. Then `vs` at `--ink-600` and the opponent at `--ink-900`, both `font:300 30px/34px letter-spacing:-.6px`. `Badge variant="win"` / `"loss"` beside it once decided.

Right rail: the team score, `.tabular font:300 40px/40px`. **`--ink-300` at 0–0, `--ink-900` once real** — no invented progress. Beneath it, either `{n} matches · no results yet` or a `StatusChip` reading `{n} analyzing · {n} without video`.

Singles and Doubles sections, each a header row with `.eyebrow` (`Singles · 3–3` once played) and, on the singles header, an `Upload match video` link to the wizard for this event.

- [ ] **Step 3: Write `line-row.tsx`**

`grid-template-columns: 44px 52px 1fr 150px 130px`, `align-items: center`, `gap: 14px`, `padding: 11px 0`, hairline bottom. Slot in `.mono` 11px `--ink-600`; `Badge`; the matchup at 13px `--ink-900` reading `Brooks d. T. Alvarez` when won, `Reid f. J. Whitmore` when lost, `Brooks vs T. Alvarez` when unplayed; score `.tabular` 13px right-aligned; then the action cell:

| `entryState` | Cell |
|---|---|
| `empty` | `Add score` — blue 11px/500, opens the inline score row |
| `no-video` | `Add video` — links to `/dashboard/team/upload?entry={id}` |
| `working` | `<StatusChip tone="blue" live>Analyzing</StatusChip>` |
| `ready` | `Report` — links to `/dashboard/matches/{matchId}` |
| `failed` | `<StatusChip tone="loss">Analysis failed</StatusChip>` |

- [ ] **Step 4: Write `score-entry.tsx`**

The inline row `Add score` opens. Won/Lost, then set cells reusing `ScoreCell` from `src/components/dashboard/matches/new-match-wizard/ScoreCell.tsx` — 26×30, white, `1px solid #EAECF0`, 6px radius, tiebreak in the small cell. Label the ordering explicitly: `{our player}'s games first · tiebreak in the small cell`.

On submit it calls `recordResult`, which is what mints the match.

- [ ] **Step 5: Typecheck, lint, browser check**

Run: `npx tsc --noEmit && npm run lint`
In the browser: open the dual created in Task 6 — 0–0 in `--ink-300`, nine `Add score` links. Add a score to S1 and confirm the team score becomes 1–0 in `--ink-900`, S1 shows a `Won` badge and its action becomes `Add video`. Verify with `getComputedStyle` that the 0–0 really is `--ink-300` — but trust a screenshot over it after an interaction, since computed styles can read stale there.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/team/schedule/\[eventId\] src/components/dashboard/schedule
git commit -m "Show a dual as its lines, and let a score mint the match"
```

---

### Task 9: Event detail — the tournament (25f, 25g)

**Files:**
- Create: `src/components/dashboard/schedule/tournament-detail.tsx`
- Create: `src/components/dashboard/schedule/run-strip.tsx`

- [ ] **Step 1: Write `tournament-detail.tsx`**

Hero: eyebrow `Tournament · 4–6 Sep 2026` with the span in `.mono` 10px, the name at 30px/300, and the facts line. Right rail 220px: `Add result` primary sm over `{n} entries · no results yet` — or, once played, `{n} results · {n} analyzing · {n} without video`.

**Empty state** carries the info panel from 25f: `--surface-subtle`, `--radius-element`, `padding: 11px 14px`, a 13px `info` icon at `--ink-600`, and the text *"Rounds appear as you add results. Nothing to enter until the first match is played — if a player's draw changes, edit the entry rather than starting a second one."*

**Populated**, per entry: a 2px `--blue` rail, the player at 16px, their draw note (`entered qualifying`, `main draw · seed 3`), the `RunStrip`, W–L in `.tabular` 14px in a 44px right-aligned column, and how they went out in `.text-micro` in a 96px column. Under each entry, results grouped by draw segment with an `.eyebrow` per segment (`Qualifying`, `Main draw`), rows at `grid-template-columns: 44px 52px 1fr 168px 110px`.

Segments render **only when a player changed draws** — an entry that never left the main draw gets no segment headings at all, exactly as 25g draws Dana Brooks.

- [ ] **Step 2: Write `run-strip.tsx`**

One 2px×12px tick per match in order, `gap: 6px`, `--success` for a win and `--danger` for a loss. 25g uses `--viz-good` / `--viz-bad`; those are fenced to charts by `colors.css`, so this is the corrected version.

- [ ] **Step 3: Typecheck, lint, browser check**

Run: `npx tsc --noEmit && npm run lint`
In the browser: open the tournament from Task 7 — entries, no rounds, the info panel. Add a first result and confirm a run strip appears with one tick and the entry's W–L reads 1–0.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/schedule
git commit -m "Read a tournament weekend as each player's run"
```

---

### Task 10: Extract the submit pipeline

**Files:**
- Create: `src/lib/services/splitstep/submit-match-video.ts`
- Modify: `src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts` (the block from the `processing_jobs` insert through auto-submit, currently around lines 911–1230)

**Interfaces:**
- Produces:

```ts
export interface SubmitMatchVideoInput {
  supabase: SupabaseClient;
  matchId: string;
  file: File;
  startSeconds: number;
  endSeconds: number;
  onProgress?: (percent: number) => void;
}

export interface SubmitMatchVideoResult {
  jobId: string;
  submitted: boolean;
}

export async function submitMatchVideo(
  input: SubmitMatchVideoInput
): Promise<SubmitMatchVideoResult>;
```

- [ ] **Step 1: Read the existing sequence end to end**

Read `useUploadMatchWizard.ts` from the `processing_jobs` insert to the end of auto-submit, and re-read guardrails §3.1 before touching a line. This is a **move**, not a rewrite: behaviour must be byte-for-byte equivalent.

- [ ] **Step 2: Move it into the service**

The three invariants travel with the code and get asserted in comments at their new home:
- the `processing_jobs` insert must `.select("id").single()`, and every later write keys on that id — keying on `match_id` touches every job a resubmitted match ever had;
- upload progress throttles to 0.1% steps, never per chunk;
- a submit failure must **not** mark the job failed — the bytes are in Azure and `uploaded` is the one state a retry needs nothing re-uploaded from.

- [ ] **Step 3: Replace the wizard's copy with a call**

The personal wizard's behaviour must not change at all — same rollback on job-insert failure, same `match-upload-failed` event, same progress writes.

- [ ] **Step 4: Typecheck, lint, and regression-check the personal wizard**

Run: `npx tsc --noEmit && npm run lint`

In the browser, run the **personal** wizard end to end with a small video: provider → video + trim → details → confirm → create. Confirm a `processing_jobs` row appears with a real `id`, progress advances, and the row reaches `uploaded`. This is the regression that matters — the team wizard in Task 11 is new code, but this path is shipped and working.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/splitstep/submit-match-video.ts src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts
git commit -m "Move the video submit pipeline where two wizards can share it"
```

---

### Task 11: Team upload wizard — steps 1 and 2

**Files:**
- Create: `src/app/dashboard/team/upload/page.tsx`
- Create: `src/components/dashboard/schedule/upload/team-upload-flow.tsx`
- Create: `src/components/dashboard/schedule/upload/match-queue-step.tsx`
- Create: `src/components/dashboard/schedule/upload/files-step.tsx`
- Create: `src/components/dashboard/schedule/upload/types.ts`

**Interfaces:**
- Consumes: `getUploadQueue` (Task 3), `VideoProbe` from `@/lib/video/probe`, `SwingVisionValidator` from `src/lib/services/upload/`.
- Produces: `TeamUploadDraft = { entries: SelectedEntry[]; files: Record<string, AttachedFile>; fixedCamera: boolean | null }`, `AttachedFile = { kind: "video" | "import"; file: File; probe?: VideoProbe; startSeconds?: number; endSeconds?: number }`.

- [ ] **Step 1: Write the route**

Reads `?entry=` and `?event=`. Workspace guard, `getUploadQueue(active.id)`, then `TeamUploadFlow` with `pinnedEntryId`.

- [ ] **Step 2: Write the flow shell**

44px breadcrumb bar (`Schedule › Upload video`, or `{event name} › Upload video` when pinned) with the viewer's initials in a 26px `--radius-pill` `--surface-subtle` mark on the right. Under it a **4-segment 2px progress bar**: `display:flex; gap:3px; height:2px`, each segment `flex:1`, `--blue` when reached and `--ink-100` when not. Body is a **780px centred column** inside `padding: 26px 56px 0`. Footer is 64px with a hairline top border and the same 780px column.

When `pinnedEntryId` is set the flow starts on step 2 with **two** segments already blue, and the pinned destination renders as an editable chip — `--surface-subtle`, `--radius-element`, a `corner-down-right` icon, the entry's description, and a blue `Change`. Editable, not locked.

- [ ] **Step 3: Write `match-queue-step.tsx` (22a)**

Title `Which matches did you film?` in `.text-title-lg`, subtitle *"The lineup and your results already created these. Tick what you're uploading — one match per video."*

A search field over match, player and event. Then one block per event: an `.eyebrow` header (`at Dayton · dual · Sat 9 Aug`) with `{n} of {n} have video` right-aligned in `.text-micro .tabular`, and rows at `grid-template-columns: 18px 40px 1fr 150px 96px`. A ticked row takes `--blue-soft` and `--radius-cell`; its checkbox is Lucide `check-square` at `--blue`, unticked is `square` at `--ink-300`.

Below every block, the single-match escape row — a `user` icon, `Not from an event — single match` with a `--ink-600` sub-label, and a trailing chevron — linking to `/dashboard/matches/new`.

Footer: `{n} matches ticked · one video each`, then `Continue` primary md.

- [ ] **Step 4: Write `files-step.tsx` (22c)**

Title `Add the videos`, subtitle naming the count and *"Drop a file for each — order doesn't matter, the address does."*

One card per ticked entry: `1px solid var(--border-hairline)`, 10px radius, `padding: 14px 16px`. Each card holds the filename at 13px/500, a metadata line in `.tabular` 11px `--ink-500` (`1920×1080 · 30 fps · 1h 22m · 2.9 GB`), and a **file-to-line select** — a bordered-bottom row with an `arrow-right` icon, the slot in `.mono`, the matchup, and a chevron.

A card accepts **either**:
- a **video** — probed, then the trim rail (reuse the rail from `VideoStepContent.tsx`; extract it into a shared component only if it comes out cleanly, otherwise mirror its markup rather than refactoring a guardrail-flagged file mid-plan);
- a **SwingVision `.xlsx`** — run through the existing `SwingVisionValidator`, no trim rail, no video answers.

Only one card expands its trim rail at a time; the others collapse to a summary with a blue `Trim` link.

Footer readout: a 16px ring progress SVG rotated −90°, the selected total in `.mono .tabular`, and `across {n} videos · {duration} of the team pool left after`. The readout is live — an untrimmed file counts in full until someone trims it, so the pool number is never a surprise at Create.

- [ ] **Step 5: Typecheck, lint, browser check**

Run: `npx tsc --noEmit && npm run lint`
In the browser: reach the wizard from a line's `Add video` and confirm it opens on step 2 with two segments blue and the chip pinned; reach it unpinned and confirm the queue lists the dual's videoless lines grouped under the event.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/team/upload src/components/dashboard/schedule/upload
git commit -m "Ask which matches were filmed, then address a file to each"
```

---

### Task 12: Team upload wizard — steps 3 and 4

**Files:**
- Create: `src/components/dashboard/schedule/upload/details-step.tsx`
- Create: `src/components/dashboard/schedule/upload/confirm-step.tsx`
- Modify: `src/components/dashboard/schedule/upload/team-upload-flow.tsx` — wire create

- [ ] **Step 1: Write `details-step.tsx` (22d)**

Title `What the lineup can't know`, subtitle *"Everything else came from the event. Wrong facts are edited there, not re-typed here."*

Then, in order:

1. **Camera, once per batch** — a `--surface-subtle` row with a `check-square` icon reading `Same camera for all {n} — fixed position, back of court` and a blue `Change`. This sets `fixedCamera` for every video in the batch, because a dual is filmed from one setup.
2. **One card per video** — slot, matchup, score, and `entered courtside` when the score already exists. A `.text-micro .tabular` facts line: `Sat 9 Aug · away · outdoor hard · best of 3, ad · window 0:06:40 – 1:10:52`.
3. **`{player} starts`** per card — a two-option radio row, `Top of frame` / `Bottom`, Lucide `check-circle` at `--blue` when chosen and `circle` at `--ink-300` when not.
4. **Score, only when missing** — the card gains a `--shadow-card` lift, an explanation (`Score wasn't entered courtside — the report needs it`), Won/Lost, and `ScoreCell` set inputs.

`{player} starts — Top of frame` **is** `initialTopPlayerIsPlayer1`. It is camera-relative at the first frame — is our player at the top of the frame, the far side from the camera. Not the deuce side, not who served first. Keep that meaning exactly; re-read the header comment in `src/lib/services/splitstep/job-request.ts` before writing this step.

- [ ] **Step 2: Write `confirm-step.tsx` (22e)**

One event header — `at Dayton — 3 match videos` at 22px/400 `letter-spacing:-0.5px`, then a facts row of icon+label pairs at 10px `#888888`: calendar, `swords`, the tennis-court icon, and `video` reading `Fixed camera · back of court`.

Then the readback table, `grid-template-columns: 40px 1fr 130px 170px 90px`: slot, matchup with the starting-end note beneath, score, analysed window in `.mono .tabular`, size. Above it, two tracked 10px `#AAAAAA` labels — `Fills 3 of the dual's 9 lines · 9 of 9 after this` on the left and the total duration on the right. That receipt is what proves no duplicate is being minted.

`After create` paragraph, then the source line listing filenames and total bytes.

Footer: `Back` ghost, `Creates in {program} · counts against the team pool`, the pool ring, and `Create {n} matches` primary md. **No ETA anywhere** — jobs queue and the state is shown, never predicted.

- [ ] **Step 3: Wire create**

Per ticked entry, in order:
1. `recordResult` if the entry has no match yet, or reuse the existing match id;
2. for a video: `submitMatchVideo({ supabase, matchId, file, startSeconds, endSeconds, onProgress })` from Task 10, having first written `fixed_camera` and `initial_top_player_is_player1` onto the match row;
3. for an `.xlsx`: the existing `/api/upload` path, untouched.

Failures are per-entry. One video failing must not abandon the others, and the error names the line it belongs to.

- [ ] **Step 4: Typecheck, lint, browser check**

Run: `npx tsc --noEmit && npm run lint`

End to end with one small video: tick a line, attach and trim, answer the camera and starting-end questions, confirm, create. Then check the job actually queued:

```sql
select status, derivation_version, external_job_id, results_object_key, trimmed_object_key
from processing_jobs order by created_at desc limit 3;
```

And confirm the dual's line now shows `Analyzing`.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/schedule/upload
git commit -m "Ask only what the lineup cannot know, then queue the batch"
```

---

### Task 13: Full verification

- [ ] **Step 1: Typecheck, lint, build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: 0 type errors, 43 pre-existing lint warnings and 0 errors, a clean build.

- [ ] **Step 2: Confirm `.claude/launch.json` is unmodified**

Run: `git status --short .claude/launch.json`
Expected: no output. The :3101 entry was for local preview only.

- [ ] **Step 3: Walk the whole flow once**

Create a dual → 9 lines, 0–0 in `--ink-300`, no matches. Score S1 → one match, team score 1–0. `Add video` from S2 → wizard pinned, starts on step 2. Create → S2 reads `Analyzing`. Create a tournament → entries, no rounds, the info panel. Add a first result → a run strip with one tick.

- [ ] **Step 4: Check the personal wizard still works**

`/dashboard/matches/new` end to end. Task 10 moved code it depends on; this is the last chance to catch a regression.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Fix what the full-flow pass turned up"
```

---

## Self-review

**Spec coverage.** §4.1–4.5 → Task 1. §5 routes → Tasks 5–9, 11–12. §5.1 → Task 5. §5.2 → Task 6. §5.3 → Task 7. §5.4 dual → Task 8, tournament → Task 9. §5.5 → Tasks 11–12. §6 → Task 10. §7 → Task 2. §8 → Tasks 3–4. §9 corrections → Task 1 Step 1 (9 lines), Task 6 Step 2 (footer copy), Task 6 (ladder link dropped), Task 9 Step 2 (`--success`/`--danger`), Task 11 (no sidebar Upload item). §10 out-of-scope items appear in no task, correctly. §11 → Task 13.

**Type consistency.** `entryState` returns the five states used verbatim in Task 8's action-cell table. `EventEntry.matches: EntryMatch[]` is what `entryState` and `dualScore` both walk. `submitMatchVideo`'s signature in Task 10 matches its call in Task 12 Step 3.

**Resolved soft spot.** Task 3 Step 2 originally guessed that `matches.result` held win/loss. It does not — it is a context string (`"Final Score"`, `"Unfinished"`), and a win is derived from set counts. The task now carries `matchWon()` and the correction. Had this shipped as written, every dual's team score would have read 0–0 forever with nothing on screen looking broken.
