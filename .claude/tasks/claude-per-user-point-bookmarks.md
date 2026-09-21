# Tasks — claude/per-user-point-bookmarks

> Scope: move a saved point off the shared `points.saved` flag onto a `point_bookmarks` table that records WHO saved it. Originally drafted as per-viewer private bookmarks (T1–T3); the product owner reversed that on 2026-09-21 — bookmarks are workspace-wide, anyone who can see the match sees and can remove them, and a later design adds a "who saved it" badge. T4–T6 carry the reversal. The branch name predates the decision.

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
- **superseded by:** T4/T5/T6. It landed (commit on this branch) and its file is still the right file, but the product decision reversed: bookmarks are workspace-wide, not private. Its second criterion — "RLS narrows it to the viewer's own rows" — is now the wrong model, and the loader must also return `savedBy`. T5 rewrites the query it added.

## T3 · Toggle a point_bookmarks row instead of points.saved in the film tab

- **status:** later
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
- **superseded by:** T6. It was implemented, then dropped during the rebase onto the merged PR #238 — it conflicted with `film-tab.tsx`, and its write shape (own-row delete, private) is the wrong model now. Do not run this task; T6 replaces it against #238's `set_point_saved` version of `handleToggleSaved`.

## T4 · Widen point_bookmarks SELECT and DELETE to workspace-wide, proven live

- **status:** done
- **model:** fable
- **files:** `supabase/migrations/<timestamp>_point_bookmarks_shared.sql` (new), `tests/point-bookmarks-db.spec.ts` (rewrite of sections 2–3; its header comment and the `MIGRATION` constant list both files) — guesses
- **done when:**
  - [ ] The diff carries one new migration under `supabase/migrations/` that `drop policy if exists` + recreates the SELECT policy "Users read their own point bookmarks" and the DELETE policy "Users remove their own point bookmarks" (rename both — the old names now lie) so each `using` clause is ONLY the `exists (select 1 from public.points p where p.id = point_bookmarks.point_id and p.match_id in (select public.visible_match_ids()))` term, with no `user_id` term; the INSERT policy is not touched by the file (it stays `user_id = (select auth.uid()) and <visible>`); no UPDATE policy, no `anon` grant, no change to grants. The file does not drop or alter `points.saved` and does not touch `set_point_saved` or run a backfill.
  - [ ] The migration has been applied to the live DB via `mcp__supabase__apply_migration`, and the diff's proof is `tests/point-bookmarks-db.spec.ts`, which now asserts, against live: (a) after the creator bookmarks the fixture point, `mate` reads the row `{ user_id: creator.userId, point_id }` through `mate.client` (the old "neither sees the other's row" test is inverted, not deleted); (b) `mate`'s unfiltered `delete().eq("point_id", pointId).select("user_id")` removes BOTH the creator's and the mate's rows and echoes both `user_id`s; (c) `outsider` still reads `[]`, gets `42501` on insert, and its delete echoes `[]` while `admin` confirms the rows survive; (d) an insert naming another user's `user_id` is still refused with `42501`.
  - [ ] The spec's fixture-sanity, anon-boundary and backfill-contract tests (sections 0, 1, 4) still pass unchanged apart from the file-path constant, and `BACKFILL_SQL` still matches `20260921004305_point_bookmarks.sql` byte-for-byte.
  - [ ] The migration file's header comment states the access model in one paragraph: bookmarks are shared per match, anyone who can see the match sees and can remove every row, INSERT is own-row so rows record who saved — and names T6 as where `set_point_saved` is dropped.
  - [ ] `npm run format:check`, `npm run typecheck` and `npx playwright test tests/point-bookmarks-db.spec.ts` pass; `npm run map` is a no-op; no file under `src/` changes.
- **notes:** Live DB checked 2026-09-20: `point_bookmarks` still carries T1's three own-row policies (version 20260921004305 applied; 20260921010409 + 20260921011421 are `set_point_saved`). Widening SELECT/DELETE is backward-compatible with the client still on `set_point_saved`, which is why this task ships first and alone. Do NOT drop the RPC or re-backfill here — the re-backfill must run as late as possible (immediately before the client stops writing `points.saved`, in T6) or the flag drifts again afterwards. The live spec runs in `serial` mode against a shared DB; a `40P01` on `apply_migration` is a GoTrue sign-in deadlock — just retry (T1 log). Run `rls-boundary-reviewer` on the diff before commit: this widens a read boundary.

## T5 · Loader returns saved (any row) plus savedBy from the visible bookmark rows

- **status:** done
- **model:** opus
- **needs:** T4
- **files:** `src/lib/data/match-points-server.ts` (the `point_bookmarks` block at lines 203–221, the `MatchPoint` type at line 39, the map at line 277); `tests/fixtures/film-point.ts` if `MatchPoint` fixtures must gain the new field — guess
- **done when:**
  - [ ] `MatchPoint` gains `savedBy: { userId: string; name: string | null }[]` (doc comment: "every workspace member who bookmarked this point; empty when none") and `saved: boolean` is kept, computed as `savedBy.length > 0`; the `point_bookmarks` query in `getMatchPointsFromSupabase` selects `point_id, user_id` through the same cookie-scoped server client with no `user_id` filter and no admin client, and the stale comment "narrows this to the viewer's own rows" is rewritten to say the rows are workspace-wide under the T4 policy.
  - [ ] `name` is resolved WITHOUT reading `public.users` for other users: the live `users` table has exactly one policy, `auth.uid() = id` (own row only), so a teammate's `first_name` is unreadable through RLS. When the match has a `program_id`, names come from the existing SECURITY DEFINER RPC `program_roster_full(p_program_id)` (`user_id` → `display_name`, the same call `team-roster-server.ts:348` makes), matched on `user_id`; for a personal match or an unmatched user `name` is `null`. The code comment states this and that the badge UI is out of scope.
  - [ ] A failed `point_bookmarks` or roster query is `console.error`-logged and degrades to `savedBy: []` for every point; the loader never returns `[]` because of it, and the `points` and `shots` queries are unchanged.
  - [ ] Every `MatchPoint` literal under `tests/fixtures/` and any factory in `src/` that builds a `MatchPoint` compiles with the new field (`npm run typecheck` passes); the existing readers of `.saved` in `src/` are untouched (no diff hunk in `film-*.tsx`, `point-list.tsx`, `filters/types.ts`).
  - [ ] `npm run lint` and the film specs (`npx playwright test tests/film-*.spec.ts`) pass.
- **notes:** `getMatchPointsFromSupabase` already has `matchId`; it needs `program_id` too — one extra `matches.select("program_id").eq("id", matchId).maybeSingle()` on the same client is acceptable, or thread it from `getMatchDetailData` if that is simpler. `program_roster_full` returns `TABLE(player_id, profile_id, user_id, display_name, email, role, …)` — use `user_id`/`display_name` only. A three-set match is a few hundred points; one `in()` is fine. This ships while the client still writes `points.saved` via the RPC: the UI keeps reading `saved`, so nothing visible changes until T6.

## T6 · Cut the film tab over to insert/delete, re-backfill, drop set_point_saved in one commit

- **status:** todo
- **model:** fable
- **needs:** T4, T5
- **files:** `src/components/dashboard/matches/match-detail/film/film-tab.tsx` (`handleToggleSaved`, lines 313–351), `tests/fixtures/supabase-client-browser-mock.ts`, `supabase/migrations/<timestamp>_drop_set_point_saved.sql` (new), `tests/point-bookmarks-db.spec.ts` (new section 5) — guesses
- **done when:**
  - [ ] `handleToggleSaved` keeps its optimistic-then-revert shape but no longer calls `supabase.rpc`: when `nextSaved` is true it runs `supabase.from("point_bookmarks").insert({ point_id: pointId }).select("point_id")` (no `user_id` sent — the column default supplies it); when false it runs `supabase.from("point_bookmarks").delete().eq("point_id", pointId).select("point_id")` with NO `user_id` filter, so every member's row on that point goes (the T4 DELETE policy allows it, and one surviving teammate row would keep the point saved). The echo check is `!error && data.length >= 1 && data.every(r => r.point_id === pointId)` for both branches (an unsave that matched zero rows reverts); the doc comment is rewritten for the new model. `grep -rn "set_point_saved\|from(\"points\").update" src/` returns nothing.
  - [ ] The same commit carries one new migration that (1) re-runs the T1 backfill statement verbatim (`BACKFILL_SQL` text) with a comment above it stating that a point saved through `set_point_saved` by a non-creator is attributed to the creator because the flag never recorded who; (2) `drop function if exists public.set_point_saved(uuid, boolean)` — the only signature live, covering both recorded versions 20260921010409 and 20260921011421; (3) `comment on column public.points.saved is 'LEGACY — unwritten since <this migration>; read nothing from it. Dropping it is a separate migration.'`. It does not drop or alter the column. Applied to live via `mcp__supabase__apply_migration`.
  - [ ] `tests/point-bookmarks-db.spec.ts` gains a section asserting, against live: `creator.client.rpc("set_point_saved", { p_point_id: pointId, p_saved: true })` errors with code `42883` or PostgREST `PGRST202` (function gone); the new migration file on disk contains `BACKFILL_SQL` verbatim and the `drop function` line, and still matches `/not\.toMatch(drop\s+column\s+saved)/`; and the client's exact unsave shape — an unfiltered `delete().eq("point_id").select("point_id")` by `mate` after both members inserted — echoes two rows and leaves `admin` reading `[]`.
  - [ ] `tests/fixtures/supabase-client-browser-mock.ts` replaces its `update` chain with `insert` and `delete` chains that resolve `{ data: [], error: null }` (zero rows → the component reverts), exposes NO `rpc` method (so a regression to `supabase.rpc` throws in the harness), and its header comment is updated; `tests/film-playback-refresh.spec.ts` and the other `tests/film-*.spec.ts` pass.
  - [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`, `npx playwright test tests/point-bookmarks-db.spec.ts tests/film-*.spec.ts` pass; `npm run map` is a no-op.
- **notes:** Migration and client change land in ONE commit on purpose: dropping the RPC first breaks the Save button; cutting the client first leaves `points.saved` written by no one while the flag's last true rows are not yet backfilled — the backfill must be the last statement to run against a still-current flag, so it sits in this migration and nowhere earlier. Order inside the file: backfill → drop → comment. The repo file `20260920120000_set_point_saved.sql` does not match its live ledger versions (20260921010409/011421); leave it as history, don't rename it in this task. Keep the `S` key, `toggleSavedActive` and `activePointId` wiring untouched. A double-click racing two inserts yields `23505` and reverts; the next toggle repairs it. Run `rls-boundary-reviewer` before commit.
