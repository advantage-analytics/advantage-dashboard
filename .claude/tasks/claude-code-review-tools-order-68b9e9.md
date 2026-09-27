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

- **status:** done
- **model:** sonnet
- **files:** src/lib/data/performance-server.ts
- **done when:**
  - [ ] `calculateKpiCards` emits `changeLabel: "vs previous match"` (performance-server.ts:699); the `change` arithmetic at lines 690-693 (latest measured match minus the previous one) is untouched
  - [ ] `grep -rn '"last 30 days"' src` returns nothing; the win/loss `"Last 30 Days"` labels at lines 173 and 916 stay — those really are a 30-day window
  - [ ] `npm run typecheck` passes and `grep -rn 'last 30 days' tests` returns nothing
- **notes:** Intent 5. The label renders in `src/components/dashboard/shared/kpi-tile.tsx:309-311` (a 10px span inside a `flex … overflow-hidden` row) and the same field is interpolated into the `/api/team-insight` prompt (`route.ts:49`); both read naturally with the new text. Whether the five extra characters crowd the narrowest tile is a look-yourself check once it lands, not a gate criterion.

## T7 · Migration: pin key_moments search_path and lock the regraft trigger function

- **status:** done
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

## T9 · process-match: verify the caller, pin the bucket and prefix, refuse a second run

- **status:** done
- **model:** fable
- **files:** supabase/functions/process-match/index.ts, supabase/functions/process-match/README.md, tests/process-match-guards.spec.ts (new) — guess
- **done when:**
  - [ ] The handler (index.ts:31-92) reads the `Authorization` bearer before building the service-role client: a token equal to `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` is the internal caller; any other token goes to `auth.getUser(token)` on an anon client (`SUPABASE_ANON_KEY`, auto-injected) and the match select gains `created_by`, which must equal that user's id — no/invalid token answers 401, a mismatch 403, both as `{ success: false, error }` JSON, and the body `userId` is no longer read: the verified user's id (for the service-role path, the match's `created_by`) is the only `userId` passed to `processMatchToDb`
  - [ ] `bucketId` is dropped from the request and hard-coded to `"match-data"`, and every `fileNames` entry must resolve under `${userId}/` — an entry containing `/` must start with that prefix and contain no `..` segment — else 400 before any `storage.from().download` call (`createCombinedSheets`, index.ts:376-378, is where the path is built)
  - [ ] Before `buildPointInserts` (index.ts:251-263) the function reads `points` for `match_id = matchId` with `limit(1)`; a hit answers 409 `{ success: false, error: "This match has already been processed" }` and inserts nothing, invokes nothing
  - [ ] A new offline spec `tests/process-match-guards.spec.ts` loads the function in a vm the way `tests/generate-insights-retry.spec.ts` does (stub `Deno.serve`/`Deno.env`, `createClient`, the `jsr:`/`npm:` requires) and asserts: no bearer → 401; a user bearer whose id is not `created_by` → 403; a foreign `fileNames` prefix → 400 with zero download calls; an existing `points` row → 409 with zero inserts; the service-role bearer with in-prefix paths gets past every guard (the spec observes the `points` pre-check read or the first `download` call)
  - [ ] `README.md`'s Request Format / Usage sections drop `bucketId` and the honoured `userId`, document 401/403/409, and state that deploying is a separate, user-run step; `git diff supabase/functions/process-match/index.ts` touches only the handler preamble, `createCombinedSheets`'s path guard and the pre-insert check — `buildPointInserts`, `buildShotInserts`, the set/game/rally maps, the `hostTeam` keying (231-237, 718-722) and the `calculate_match_stats`/`backfill_returns_in_and_net_points` RPCs are byte-identical
- **notes:** Intent 1, function 1 of 3. Live today: `verify_jwt=true` is satisfied by the PUBLIC anon key, so anyone can point this at any `matchId`/`bucketId`/path and have points+shots inserted under a service-role client, then chain key-moments + insights. The only legitimate external caller is `/api/upload` (`src/app/api/upload/route.ts:150-158`) via `supabase.functions.invoke` on the user's session client, which sends the user's access token as the bearer; nothing in the repo calls it with the service role, but allowing it keeps the rule identical across the three functions. Storage paths are `${userId}/${providerId}/${matchId}/${fileName}` (`upload.service.ts:127-130`), so the prefix rule matches every real file. `docs/ui-revamp-guardrails.md` §2 freezes this path — this is a security fix: guards only, no parser/stat-logic edits. **Deploying the function is the user's step** (`supabase functions deploy process-match` or the Supabase MCP `deploy_edge_function`) — the task stops at "code + README + spec"; no live-DB or live-deploy criterion is allowed and the gate must not require one. **User action, not a task:** the live Edge Function `inspect-swingvision` (`verify_jwt=false`, not in the repo) lets anyone download any `match-data` object with the service role — delete it in the Supabase dashboard or with `supabase functions delete inspect-swingvision`.

## T10 · generate-insights: verify the caller

- **status:** done
- **model:** opus
- **needs:** T9
- **files:** supabase/functions/generate-insights/index.ts, tests/generate-insights-retry.spec.ts, tests/insights-workspace-history.spec.ts, tests/generate-insights-guards.spec.ts (new), src/lib/services/splitstep/request-insights.ts (comment only) — guess
- **done when:**
  - [ ] The handler (index.ts:99-108) applies T9's rule before any query: the service-role key as bearer is allowed (this is what `process-match`'s chained invoke and the webhook's admin client via `requestMatchInsights` send); any other bearer goes to `auth.getUser(token)` on an anon client and must equal `matches.created_by` for `matchId` (one added `select created_by` on `matches`); no/invalid token → 401, mismatch → 403, JSON bodies
  - [ ] The diff to index.ts is the preamble plus one small helper: the Gemini prompt, `fetchWithRetry`, `captureGeminiGeneration`, the comparison-context block and the `.update({ insights }).eq("id", matchId)` write are unchanged
  - [ ] `tests/generate-insights-retry.spec.ts` and `tests/insights-workspace-history.spec.ts` still pass — their fixtures gain a service-role bearer (or an `auth.getUser` stub), whichever is the smaller edit, with `Deno.env.get` returning distinct values per key so the equality check is real
  - [ ] A new `tests/generate-insights-guards.spec.ts` (same vm harness) asserts 401 with no bearer, 403 for a signed-in user who is not `created_by`, and that the service-role bearer reaches the Gemini `fetch` stub
  - [ ] `src/lib/services/splitstep/request-insights.ts`'s header comment records that the function now requires the service-role bearer or the match owner's session, and that the webhook's `createAdminClient()` (`webhooks/splitstep/route.ts:307` → `deriveAndPublish`) already qualifies — no code change there; `npm run typecheck` passes
- **notes:** Intent 1, function 2 of 3. Live: overwrites `matches.insights` for any `matchId` on an anon-key call. Copy T9's helper verbatim rather than inventing a second shape — the three functions should read the same. Deploying is the user's step; no live criterion.

## T11 · Commit generate-key-moments from live and verify its caller

- **status:** done
- **model:** fable
- **needs:** T9
- **files:** supabase/functions/generate-key-moments/index.ts (new, from live), supabase/functions/generate-key-moments/README.md (new), tests/generate-key-moments-guards.spec.ts (new) — guess
- **done when:**
  - [ ] `supabase/functions/generate-key-moments/index.ts` exists, fetched from the live project `pouxujkhtbvkdwbzfvka` with the Supabase MCP `get_edge_function`, committed verbatim in the task's first commit-worthy step with a header comment recording the retrieval date and that it was live-only until now — never reconstructed from memory: if the MCP is unauthenticated in the runner's session, block with that reason
  - [ ] The handler then applies T9's rule: service-role bearer allowed (this is what `process-match` sends on its chained invoke, index.ts:309-312), any other bearer resolves via `auth.getUser` and must equal `matches.created_by` for the body's `match_id`; 401/403 JSON; the `{ match_id }` body contract `process-match` sends is unchanged
  - [ ] Every write the function makes stays scoped to that one match (its existing `.eq(<match column>, match_id)` filters are kept; nothing else in its logic changes — the diff against the verbatim commit is the preamble plus the helper)
  - [ ] A new offline vm spec `tests/generate-key-moments-guards.spec.ts` (harness: `tests/generate-insights-retry.spec.ts`) asserts 401 without a bearer, 403 for a non-owner, and that the service-role bearer reaches the function's first database read
  - [ ] Its README (or a shared "Edge function auth" section in `supabase/functions/process-match/README.md`, linked from the new one) lists the three functions, the one auth rule, the chain order upload → process-match → generate-key-moments → generate-insights, and that deploying each is the user's step
- **notes:** Intent 1, function 3 of 3. Live-only today (`verify_jwt=true`, anon key satisfies it, service-role client built from the body). The offline spec does not need the function's real logic — stub every table read to return empty data after the guard. Deploying is the user's step; no live-DB or live-deploy criterion.

## T12 · /api/upload checks the match; /api/validate-file gets an auth gate and a size ceiling

- **status:** done
- **model:** fable
- **files:** src/app/api/upload/route.ts, src/app/api/validate-file/route.ts, tests/upload-route-guards.spec.ts (new) — guess
- **done when:**
  - [ ] POST `/api/upload` (route.ts:53-127), after `getUser()` and before `uploadMatchFile`, loads the match through the caller's client (`select id, created_by … .eq("id", matchId).maybeSingle()`) and answers 404 when no row is visible and 403 when `created_by !== user.id`; neither the storage upload nor the `process-match` invoke runs after a refusal
  - [ ] It answers 409 (`"This match already has a file"`) when the caller's client finds a `match_files` row or a `points` row for the match (`select id … limit 1` each), so a retried POST can no longer fire `process-match` a second time against a match that already has statistics
  - [ ] POST `/api/validate-file` gates on `supabase.auth.getUser()` (401, same shape as `/api/upload`), rejects a `file` string longer than the SwingVision `maxFileSizeMB` allows as base64 (`Math.ceil(50 MiB / 3) * 4` chars, derived from `swingVisionStrategy`'s config, not a second literal) with 413 before `Buffer.from`, and both 500 branches return the fixed string `"Failed to validate file. Please try again."` with the caught error only in `console.error`
  - [ ] A new offline spec `tests/upload-route-guards.spec.ts` drives both handlers with `@/lib/supabase/server` stubbed — either through `tests/fixtures/vm-modules.ts` `createLoader()` (precedent: `tests/paged-query.spec.ts` loading `getMatchPointsFromSupabase`) or by splitting each route into a `handler.ts` that takes its deps the way `splitstep/upload-url` does — and asserts: unauthenticated → 401 on both; a match with a different `created_by` → 403 with zero storage uploads and zero `functions.invoke` calls; an existing `match_files` row → 409; an oversized base64 body → 413 with `validateSwingVisionFile` never called
  - [ ] `npm run typecheck` and `npm run lint` pass; `tests/upload-write-eligibility.spec.ts` is untouched (it skips without a local stack)
- **notes:** Intent 2. Today the route trusts the live `match_files_guard_upload_eligibility` trigger (`20260911000000_upload_eligibility.sql:430`) for ownership and has no idempotency at all — `process-match` inserts unconditionally, so every retried POST doubles every stat. `created_by === user.id` is safe for every wizard path: the create path inserts the row under the uploader immediately before the POST (`useUploadMatchWizard.ts:3106`, `utils.ts:192`), and the existing-line path refuses when the row is someone else's (`useUploadMatchWizard.ts:3096-3120`). The wizard uploads exactly one file per match (`useUploadMatchWizard.ts:3266-3277`), so the 409 on an existing `match_files` row breaks nothing that works today. The only callers are the wizard's two `fetch`es (`useUploadMatchWizard.ts:2473`, `:3273`). Keep sending `userId` in the invoke body — T9's function ignores it, and the undeployed one still reads it. T16 edits this file's outer catch afterwards; leave line 180 alone here.

## T13 · SwingVision parser: host is always player1, even on the blank-Guest fallback

- **status:** done
- **model:** opus
- **files:** src/lib/services/upload/parsers/swingvision-parser.ts, tests/swingvision-parser-fallback.spec.ts (new) — guess
- **done when:**
  - [ ] `transformToFormData` (swingvision-parser.ts:338-388) no longer branches on `settings.guestTeamFromFallback` for names or scores: in every case `playerName = settings.hostTeam || "Player"`, `opponentName = settings.guestTeam || "Opponent"`, player scores/tiebreaks come from `hostScore`/`hostTiebreak` and opponent from `guestScore`/`guestTiebreak`, and the result caption follows (`"<Host Team> Wins"` when host won more sets); the flag itself, its detection code (149-215) and `SwingVisionSettingsSheet` are untouched
  - [ ] A new offline spec `tests/swingvision-parser-fallback.spec.ts` imports `SwingVisionParser` from `@/lib/services/upload/parsers/swingvision-parser` directly (a `.ts` module — no JSX, so no `createLoader` needed) and builds workbooks with ExcelJS the way `oneSetExport()` does in `tests/upload-score-regression.spec.ts`, wrapping the buffer in a Node `File`: (a) Guest Team cell blank and the opponent's name in a Settings metadata row (`rows[5..9][0]`, > 2 chars, not the host, not containing "Speed"/"is positive") — asserts the fallback was taken (`opponentName` equals that metadata name) and `playerName === "<Host Team>"`, `playerScores` equal the host scores, `opponentScores` the guest scores, `result === "<Host Team> Wins"` for a host-won set line; (b) the same file with Guest Team filled — identical output
  - [ ] `git diff --stat` shows only the parser's `transformToFormData` block and the new spec; `npm run typecheck` passes and the spec passes
- **notes:** Intent 3. Today a fallback file swaps the names (`playerName = guestTeam`) while keeping host scores, and downstream both `player1_name = formData.playerName` (`new-match-wizard/utils.ts:155-159`) and `process-match`'s `is_player1` (keyed solely on the Settings "Host Team" cell, `index.ts:231-237`, `718-722`) assume host = player1 — so the name and the statistics disagree for every such file. `docs/ui-revamp-guardrails.md` §2 freezes this path; this is the minimal correctness edit and no other parser behaviour may change. The parser's `getExcelJS()` dynamic import works under Playwright's Node runtime; `File` is global on Node 20+.

## T14 · Delete the callerless POST /api/chat

- **status:** done
- **model:** sonnet
- **files:** src/app/api/chat/route.ts (delete), MAP.md (line 107, hand-written row), docs/README.md (line 13), docs/llm-setup.md — guess
- **done when:**
  - [ ] `src/app/api/chat/` is gone and `grep -rn 'api/chat' src tests` returns only the historical note in `src/lib/llm/stream-response.ts:7` (reword or keep — it describes the past)
  - [ ] Nothing else is deleted: `createLLMObservabilityContext`, `getLLMStream`, `ChatMessage` (`src/lib/llm/adapter.ts`) and `logPostHog`/`flushPostHogLogs` (`src/lib/posthog-logs`) each still have an importer (`home-insight`, `team-insight`, `pipeline-log.ts`) and stay as they are
  - [ ] MAP.md's hand-written `src/app/api/` row (line 107) drops "`chat` (LLM streaming)"; `docs/README.md:13`'s `llm-setup.md` description and any `/api/chat` mention inside `docs/llm-setup.md` name `/api/home-insight` and `/api/team-insight` instead; `docs/ux-overhaul-brief.md` (point-in-time) is left alone
  - [ ] `npm run map` has been run (the generated table covers `page.tsx` routes only, so a no-op is expected) and `npx playwright test tests/generate-map.spec.ts`, `npm run typecheck`, `npm run lint` all pass
- **notes:** Intent 4. The route has no caller in `src/` or `tests/`, streams for any signed-in user with an unbounded `messages` array and a client-authored system prompt, and `buildSystemPrompt` runs outside the try so a body without `keyMoments` throws a 500. `docs/ux-overhaul-brief.md:112,147,210,299` planned to wire it to `/dashboard/ask` (a `ComingSoonPage`); AGENTS.md already says those pages have no implementation to revive.

## T15 · Splitstep: record the blob name on the live job only; error-check the `uploaded` write; fix the SAS re-mint comment

- **status:** done
- **model:** opus
- **files:** src/app/api/splitstep/upload-url/route.ts, src/app/api/splitstep/upload-url/handler.ts (doc comment), src/lib/services/splitstep/mark-job-uploaded.ts (new), src/lib/services/splitstep/submit-match-video.ts, src/lib/services/splitstep/video-url/types.ts, tests/splitstep-mark-uploaded.spec.ts (new) — guess
- **done when:**
  - [ ] `recordBlobName` in `upload-url/route.ts:111-116` updates only the live job — `.eq("match_id", matchId).in("status", ["pending", "uploading", "uploaded"])` — which `processing_jobs_one_live_per_match` (`20260829184210`) makes at most one row; the `UploadUrlDeps.recordBlobName` doc comment in `handler.ts:101-105` says so
  - [ ] The terminal write in `submit-match-video.ts:380-391` moves into a new pure module `src/lib/services/splitstep/mark-job-uploaded.ts` exporting `markJobUploaded(supabase, { jobId, videoObjectKey })`, which keeps the same payload (`status: "uploaded"`, `upload_progress_percent: 100`, `updated_at`), checks the error, retries once, and returns `{ ok: true } | { ok: false; error: string }`
  - [ ] `uploadAndSubmitVideo` calls it and, on `{ ok: false }`, does not POST `/api/splitstep/jobs`; it writes `status: "failed"` with an `error_message` saying the video must be uploaded again (best effort, error logged) and reports through the existing failure surface (`onTransferFailed` / `onEvent` — no new UI); the success path is unchanged
  - [ ] A new offline spec `tests/splitstep-mark-uploaded.spec.ts` drives `markJobUploaded` with a fake client: fail-then-succeed → `{ ok: true }` and exactly two `update` calls both filtered `.eq("id", jobId)`; fail twice → `{ ok: false }` after two calls; succeed first → one call
  - [ ] `VideoUrlStrategy.mint`'s doc comment (`video-url/types.ts:45-52`) no longer claims re-minting invalidates the previous URL; it says that under `azure-sas` the earlier SAS keeps working until it expires (`azure-sas.ts:16-28`) and that a strategy with real revocation may do better; `npm run typecheck` passes and `tests/upload-url-authorization.spec.ts` still passes
- **notes:** Intents 5 + 7, merged: same pipeline, small edits. Live: 1 of 12 matches already has two job rows, so the unfiltered `.eq("match_id")` update rewrites a finished job's `video_object_key`. The un-checked `uploaded` write is why a failed write leaves the row at `uploading` until `reap_stalled_uploads()` fails it 15 minutes later while `/api/splitstep/jobs` answers 409 (`handler.ts:267-275`). `submit-match-video.ts` touches `window`/`fetch` and is stubbed wholesale by `tests/fixtures/upload-wizard-hook.ts:335`, which is why the helper gets its own importable module.

## T16 · API routes: generic 500 bodies and the runtime/dynamic convention exports

- **status:** done
- **model:** sonnet
- **needs:** T12, T14
- **files:** src/app/api/matches/[matchId]/route.ts, src/app/api/webhooks/stripe/route.ts, src/app/api/upload/route.ts, src/app/api/validate-file/route.ts, src/app/api/home-insight/route.ts, src/app/api/team-insight/route.ts, src/app/api/programs/search/route.ts, src/app/api/create-checkout-session/route.ts
- **done when:**
  - [ ] In `matches/[matchId]/route.ts` the five 500 responses that echo `error.message` / `lookupError.message` / `deleteError.message` (lines 153, 204, 268, 298, 313) return fixed strings ("Could not load the match", "Could not save the match", "Could not delete the match") with the Supabase error in a `console.error` beside each — precedent `splitstep/jobs/handler.ts:247-250`
  - [ ] `webhooks/stripe/route.ts:65` and `:79` drop the `details:` field (the message stays in the existing `console.error` / is added to one for `result.error`); `upload/route.ts`'s outer catch (line 180) returns `"Internal server error"` unconditionally
  - [ ] `export const runtime = "nodejs";` and `export const dynamic = "force-dynamic";` are added after the imports (placement as `splitstep/upload-url/route.ts:34-35`) to upload, validate-file, home-insight, team-insight, programs/search, create-checkout-session, matches/[matchId] and webhooks/stripe, so `grep -L 'export const runtime' $(find src/app/api -name route.ts)` prints nothing
  - [ ] `npm run typecheck` and `npm run lint` pass, and `tests/upload-route-guards.spec.ts` (T12) still passes
- **notes:** Intent 6 — the rls reviewer's informational drift. Waits on T12 (shares `upload/route.ts`) and T14 (`chat` is gone, so it is not in the list). `splitstep/jobs/route.ts` and `jobs/[jobId]/resubmit/route.ts` already export `runtime` and `maxDuration` without `dynamic`; leave them.

## T17 · /api/upload: one `match_files` row per match, enforced by the database

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-timestamp>_match_files_one_per_match.sql (new; timestamp from the live apply), src/lib/services/upload/upload.service.ts, src/lib/services/upload/types.ts, src/app/api/upload/route.ts, tests/upload-route-guards.spec.ts, tests/fixtures/local-supabase/live-baseline.sql — guess
- **done when:**
  - [ ] A migration file, named with the version the live project recorded on apply (precedent: T7, `20260926231753_…`), contains `create unique index match_files_one_per_match on public.match_files (match_id) where match_id is not null;` as its only DDL, ends with a `do $$ … $$` block that raises unless `pg_indexes` lists that index as `CREATE UNIQUE INDEX … WHERE (match_id IS NOT NULL)`, and its header records the live count it was created over (2026-09-26: 21 rows, all `swing-vision`, max 1 per match, 0 with a null `match_id` — re-checked at apply) and that `/api/upload` already refuses a second file (T12), so the index closes the check-then-act race rather than changing any working path; `git diff --stat` shows the file was not hand-formatted; the same `create unique index` line is added to `tests/fixtures/local-supabase/live-baseline.sql` beside `match_files`' other indexes
  - [ ] `UploadService.uploadMatchFile` (`upload.service.ts:89-102`) distinguishes a unique violation: when `dbError.code === "23505"` it returns `{ success: false, code: "conflict", error }` (a new optional `code?: "conflict"` on `UploadResult` in `types.ts`) and removes the object it just wrote ONLY when the surviving row's `storage_path` — read through the same client, `select storage_path … .eq("match_id", matchId).limit(1)` — differs from its own path (two tabs uploading the same file name share one path under `upsert: true`, so an unconditional delete would remove the winner's file before `process-match` downloads it); every other insert error keeps today's delete-then-fail path unchanged
  - [ ] `/api/upload` (`route.ts:204-209`) answers 409 `{ success: false, error: "This match already has a file" }` — the same body as step 7 — when `uploadResult.code === "conflict"` and does not invoke `process-match`; a non-conflict failure keeps 500 with the fixed string `"Failed to store the file"` and the service's message only in `console.error` (closes T16 follow-up 1); the step-7 `match_files`/`points` pre-check stays as the fast path
  - [ ] `tests/upload-route-guards.spec.ts` gains three cases through the existing fake client (its `storage.from().remove` now records paths): the pre-check answers empty but `match_files.insert` answers `{ code: "23505" }` with a surviving row at the SAME `storage_path` → 409, zero `functions.invoke`, zero removes; the same with a DIFFERENT surviving path → 409, zero invokes, exactly one remove of the loser's own path; a non-23505 insert error → 500 with the fixed string and one remove; the existing 13 cases still pass
  - [ ] `npm run typecheck` and `npm run lint` pass; `tests/upload-write-eligibility.spec.ts` is untouched (it skips without a local stack)
- **notes:** Intent 1, route layer (pr-check low finding at `upload/route.ts:162`). Live, verified 2026-09-26 via the Supabase MCP: `match_files` has only non-unique btree indexes on `match_id` and `uploaded_by` plus the pkey; 21 rows, all `provider_id = 'swing-vision'`, max 1 per match, none with a null `match_id` — the index creates cleanly. If the re-check at apply time finds a match with two rows, BLOCK and name it; never delete a row to make the index fit. `uploadMatchFile` is the only writer of `match_files` in `src/` and `supabase/functions/` (the route reads it twice, `purge-match-storage.ts:254` reads it on delete) and the route refuses processing providers before the service runs (`getImportProviderStrategy` throws at `route.ts:97`), so no `provider_id` predicate is needed. The surviving row is visible to the loser because both tabs are the same user (`match_files` policy "Users can view own files"). Match the violation on `error.code`, never on the message. The layer-2 race (`process-match`'s own non-atomic `points` check) is T18, independent of this task. Runner's own steps, outside the gate: apply with the Supabase MCP `apply_migration` on `pouxujkhtbvkdwbzfvka`, rename the file to the recorded version. No live-DB or browser criterion.

## T18 · process-match: points, shots and stats land in one transaction, or not at all

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-timestamp>_import_match_rows.sql (new; timestamp from the live apply), supabase/functions/process-match/index.ts, supabase/functions/process-match/README.md, docs/ui-revamp-guardrails.md (§2, the 2026-09-26 blockquote), tests/process-match-guards.spec.ts — guess
- **done when:**
  - [ ] A migration file, named with the version the live project recorded on apply (T7 precedent), creates `public.import_match_rows(p_match_id uuid, p_points jsonb, p_shots jsonb) returns void` — plpgsql, `security invoker`, `set search_path = 'public'` (T7's reasoning: `calculate_match_stats` and `backfill_returns_in_and_net_points` run inside it and a nested call inherits the caller's path; the header cites both callees' `pg_proc.proconfig`) — whose body, in order: `perform pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0))` (precedent `20260925023004_match_video_attachment_cap.sql:132`); raises `using errcode = 'unique_violation'` if a `public.points` row exists for `p_match_id`; inserts `p_points` into `public.points` and `p_shots` into `public.shots` through `jsonb_to_recordset` with explicit column lists equal to the keys `buildPointInserts`/`buildShotInserts` emit (plus `id` on points), so unnamed columns keep their defaults; `perform public.calculate_match_stats(p_match_id)`; `perform public.backfill_returns_in_and_net_points(p_match_id)`. It revokes EXECUTE from `public, anon, authenticated`, grants it to `service_role`, and ends with a `do $$` block that raises unless the function exists, `has_function_privilege('authenticated', …, 'execute')` is false, `has_function_privilege('service_role', …, 'execute')` is true, and `pg_get_functiondef` contains `pg_advisory_xact_lock` (precedent `…cap.sql:652`); not hand-formatted (`git diff --stat`)
  - [ ] In `processMatchToDb` (`index.ts:361-407`) the `points` insert, the `shots` insert and the two `rpc()` calls are replaced by ONE `supabase.rpc("import_match_rows", { p_match_id, p_points, p_shots })`: each point insert gets `id: crypto.randomUUID()` before the call and `buildPointIdMap` is fed that local array instead of a returned select, so `buildShotInserts` is called exactly as before; `buildPointInserts`, `buildShotInserts`, `buildPointIdMap`, `pointKey`, the set/game/rally maps, the `hostTeam` keying, the `points` pre-check (T9) and the `generate-key-moments`/`generate-insights` invokes are byte-identical in `git diff`
  - [ ] An RPC error with `code === "23505"` makes the handler answer 409 `{ success: false, error: "This match has already been processed" }` — the pre-check's body — and invoke nothing; any other RPC error is a 500 with nothing persisted (the transaction rolled back), so the pre-check does not refuse the re-run
  - [ ] `tests/process-match-guards.spec.ts`'s harness resolves `npm:exceljs@4.4.0` to the real `exceljs` package, supplies `crypto` to the vm context, records `rpc` names and args, and its `download` can return a Blob of a workbook built with ExcelJS carrying Settings, Points and Shots sheets (workbook-building precedent: `tests/swingvision-parser-fallback.spec.ts`); three new cases: the service role with that workbook yields an event log with exactly one `rpc:import_match_rows` followed by `invoke:generate-key-moments` and `invoke:generate-insights` and NO `insert:points`, `insert:shots`, `rpc:calculate_match_stats` or `rpc:backfill_returns_in_and_net_points`, every `p_points` entry carrying a UUID `id` and every `p_shots.point_id` being one of them; the RPC answering `{ code: "23505" }` → 409 with the body above and zero invokes; the RPC answering any other error → 500 and zero invokes; the existing eight cases still pass
  - [ ] `README.md`'s Architecture steps 5–7 become the single RPC, and a new "Recovery" section states: a failed run persists nothing but leaves the `match_files` row, so `/api/upload` answers 409 and the path back is `DELETE /api/matches/[matchId]` (cascades `match_files`, `points`, `shots`) then re-upload, or an operator re-invoking `process-match` with the service-role bearer and the same `fileNames` — never a hand-run UPDATE; the live count of matches with `points` but no `match_stats` row at apply time (0 on 2026-09-26), with the same procedure applying to any such match; and that the RPC must be live BEFORE the function is deployed. `docs/ui-revamp-guardrails.md` §2's 2026-09-26 blockquote gains a bullet for this task: the four writes now run inside `import_match_rows` in one transaction under an advisory lock, point ids are assigned by the function, every row value, the `is_player1` keying and `calculate_match_stats` itself are unchanged, and no existing row is touched
- **notes:** Intent 1 (function layer) + intent 2 merged (pr-check low findings at `process-match/index.ts:226` and the non-transactional inserts at ~361/377/394), and T9 follow-up 1 ("a guard, not a lock"). Two concurrent invokes both pass the `.limit(1)` pre-check today; inside the RPC the lock serialises them and the second sees the first's rows and raises. A run that dies after the points insert today leaves points with no shots/stats and every later invoke a 409; with the RPC nothing is left behind. Live 2026-09-26: 26 matches have points, 0 have points without `match_stats`; 13 have points and no `shots` rows at all, a legitimate state (the Shots sheet is optional, `index.ts:376`) — "stuck" means points without `match_stats`, nothing else. `docs/ui-revamp-guardrails.md` §2 freezes this function; the reviewed exception of 2026-09-26 covers T9–T11/T13/T15 only and says anything beyond needs its own entry, hence the guardrails criterion. `calculate_match_stats` is called, never edited (§2: "if you believe it must change, stop and ask"); it upserts `ON CONFLICT (match_id, is_player1)`. `points.id` is `uuid default gen_random_uuid()`; `crypto.randomUUID()` is global in Deno. Check `select rolconfig from pg_roles where rolname = 'service_role'` for a `statement_timeout` before assuming a three-set import (~300 points, ~1,000 shots, plus the stats calc) fits one statement. Runner's own steps, outside the gate: apply with the Supabase MCP `apply_migration`, rename the file to the recorded version. **Deploying the function is the user's step** (README "Deployment"); the deployed function keeps writing the old way until then, and the order is migration live first, then deploy. No live-DB, live-deploy or browser criterion. Follow-up, not this task: a `generate-key-moments` failure after the RPC still returns 500 over a fully processed match, which then 409s on retry.

## T19 · Match points: a failed read reaches the match's error boundary, not a zero-point page

- **status:** done
- **model:** opus
- **files:** src/lib/data/match-points-server.ts, src/lib/data/match-detail-server.ts, src/app/dashboard/matches/(detail)/[matchId]/layout.tsx, src/app/dashboard/matches/(detail)/[matchId]/page.tsx, tests/paged-query.spec.ts — guess
- **done when:**
  - [ ] `getMatchPointsFromSupabase` returns `Promise<MatchPoint[] | null>`: `null` when the `points` read errors (`match-points-server.ts:268-271`) and when `fetchAllPages` returns `null` (`:302`), each with the one `console.error` already there; `[]` only for a match with no `points` rows; `getMatchDetailData` passes the value through (its `points` type widens to `MatchPoint[] | null`) and throws nothing new
  - [ ] `[matchId]/layout.tsx` hands `MatchDataProvider` `points={points ?? []}`; `[matchId]/page.tsx` throws an `Error` when `data.points === null && !isAwaitingAnalysis`, placed after `isAwaitingAnalysis` is computed (`page.tsx:220-221`) and before the saved-views/bands `Promise.all` (`:227`), so the awaiting-analysis branch (guardrails §3.3) is byte-identical and never throws over a failed points read
  - [ ] `tests/paged-query.spec.ts:198`'s case becomes "returns null with one console.error when a shots page fails" and a sibling case asserts `null` with one `console.error` when the `points` read itself errors; `tests/report-empty-states.spec.ts`, `tests/match-report-pending.spec.ts` and `tests/viz-model.spec.ts` still pass
  - [ ] `npm run typecheck` and `npm run lint` pass; `grep -rn "getMatchPointsFromSupabase(" src` shows `match-detail-server.ts` as the only caller
- **notes:** Intent 3, match half (pr-check low finding at `match-points-server.ts:302`; the `pointsError → []` fold at `:268` is the same contract mismatch in the same function). `paged-query.ts:9-12`'s contract: the caller must "treat `null` as 'no answer' and say so". The throw lives in `page.tsx`, NOT in the loader or the layout: Next's `error.js` convention "does not wrap the `layout.js` … above it in the same segment" (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:96`), and `getMatchDetailData` is awaited by `layout.tsx` first, so a throw there skips `[matchId]/error.tsx` (the only `error.tsx` under `dashboard/`) and lands in `src/app/global-error.tsx`. A page-level throw is what the existing retry plumbing presupposes: `ClearRetryOnSuccess` in the layout clears the count on mount, `error.tsx` increments it per "Try again" and escalates at 3, and `reset()` re-renders only the page — moving the boundary up a segment would remount the layout on every retry and reset the count. `match-detail-server.ts:427-431`'s comment claims the loader's own throw reaches `error.tsx`; that is wrong for the layout path, but the `matches`-read throw is pre-existing — leave it and the comment alone (flagged separately). Editing `page.tsx`/`layout.tsx` fires the widget-states hook: loading and empty states are unchanged; the error state is the point of the task. No screenshot or browser criterion.

## T20 · Player profile: the serve map says "couldn't load" instead of "no matches"

- **status:** done
- **model:** opus
- **files:** src/lib/data/player-profile-server.ts (`PlayerProfile["serve"]`, `serveMapFor`), src/components/dashboard/team/player-profile/serve-placement-card.tsx, tests/player-profile-serve-map.spec.ts, tests/player-profile-serve-card.spec.ts (new) — guess
- **done when:**
  - [ ] `PlayerProfile["serve"]` gains `unavailable: boolean`; `serveMapFor` returns `{ zoneStats: null, matchCount: 0, serves: 0, unavailable: true }` only on the `!shots` branch (`player-profile-server.ts:285-288`) and `unavailable: false` from its other two returns; `getPlayerProfile` and `roster/[playerId]/page.tsx:170` pass it through with no other change
  - [ ] `ServePlacementCard` branches on `serve.unavailable` before `zoneStats`: the card frame (`surface-card`, the "Serve placement" eyebrow) with a one-line notice saying this player's serves could not be loaded and that reloading retries, in the third person when `!subject.isSelf` (the day-zero band's voice); no `CardEmpty`, no `ServeGhost`, no skeleton, no sample data, no new colour literal; the `zoneStats !== null` and day-zero branches are byte-identical
  - [ ] A new offline markup spec `tests/player-profile-serve-card.spec.ts` (precedent: `tests/report-empty-states.spec.ts` — `createLoader` with `ServePlacementQuietStrip` and `CardEmpty` as markers, `renderToStaticMarkup`) asserts: `unavailable: true` renders the notice and not the "serve map lands here" band; `{ zoneStats: null, unavailable: false }` renders the band; a non-null `zoneStats` renders the strip marker
  - [ ] Every `toEqual` on the serve shape in `tests/player-profile-serve-map.spec.ts` (`:163`, `:181`) carries the new field — `true` on the failed page, `false` on the empty-`sides` short-circuit — and `tests/player-profile.spec.ts` still passes; `npm run typecheck` and `npm run lint` pass
- **notes:** Intent 3, profile half (pr-check low finding at `player-profile-server.ts:287`). T4 chose the zeroed shape deliberately so the rest of the profile still renders — that stays; this only lets the card tell "no matches" from "no answer". Throwing (as `loadHomeServes` does, T3) would take the whole profile down for one card, which T4 rejected. Read `.skills/advantage-analytics-design/SKILL.md` then `reference/empty-and-loading.md` before the card edit; `src/components/dashboard/shared/chart-error-boundary.tsx` is the nearest precedent for an in-card failure tone. The team player profile keeps PER-CARD empty states by decision (2026-09-22) — this is a per-card error state, not a page-level one. The widget-states hook fires on the card edit; loading and empty states are unchanged. No screenshot or browser criterion.
