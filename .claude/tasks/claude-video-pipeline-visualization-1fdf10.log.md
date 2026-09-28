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

## T2 · Carry vendor event and rally ids through the transcript — done

**gate:** mechanical pass · completion pass

**changed:** `derivation/transcript.ts` — `DerivedShot.event_id` (from `stroke.eventId`) and `DerivedPoint.rally_id` (from `rally.rallyId`), both non-null numbers documented as join keys, not columns. `persist-transcript.ts` untouched: its point/shot inserts already list columns explicitly. New spec in `tests/splitstep-transcript.spec.ts` asserts non-null, unique event ids equal to the parsed strokes, and rally ids in order. `DERIVATION_VERSION` unchanged.

**follow-ups:**

1. `event_id` is unique only within one vendor payload; T1's key `(session_id, event_id)` already scopes it per session (one job), so no change needed — keep it that way.

## T3 · Seed a label session from a job's raw strokes — done

**gate:** mechanical pass · completion pass

**changed:**

- `src/lib/services/labels/seed.ts` (new, pure): `buildLabelSeed`, plus the tested mappers `labelEnding`, `labelStroke`, `labelShotResult` and `endedBy`.
- `src/lib/services/labels/seed-session.ts` (new, orchestration):
  - Returns the existing `labelling` session before doing any download.
  - Rebuilds the transcript from the current code.
  - Recovers from a 23505 insert race.
  - Writes points and then shots in batches.
  - Deletes a half-seeded session if a write fails.
  - Is gated by `requireAdmin`.
- `src/app/admin/labels/actions.ts` (new): `seedLabelSessionAction`.
- `persist-transcript.ts`: `buildTranscriptForJob` also returns `raw`, reusing its single download (additive).
- `tests/label-seed.spec.ts`: 20 tests, covering the fixture invariants and a recording fake client.

Decisions:

- `winner` is null when the derived winner never resolved (not a confident p2).
- Volley side comes from the vendor's `stroke_side`.
- `point_index` is 0-based.
- `labeller` is set explicitly, because `auth.uid()` is null under the service role.

**follow-ups:**

1. Migration must be applied live before the seed can run against job d3bff342….
2. `serve_side` isn't prefilled — could come from `serveCourtSide` on the deciding serve.
3. Raw strokes the parse layer drops are never seeded, so a labeller can't mark them; consider seeding them.
4. T4 can use `{ existing }` from `seedLabelSession` to show "resumed" vs "new".

## T4 · Label session list and "Start labelling" — done

**gate:** mechanical pass · completion pass

**changed:**

- `src/lib/data/labels-server.ts`: `listLabelJobs()`, admin-checked and using the service role. It lists completed splitstep jobs with players, point counts, the open or latest session, and an "N of M checked" count that excludes deleted points.
- New components in `src/components/admin/labels/`:
  - `labels-table.tsx` and `labels-table-layout.ts`, following the requests-table pattern.
  - `start-labelling-button.tsx`, which calls `seedLabelSessionAction` and then `router.push`, and shows errors inline.
- `/admin/labels` page.
- A placeholder `/admin/labels/[sessionId]` page, for T5 to replace.
- A "Labels" tab in `admin-header.tsx`.
- `MAP.md` regenerated.
- `npm run build` passes.

**follow-ups:**

1. A job whose latest session is `complete` shows "Continue" but the action would seed a new session — may want a third state once real use shows it.
2. No pagination on the jobs list (fine at current volume).
3. The page errors or shows nothing until the label migration is applied live.

## T5 · Read-only console: video, court, points and shots table — done

**gate:** mechanical pass · completion pass

**changed:**

- `/admin/labels/[sessionId]` replaces the T4 placeholder. It shows a header with the checked count, a video and court band, and a read-only points table with shots folded under their point. Deleted points and shots render as "Deleted point"/"Deleted shot" markers; added and edited shots get pills.
- New pure module `src/lib/services/labels/session.ts`, holding the shared types, `orderLabelShots` (video_time, then event_id) and `labelProgress`.
- `getLabelSession` and `loadJobVideo` added to `labels-server.ts`. The video plays from a SAS URL minted for the labelled job itself.
- `court-geometry.ts` adds `toCourt`/`fromCourt` in percent 0–100. The court colours are imported from `court-art.tsx`.
- New components in `src/components/admin/labels/`: `label-console`, `label-points-table`, `label-court`, `label-video`, `label-format`, `label-table-layout`.
- Specs: `label-console` (uses createLoader and also scans the folder for "flags"), `label-court-geometry` and `label-session-order`, with fixture `tests/fixtures/label-session.ts`.
- The video is a plain `<video>`, not `FilmPlayer`, which is tied to the film tab's props and hooks.

**follow-ups:**

1. T6: the court needs to become a clickable button, and the right-hand point cells and the shot cells need to become editors. The row is currently a clickable div with a chevron and will need restructuring.
2. T7: make the deleted marker expand to a struck-through ghost row with Undo.
3. An added shot with no `video_time` sorts to the end of its point; it should sit after its `after_event_id` instead.
4. Board 08's set/game group headers, and refreshing the SAS URL during long sessions.
5. Not yet run against real data: the label tables aren't live, and neither the loader nor the video URL has been exercised.
