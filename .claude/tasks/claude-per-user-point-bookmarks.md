# Tasks — claude/per-user-point-bookmarks

> Scope: make a saved point per-viewer — a `point_bookmarks` table with its own RLS, the points loader reading the viewer's own rows, and the film tab writing them instead of `points.saved`

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Create point_bookmarks table, RLS and backfill, proven by a live spec

- **status:** done
- **model:** fable
- **files:** `supabase/migrations/<timestamp>_point_bookmarks.sql` (new), `tests/point-bookmarks-db.spec.ts` (new, modelled on `tests/match-video-attachments-db.spec.ts` and `tests/fixtures/live-db.ts`) — guesses
- **done when:**
  - [ ] The diff carries one committed migration under `supabase/migrations/` that creates `public.point_bookmarks (user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, point_id uuid not null references public.points(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, point_id))`, enables RLS, and defines exactly three policies for `authenticated`: SELECT, INSERT (with check) and DELETE, each requiring `user_id = auth.uid()` AND the point's `match_id` to be in `visible_match_ids()`. No UPDATE policy and no grant to `anon`.
  - [ ] The same migration backfills `insert into point_bookmarks (user_id, point_id) select m.created_by, p.id from points p join matches m on m.id = p.match_id where p.saved and m.created_by is not null on conflict do nothing`, and does NOT drop or alter `points.saved` (it stays `boolean not null`, legacy, per the intent).
  - [ ] The migration has been applied to the live DB via `mcp__supabase__apply_migration`, and the proof is in the diff: `tests/point-bookmarks-db.spec.ts` (skipping with `SKIP_REASON` when `HAVE_ENV` is false, using `runMarker`/`createLogins`/`deleteAuthUsers`, and creating its own marked match + point rows through the service-role client) passes against the live DB and asserts: the anon client is refused SELECT/INSERT/DELETE; the match creator can insert, read back, and delete their own bookmark; a second user who can see the match (a `program_members` member of the match's program, or whatever `visible_match_ids()` honours — verify the function body in the live DB before choosing) bookmarks the same point independently and neither user sees the other's row; a user who cannot see the match gets zero rows or `42501` on insert; an insert that names another user's `user_id` is refused.
  - [ ] The spec also asserts the backfill contract on its own fixture rows: after the migration runs, a fixture point with `saved = true` owned by the fixture creator has a matching `point_bookmarks` row — i.e. the spec re-runs the backfill statement text (exported from the spec or duplicated verbatim) against the marked rows and finds the row, so a reviewer can read the invariant from the diff.
  - [ ] The migration file is not hand-formatted (`.prettierignore` excludes `supabase/migrations/`; `npm run format:check` and `npm run typecheck` pass), and `npm run map` is a no-op.
- **notes:** Live DB is the source of truth; the repo folder runs ~100 migrations behind, so the migration must be applied by the runner, not left for a deploy. `visible_match_ids()` and `my_player_ids()` already exist — reuse, do not redefine. `matches.player1_id` mixes auth uids and `program_players.id` with no FK; do not join it. Add an index on `point_bookmarks(point_id)` for the loader's `in (...)` lookup (the PK already covers `user_id`-leading reads). Run the `rls-boundary-reviewer` agent on the diff before commit — the intent asks for it explicitly.

## T2 · Derive MatchPoint.saved from the viewer's bookmarks in the points loader

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** `src/lib/data/match-points-server.ts` (lines 161 and 258 today)
- **done when:**
  - [ ] The `points` select string in `getMatchPointsFromSupabase` no longer includes `saved`, and `DbPoint`'s `saved` field is removed from the type.
  - [ ] After the points fetch, the loader queries `point_bookmarks` with `.select("point_id").in("point_id", pointIds)` through the same cookie-scoped server client (RLS narrows it to the viewer's own rows; no `user_id` filter is added client-side and no admin client is used), building a `Set<string>` of bookmarked point ids.
  - [ ] `MatchPoint.saved` is set to `bookmarkedIds.has(point.id)`; every other mapped field is unchanged.
  - [ ] A failed bookmarks query is logged with `console.error` and treated as "no bookmarks" (every `saved` false) — it does not make the loader return `[]`, so points and shots still render.
  - [ ] `npm run typecheck` and `npm run lint` pass; no file other than `match-points-server.ts` changes.
- **notes:** A three-set match is a few hundred points, so a single `in()` is fine; do not page it. The consumers of `MatchPoint.saved` (point rows, player glyph, transport, fullscreen room, the `savedOnly` filter axis) need no change.

## T3 · Toggle a point_bookmarks row instead of points.saved in the film tab

- **status:** todo
- **model:** sonnet
- **needs:** T1
- **files:** `src/components/dashboard/matches/match-detail/film/film-tab.tsx` (`handleToggleSaved`, ~line 291), `tests/fixtures/supabase-client-browser-mock.ts` (its `update` chain exists only for this bookmark write), plus whichever film spec drives the toggle through that mock (`tests/film-filters-fullscreen.spec.ts` / `tests/film-timeline.spec.ts` — guess)
- **done when:**
  - [ ] `handleToggleSaved` keeps its optimistic-then-revert shape but the write is `supabase.from("point_bookmarks").insert({ point_id: pointId }).select("point_id")` when `nextSaved` is true and `supabase.from("point_bookmarks").delete().eq("point_id", pointId).select("point_id")` when false; `user_id` is never sent from the browser (the column default `auth.uid()` from T1 supplies it).
  - [ ] The "echo the stored value" check remains honest: the write counts as stored only when `!error && data?.length === 1 && data[0].point_id === pointId`; otherwise the optimistic value is reverted — a refused insert (RLS) or a delete that matched zero rows both revert.
  - [ ] No `.from("points").update(...)` call remains anywhere under `src/components/dashboard/matches/match-detail/film/`, and `points.saved` is not written anywhere in `src/` (grep evidence in the diff summary).
  - [ ] `tests/fixtures/supabase-client-browser-mock.ts` gains `insert` and `delete` chains that echo `{ point_id }` on success and can be configured to return an error or zero rows, and the existing film spec that exercises the bookmark toggle passes with the mock's `update` chain removed (so a regression back to the `points` update fails the suite).
  - [ ] `npm run typecheck`, `npm run lint` and the film specs pass.
- **notes:** Keep the keyboard `S` shortcut and `activePointId` wiring untouched. A double-click that races two inserts yields `23505`; treating that as a revert is acceptable for now — the next toggle repairs it.
