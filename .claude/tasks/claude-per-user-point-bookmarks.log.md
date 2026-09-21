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
