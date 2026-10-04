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

## T6 · Field editing with autosave and court click placement — done

**gate:** mechanical pass · completion pass

**changed:**

- **Server actions.** New `updateLabelShot` / `updateLabelPoint`, backed by the pure `src/lib/services/labels/edit.ts` and the admin-checked `edit-session.ts`.
  - They check allowed keys and values before touching anything, and refuse edits to a deleted row or a `complete` session.
- **Edited-status baseline.** A shot counts as edited when a value differs from its seeded value, which is the vendor stroke mapped at the pinned derivation version (tolerance 1 cm / 0.05 s).
  - Why: hitter, result and serve number can't be recomputed from one raw stroke.
  - An edited shot never reverts to kept.
- **Court placement.** `court-placement.ts` (`nextPlacement`, `placementPrompt`) cycles hit → landed → hit.
- **Autosave.** Optimistic, reverting on error, with the save line ("Saving…" / "Saved · just now" / "Not saved · reason") in `save-status.ts` and `label-save-status.tsx`. No Save button.
- **Editable cells.** `label-cells.tsx`: cells are text until hovered or selected, with Enter/Space to edit and Escape to cancel. The selected shot row mounts all its editors.
- **Header.** Moved into `LabelConsole`. The Result column is now 64px.
- **Tests.** `label-edit` and `label-console-edit` specs, plus 7 new render tests in `label-console`. The implementer also drove the UI in headless Chromium on a throwaway route, since deleted.

**follow-ups:**

1. Add a frozen `label_shots.seed jsonb` so an edited shot can revert to `kept` when its values are set back.
2. There's no UI yet for `serve_side`, `note` or `unclear`; the actions accept them, but the loader doesn't fetch `note`/`unclear`.
3. Two quick edits to the same row compute status from the row as read, so they can race (harmless while the rule never un-edits).
4. Clicking a Hit at / Landed at cell could choose which end the next court click places.
5. Point rows have no "Edited" marker.

## T7 · Delete/undo, add shot, move point, mark checked — done

**gate:** mechanical pass · completion pass

**changed:**

- **Rules and services.**
  - `operations.ts` (pure) and `operations-session.ts` (admin-checked, UPDATE/INSERT only).
  - Operations: delete with a reason (shots), restore, add shot, move point, mark checked / unchecked.
  - A status change only lands if the row's status hasn't changed since it was read (so another tab can't be overwritten).
  - Actions are wrapped in `actions.ts`.
- **Undo needs the pre-delete status.** Amended the unapplied T1 migration with `status_before_delete`, CHECK-paired to `status = 'deleted'`. Undo needs it because kept vs edited can't be derived once a value is overwritten.
- **Delete confirmation.** `label-confirm-dialog.tsx` wraps `ConfirmDialog`: danger tone, and a required reason radio for shot deletes. The dialog wording lives in `label-confirm.ts`.
- **Table.**
  - ✕ at the far right of each row.
  - Deleted markers expand to a ghost row with Undo.
  - Clicking set · game opens the move menu, listing adjacent games with their server. A different server shows "<player> is serving this game, switch players?" with Switch players / Cancel.
  - Open-point footer: "Mark point checked ↵" becomes "✓ Point checked · Undo", plus Add shot (after the selected shot).
  - Enter marks the point checked.
- **Added shots.**
  - `after_event_id` is the nearest earlier vendor stroke.
  - `video_time` is the midpoint of the neighbouring shots.
  - The hitter defaults to the previous hitter's opponent.
- **Tests.** Specs `label-operations` (29) and `label-console-operations` (13), with ConfirmDialog stubbed so tests can prove nothing is written before confirm. Browser-checked on a throwaway route, since deleted.

**follow-ups:**

1. After marking a point checked, move to the next unchecked point.
2. Insert a shot at the start of a rally, and an "Add shot at playhead" option.
3. Allow moving a point into a brand-new game.
4. Adding or deleting a shot on a checked point doesn't clear its checked state.
5. An added shot can't be edited while it is still saving (its temporary id is rejected).
6. The seed still hard-deletes a half-seeded session on failure (T3, internal).

## T8 · Derive scores and per-set game numbers (pure module) — done

**gate:** mechanical pass · completion pass

**changed:** New pure `labelScores(points, adScoring)` in `src/lib/services/labels/score.ts` (per-set game number, score before each point with the server first, games score per band; lets, non-points, deleted and winner-less points don't advance it) with `tests/label-score.spec.ts` (20 tests).

**follow-ups:**

1. A stray point inside an already-decided game prints "Game–30"; the point row could style it as a warning.
2. `labelScores` knows each game's winner but does not return it; the band may want it.

## T9 · game_type column, note/game_type/adScoring in the session loader — done

**gate:** mechanical pass · completion pass

**changed:** Migration `20261004051628_label_points_game_type.sql` (applied live) adds `label_points.game_type`; `LabelPoint` gains `gameType` and `note`, `LabelSession` gains `adScoring` (session value, else the job's, else ad); the seed writes `game_type: game`; game type stays out of the seed comparison, the point patch and Reset, with specs.

**follow-ups:**

1. Seeding never writes `label_sessions.ad_scoring`; the loader falls back to the job's value.

## T10 · Game operations: set a game's server, set a game's type — done

**gate:** mechanical pass · completion pass

**changed:** New pure `game-operations.ts` (`planGameServer`, `planGameType`, `applyGameWrites`; 1-2-2 tiebreak rotation, lets take the next served point's server) and `game-operations-session.ts` (`setLabelGameServer`, `setLabelGameType`: admin-gated, open session only, UPDATEs on `label_points` with compare-and-set on `updated_at`), wrapped in `actions.ts`, with `tests/label-game-operations.spec.ts` (24 tests). A point with no winner yet still takes a serve turn in the rotation.

**follow-ups:**

1. A game write is one UPDATE per row with no transaction; a failure midway leaves a partly rotated game (each row consistent on its own).
2. Moving a point into a tiebreak uses the majority-server rule, which is wrong for a rotated game; re-run the rotation after such a move.

## T11 · Derive shot Result and Placement from the coordinates — done

**gate:** mechanical pass · completion pass

**changed:** New pure `shot-derived.ts`: `deriveShotResult` (net / in / out from contact and landing, service box for serves) and `shotPlacement` (reusing `serveZone` / `directionZone`). `nextPlacement` now takes the shot and the court click that completes a contact+landing pair carries the derived `result` in the same patch.

**follow-ups:**

1. Changing a shot's stroke (rally ↔ serve) does not re-derive the result.
2. Shots placed before this change keep their stored result until re-placed.

## T12 · Extract the point row and redesign it to 08g — done

**gate:** mechanical pass · completion pass

**changed:** Point rows moved to `label-point-row.tsx` (⋯ menu in `label-point-menu.tsx`, shared row helpers in `label-row-parts.tsx`); the table file drops from 1,229 to 590 lines. Row is now caret · winner chip (menu) · # · Time · Score · How it ended · Last shot · Rally · Note · Status · ⋯, with Score from `labelScores`, an editable Note, and Move to game / Reset / Delete in the ⋯ menu. `MoveGameCell` became `pointMenuActions().move`.

**follow-ups:**

1. `ended_by` is no longer editable from the row (the column is gone).
2. An edited, unchecked point has no row ✓; it is checked from the footer.
3. Click-to-seek on Time; Split point / Add point before; 22px marks in the winner menu.
4. No spec covers the note revert on a failed save.

## T13 · Extract the shot row and redesign it to 08g — done

**gate:** mechanical pass · completion pass

**changed:** Shot rows moved to `label-shot-row.tsx` (table file now ~200 lines) and drawn in a bordered card under the point: Shot · Time · Player (22px chip) · Stroke · Hit at · Landed at · Placement · Result · Status · ✕, with 124px coordinate tracks so values show whole. Result and Placement are calculated text (no select); a typed coordinate sends one patch with the derived `result`. Serves that are out or net read as muted Fault rows. `WinnerMark` moved to `label-row-parts.tsx` as `SideMark`.

**follow-ups:**

1. The shot header is still rendered by the point row, above the card; moving it into `ShotRows` would let the calculated-column glyph sit on the header as the board draws it.
2. `nextPlacement` and `positionPatch` share derive-and-merge logic.
3. Table min width is now 1184px.

## T14 · Game bands with game-type and server dropdowns — done

**gate:** mechanical pass · completion pass

**changed:** New `label-game-band.tsx`: a band before each game's first live point reading "Set N · Game M" (or Tiebreak / Match tiebreak), the set's games score and who serves, with a game-type menu and a server menu. The console gains `setGameServer` / `setGameType` (optimistic via `applyGameWrites`, reverted on failure, reported on the save line), wired in `page.tsx` to the T10 actions; scores re-derive after either change. `SideMark` gains an 18px size.

**follow-ups:**

1. Server-menu rows have no player chip (`FloatMenuItem`'s icon slot is 12px).
2. The console spec stubs the table, so the optimistic state and save line are not asserted directly.

## T15 · Follow playback with hold and "Now playing" — done

**gate:** mechanical pass · completion pass

**changed:** The film room rail's hold-intent listeners and keep-in-view / re-follow scroll moved into a shared `use-follow-scroll.ts` hook (element or window scroller); `point-list.tsx` now calls it, behaviour unchanged. The labelling console holds a `PointFocus`: following, the playing point is the open one and is kept in view with its playing stroke lit; clicking a row or stroke, focusing an editor, or scrolling by hand holds; a fixed top-centre "Now playing · Point N" pill re-follows. New `tests/film-follow-scroll.spec.ts`.

**follow-ups:**

1. The console's pill does not hide when the playing row is already in view (the film room's does).
2. The hook supports insets for fixed chrome; the console passes none, so the video dock can cover the playing row's right-hand cells.
3. `setRestPointId` is adjusted during render in the console.
