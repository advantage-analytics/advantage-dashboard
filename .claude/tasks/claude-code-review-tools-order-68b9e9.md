# Tasks — claude/code-review-tools-order-68b9e9

> Scope: fixes from the final-pass codebase review — Surface 1 (data + access layer) findings; later surfaces append here.

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

## T1 · Make pickServeShotBy return undefined when a point has no serve row

- **status:** done
- **model:** sonnet
- **files:** src/lib/data/serve-return-shots.ts, tests/serve-return-shots.spec.ts (new) — guess
- **done when:**
  - [ ] `pickServeShotBy` (and so `pickServeShot`) returns `undefined` for a shot list with no `First Serve`/`Second Serve` row — the `?? shots[0]` fallback at serve-return-shots.ts:47 is gone; it still returns the Second Serve row when both serve rows exist and the First Serve row when only that one exists
  - [ ] A new pure spec `tests/serve-return-shots.spec.ts` (imports `@/lib/data/serve-return-shots` directly, the way `tests/serve-placement-caption.spec.ts` imports its module) asserts those three cases plus `[Feed, Forehand] → undefined`, and passes
  - [ ] The four callers compile unchanged — `match-points-server.ts:323`, `viz-model.ts:372`, `home-serve-data.ts:88`, `player-profile-server.ts:286` all already handle `undefined` — and `npm run typecheck` passes
  - [ ] `npx playwright test tests/viz-model.spec.ts tests/viz-serve-zones.spec.ts tests/serve-return-shots.spec.ts` passes
- **notes:** The fallback is how a truncated read plots a Feed row's landing coordinates as a serve (see T3): rows arrive feeds-first, many points keep only their Feed row, and `shots[0]` is that row. viz-model's `resolvedServe` already falls back to `p.firstShot*` when `shot` is undefined (covered at tests/viz-model.spec.ts:2506). Update the JSDoc on `pickServeShotBy` to say it is `undefined` when the point has no serve row.

## T2 · Add a fail-closed paged-read helper and use it for match shots

- **status:** done
- **model:** opus
- **files:** src/lib/data/paged-query.ts (new), src/lib/data/match-points-server.ts, tests/paged-query.spec.ts (new) — guess
- **done when:**
  - [ ] A new helper in `src/lib/data/` — shape: `fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, pageSize = 1000): Promise<T[] | null>` — loops `.range()` pages until a short page, returns every row concatenated in order, and returns `null` on the first page error, never a partial list
  - [ ] `getMatchPointsFromSupabase`'s shots loop (`match-points-server.ts:281-301`) is replaced by that helper; a page error now `console.error`s and the function returns `[]` instead of points with half their shots, matching the rule `match-video-attachment-server.ts:345-347` states for its own paged reads
  - [ ] A new spec drives the helper with a fake page function: 2,500 rows arrive as pages of 1000/1000/500 with every row present and in order; an error injected on page 2 yields `null`, and `getMatchPointsFromSupabase` (loaded through `tests/fixtures/vm-modules.ts` with `@/lib/supabase/server` stubbed, or the shots read extracted into an exported function that takes the client) yields `[]` with exactly one `console.error`
  - [ ] `npm run typecheck` and `npm run lint` pass; `tests/viz-model.spec.ts` and `tests/film-court.spec.ts` still pass
- **notes:** Intent 4 plus the helper T3/T4/T8 build on. Keep the helper a plain function of a page closure (no Supabase generics beyond the `{ data, error }` shape) so any `.from().select()…range()` chain fits, and keep the total ordering `(point_id, shot_number, id)` — pages overlap without it. `getMatchPointsFromSupabase` creates its own client (`createClient()` at line 254), hence the stub-or-extract choice for the test. Precedents for a chainable fake client: tests/schedule-outcome-loader.spec.ts, tests/insights-workspace-history.spec.ts.

## T3 · Page the Home serve read and select serve rows only

- **status:** done
- **model:** opus
- **needs:** T1, T2
- **files:** src/lib/data/home-serve-data.ts, tests/home-serve-data.spec.ts (new) — guess
- **done when:**
  - [ ] The shots select in `loadHomeServes` (home-serve-data.ts:62-68) filters `.in("shot_type", ["First Serve", "Second Serve"])`, orders totally (`point_id`, `shot_number`, `id`) and reads through T2's helper in pages of 1000; a page error throws (or returns `{ dots: [], matchCount }` after a `console.error`) rather than plotting a partial set
  - [ ] `pickReturnShot` and the `secondShot*`/`rallyLength` fields are dropped from this loader — `pointToServeDot` reads only `firstShot*` (serve-zones.ts:268-283) and `ServeDot` carries no return field, so they were dead once the select is serve-only — and the "Fetch every shot … so each point's return can be located" comment is rewritten to match
  - [ ] A new spec drives `loadHomeServes(fakeSupabase, userId, matches)` with 4 matches × 300 serve points (1,200 rows, two pages): every player-1 first-serve point yields a dot, and a fixture point whose only row is a `Feed` row yields no dot
  - [ ] `npm run typecheck` passes; `tests/home-streaming.spec.ts`, `tests/home-empty-loading.spec.ts` and `tests/serve-placement-caption.spec.ts` still pass
- **notes:** Intent 1(b). Live data is up to 949 shot rows per match (≈250 serve rows), so 4 matches of every shot is 2,000–3,000 rows against the 1,000-row cap; serve-only lands near the cap, so page anyway. `serve-placement-home.tsx` consumes only `dots`/`matchCount` — no component edit, so the widget-states hook should not fire; if it does, the widget's states are unchanged. Read `docs/ui-revamp-guardrails.md` first: the `serverIsPlayer1` gate at the bottom of the loop is what keeps opponent serves out of the aggregate — do not touch it.

## T4 · Page the player-profile serve map read

- **status:** done
- **model:** sonnet
- **needs:** T2
- **files:** src/lib/data/player-profile-server.ts, tests/player-profile-serve-map.spec.ts (new) — guess
- **done when:**
  - [ ] `serveMapFor` (player-profile-server.ts:251-268) reads its serve rows through T2's helper in pages of 1000 with a total order (`point_id`, `shot_number`, `id`), keeping the existing `.in("shot_type", …)` filter; a page error returns `{ zoneStats: null, matchCount: 0, serves: 0 }` (or throws) rather than a partial map
  - [ ] `serveMapFor` is exported (it already takes the client as its first argument) and a new spec drives it with a fake client returning 10 matches × 220 serve rows (2,200 rows, three pages): `matchCount` is 10 and `serves` equals the number of fixture serve points served by the profile's side
  - [ ] `npm run typecheck` passes; `tests/player-profile.spec.ts` still passes
- **notes:** Intent 2. Live: ~2,000 serve rows across the 10 most recent matches, so today the "read from N matches" figure counts matches whose serves were never returned. Precedent for the chainable fake client: tests/schedule-outcome-loader.spec.ts.

## T5 · Remove the unread playerAverages from the match page

- **status:** done
- **model:** sonnet
- **files:** src/lib/data/match-detail-server.ts, src/app/dashboard/matches/(detail)/[matchId]/layout.tsx, src/components/dashboard/matches/match-data-provider.tsx
- **done when:**
  - [ ] `grep -rn playerAverages src` returns nothing: the `getPlayerAverageStats(…)` branch is gone from the `Promise.all` in `getMatchDetailData` (match-detail-server.ts:458-464, comment included) and from its return object, the layout neither destructures nor passes the prop, and the provider's context type, props type, default and value no longer carry it
  - [ ] `getPlayerAverageStats` is no longer imported by `match-detail-server.ts`; the function itself stays in `match-stats-server.ts` (other functions' doc comments define their semantics against it) and is not re-keyed to the athlete
  - [ ] `npm run typecheck` and `npm run lint` pass; `tests/report-empty-states.spec.ts` and `tests/match-kpi-history.spec.ts` still pass
- **notes:** Intent 3 — two round trips on every match page for a value no component reads; if ever wired it would average over the VIEWER's ids and show a coach their own baseline under an athlete's match. The `resolveKpiHistory` branch just below still needs its own `getMyPlayerIds()` — leave that. Editing match-data-provider.tsx fires the widget-states hook; no loading or empty state changes.

## T6 · Say what the Home KPI change is: "vs previous match"

- **status:** todo
- **model:** sonnet
- **files:** src/lib/data/performance-server.ts
- **done when:**
  - [ ] `calculateKpiCards` emits `changeLabel: "vs previous match"` (performance-server.ts:699); the `change` arithmetic at lines 690-693 (latest measured match minus the previous one) is untouched
  - [ ] `grep -rn '"last 30 days"' src` returns nothing; the win/loss `"Last 30 Days"` labels at lines 173 and 916 stay — those really are a 30-day window
  - [ ] `npm run typecheck` passes and `grep -rn 'last 30 days' tests` returns nothing
- **notes:** Intent 5. The label renders in `src/components/dashboard/shared/kpi-tile.tsx:309-311` (a 10px span inside a `flex … overflow-hidden` row) and the same field is interpolated into the `/api/team-insight` prompt (`route.ts:49`); both read naturally with the new text. Whether the five extra characters crowd the narrowest tile is a look-yourself check once it lands, not a gate criterion.

## T7 · Migration: pin key_moments search_path and lock the regraft trigger function

- **status:** todo
- **model:** fable
- **files:** supabase/migrations/<live-timestamp>_key_moments_search_path_regraft_grants.sql (new; timestamp from the live apply)
- **done when:**
  - [ ] A migration file, named with the version the live project recorded on apply (as `20260925023004…023148` were renamed for PR #262), contains `alter function public.key_moments(uuid) set search_path = 'public';` — `'public'`, not `''`: the body (`20260508000000_increase_key_moments_limit.sql:41-111`) reads unqualified `points`/`shots`, and an empty search_path would make it raise
  - [ ] The same file contains `revoke execute on function public.matches_block_client_regraft() from public, anon, authenticated;` (precedent: `20260925023148_match_video_expiry_sweep.sql:150`) and no other grant change — in particular no revoke on `is_admin`, `is_program_staff`, `my_player_ids`, `user_program_ids`, `user_program_role`, `visible_match_ids` or `visible_point_ids`
  - [ ] It ends with a `do $$ … $$` block (precedent: `20260925023148_match_video_expiry_sweep.sql:275-284`) that raises unless `pg_proc.proconfig` for `key_moments(uuid)` contains `search_path=public` and `has_function_privilege('anon', 'public.matches_block_client_regraft()', 'execute')` is false
  - [ ] Its header comment cites `20260821144754` → `20260821144843` as the reason the RLS helpers stay anon-executable, and the file is not hand-formatted (`.prettierignore` covers `supabase/migrations/`; check `git diff --stat` shows only the new file)
  - [ ] `npx playwright test tests/rls-workspace-isolation.spec.ts` passes, run serially under the live-DB lock after the migration is applied live — it asserts the regraft trigger's 42501 refusal, so it proves the trigger still fires with EXECUTE revoked
- **notes:** Intent 6(a)+(c). 6(b) is DROPPED, not deferred: the repo shipped exactly that revoke on 2026-08-21 (`20260821144754`) and put it back within the minute (`20260821144843`) — RLS policy expressions run as the querying role, so with EXECUTE revoked an anon read of matches/points/shots/program_events/program_claims raised "permission denied for function" (a 500) instead of returning 0 rows; `20260822090300_my_player_ids.sql:41-45` re-grants anon for the same reason, and the restore migration records that the "runs as the policy owner" probe was invalid (cached plan). The advisor's `anon_security_definer_function_executable` line on those seven is a documented accept. Postgres does not check EXECUTE when a trigger fires, so (c) cannot break the regraft guard. Runner's own steps, outside the gate: apply with the Supabase MCP `apply_migration` on project pouxujkhtbvkdwbzfvka (the MCP needs auth in the runner's session), rename the file to the recorded version, then re-run `get_advisors(security)` and confirm `function_search_path_mutable` no longer lists `key_moments` and the trigger function is gone from the anon list. Check first whether anything still calls `key_moments` (`grep -rn key_moments src supabase/functions`); the function stays either way. Live specs: never with `LIVE_DB_ALLOW_PROD` in a loop.

## T8 · Page the season-wide matches reads before a program crosses the row cap

- **status:** later
- **model:** opus
- **needs:** T2
- **files:** src/lib/data/team-home-server.ts (1691-1697, 1732-1735), src/lib/data/team-roster-server.ts (365-394), src/lib/data/opponents-server.ts (446-450, 617-623), src/lib/data/schedule-server.ts (222-231) — guess
- **done when:**
  - [ ] Each listed `matches` / `match_stats_with_percentages` / `program_event_outcomes` read goes through T2's helper in pages of 1000 (or is replaced by an RPC that aggregates in SQL), keeping each read's existing order and `nullsFirst: false`
  - [ ] Every `.in("match_id" | "event_entry_id" | "entry_id", ids)` over a season's ids is chunked (e.g. 200 ids per request, results concatenated) so the request URL stays bounded
  - [ ] A spec drives one of the four loaders with a fake client returning 1,200 matches and asserts all 1,200 reach the aggregate (precedent for the fake: tests/schedule-outcome-loader.spec.ts)
  - [ ] `npm run typecheck` passes; `tests/team-home-week.spec.ts`, `tests/team-court-record.spec.ts`, `tests/team-roster-ids.spec.ts` and `tests/team-home-schedule-reads.spec.ts` still pass
- **notes:** Intent 7, deferred by its author — a multi-season program crosses the cap in year 3. Read `docs/ui-revamp-guardrails.md` first: team-home and team-roster attribute a stat row to a side by `is_player1` against the match's `player1_id` (team-home-server.ts:1719-1724 spells out why there must be one way), and chunking must not reorder rows relative to their match. When promoted, consider splitting per file — four loaders of this size may exceed one subagent context.
