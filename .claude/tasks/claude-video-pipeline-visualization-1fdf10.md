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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
- **model:** sonnet
- **files:** src/components/admin/labels/labels-table.tsx, src/components/admin/labels/labels-table-layout.ts, tests/labels-table.spec.ts (guess)
- **routes:** /admin/labels
- **done when:**
  - [ ] Each row shows a "Job" column with the job's `completedAt` formatted as date + time and the first 8 characters of `jobId` in mono; `LABELS_COLUMNS` gains the column so the header names it
  - [ ] A new offline spec (`createLoader` from `tests/fixtures/vm-modules.ts`) renders `LabelsTable` with two rows for the same players and different `jobId`/`completedAt` and asserts both short ids and both times appear
  - [ ] A row with `completedAt: null` renders an `EmptyMark` in the Job column instead of "Invalid Date"
- **notes:** `listLabelJobs` already returns `completedAt` and `jobId`; no loader change needed. Live check: no two completed jobs currently share a match, so the fixture is the proof.

## T19 · Viewport-fit: the table scrolls, the page does not

- **status:** done
- **model:** opus
- **files:** src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-points-table.tsx, src/app/admin/labels/[sessionId]/page.tsx, tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] The console renders inside one root element (`data-label-console`) that is a flex column filling the admin page's remaining viewport height — `page.tsx` passes `AdminPage` a className bounding `main` to `calc(100dvh - var(--header-h))` with `overflow-hidden` (its `pb-[72px]` reduced for this page), the header row + save line sit above, and the table card is `min-h-0 flex-1 overflow-y-auto` (keeping `overflow-x-auto`) so the body never scrolls; the point column header is `sticky top-0 z-10` on `bg-[var(--surface-card)]` inside that scroller
  - [ ] `LabelPointsTable` / `LabelPointsTableView` accept a `scrollerRef: RefObject<HTMLDivElement | null>` forwarded onto the scroll element (`data-label-scroller`), and the console's `useFollowScroll` call passes `scroller: scrollerRef` instead of `"window"` (the `insets` from `followInsets` are still passed — T24 turns them off for docked modes)
  - [ ] The "Now playing" pill (`data-label-follow-pill`) moves from `fixed top-3` on the viewport to `absolute top-3 left-1/2` inside a `relative` wrapper around the scroller, so it sits over the table, not over the page header
  - [ ] `tests/label-console.spec.ts` asserts `data-label-scroller` is present, the point header inside it carries `sticky`, and a held render's pill markup carries no `fixed` class; every existing label spec still passes
  - [ ] No file under `src/components/dashboard/matches/match-detail/film/` changes
- **notes:** Admin layout = `min-h-screen flex-col` → sticky `--header-h` header → `flex flex-1` around `AdminPage`'s `main` (`px-14 pt-7 pb-[72px]`). `label-console.tsx` is 1,202 lines — Read with offset/limit. The floating docks are `fixed` and unaffected. `useFollowScroll` already accepts an element ref (`FollowScroller`).

## T20 · Game headers from the points rail, column headers from the DS

- **status:** done
- **model:** opus
- **needs:** T19
- **files:** src/components/admin/labels/label-game-band.tsx, src/components/admin/labels/label-points-table.tsx, src/components/admin/labels/label-point-row.tsx, tests/label-console.spec.ts, tests/label-console-operations.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] `LabelGameBand` drops its `bg-[var(--surface-subtle)]` ground, `-mx-6` bleed, `h-9` and `mt-4`, and takes the points rail's game header (`LIST_TONE.light` in `point-list.tsx`): `flex items-center px-3 pt-3 pb-[5px]`, left label "Set N · Game M" (or Tiebreak / Match tiebreak) in `mono text-[9px] tracking-[1.4px] uppercase` ink-400, a `flex-1` spacer, right meta "{gamesBefore} · {player} serves" ("serves first" for a tiebreak) in `mono tabular text-[10px]` ink-400; the `SideMark` chip goes (the rail draws none)
  - [ ] The game-type and server `FloatMenu` triggers (`data-game-menu="type"` / `"server"`) stay in the band, still call `onSetGameType` / `onSetGameServer` with the same rows, and their trigger text takes the rail's classes (hover wash and open state unchanged); a read-only console renders the same text with no buttons; `data-game-band` / `data-game-type` attributes stay
  - [ ] The point column header cells (`POINT_COLUMNS` loop in `label-points-table.tsx`) and the shot column header cells (`SHOT_COLUMNS` loop in `label-point-row.tsx`) use the DS `eyebrow-sm` class instead of `text-[12px] text-[var(--ink-500|400)]`; the hairline under the point header, the `POINT_CELL` offsets/`text-right` and T19's sticky header are kept; nothing is centred
  - [ ] `tests/label-console.spec.ts` asserts every point and shot header label sits in an element carrying `eyebrow-sm`, and that the band `data-game-band="1-1"`'s markup contains no `surface-subtle` and reads "Set 1 · Game 1" before its games score before "serves"; `tests/label-console-operations.spec.ts`'s band assertions pass (updated only for the removed chip)
  - [ ] `point-list.tsx` is not edited
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` + `reference/tables.md` + `reference/foundations.md` (eyebrows: "`.eyebrow-sm` — table column headers, in-table group dividers"; shipped in `admin/requests-table.tsx`). Band = the rail's look as the user asked (its mono 9px/1.4px/ink-400 is `.eyebrow-sm` in mono); column headers = DS. The rail's header is at `point-list.tsx` ~lines 180–183 and 631–641.

## T21 · The playing row's 2px blue progress rule

- **status:** done
- **model:** opus
- **needs:** T19
- **files:** src/components/admin/labels/label-video.tsx, src/components/admin/labels/label-video-dock.tsx, src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-points-table.tsx, src/components/admin/labels/label-point-row.tsx, src/components/admin/labels/label-row-parts.tsx, tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] `LabelVideoPlayer` gains an optional `clockTargetRef?: RefObject<HTMLElement | null>` and writes `--film-t` / `--film-d` onto it as well as onto its own frame through a second `useFilmClockVars(videoRef, clockTargetRef ?? NULL_REF, playing)` call (film-clock.ts, unchanged) — no hand-rolled rAF or timer anywhere under `labels/`; `LabelVideoDock` forwards the prop; the console passes a ref to its T19 root so every table row inherits the variables
  - [ ] The console derives the playing point's window in FILE seconds from `labelFilmStops(points, video?.startTimeSeconds ?? 0)` (the stop whose `point.id === playingPointId`) and hands `{ start, end }` to the table as `playingWindow`; `EditContext` (or a `PointRow` prop) carries it to the playing row only
  - [ ] `PointRow` is `relative` and, only when `playing`, draws an `aria-hidden` span `absolute bottom-0 left-0 h-0.5 bg-[var(--blue)]` with `style.width = filmProgressWidth(start, end)` imported from `film-clock.ts` — the rail's `PointRow` rule, same classes
  - [ ] `tests/label-console.spec.ts` renders with `initialVideoTime` inside a fixture point and asserts the playing row's markup contains `h-0.5 bg-[var(--blue)]` with a width starting `clamp(0%, calc((var(--film-t, 0) -`, that a non-playing row has none, and that a dead-time render has none
  - [ ] `film-clock.ts`, `point-list.tsx` and `film-transport.tsx` are not edited
- **notes:** The mechanism is `point-list.tsx` lines ~1151–1160 + `film-clock.ts`: CSS variables written per frame, rows never re-render. `--film-t` is the `<video>`'s FILE clock, which is why the window comes from `labelFilmStops` (file seconds), not from `playingRowAt` (analysis clock). The video dock is a DOM child of the console root even when `fixed`, so one target serves both the transport track and the rows.

## T22 · Court marks one at a time, fading; a selected shot alone

- **status:** done
- **model:** fable
- **files:** src/components/dashboard/matches/match-detail/film/film-court.ts, src/components/dashboard/matches/match-detail/film/film-court-card.tsx, src/components/admin/labels/label-court-marks.ts (new), src/components/admin/labels/label-court.tsx, src/components/admin/labels/label-court-dock.tsx, src/components/admin/labels/label-console.tsx, tests/label-court-marks.spec.ts (new), tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] The only film edits are exports: `film-court.ts` exports its private `bounceEventTime`, and `MARK_FADE_TRANSITION` + `MARK_IN_ANIMATION` are exported from `film-court-card.tsx` (or moved to `film-court.ts` and imported back) — no other line in any `film-*` file changes, every `tests/film-*.spec.ts` passes unchanged, and `docs/ui-revamp-guardrails.md` is read first
  - [ ] New pure `label-court-marks.ts`: `courtMarksAt(shots, filmTime)` takes the open point's live, timed strokes in `videoTime` order and returns, per stroke, `{ shotId, contactOpacity, landingOpacity }` where `contactOpacity = markOpacity(filmTime, videoTime)` and `landingOpacity = markOpacity(filmTime, bounceEventTime({ contactTime: videoTime }, nextVideoTime))`, both imported from `film-court.ts`; strokes with both at 0, tombstones and untimed strokes are omitted; `courtMarksKey(marks)` returns a string snapshot. Both clocks are the analysis clock (label `videoTime` and the console's `VideoClock`), so no offset conversion; coordinates stay `LabelCourt`'s own metres→percent (`fromCourt` / `fromCourtInHalf`), never `toCourtPercent`
  - [ ] `LabelCourt` accepts per-stroke `opacity: { hit, landed }` (default 1 each) and draws each end at its opacity with `transition: MARK_FADE_TRANSITION` and `animation: MARK_IN_ANIMATION`, the dashed path at the lesser of the two, an end at 0 not drawn; the `strength()` dimming of unlit strokes is removed in favour of these opacities; the `--blue` target ring is unchanged
  - [ ] `LabelCourtDock` gains a `clock: VideoClock` prop (the console passes its `clock`) and subscribes with `useSyncExternalStore(clock.subscribe, () => courtMarksKey(courtMarksAt(…)))` so the card re-renders on an opacity step while the console does not. With `placement.shotId === null` the whole-court view draws only `courtMarksAt`'s marks (never the whole point at once); with a shot selected — `placement.shotId !== null`, editable or not — it draws ONLY that shot's contact/landing at full opacity, a blank court when it has none; the half-court zoom, Contact/Landing switch, Flip side and the `onPlace` → `nextPlacement` patch (coordinates + derived `result`) are unchanged — `tests/label-court-dock.spec.ts` and the placement assertions in `tests/label-console.spec.ts` pass
  - [ ] `tests/label-court-marks.spec.ts` covers: before contact → omitted; within `MARK_HOLD_SECONDS` → 1; the landing appears at the estimated bounce time, not at contact; after hold + `MARK_FADE_SECONDS` → omitted; the last stroke uses `BOUNCE_REVEAL_SECONDS`; `tests/label-console.spec.ts` renders (a) `initialVideoTime` at a fixture stroke's time with no selection and asserts one `data-court-hit` and that an earlier, faded stroke's is absent, (b) a selected shot and asserts at most one `data-court-hit` and one `data-court-landed`, (c) a selected shot without coordinates and asserts the `data-court-marks` svg holds no `<circle>`
- **notes:** Opacity is a pure function of film time (film-court.ts header): pausing freezes the court, seeking back un-draws. `MARK_OPACITY_STEP` quantises, so the key changes at most ~20 times per mark. The fade-in keyframe `film-mark-in` already lives in `globals.css`. The Video tab's `FilmCourt` must render identically. `label-console.tsx` edits = the `clock` prop only.

## T23 · Click a shot: loop that shot

- **status:** done
- **model:** opus
- **files:** src/components/admin/labels/label-shot-loop.ts (new), src/components/admin/labels/label-video.tsx, src/components/admin/labels/label-console.tsx, tests/label-shot-loop.spec.ts (new) (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] Pure `shotLoopWindow(point, shotId, offset)` in new `label-shot-loop.ts` returns FILE-second `{ start, end }`: `start` = the stroke's `videoTime − offset` clamped at 0; `end` = the next live timed stroke's `videoTime − offset`; for the point's last stroke `min(videoTime + SHOT_LOOP_TAIL_SECONDS, that point's stop end from labelFilmStops)` on the file clock; `null` when the stroke is deleted or has no `videoTime`; `SHOT_LOOP_TAIL_SECONDS` exported (1.5)
  - [ ] `LabelVideoHandle` gains `loopShot(window: { start: number; end: number } | null)`: `label-video.tsx` holds the window in a ref, seeks to `start` and plays when one is set, and in `onPlayhead` — before the point-loop check — seeks back to `start` once `t >= end − REACHED_EPSILON_SECONDS`; `togglePlay()`, `seek()` (the transport/track) and `step()` clear the window; the transport's Loop button, `looping` state and the `L` key keep meaning "loop the point"
  - [ ] The console's `selectShot` calls `player.current?.loopShot(shotLoopWindow(owner, shotId, offset))` in place of `seekTo`; `togglePoint` and `followPlayback` (the Now-playing pill) call `loopShot(null)` first (togglePoint then seeks the point as today); no other console line changes
  - [ ] `tests/label-shot-loop.spec.ts` covers: a middle stroke's window ends at the next stroke; the last stroke's window uses the tail and is capped by the point end; a `null` `videoTime` → null; a non-zero offset is subtracted and the start never goes below 0
  - [ ] `film-player.tsx` and `film-timeline.ts` are not edited
- **notes:** `label-video.tsx` already runs the point loop and skip-dead-time from `film-timeline.ts` helpers (`onPlayhead`); the shot loop is a second, higher-priority window in the same function. `useImperativeHandle` does not run in a static render, so the handle is covered by typecheck + the pure spec, not by `renderToStaticMarkup`. T22 makes the court show only the selected shot while this loops.

## T24 · Layout modes: Overlay, Docked top, Docked side

- **status:** done
- **model:** fable
- **needs:** T19, T21, T22, T23
- **files:** src/components/admin/labels/label-layout.ts (new), src/components/admin/labels/label-layout-control.tsx (new), src/components/admin/labels/label-court-panel.tsx (new), src/components/admin/labels/label-court-dock.tsx, src/components/admin/labels/label-console.tsx, tests/label-layout.spec.ts (new), tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] Pure `label-layout.ts`: `type LabelLayoutMode = "overlay" | "docked-top" | "docked-side"`, `DEFAULT_LAYOUT_MODE = "overlay"`, `LAYOUT_MODE_STORAGE_KEY = "labels-layout-mode"`, `LAYOUT_SIZE_STORAGE_KEY = "labels-layout-size"`, `parseLayoutMode(raw)` (anything unknown → overlay), `DEFAULT_DOCK_SIZE` per docked mode, `MIN_DOCK_PX`, `MIN_TABLE_PX`, and `clampDockSize(mode, px, available)`; `tests/label-layout.spec.ts` covers the parse fallback, both clamp ends, and that a viewport smaller than both minimums yields `MIN_DOCK_PX` rather than a negative table
  - [ ] The court card's body — readout header, `LabelCourt`, Contact/Landing switch, Flip side, legend — moves out of `label-court-dock.tsx` into `LabelCourtPanel` (new `label-court-panel.tsx`), which `LabelCourtDock` renders inside its floating shell; Overlay is unchanged (`tests/label-court-dock.spec.ts` and the console's court assertions pass as they are)
  - [ ] A "Layout" `FloatMenu` trigger (`data-label-layout`) in the console header beside the save line lists Overlay / Docked top / Docked side with `chosen` on the current mode; the mode is read in a lazy initialiser via `parseLayoutMode(localStorage)` and written on change; an `initialLayoutMode` prop exists for specs
  - [ ] Overlay renders `LabelVideoDock` + `LabelCourtDock` exactly as today, with `followInsets`; `docked-top` renders a band above the table (`data-label-dock="top"`) holding `LabelVideoPlayer` (the same `player` ref, `readout` from `dockReadout`, `onTime={clock.set}`, `clockTargetRef`) and `LabelCourtPanel` side by side; `docked-side` renders a right column (`data-label-dock="side"`) with the player above the court panel and the table on the left; in docked modes the band/column is `DEFAULT_DOCK_SIZE`, there is no corner drag and no minimise pill, the transport stays, and `useFollowScroll` gets no `insets`; the table keeps `min-h-0 flex-1`
  - [ ] `tests/label-console.spec.ts` renders each mode via `initialLayoutMode` and asserts: overlay → no `data-label-dock` and the existing dock assertions hold; docked-top → `data-label-dock="top"` containing `data-label-video-frame` and `data-court-art` and no `data-dock-minimised`; docked-side → the same with `"side"`; a selected shot in a docked mode still yields `data-court-view="near"|"far"`
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` first. The decided three modes: Overlay = today's floating cards; Docked top = video and court side by side above the table; Docked side = video over court in a right column. Switching mode remounts the `<video>` — re-seek to `clock.get()` once `canplay` if it fits, else say so in the report. `dockReadout` / `DockNowPlaying` are already exported from `label-video-dock.tsx`. `label-console.tsx` edits: the mode state, the header control, and one branch choosing which of the two renderings to mount.

## T25 · Drag the divider between the dock and the table

- **status:** done
- **model:** opus
- **needs:** T24
- **files:** src/components/admin/labels/label-divider.tsx (new), src/components/admin/labels/label-layout.ts, src/components/admin/labels/label-console.tsx, tests/label-layout.spec.ts, tests/label-console.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] `LabelDivider` renders `role="separator"`, `aria-orientation="horizontal"` in docked-top and `"vertical"` in docked-side, `aria-valuemin` / `aria-valuemax` / `aria-valuenow` in px, `aria-label="Resize video and court"`, `tabIndex={0}`; Arrow Up/Down (top) or Left/Right (side) move by `DIVIDER_KEY_STEP_PX` (new in `label-layout.ts`, 16), Home/End go to min/max; pointer drag uses `pointerdown` + `setPointerCapture` + `pointermove` / `pointerup` — no HTML5 drag-and-drop
  - [ ] The dock size lives in console state, clamped through `clampDockSize`, persisted under `LAYOUT_SIZE_STORAGE_KEY` as `{ "docked-top": px, "docked-side": px }` and read in a lazy initialiser; the band's height / column's width is an inline style from it and the table takes the rest (`min-h-0 flex-1`); an `initialDockSize` prop exists for specs
  - [ ] `clampDockSize` honours `MIN_DOCK_PX` (the video stays ≥ 240px tall in docked-top / ≥ 360px wide in docked-side) and `MIN_TABLE_PX` (≥ 240px); `tests/label-layout.spec.ts` gains a case per bound and one for the key step
  - [ ] `tests/label-console.spec.ts` renders docked-top with `initialDockSize` and asserts the separator's `aria-valuenow`, `aria-orientation` and the band's inline height; docked-side asserts the column's inline width; overlay renders no `role="separator"`
  - [ ] `use-corner-drag.ts` and the Overlay rendering are not edited
- **notes:** The DS has no divider primitive and nothing in `src/` renders `role="separator"` with a value yet; hand-build (appearance-only, SKILL.md's "hand-build" row), `--border-hairline` at rest, `--blue` while dragging/focused, 8px grab area. Reorder Mode's rule applies: pointer drag, never native DnD.

## T26 · Spin on label shots

- **status:** done
- **model:** fable
- **files:** supabase/migrations/20261004060000_label_shots_spin.sql, src/lib/services/labels/seed.ts, src/lib/services/labels/session.ts, src/lib/services/labels/edit.ts, src/lib/services/labels/reset.ts, src/lib/data/labels-server.ts, tests/fixtures/label-session.ts, tests/label-edit.spec.ts, tests/label-seed.spec.ts (guess)
- **done when:**
  - [ ] A new migration adds nullable `spin text` to `public.label_shots` with `check (spin in ('topspin', 'flat', 'backspin', 'sidespin'))`, backfills `spin` on existing rows from `vendor->>'spin_type'` where that value is one of the four, and adds the same value as a `spin` key to each backfilled row's `seed` jsonb (rows with a null `seed` are left alone); it contains no statement touching `points`, `shots`, `matches` or `processing_jobs`
  - [ ] `LabelSpin` type and `LABEL_SPINS` list exist; `LabelShot` gains `spin: LabelSpin | null` and `LabelShotSeedValues` gains `spin`; `buildLabelSeed` seeds it from the stroke's vendor spin (anything outside the four → null) for transcript shots and for dropped strokes alike; `getLabelSession` selects and maps it
  - [ ] `spin` is an editable shot value: it is in `LABEL_SHOT_VALUE_FIELDS`, `parseLabelShotPatch` accepts the four values and null and rejects anything else, a shot whose spin differs from its seed is `edited` and one set back is `kept`, and Reset restores the seeded spin — specs assert each; a stored seed with no `spin` key parses as `spin: null` rather than failing
  - [ ] `tests/fixtures/label-session.ts` shots carry `spin`, and `npm run typecheck` passes
- **notes:** Do NOT apply the migration — the orchestrator applies it through the Supabase MCP and renames the file to the live version. Live check 2026-10-04: `label_shots.vendor->>'spin_type'` holds topspin 1148, flat 330, backspin 112, sidespin 61, "None" 1. No auto-fix: the seed copies the vendor's value as is. The row UI is T27.

## T27 · Shot row: Spin column, no crest, no target icon, DS dropdowns

- **status:** done
- **model:** opus
- **needs:** T20, T26
- **files:** src/components/admin/labels/label-shot-row.tsx, src/components/admin/labels/label-cells.tsx, src/components/admin/labels/label-table-layout.ts, src/components/admin/labels/label-format.ts, tests/label-console.spec.ts, tests/label-console-edit.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] `SHOT_COLUMNS` reads "Shot", "Time", "Player", "Stroke", "Spin", "Hit at", "Landed at", "Placement", "Result", "Status" plus the unlabelled delete track; the Spin cell shows the shot's spin in the words the match Video tab uses for the same vendor values (reuse that label source; an em-dash when null) and, on an editable row, is a dropdown saving `{ spin }`; the Hit at / Landed at tracks stay at least 112px and the spec's whole-coordinate assertion still passes
  - [ ] The shot row's Player cell renders the name only — no `SideMark` chip (`data-player-mark` is gone from shot rows; the point row's winner chip is untouched)
  - [ ] The hover/selected `Crosshair` glyph and its tooltip are removed from the Placement and Result cells; both stay display-only text with `data-calculated`
  - [ ] Every dropdown in the point and shot rows (How it ended, Player, Stroke, Spin) renders through the design system's menu (`MenuSelect` in `src/components/ui/menu-select.tsx`, or `FloatMenu`) instead of a native `<select>`: `SelectEditor` in `label-cells.tsx` no longer renders `<select`, keeps its props and commit/cancel contract, and specs assert no `<select` in a rendered table and that choosing an option sends the same single-field patch as before
  - [ ] `label-point-row.tsx`, the court and the video files are not edited
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` and its components/tables references first. User's words: "remove the target icon on hover for the shot rows, make sure that the rows have spin, remove the crest from the shot rows, make sure the dropdown menu follows the DS". Never create `foo.tsx` beside `foo.ts`; off-palette hex fails the design-drift spec.

## T28 · How it ended follows the shot rows

- **status:** done
- **model:** opus
- **files:** src/lib/services/labels/ending-derived.ts (new), src/components/admin/labels/label-console.tsx, tests/label-ending-derived.spec.ts (new), tests/label-console-operations.spec.ts (guess)
- **routes:** /admin/labels/54097a66-c5f1-4697-a85f-8a97e5a8f947
- **done when:**
  - [ ] A pure `deriveEnding(point)` in new `src/lib/services/labels/ending-derived.ts` reads the point's live (non-deleted) strokes in video order and its labelled `winner`, and returns `{ ending, endedBy } | null`: no live stroke → null; the last live stroke is a serve whose `result` is `out` or `net` → `double_fault` when it is a `second_serve` or an earlier live serve exists, else null; the last live stroke is a serve otherwise → `ace`; the last live stroke is not a serve and its `result` is `out` or `net` → `service_winner` when it is the first stroke after the last serve (the return), else `error`; the last live stroke is not a serve and its `result` is `in` or null → `winner` when its hitter is the point's `winner` or the winner is null, else `error`; `endedBy` is the last live stroke's hitter
  - [ ] In the console, every shot change — a field patch (including the derived `result` a court click or typed coordinate carries), delete, undo, add, reset — compares `deriveEnding` of the point before and after the change; only when the two differ and the new one is non-null and not already the point's `ending`, the console sends ONE point patch `{ ending, ended_by }` through the existing point autosave (optimistic, save line, revert on failure); a shot change that leaves the derived ending the same sends no point patch, so an ending set by hand survives unrelated shot edits
  - [ ] Points whose `ending` is `let_replayed` or `not_a_point` are never rewritten by a shot change
  - [ ] `tests/label-ending-derived.spec.ts` covers: unreturned serve → ace; return into the net → service winner; second serve out → double fault; lone faulted first serve → null; last rally ball out → error; last rally ball in by the winner → winner; last ball in by the loser → error; deleted trailing stroke ignored; and a console-level spec asserts a shot patch that flips the last stroke to `out` produces exactly one point patch `{ ending: "error", ended_by }` while a spin edit produces none
  - [ ] No server file changes: the point patch goes through the existing `updateLabelPoint` action, and labels code still writes only `label_*` tables
- **notes:** User's words: "How it ended should updated based on the updates done on the shot rows". The point's `winner` is NOT changed by this task (it is labelled directly); say so in the report if the derived ending contradicts it. `label-console.tsx` is ~1,500 lines — Read with offset/limit; keep the console edit to one helper called from the shot paths.
