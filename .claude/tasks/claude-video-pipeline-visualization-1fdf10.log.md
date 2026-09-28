# Run log — claude/video-pipeline-visualization-1fdf10

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add the label tables migration — done

**gate:** mechanical pass (after `npm ci` — node_modules predated the base sync's new `pg`/`@electric-sql/pglite` devDeps; first run failed on missing packages only) · completion pass

**changed:** `supabase/migrations/20260928180000_label_sessions.sql` — `label_sessions`, `label_points`, `label_shots` per the plan, with CHECK enums, cascade FKs, partial unique `(session_id, event_id)`, one open `labelling` session per job, admin-only RLS via `(select public.is_admin())`, `updated_at` triggers. Ran on user's choice on opus (fable at its spend limit). NOT applied to live — awaiting user confirmation; rename to the live version after applying.

**follow-ups:**

1. Match/job delete cascades to labels — confirm that's wanted, or switch to `on delete set null`.
2. `final_score` must be a JSON array (one `{p1, p2}` per set); T5–T7 must write that shape.
3. A deleted shot must carry `delete_reason` in the same update (T7); T3 can rely on the one-open-session index and re-select on a unique violation.
