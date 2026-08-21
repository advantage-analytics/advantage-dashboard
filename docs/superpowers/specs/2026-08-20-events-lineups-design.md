# Events & Lineups — design

**Date:** 2026-08-20
**Source:** Claude Design project `afde9116-328b-445c-aeff-8b3c2a702d6f`, `Events & Lineups.dc.html`,
round 25 (frames 25a–25j) for the pages and round 22 (22a–22f) for the upload wizard it hands off to.
**Goal:** a team workspace can create an event and put a match video — or a SwingVision import — against
each of its lines.

---

## 1. What exists today

- `matches` carries `program_id` (nullable; NULL = personal workspace) and free-text `tournament_name`.
  There is no event, lineup, or entry anywhere in the schema.
- `TEAM_NAV` in `src/lib/dashboard/nav.ts` has Team Home, Roster, Compare — **no** matches/schedule
  destination, with a comment explaining why (`/dashboard/matches` filters on `created_by`).
- `/dashboard/team/roster` and `/dashboard/team/compare` are `ComingSoonPage` stubs.
- The personal upload wizard lives at `/dashboard/matches/new`
  (`src/components/dashboard/matches/new-match-wizard/`), 6,471 lines across 14 files. Its step order
  branches on provider kind: `import` → provider/match/confirm, `processing` → provider/video/match/confirm.
- RLS helpers `user_program_ids()`, `user_program_role(uuid)`, `is_program_staff(uuid)` and the
  set-returning `visible_match_ids()` already exist and are the house pattern.
- `docs/ui-revamp-guardrails.md` §3.1 lists five vendor-required fields and three invariants inside
  `useUploadMatchWizard.ts`. They are binding on everything below.

## 2. Scope

**In:** the schedule page, the dual rail, the tournament rail, and the team upload wizard.

**Out:** the single-match rail (25h–25j). It is the escape hatch for challenge/practice/outside matches,
not an event, and the goal names events. The schedule's New-event menu still renders its row, pointing at
the existing personal wizard, so the menu is not a lie.

**Also out:** the Roster page. `ladder_position` arrives as a column with no editor; the dual form is its
only writer for now (see §5.3).

## 3. Decisions taken before design

Four questions were settled up front. They are recorded here because each one changes what gets built:

1. **Scope** — dual + tournament + upload wizard; single rail deferred.
2. **Data layer** — real tables with RLS migrations, applied.
3. **Ladder** — one `program_members.ladder_position` column; no Roster editor this pass.
4. **When a match exists** — creating a dual writes 9 *lines*, not 9 `matches` rows. See §4.3.

## 4. Data model

### 4.1 `program_events`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `program_id` | uuid not null | → `programs(id)` on delete cascade |
| `kind` | text not null | check in (`dual`, `tournament`) |
| `name` | text not null | opponent school for a dual, tournament name for a tournament |
| `starts_on` | date not null | |
| `ends_on` | date not null | equals `starts_on` for a dual; check `ends_on >= starts_on` |
| `site` | text not null | check in (`home`, `away`, `neutral`) |
| `surface` | text | free text, program default |
| `host` | text | "Buckeye State" — tournament only |
| `format` | jsonb not null default `'{}'` | `{ best_of, ad_scoring }`; dual-wide scoring rules |
| `created_by` | uuid | → `users(id)` on delete set null |
| `created_at` / `updated_at` | timestamptz not null default now() | |

Index on `(program_id, starts_on desc)` — the schedule's only query.

### 4.2 `program_event_entries`

One table serves both rails, because a dual line and a tournament entry are the same shape: someone, on
our side, in a slot at an event.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `event_id` | uuid not null | → `program_events(id)` on delete cascade |
| `program_id` | uuid not null | → `programs(id)` on delete cascade. **Denormalized on purpose** — every RLS predicate filters on it, and gating through a join to `program_events` would put a subquery in the policy. Set from the event by the server action; a check trigger is not worth it for a staff-only write path. |
| `discipline` | text not null | check in (`singles`, `doubles`) |
| `slot` | text | `S1`…`S6`, `D1`…`D3` for a dual; NULL for a tournament entry |
| `position` | int not null | sort order within its discipline |
| `draw` | text | tournament: `main`, `qualifying`, `consolation`, or a flight label |
| `seed` | int | tournament |
| `player_user_ids` | uuid[] not null default `'{}'` | roster members on our side — 1 for singles, 2 for doubles |
| `player_labels` | text[] not null default `'{}'` | display names, written at create. A lineup must still read correctly after a roster edit or a player leaving the program, and joining through `program_members` for a historical lineup would rewrite the past. |
| `opponent_labels` | text[] not null default `'{}'` | `["T. Alvarez"]`, `["Alvarez", "Patel"]` |
| `opponent_school` | text | tournament: "Ohio Valley State" |
| `created_at` / `updated_at` | timestamptz | |

Unique index on `(event_id, slot)` where `slot is not null` — a dual has one S1.
Index on `(event_id, discipline, position)`.

### 4.3 `matches.event_entry_id`

```sql
alter table public.matches
  add column if not exists event_entry_id uuid
  references public.program_event_entries(id) on delete set null;
```

Partial index where not null, matching the `matches_program_idx` precedent.

**This column is the rule that makes both rails consistent:** an entry becomes a match the first moment
anyone records how it went — a score or a video, whichever lands first. Before that the entry is a line
with a name on it and nothing else.

- A dual line has **0 or 1** matches.
- A tournament entry has **0..n** — Q1, Q2, R32 and R16 are four matches under one entry, which is exactly
  what 25g draws as a "run".

The score lives in `matches.score` and nowhere else. An entry never stores a result, so the two can never
drift.

The design's 25b footer says *"Creates 9 matches, every line named"*. Taken literally that drops nine
scoreless rows into `/dashboard/matches` (scoped by `created_by`, so the coach's own list) and into
Statistics. It also contradicts the tournament rail's own rule, printed in 25e: *"Creates 5 entries and no
matches — a tournament match exists once it's played."* The copy is corrected to **"Creates 9 lines"**.

### 4.4 `program_members.ladder_position`

Nullable int. Staff-writable, player-readable. The dual form's default S1–S6 order.

### 4.5 RLS

Both new tables: `enable row level security`, `grant select` to `authenticated`.

- **select** — `program_id in (select public.user_program_ids())`. Every member of the program can read the
  schedule, including players. A lineup is a thing a squad is told, not a staff secret.
- **insert / update / delete** — `public.is_program_staff(program_id)`. Players never write an event.

`visible_match_ids()` is **not** touched. A match created from an entry already carries `program_id`, so
the existing program route covers it.

## 5. Routes and screens

All under `/dashboard/team/`, and all of them redirect to `/dashboard` when
`workspace.active.kind !== "team"` — the same guard `/dashboard/team/page.tsx` already uses.

| Route | Frame | What it is |
|---|---|---|
| `/dashboard/team/schedule` | 25a | The event list |
| `/dashboard/team/schedule/new/dual` | 25b | New dual |
| `/dashboard/team/schedule/new/tournament` | 25e | New tournament |
| `/dashboard/team/schedule/[eventId]` | 25c/25d, 25f/25g | Event detail |
| `/dashboard/team/upload` | 22a–22f | Team upload wizard |

`Schedule` joins `TEAM_NAV` between Team Home and Roster, with the `Calendar` icon `PERSONAL_NAV` already
uses for Matches. The comment in `nav.ts` explaining the absent Matches entry gets rewritten rather than
deleted — the reason it gave (a page that assumes a personal workspace) is still true of
`/dashboard/matches`, and `/dashboard/team/schedule` is the workspace-scoped answer it predicted.

### 5.1 Schedule — 25a

Header "Schedule" at 30px/300, a primary `New event` button, and three filter pills (All / Duals /
Tournaments) as `rounded-full` — pills are one of the four places `rounded-full` is allowed.

Rows are a 4-column grid `92px 1fr 152px 100px`: date (mono), name + kind·site, state, score. State is
computed, never stored:

| Condition | Cell |
|---|---|
| dual, no entry has a match | `lineup set` |
| tournament, no entry has a match | `Add entries` in blue |
| any match in flight | blue dot + "*n* analyzing" |
| all played | team score, tabular, right-aligned |

`New event` opens a 274px dropdown with Dual match (`D`), Tournament (`T`), a hairline, then Single match
(`M`) with its own sub-label. `Kbd` is already ported at `src/components/ui/kbd.tsx`. The keys are real
shortcuts, bound only while the menu is open.

Empty state: the same instruction-not-greeting voice `/dashboard/team/page.tsx` uses.

### 5.2 New dual — 25b

Full page, 44px breadcrumb bar, scrolling body, sticky 16px/48px footer.

1. **Opponent** — search over `programs` (the directory already backs `/api/programs/search`), falling back
   to free text for a non-collegiate opponent. Selected school renders at 22px/300 with a blue `Change`.
2. **Defaults row** — a 4-column grid: Date, Site, Surface, Format, each an underlined cell with a
   hairline bottom border. Seeded from program settings; every one editable before create.
3. **Lineup** — a 5-column grid `18px 36px 1.15fr 22px 1fr`: grip, slot, our player, "vs", their player.
   Six singles then three doubles. Both columns reorder independently by drag. Our names come from
   `program_members` ordered by `ladder_position`; theirs are typed in place.
4. **Bench** — roster members below the cut as draggable pills, each with its ladder number.

Footer: `Cancel` ghost, then "Creates *9* lines, every line named — video comes later", then
`Create dual` primary.

**Drag** uses HTML5 drag-and-drop with a keyboard fallback (↑/↓ on a focused row moves it). No dnd
library — the repo has none, and one list of nine rows does not earn a dependency.

### 5.3 New tournament — 25e

Name at 22px/300 over a 2px blue underline, then a facts line (span · site · surface · host). Entries are
a 3-column grid `1fr 220px 140px`: player with a 2px blue rail, draw + seed, `Edit entry`. Singles and
doubles sections, each with its own add control.

Footer: "Creates *n* entries and no matches — a tournament match exists once it's played", `Create
tournament`.

### 5.4 Event detail — 25c/25d, 25f/25g

One route, one server component, two renderers chosen by `event.kind`. Empty and filled are the same
renderer with different data — the transition between them is the thing being designed, exactly the
reasoning `/dashboard/team/page.tsx` already records for its own two states.

**Dual.** Hero: eyebrow (`Dual match · Fri 26 Sep · Home · Hard`, with `· final` appended once every line
has a match), "vs {opponent}" at 30px/300, `Won`/`Lost` badge when decided. Right rail: team score at
40px/300 tabular — `--ink-300` at 0–0, `--ink-900` once real — over a status line.

Then Singles and Doubles tables, `44px 52px 1fr 150px 130px`: slot, badge, "A d. B" / "A f. B", score,
action. The action cell is the state machine:

| Entry state | Cell |
|---|---|
| no match | `Add score` (blue) |
| match, no video | `Add video` → upload wizard pinned to this entry |
| match, video in flight | `StatusChip` — blue dot + "Analyzing" |
| match, analysis ready | `Report` → `/dashboard/matches/[matchId]` |

Team score is computed from the lines, never stored: singles points plus one doubles point, ITA rules —
whoever takes 2 of 3 doubles takes the point.

**Tournament.** Hero, then one block per entry: a 2px blue rail, the player, their draw note, a win/loss
tick strip, W–L, and how they went out. Under each, results grouped by draw segment (Qualifying, Main
draw), each row `44px 52px 1fr 168px 110px` with the same action state machine.

The tick strip uses `--success` / `--danger`. 25g draws it with `--viz-good` / `--viz-bad`, but
`colors.css` fences the whole `--viz-*` ramp to "charts ONLY — never chrome". Corrected.

### 5.5 Team upload wizard — 22a–22f

Route `/dashboard/team/upload`, optionally `?entry=<uuid>`. Four steps, a 4-segment 2px progress bar, a
780px centred column, a 64px footer.

**Step 1 — matches (22a).** Every entry in the program with no video, grouped by event, newest first.
Tick several; ticks cross events. A search field filters by match, player or event. Below the groups, the
single-match escape row links to the existing personal wizard. **Skipped entirely** when `?entry=` is
present (22f): the wizard opens on step 2 with the destination pinned as an editable chip, and the
progress bar starts two segments in.

**Step 2 — files (22c).** One card per ticked entry. Each card takes **either**:

- a **video** — probe, trim rail, quota against the team pool; or
- a **SwingVision `.xlsx`** — validated and parsed by the untouched
  `SwingVisionValidator`/`SwingVisionParser`, no trim, no video answers.

A file-to-line select on every card so a mixed-up drop is a two-click fix. Live footer readout: total
selected duration and what is left of the team pool after.

> 22b says a SwingVision export imports "from the match row instead — numbers only, different job",
> i.e. outside this wizard. The goal asks for video *and* import file per line in one flow, so the goal
> wins and both live here. The import path still runs the existing `/api/upload` → `process-match`
> pipeline untouched, per guardrails §2.

**Step 3 — details (22d).** Only what the event cannot know:

- `fixedCamera` — **once per batch**, as a single row above the cards. A dual is filmed from one setup.
- `initialTopPlayerIsPlayer1` — **per video**, because ends are decided at the toss. Asked as
  "{player} starts — Top of frame / Bottom", which is the camera-relative meaning guardrails §4 requires.
- Score — only for an entry whose match does not have one. Same set cells as the personal wizard
  (`ScoreCell`), tiebreak in the small cell, **game count** in the main cells.

`adScoring` comes from `event.format.ad_scoring`; both player names come from the entry. That is all five
vendor-required fields accounted for.

**Step 4 — confirm (22e).** Per-video readback under one event header: line, players, score, analysed
window, size. A receipt line — "Fills 3 of the dual's 9 lines · 9 of 9 after this" — and the after-create
paragraph. Footer: "Creates in {program} · counts against the team pool" and `Create n matches`. No ETA
anywhere.

**On create**, per ticked entry, in order:
1. insert the `matches` row with `program_id`, `event_entry_id`, players, score, format;
2. for a video, call the extracted submit service (§6);
3. for an `.xlsx`, upload to the `match-data` bucket and let `process-match` run.

## 6. The submit-pipeline extraction

`useUploadMatchWizard.ts` currently owns, inline, the sequence: insert `processing_jobs` → mint an Azure
write SAS → chunked upload with throttled progress → terminal `uploaded` write → auto-submit. The team
wizard needs the identical sequence, once per video.

Move it to `src/lib/services/splitstep/submit-match-video.ts`:

```ts
submitMatchVideo({ supabase, matchId, file, startSeconds, endSeconds, onProgress })
```

Both wizards call it. This is a **move, not a rewrite** — the three invariants in guardrails §3.1 travel
with the code and end up asserted in one place instead of two copies:

- the `processing_jobs` insert must `.select("id").single()`, and every later write keys on that id;
- progress writes throttle to 0.1% steps;
- a submit failure must **not** mark the job failed — the bytes are in Azure and `uploaded` is the state a
  retry needs nothing re-uploaded from.

The personal wizard keeps its behaviour exactly; its call site becomes one function call.

## 7. Components

Two DS components the frames use everywhere and the repo does not have. Both go in `src/components/ui/`
transcribed from `_ds_bundle.js`, not approximated:

- **`Badge`** — `.adv-badge`: inline-flex, 10px/500, uppercase, 2.5px tracking, **no container**.
  `win` → `--success`, `loss` → `--danger`, `blue` → `--blue`, `neutral` → `--ink-500`.
- **`StatusChip`** — `.adv-status`: 5px dot + 11px label, no container. Tones blue/neutral/win/loss; the
  `live` variant pulses the dot 1.6s and is disabled under `prefers-reduced-motion`.

Reused as-is: `ScoreCell`, `FieldCell`, `Kbd`, `advButton()`.

**DS class layering:** the DS type classes (`.eyebrow`, `.text-micro`, `.text-body-sm`, `.mono`,
`.tabular`) are unlayered and beat Tailwind utilities on colour. Any colour override on an element
carrying one goes in `style={{ color: ... }}`, never a `text-[var(--…)]` utility.

## 8. Data layer

Server-side, following the `*-server.ts` convention:

- `src/lib/schedule/types.ts` — `ProgramEvent`, `EventEntry`, `EntryState`, `ScheduleRow`.
- `src/lib/data/schedule-server.ts` — `getScheduleRows(programId)`, `getEventDetail(eventId)`,
  `getUploadQueue(programId)`. Wrapped in React `cache()` where a layout and a page both read them,
  matching `getMatchDetailData()`.
- `src/lib/schedule/actions.ts` — `"use server"`: `createDual`, `createTournament`, `addEntry`,
  `updateEntry`, `recordScore`. Each re-checks staff standing server-side; a hidden control is not
  authorization.
- `src/lib/schedule/entry-state.ts` — the single `entryState(entry, match)` predicate the schedule row,
  the event table and the upload queue all ask. Three surfaces disagreeing about one line is the failure
  `match-analysis.ts` was consolidated to prevent; this is the same shape of problem.

Entry state is derived from the existing `resolveAnalysisStatus` for anything with a match, so "Analyzing"
here and "Analyzing" on the match page always mean the same thing.

## 9. Design-copy corrections

Per the standing rule — implement layout literally, but do not ship copy that contradicts the product:

1. **25b, "Creates 9 matches"** → "Creates 9 lines". §4.3.
2. **25b, "Ladder lives in Roster"** — the link is dropped. Roster is a `ComingSoonPage`; a link to a stub
   that claims to hold the ladder is worse than no link.
3. **25g, `--viz-good` / `--viz-bad` on the win/loss ticks** → `--success` / `--danger`. `colors.css`
   fences `--viz-*` to charts.
4. **22a's sidebar "Upload" entry** — there is no Upload item in `TEAM_NAV` and this pass does not add one.
   The unpinned queue is reached from the event header's remaining count and from Team Home.

## 10. Out of scope, deliberately

- The single-match rail (25h–25j).
- A Roster ladder editor.
- Courtside score entry as a distinct surface — "Enter scores courtside" and "Add score" both open the
  same inline score row on the event page.
- Draw moves and consolation handling beyond storing `draw` on the entry (25e defers this to 21c).
- Playback of the trimmed video. Guardrails §5 lists it as unbuilt.

## 11. Verification

```bash
npx tsc --noEmit && npm run lint && npm run build
```

The worktree needs its own `npm ci` and a copied `.env.local` before `npm run build` resolves, and its own
dev port — the main repo holds :3000.

Manual, in a team workspace: create a dual → 9 lines, 0–0, no matches; add a score to S1 → one match
appears, team score reads 1–0; open the upload wizard from S2's row → pinned, starts on step 2; upload a
video → job queued, S2 shows Analyzing; create a tournament → entries, no matches; add a first result →
one match under that entry, the run strip appears.
