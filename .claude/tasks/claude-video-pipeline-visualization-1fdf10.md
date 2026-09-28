# Tasks — claude/video-pipeline-visualization-1fdf10

> Scope: internal hand-labelling console for Advantage Intelligence matches (label tables, seed from raw vendor strokes, /admin/labels), so auto-fixes and flags can be scored against ground truth. Plan: /Users/cjgimena/.claude/plans/show-me-visually-the-tidy-honey.md

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

## T1 · Add the label tables migration

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<timestamp>_label_sessions.sql (guess)
- **done when:**
  - [ ] The migration creates `label_sessions`, `label_points` and `label_shots` with every column named in the plan's "What gets saved" section, with CHECK constraints listing exactly the plan's values for `ending`, `status`, `delete_reason`, `stroke`, `result`, `hitter`/`server`/`winner`/`ended_by` (p1/p2) and `serve_side`
  - [ ] `label_points` and `label_shots` reference `label_sessions` with `on delete cascade`, `label_shots.label_point_id` references `label_points`, and a partial unique index covers `(session_id, event_id) where event_id is not null`
  - [ ] All three tables enable RLS, and their only policies are select/insert/update/delete using `public.is_admin()`
  - [ ] The migration contains no statement that alters or writes `points`, `shots`, `matches` or `processing_jobs`
- **notes:** Spec: plan file § "What gets saved". Do NOT apply to the live DB — the user confirms first; after applying, rename the file to the live version (repo convention). Coordinates use the `shots` frame (metres, near baseline y=0).

## T2 · Carry vendor event and rally ids through the transcript

- **status:** done
- **model:** opus
- **files:** src/lib/services/splitstep/derivation/transcript.ts, src/lib/services/splitstep/persist-transcript.ts, tests/splitstep-transcript.spec.ts (guess)
- **done when:**
  - [ ] `DerivedShot` gains `event_id` (from the stroke's `eventId`) and `DerivedPoint` gains `rally_id` (from the rally's `rallyId`)
  - [ ] The point and shot insert objects in `persist-transcript.ts` still list only the existing columns, so neither new field reaches `points` or `shots`
  - [ ] `tests/splitstep-transcript.spec.ts` asserts that every shot built from the clean-match fixture has a non-null `event_id`, the ids are unique across the match, and the count equals the parsed stroke count
  - [ ] `DERIVATION_VERSION` is unchanged
- **notes:** The labelling seed needs a join key back to the vendor stroke; `shots` has none. The change must be purely additive.

## T3 · Seed a label session from a job's raw strokes

- **status:** todo
- **model:** opus
- **needs:** T1, T2
- **files:** src/lib/services/labels/seed.ts, src/app/admin/labels/actions.ts, tests/label-seed.spec.ts (guess)
- **done when:**
  - [ ] A pure `buildLabelSeed(transcript, rawStrokes)` returns one label shot per transcript shot carrying `event_id`, `vendor` (the raw stroke with that event_id, verbatim), coordinates, `hitter` from `is_player1` and `status: "kept"`, plus one label point per transcript point with `vendor_rally_ids` and `winner`/`ending`/`ended_by` prefilled from the derived values
  - [ ] `tests/label-seed.spec.ts` checks those invariants against `tests/fixtures/splitstep/clean-match.json`
  - [ ] The server action returns an error when `requireAdmin()` is null, builds the transcript with `buildTranscriptForJob` (current code, never stored rows), and writes only to `label_*` tables
  - [ ] Seeding a job that already has a session with status `labelling` returns that session's id instead of inserting a duplicate
  - [ ] The session stores `results_object_key`, `DERIVATION_VERSION`, `job_id`, `match_id` and the labeller
- **notes:** Target job d3bff342-b33a-417a-a332-b5a3192f3f4d (match 1415029e…, 87 points, 539 shots; its stored rows are derivation 0.3.0).

## T4 · Label session list and "Start labelling"

- **status:** todo
- **model:** sonnet
- **needs:** T3
- **files:** src/app/admin/labels/page.tsx, src/lib/data/labels-server.ts, MAP.md (guess)
- **routes:** /admin/labels
- **done when:**
  - [ ] `/admin/labels` lists the completed Advantage Intelligence jobs; each row shows the players, the point count and any existing session with its "N of M checked" progress
  - [ ] Each row's "Start labelling" or "Continue" calls the T3 action and links to `/admin/labels/[sessionId]`
  - [ ] MAP.md, regenerated with `npm run map`, lists `/admin/labels` and `/admin/labels/[sessionId]`
- **notes:** Use the admin shell (`src/components/admin/admin-page.tsx`); the `requireAdminOrNotFound` layout already gates the route.

## T5 · Read-only console: video, court, points and shots table

- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** src/app/admin/labels/[sessionId]/page.tsx, src/components/admin/labels/* (guess)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] Shots within a point are ordered by `video_time`, never by `shot_number` alone
  - [ ] Point rows show the calculated columns on the left and `winner`/`ending`/`ended_by` plus a Checked/To check status on the right; shots fold under their point; a deleted row renders as a "Deleted shot"/"Deleted point" marker instead of a normal row
  - [ ] The court renders in viewBox `-6.2 -2.1 12.4 27.97` with apron `#86AC91` and court `#6092CE`, and a pure `toCourt`/`fromCourt` helper that round-trips percent ↔ metres is covered by a spec
  - [ ] An offline component spec (`tests/fixtures/vm-modules.ts` `createLoader`) renders the console from a fixture session and asserts the point-row count, the shots under an expanded point, and the deleted-marker text
  - [ ] No component in `src/components/admin/labels/` reads a `flags` field
- **notes:** Design = board 08 of https://claude.ai/artifact/Gi72TBnvgdczNRm39zP4bT. Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Video uses `FilmPlayer` (src/components/dashboard/matches/match-detail/film/film-player.tsx); the court uses the `shots/court-art.tsx` colours. Largest task — split it into table vs. video/court band if the subagent runs out of room.

## T6 · Field editing with autosave and court click placement

- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** src/app/admin/labels/actions.ts, src/components/admin/labels/* (guess)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `updateLabelShot` (fields: hitter, stroke, result, contact__, landing__, video_time, unclear) and `updateLabelPoint` (winner, ending, ended_by, serve_side, note) reject any other key and return an error when `requireAdmin()` is null
  - [ ] A shot's status becomes `edited` when a patched value differs from its `vendor` snapshot; an `added` shot stays `added`
  - [ ] In the court click handler, the first click writes `contact_x`/`contact_y` and the second writes `landing_x`/`landing_y`, and the prompt changes from "Click where shot N was hit" to "Click where shot N landed"
  - [ ] The header shows "Saved · just now" after a successful save and an error state after a failed one; the page has no "Save" button
  - [ ] Every value cell renders as text and mounts its editor only on hover or selection

## T7 · Delete/undo, add shot, move point, mark checked

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** src/app/admin/labels/actions.ts, src/components/admin/labels/* (guess)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] Delete sets `status: "deleted"` (shots also require `delete_reason`) and Undo restores the previous status; no action issues a SQL DELETE on a `label_*` row; deleting opens a confirm dialog first
  - [ ] "Add shot" inserts a row with `event_id` null, `after_event_id` set and `status: "added"`, rendered with the blue outline and "Added" pill
  - [ ] Moving a point to a game whose server differs opens a dialog reading "<player> is serving this game, switch players?", and the action changes `server` only when confirmed
  - [ ] "Mark point checked" sets `checked_at` and Undo clears it; the header count is the checked points out of the non-deleted points
