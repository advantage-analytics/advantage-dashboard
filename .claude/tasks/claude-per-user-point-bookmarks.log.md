# Run log — claude/per-user-point-bookmarks

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Create point_bookmarks table, RLS and backfill, proven by a live spec — done

**gate:** mechanical pass; completion review pass (the reviewer re-read the live DB to confirm the policies match the migration file)
**changed:** New `supabase/migrations/20260920120000_point_bookmarks.sql`, applied to the LIVE database: `point_bookmarks(user_id default auth.uid(), point_id, created_at)` with PK(user_id, point_id), an index on `point_id`, RLS on, grants to `authenticated` and `service_role` only, and exactly three policies (SELECT/INSERT/DELETE) each requiring `user_id = auth.uid()` AND the point's match to be in `visible_match_ids()`. No UPDATE policy and no UPDATE grant, so the absent policy is airtight. The backfill turns existing `points.saved = true` rows into bookmarks for the match creator, `on conflict do nothing`; `points.saved` is untouched and stays legacy. New `tests/point-bookmarks-db.spec.ts` proves it against live (9 tests).
**deviations:** Two, both deliberate. (1) `task-next`'s gate does not normally dispatch `rls-boundary-reviewer` — that is `/pr-check`'s — but this task's notes asked for it and the DDL lands in production immediately, so it ran on the diff and reported no findings. (2) The live project exposes no raw-SQL endpoint, so the spec cannot execute the backfill statement; instead it exports `BACKFILL_SQL`, asserts the migration file contains it byte-for-byte, and replays its semantics through PostgREST. The reviewer judged the substitution sound.
**notes:** The first two `apply_migration` attempts hit a `40P01` deadlock against GoTrue's sign-in transaction (adding an FK to `auth.users` while a live spec was signing in); both rolled back cleanly and the third succeeded. One real `point_bookmarks` row now exists in production — the backfill correctly converted a genuine saved point on a match that `clajersongimena@gmail.com` created. That row is also the evidence for the original diagnosis: saving already worked on a match you own.
**follow-ups:**

1. A later migration can drop `points.saved` once no reader references it.
2. Worth a note in `tests/fixtures/live-db.ts`: DDL adding an FK to `auth.users` deadlocks against a concurrent sign-in burst and should just be retried.

## T2 · Derive MatchPoint.saved from the viewer's bookmarks in the points loader — done

**gate:** mechanical pass (after one re-run: `match-video-attachments-db.spec.ts` "two concurrent sweeps never share a row" failed once against the shared live DB and passed alone — the same spec flaked on the video-tab branch); completion review pass
**changed:** `match-points-server.ts` no longer selects `saved` off `points` and drops it from `DbPoint`. After the points fetch it queries `point_bookmarks` with `.select("point_id").in("point_id", pointIds)` on the same cookie-scoped server client — RLS narrows that to the viewer's own rows, so no `user_id` filter is applied client-side and the admin client is not involved. `MatchPoint.saved` is now `bookmarkedIds.has(point.id)`. An empty `pointIds` skips the query, and a failed one is logged and treated as "no bookmarks" rather than failing the loader, so points and shots still render.

## T4 · Widen point_bookmarks SELECT and DELETE to workspace-wide, proven live — done

**gate:** mechanical pass; completion review pass (the reviewer re-read the live ledger and `pg_policies`); `rls-boundary-reviewer` also ran on the diff per the task notes and found nothing
**changed:** New `supabase/migrations/20260921034815_point_bookmarks_shared.sql`, applied to live under that same version — the file and the ledger agree this time, which is the mistake T1 made and had to be fixed by rename. It drops and recreates the SELECT and DELETE policies under honest names ("…on matches they can see"), each `using` reduced to the bare `visible_match_ids()` exists-clause with no `user_id` term. INSERT is untouched and stays own-row, so rows still record who saved. No UPDATE policy, no grant changes, no `anon` path; `points.saved` and `set_point_saved` are not touched and no backfill runs here. `tests/point-bookmarks-db.spec.ts` inverts the old privacy tests: a program-mate now reads the creator's row, and an unfiltered delete by the mate removes BOTH rows and echoes both user ids. The outsider and forged-`user_id` refusals are unchanged.
**verified live after the fact:** SELECT and DELETE carry no `user_id` term; INSERT still does.
**notes:** Deliberately ships alone and first — widening reads is backward-compatible with the client still writing through `set_point_saved`, so saving keeps working. The re-backfill and the RPC drop wait for T6, because a backfill run now would let `points.saved` drift again before cutover.
**follow-ups:**

1. T1's table comment said "Own rows only" and is now superseded live; no code reads it, but docs quoting it should follow.
2. The spec reorders section 3 before the shared-delete test so refusals run while both rows exist — T6's spec edits should preserve that ordering.

## T5 · Loader returns saved (any row) plus savedBy from the visible bookmark rows — done

**gate:** mechanical pass (full suite); completion review pass
**changed:** `MatchPoint` gains `savedBy: { userId, name }[]`, and `saved` is now `savedBy.length > 0` — so a point a TEAMMATE bookmarked reads as saved, which is the whole point of the reversal. The `point_bookmarks` query selects `point_id, user_id` on the same cookie-scoped server client with no `user_id` filter and no admin client; the stale "narrows this to the viewer's own rows" comment now describes the workspace-wide T4 policy. Names come from the SECURITY DEFINER RPC `program_roster_full(p_program_id)` matched on `user_id`, never from `public.users`. Fixtures in `film-point.ts` and `film-playback-refresh-harness.tsx` gain the field.
**verified against live:** `public.users` has exactly one policy, `cmd=ALL`, `qual = (select auth.uid()) = id` — own row only, so a teammate's name genuinely is unreadable there and the roster RPC is not a workaround but the only route. `program_roster_full(p_program_id uuid)` is SECURITY DEFINER and does return `user_id` and `display_name`.
**notes:** Both the `program_id` lookup and the roster RPC are skipped entirely when a match has no bookmark rows, so an unbookmarked match costs no extra round trips. A bookmark, program or roster failure each logs and degrades to `savedBy: []` rather than failing the loader. Nothing visible changes yet — the UI still reads `saved`, and the client still writes through `set_point_saved` until T6.
**follow-ups:**

1. After an optimistic toggle the client has no name for the row it just added; `savedBy` fills in on the next server fetch. The badge design needs to decide what to show in that gap.
2. A personal match shared into a program falls back to `null` names; worth confirming when the badge is designed.
