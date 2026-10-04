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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
- **model:** opus
- **needs:** T6
- **files:** src/app/admin/labels/actions.ts, src/components/admin/labels/* (guess)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] Delete sets `status: "deleted"` (shots also require `delete_reason`) and Undo restores the previous status; no action issues a SQL DELETE on a `label_*` row; deleting opens a confirm dialog first
  - [ ] "Add shot" inserts a row with `event_id` null, `after_event_id` set and `status: "added"`, rendered with the blue outline and "Added" pill
  - [ ] Moving a point to a game whose server differs opens a dialog reading "<player> is serving this game, switch players?", and the action changes `server` only when confirmed
  - [ ] "Mark point checked" sets `checked_at` and Undo clears it; the header count is the checked points out of the non-deleted points

## T8 · Derive scores and per-set game numbers (pure module)

- **status:** done
- **model:** fable
- **files:** src/lib/services/labels/score.ts, tests/label-score.spec.ts (guess)
- **done when:**
  - [ ] A pure `labelScores(points, adScoring)` in `src/lib/services/labels/score.ts` takes the session's points in `point_index` order (fields: id, status, setNumber, gameNumber, server, winner, ending, gameType) and returns, for every non-deleted point, `gameInSet` (1-based rank of its stored `(set_number, game_number)` among the set's distinct games in point order — a point with stored game 7 in set 2 after six games in set 1 gets `gameInSet: 1`) and `scoreBefore`, the score before the point with the point's server first ("0–0", "30–15", "40–40", "40–Ad", "Ad–40"); tiebreak and match-tiebreak games print raw counts ("3–2"); stored `game_number` is never rewritten
  - [ ] Points with `ending` `let_replayed` or `not_a_point`, points with `status: "deleted"`, and points with a null `winner` do not advance the score — the next point's `scoreBefore` equals theirs; with `adScoring: false` a point at 40–40 ends the game; with `adScoring: true` it goes to Ad and a second deuce returns "40–40"
  - [ ] The same call returns one entry per game band — `{ setNumber, gameNumber, gameInSet, gamesBefore }` where `gamesBefore` is "p1–p2" games already won in that set (p1 first), a game's winner being the winner of its last counted point — so the band after p1 wins the set's first two games reads "2–0"
  - [ ] `tests/label-score.spec.ts` covers: an ad game through deuce/Ad/deuce, a no-ad game ending at 40–40, a 7-point tiebreak with "3–2"-style scores, a let in the middle of a game, a null-winner point, and game numbering restarting in set 2
  - [ ] The module imports nothing from `components/`, `next/` or any server-side file (it is consumed by the `"use client"` table)
- **notes:** Scores are derived, never stored. `game_type` values are `game | tiebreak | match_tiebreak` (T9 adds the column; this module just reads the field and treats a missing one as `game`). Typing a custom score (the board's "Yours") is out of scope.

## T9 · `game_type` column, `note`/`game_type`/`adScoring` in the session loader

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<timestamp>_label_points_game_type.sql, src/lib/services/labels/session.ts, src/lib/services/labels/seed.ts, src/lib/services/labels/edit.ts, src/lib/data/labels-server.ts, tests/fixtures/label-session.ts, tests/label-edit.spec.ts, tests/label-reset.spec.ts (guess)
- **done when:**
  - [ ] A new migration file adds `game_type text not null default 'game'` to `public.label_points` with `check (game_type in ('game', 'tiebreak', 'match_tiebreak'))`, and contains no statement touching `points`, `shots`, `matches` or `processing_jobs`
  - [ ] `LabelPoint` gains `gameType: LabelGameType` and `note: string | null`; `getLabelSession` selects `game_type` and `note` and `buildLabelSession` maps them; the seed's point row writes `game_type: "game"`
  - [ ] `LabelSession` gains `adScoring: boolean`, loaded as `label_sessions.ad_scoring ?? processing_jobs.ad_scoring (of the session's job) ?? true`, with a spec on the fallback order
  - [ ] `game_type` is NOT in `LABEL_POINT_SEED_FIELDS`, `parseLabelPointSeed` drops it, `parseLabelPointPatch` rejects `{ game_type }` with an error, and `planPointReset`'s write carries no `game_type` — specs assert all four
  - [ ] `tests/fixtures/label-session.ts` points carry `gameType` and `note`, and `npm run typecheck` passes
- **notes:** Do NOT apply the migration — the orchestrator applies it to the live DB through the Supabase MCP and renames the file to the live version. `game_type` is a game-level annotation stored per point (like `server`): not part of the seed/`unchanged` comparison, and Reset never touches it. Live check 2026-10-03: `label_points.note` and `label_sessions.ad_scoring` exist; `ad_scoring` is null on both sessions, both jobs have `ad_scoring = false`.

## T10 · Game operations: set a game's server, set a game's type

- **status:** done
- **model:** fable
- **needs:** T9
- **files:** src/lib/services/labels/game-operations.ts, src/lib/services/labels/game-operations-session.ts, src/app/admin/labels/actions.ts, tests/label-game-operations.spec.ts (guess)
- **done when:**
  - [ ] A NEW pure module `game-operations.ts` (not appended to `operations.ts`) exports `planGameServer(points, game, server)` and `planGameType(points, game, type)`, each returning one write per live point of that game as `{ id, server, game_type?, status }`, where `status` comes from the existing `labelPointStatusAfterChange` with `{ server }`
  - [ ] `planGameServer` on a `game` gives every live point the chosen server; on a `tiebreak`/`match_tiebreak` the chosen server serves counted point 1, then the sides alternate in pairs (points 2–3 the other side, 4–5 back, …); a `let_replayed`/`not_a_point` point takes the server of the next counted point (the last one, if none follows); `planGameType` applies the same rotation from the game's current first server when switching to a tiebreak type and gives every point the current first server when switching back to `game`
  - [ ] `game-operations-session.ts` exports `setLabelGameServer` and `setLabelGameType` that return an error when `requireAdmin()` is null or the session is `complete`, write only `label_points` (UPDATE, no INSERT/DELETE), and return the written rows' `{ id, server, gameType, status }`; `actions.ts` wraps both
  - [ ] Pure `applyGameWrites(points, writes)` returns the console's rows with the writes applied, so the console can be optimistic
  - [ ] `tests/label-game-operations.spec.ts` covers the 1-2-2 rotation over 9 points including a let at position 4, the normal-game case, the status rule (a point moved back to its seeded server returns to `unchanged`), and that no write names a key other than `server`, `game_type`, `status`
- **notes:** The existing per-point move dialog stays as it is. `labelPointStatusAfterChange` lives in `src/lib/services/labels/edit.ts`; `LabelGame` in `operations.ts`.

## T11 · Derive shot Result and Placement from the coordinates

- **status:** todo
- **model:** opus
- **files:** src/lib/services/labels/shot-derived.ts, src/components/admin/labels/court-placement.ts, src/components/admin/labels/label-console.tsx, tests/label-shot-derived.spec.ts, tests/label-console-edit.spec.ts (guess)
- **done when:**
  - [ ] A pure `deriveShotResult({ stroke, contact_x, contact_y, landing_x, landing_y })` in `src/lib/services/labels/shot-derived.ts` returns `null` when any coordinate is null; `"net"` when landing and contact are on the same side of the net (`y` compared with `NET_Y` = 11.885); for a `first_serve`/`second_serve`, `"in"` when the landing is within 6.4 m past the net, `|x| ≤ 4.115`, and on the opposite side of the centre line from the contact (contact x = 0 accepts either box); for any other stroke `"in"` when `|landing_x| ≤ 4.115` and `0 ≤ landing_y ≤ 23.77`; else `"out"`
  - [ ] A pure `shotPlacement(shot)` returns `serveZone(landing_x)` for a serve and `directionZone(landing_x, contact_x)` otherwise, importing both from `src/lib/services/splitstep/derivation/court.ts` — no second placement rule is written anywhere under `labels/`
  - [ ] `nextPlacement` (court-placement.ts) takes the shot being placed and, when the click completes a contact+landing pair, the returned patch carries `result: deriveShotResult(...)` alongside the coordinates — one autosave write; `LabelConsole.place` passes the selected shot
  - [ ] `tests/label-shot-derived.spec.ts` covers: a net ball, a serve into the correct box, a serve into the wrong box, a long rally ball, a wide rally ball, and a missing coordinate; `tests/label-console-edit.spec.ts` (or the court-placement spec) asserts the landing click's patch includes `result`
  - [ ] `label_shots.result` stays a stored column: `parseLabelShotPatch` still accepts `result`, and a row whose coordinates are incomplete keeps and shows its stored value
- **notes:** `court.ts` helpers use a net-centred frame (`y = 0` at the net); label coordinates have the near baseline at `y = 0`, so pass `y − NET_Y` where a helper needs depth. The Result select is removed from the shot row in T13, not here.

## T12 · Extract the point row and redesign it to 08g

- **status:** todo
- **model:** opus
- **needs:** T8, T9
- **files:** src/components/admin/labels/label-point-row.tsx (new), src/components/admin/labels/label-points-table.tsx, src/components/admin/labels/label-table-layout.ts, src/components/admin/labels/label-console.tsx, tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] `PointRow`, `DeletedPoint`, `PointFooter`, `PointStatus` and `MoveGameCell` move out of `label-points-table.tsx` into a new `label-point-row.tsx` (the table file shrinks by at least those functions); shot-row code is not touched
  - [ ] The point row's columns, in order, are: fold caret · winner mark · # · Time · Score · How it ended · Last shot · Rally · Note · Status · ⋯; `POINT_COLUMNS` reads "Won", "#", "Time", "Score", "How it ended", "Last shot", "Rally", "Note", "Status", and the header spec in `tests/label-console.spec.ts` asserts the new text
  - [ ] The winner mark is a 30px square chip with the player's initial — p1 on `--blue` with white text, p2 on `--surface-subtle` with a hairline — and is a `FloatMenu` trigger listing both players; choosing the other one calls `onPatchPoint(id, { winner })`; Time is the first live timed stroke's `formatVideoTime`; Score is `labelScores(points, adScoring).scoreBefore` (table computes once via `useMemo`, `LabelPointsTable` gains an `adScoring` prop the console passes from `session.adScoring`); Last shot is the last live stroke's `STROKE_LABEL`; Rally is the count of live strokes from the last serve inclusive (a point with a fault, second serve and two groundstrokes shows 3)
  - [ ] Note is an `EditableCell` text editor over `point.note` saving `{ note }`, showing "Add note" muted when empty; the console's `patchPoint` revert restores `note` on failure
  - [ ] The ⋯ menu holds Move to game… (the existing neighbour-games items and switch-server confirm), Reset (when `canResetPoint`) and Delete point; `tests/label-console.spec.ts` renders a fixture point and asserts the Score, Rally and Last shot cell text and the winner chip's initial
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` first. `label-points-table.tsx` is 1,229 lines and `label-console.tsx` 915 — the Read hook blocks files over 800 lines, read with offset/limit. Check `src/components/ui/player-mark.tsx` / `initials-avatar.tsx` before hand-rolling the chip. Status column = Checked chip, or Edited pill + Reset, or "To check" + check button, as today.

## T13 · Extract the shot row and redesign it to 08g

- **status:** todo
- **model:** opus
- **needs:** T11
- **files:** src/components/admin/labels/label-shot-row.tsx (new), src/components/admin/labels/label-points-table.tsx, src/components/admin/labels/label-table-layout.ts, tests/label-console.spec.ts, tests/label-console-edit.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] `ShotRows`, `ShotRow`, `DeletedShot` and `PositionCell` move out of `label-points-table.tsx` into a new `label-shot-row.tsx`; point-row code is not touched
  - [ ] `SHOT_COLUMNS` reads "Shot", "Time", "Player", "Stroke", "Hit at", "Landed at", "Placement", "Result", "Status" plus the unlabelled delete track; there are no Type, Spin or Speed columns; `SHOT_GRID`'s Hit at / Landed at tracks are at least 112px so a value like "−3.21, 18.40" renders without `truncate`/ellipsis (spec asserts the formatted value appears whole in the markup)
  - [ ] Result is rendered as text from `shot.result` with no `<select>` for it (spec: the selected row's editors no longer include a result select), and Placement is display-only text from `shotPlacement(shot)` with an em-dash when null
  - [ ] A typed edit in Hit at or Landed at (`PositionCell`) sends one patch carrying the coordinates AND `result: deriveShotResult(...)` of the row's values after the edit; `tests/label-console-edit.spec.ts` asserts the patch shape
  - [ ] Existing shot behaviours survive: fault rows muted, Added ring and pill, Edited pill + Reset, ✕ delete, `data-playing`/`data-selected` attributes — the existing shot assertions in `tests/label-console*.spec.ts` still pass (updated only for the column change)
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`. `label-points-table.tsx` exceeds the 800-line Read hook; read in slices. The shot's number column keeps the "both serves = 1" numbering the table has.

## T14 · Game bands with game-type and server dropdowns

- **status:** todo
- **model:** opus
- **needs:** T8, T10, T12
- **files:** src/components/admin/labels/label-game-band.tsx (new), src/components/admin/labels/label-points-table.tsx, src/components/admin/labels/label-console.tsx, src/app/admin/labels/[sessionId]/page.tsx, tests/label-console-operations.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] A `LabelGameBand` row is drawn before the first live point of every distinct `(set_number, game_number)`, reading "Set N · Game M" with M = `gameInSet` from T8 (a tiebreak band reads "Set N · Tiebreak", match tiebreak "Match tiebreak"), the set's `gamesBefore` score, and "<player> serves"; the spec renders the fixture and asserts the band count and text
  - [ ] The game-type control is a `FloatMenu` with Game / Tiebreak / Match tiebreak (current one checked) calling the console's `setGameType`; the server control is a `FloatMenu` listing both players calling `setGameServer`; neither renders when the console is read-only
  - [ ] `LabelConsoleOperations` gains `setGameServer` and `setGameType`, wired in `page.tsx` to the T10 actions, and the console applies them through `runOperation` with `applyGameWrites` as the optimistic step and the save-status line reporting the result — the only console edits are these two operations and the band props
  - [ ] After an optimistic server or type change the Score column re-derives (the spec asserts a point's `scoreBefore` text changes after `applyGameWrites` swaps the server), and bands never appear for deleted points alone
  - [ ] `label-points-table.tsx` only gains the band insertion loop and the two new callbacks; point and shot row files are not edited
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`. The per-point "Set · game" move cell from T12's ⋯ menu stays as the way to move one point.

## T15 · Follow playback with hold and "Now playing"

- **status:** todo
- **model:** fable
- **needs:** T12
- **files:** src/components/dashboard/matches/match-detail/film/use-follow-scroll.ts (new), src/components/dashboard/matches/match-detail/film/point-list.tsx, src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-points-table.tsx, tests/label-console.spec.ts, tests/film-follow-scroll.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] The hold-intent listeners (`wheel`, `touchmove`, `pointerdown` on the scroller's gutter, scrolling keys) and the keep-in-view / re-follow-jump scroll effect move out of `point-list.tsx` into a shared hook (e.g. `useFollowScroll`) that accepts either an element or `window` as the scroller; `point-list.tsx` calls the hook with its list element and its own constants, and no other line of `point-list.tsx` changes (diff limited to the extraction)
  - [ ] `LabelConsole` holds a `PointFocus` imported from `film-timeline.ts` (`{ mode: "follow" }` initially); the open point is `displayedPointId(focus, playingPointId)` while playing, so in follow mode the playing point is unfolded and scrolled into view by the hook, and its playing stroke carries `data-playing`; clicking a row or stroke holds that point (re-clicking the playing one re-follows), and a hand scroll holds with the displayed point — both via the hook
  - [ ] While held and a point is playing, a "Now playing · Point N" control (text from `followAffordance`) is rendered; pressing it sets focus back to follow; it is absent in follow mode and in dead time — `tests/label-console.spec.ts` renders both states through an `initialPointFocus` prop
  - [ ] Space, ← and → keep working as before; marking a point checked does not change focus
  - [ ] `docs/ui-revamp-guardrails.md` is read and the Video tab's behaviour is unchanged: the existing film specs pass and the new `tests/film-follow-scroll.spec.ts` exercises the hook's pure helpers (jump vs keep-in-view target computation) with the same inputs for both callers
- **notes:** A dashboard-surface change: `point-list.tsx` (1,615 lines) is a film file — guardrails apply, and the Read hook needs offset/limit. `film-timeline.ts`'s only runtime-free import is a type from `match-points-server`, so admin can import it (`label-film-stops.ts` already does). The admin page scrolls the body, not a list, which is why the hook must take `window`.

## T16 · Video dock: the Video tab's transport and a loading state

- **status:** todo
- **model:** opus
- **files:** src/components/admin/labels/label-video-dock.tsx, src/components/admin/labels/label-video.tsx, src/components/dashboard/matches/match-detail/film/film-transport.tsx, tests/label-video-dock.spec.ts, tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] The dock renders `FilmTransport` over the film's foot: title (ending · last stroke of the playing point), subtitle ("Set N · Game M · <player> serves"), "Point N / total", the set-by-set track from `setSegments` over `labelFilmStops`, play/pause, previous/next point, clock, skip dead time, rate, loop, sound, minimise — and no scoreboard element (spec asserts no `Scoreboard` role/aria-label in the dock markup)
  - [ ] `film-transport.tsx` changes only by two optional props (e.g. `showSaved`, `showCourt`) defaulting to today's behaviour, so the Video tab renders exactly as before; no other `film-*` file changes
  - [ ] While the video element has not reached `canplay` (or `readyState < 3`), the dock shows a loading state (`FilmFramePending` or the design system's skeleton) in the frame with the transport disabled; once playable the frame shows the video — a spec renders the dock with an `initialReady={false}` prop and asserts the pending markup
  - [ ] The minimised pill keeps its play/pause and "Point N" label; the drag handle, corner storage key and `dockRest` geometry are unchanged (`tests/label-video-dock.spec.ts` still passes)
  - [ ] `LabelVideoHandle` gains what the transport needs (`seek(seconds)`, `cycleRate`, `toggleLoop`, `toggleMute`, `toggleSkipDeadTime`) and the console's Space/←/→ keys still call the same handle
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` (film-transport is a dashboard file). `FilmPlayer` is already mounted in passthrough mode by `label-video.tsx`; check whether its own control bar must be hidden when the transport takes over. The Video tab's fullscreen room must look and behave the same.

## T17 · Court widget as its own floating card with half-court zoom

- **status:** todo
- **model:** opus
- **needs:** T11
- **files:** src/components/admin/labels/label-court-dock.tsx (new), src/components/admin/labels/label-court-position.ts (new), src/components/admin/labels/label-court.tsx, src/components/admin/labels/court-geometry.ts, src/components/admin/labels/court-placement.ts, src/components/admin/labels/label-console.tsx, tests/label-court-geometry.spec.ts, tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] The court leaves the band (`data-label-band` is gone from the console) and renders in a new `LabelCourtDock`: a 300×318 dark card using `useCornerDrag` with its own `storageKey` (`labels-court-corner`) and minimised key, default anchor `bottom-left` (the video's stays `bottom-right`), its own minimise pill, and a `rest` that never overlaps the video's default corner — `tests/label-video-dock.spec.ts`-style assertions cover the rest geometry and the distinct keys
  - [ ] Not placing: the whole court (`COURT_VIEW_BOX`) draws read-only with the open point's marks and no shot list beside it; placing (a shot selected and editable): the card zooms to one half with a clickable surround — pure `halfCourtViewBox(half)` and `toCourtInHalf`/`fromCourtInHalf` helpers in `court-geometry.ts`, round-trip-tested in `tests/label-court-geometry.spec.ts`
  - [ ] `PlacementState` gains `half: "near" | "far"` and `flipped: boolean`: Contact targets the hitter's half (the shot's existing `contact_y` side, else the opposite of the previous live stroke's contact, else near), Landing targets the other half, "Flip side" (an `aria-pressed` button) inverts it for a net ball; a Contact/Landing segmented control sets `target` directly — all pure in `court-placement.ts` with a spec
  - [ ] A click in the surround still writes a coordinate (out balls), and the completed pair's patch carries the derived `result` from T11
  - [ ] `tests/label-console.spec.ts` renders the console with a selected shot and asserts the half-court viewBox and the Contact/Landing control, and with no selection asserts the whole-court viewBox
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md`; board 08i is the spec (300×318, dark card, run-off clickable). `label-console.tsx` is 915 lines — Read with offset/limit. The video dock (T16) and this card are independent files; coordinate only on default corners.

## T18 · Tell duplicate jobs apart on the Labels list

- **status:** todo
- **model:** sonnet
- **files:** src/components/admin/labels/labels-table.tsx, src/components/admin/labels/labels-table-layout.ts, tests/labels-table.spec.ts (guess)
- **routes:** /admin/labels
- **done when:**
  - [ ] Each row shows a "Job" column with the job's `completedAt` formatted as date + time and the first 8 characters of `jobId` in mono; `LABELS_COLUMNS` gains the column so the header names it
  - [ ] A new offline spec (`createLoader` from `tests/fixtures/vm-modules.ts`) renders `LabelsTable` with two rows for the same players and different `jobId`/`completedAt` and asserts both short ids and both times appear
  - [ ] A row with `completedAt: null` renders an `EmptyMark` in the Job column instead of "Invalid Date"
- **notes:** `listLabelJobs` already returns `completedAt` and `jobId`; no loader change needed. Live check: no two completed jobs currently share a match, so the fixture is the proof.
