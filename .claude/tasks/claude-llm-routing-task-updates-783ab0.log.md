# Run log — claude/llm-routing-task-updates-783ab0

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Define attachment timing and request contracts — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `src/lib/match-video/` holds the feature's pure contracts with no
Azure/Supabase/Next imports: `types.ts` (add/replace/align modes, pending/active/retired
lifecycle, 15 error codes with their status/message table, `MatchVideoResult` union, and
request/result shapes for all six planned endpoints), `limits.ts`
(`MATCH_VIDEO_MAX_BYTES = 7_999_999_999`, `COVERAGE_TOLERANCE_SECONDS = 0.1`), and
`alignment.ts` (`summarizeSourceTiming` orders by point_number; `planAlignment` computes
offset = anchor source time − confirmed video time and validates coverage). New
`tests/match-video-alignment.spec.ts`, 34 cases. Required coverage end is a max over every
known point start, positive point end and shot time — a first implementation derived it
from the final point alone and accepted a file that cut off mid-rally; the failing case is
kept as a test.

**follow-ups:**

1. T3's SQL timing helper must reproduce `requiredSourceEndSeconds` as that same max over
   all known bounds, not just the final point's end; the parity fixtures should include the
   out-of-range-shot case.
2. `formatConfirmedVideoTime` is exported for T18's hh:mm:ss.sss field. If a sub-hour
   display is wanted, change it there rather than adding a second formatter.
3. T5/T6's probe should map a bounded-read overrun to `media_probe_budget` and a network
   timeout to `storage_unavailable`; the split is encoded in `types.ts` but unused so far.
4. Two judgment calls worth a second look: a numeric confirmed time is rounded to
   milliseconds while a string with a fourth fractional digit is refused rather than
   silently rounded; and a zero point duration counts as "unknown end" except on the final
   point, where it still refuses.

## T2 · Create attachment persistence and privilege boundaries — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `supabase/migrations/20260919045208_create_match_video_attachments.sql`
creates `public.match_video_attachments` — 36 columns covering identity, the
pending/active/retired lifecycle and version, staged/final blob keys, copy id/status,
verified media facts, `confirmed_video_time_seconds` at millisecond precision, offset,
`client_request_id`, expected-active id/version, SAS expiry, and the finalize/cleanup lease
and retry metadata. 15 check constraints, 8 indexes and a BEFORE UPDATE trigger that
refuses retired→anything, active→pending and any blob-key change. Both `match_id` and
`uploaded_by` are nullable with ON DELETE SET NULL. RLS is enabled with no policy, all
privileges revoked from public/anon/authenticated and granted to service_role only —
the same server-only shape as `pending_claims` and `program_requests`. A check constraint
refuses a `scheme://` prefix or any `?`/`#` in either key, so a SAS URL cannot be stored
as a key. Applied to the live project with the Supabase MCP and verified there against
`pg_class`, `pg_policies`, `role_table_grants`, `pg_constraint`, `pg_indexes` and
`pg_trigger`; the only new advisor entry is the INFO-level `rls_enabled_no_policy` that
every server-only table here carries. New `tests/match-video-attachments-db.spec.ts`,
8 live-DB tests on `tests/fixtures/live-db`, all passing, rows self-cleaned.

**follow-ups:**

1. `DbMatchVideoAttachment` in `src/lib/data/types.ts` is still missing — create-migration's
   step 6 asks for it, but this task forbade application code. T3's server readers are the
   natural place.
2. `match_video_attachments_active_verified_check` constrains T4: activation must set all
   six verified/alignment fields plus `activated_at` in one statement, and `retired_at`
   exactly when state is retired. Write the RPCs to those constraints, not around them.
3. The trigger enforces one-way transitions but deliberately does not stamp
   `activated_at`/`retired_at` — the transaction owns those timestamps.
4. Unrelated: `20260913230000_notification_prefs_team.sql` fails `create-migration`'s
   `check.sh` policy-or-marker rule. Left alone; worth its own task.

## T3 · Implement reservation renewal and cancellation transactions — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `supabase/migrations/20260919050413_match_video_attachment_reservations.sql`
adds four functions, all `security definer` with `search_path = ''`, EXECUTE revoked from
public/anon/authenticated and granted to `service_role` only.
`match_video_authorize_match` is the shared guard: it refuses an authenticated or anon JWT
outright, locks the parent `matches` row `for no key update` before any attachment row, then
rechecks creator, `source_provider = 'swing-vision'` and the exact workspace (personal means
`program_id is null` and the workspace id is the actor; team means `program_id` matches and a
current `program_members` row exists). `match_video_reserve_upload` mints the staged/final
keys from the new row id and writes them with `expected_active_id`/`version`,
`client_request_id` and the SAS expiry before any credential is issued; an identical retry
returns the same row with `reused = true`, changed metadata under the same request id
conflicts, and other pending work conflicts. `match_video_renew_upload` keeps the greater of
the stored and supplied expiry, never rolls it back, and refuses a finalizing or retired
attempt. `match_video_cancel_upload` retires pending work idempotently, seeds
`cleanup_next_attempt_at` from the last SAS expiry, and refuses an active asset. Errors carry
the T1 `MatchVideoErrorCode` as the message and a cause slug as the detail. Applied to live
and verified there: `prosecdef` true, `proconfig` pins the empty search path, EXECUTE denied
to anon/authenticated/public, `for no key update` present in the guard's definition.
`tests/match-video-attachments-db.spec.ts` grows from 8 to 16 live cases, all passing,
including 5-way concurrent reservation races (exactly one pending survives) and RPC
privilege denial for anon and two authenticated sessions across all four functions.

**follow-ups:**

1. Precedence worth knowing for T8: a retried reservation whose expected-active differs is
   answered `stale_attachment`, not `pending_attempt_conflict` — reality is checked before the
   request-id lookup.
2. T4's activation must lock the match the same way (`for no key update` first) and owns
   setting and clearing `finalize_lease_token`/`until`; reserve, renew and cancel all honour
   that lease already.
3. T13's cleanup worker gets `cleanup_next_attempt_at` seeded by cancel; it only needs T2's
   partial index to find the rows.
4. An RPC wrapper in `src/lib/match-video/` is deliberately absent — that is T8's job.

## T4 · Implement atomic activation and alignment transactions — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass

**changed:** New `supabase/migrations/20260919052002_match_video_attachment_activation.sql`
adds six functions, all `security definer` with `search_path = ''`, EXECUTE revoked from
public/anon/authenticated and granted to `service_role` only. Two are read-only SQL twins of
T1's TypeScript: `match_video_source_timing` mirrors `summarizeSourceTiming` and
`match_video_plan_alignment` mirrors `planAlignment`, both shared by the writers.
`match_video_begin_finalization` takes the lease by CAS (free, expired, or the same token),
freezes the confirmed time and rechecks the reservation's expected-active belief against
reality; `match_video_release_finalization` drops it holder-only for the failure path;
`match_video_activate_attachment` retires the old active row and activates the new one in one
transaction, returning `reused = true` on an idempotent replay;
`match_video_correct_alignment` does a version CAS and recomputes from source rows against the
saved verified duration, returning `changed = false` on a no-op. All call T3's
`match_video_authorize_match` first, so the parent `matches` row is locked before any
attachment row. The migration carries a self-checking `do` block asserting the privileges, the
secdef/search_path pinning, the lock order, and that no function body writes `points`,
`shots`, `matches` or `match_stats`. Applied to live and verified there. The spec grows from
16 to 30 live cases, all passing.

Timing parity is proven, not asserted: one fixture match is shaped so an interior point ends
at 150.125s — past the final point's 131.0s end — with a shot at 140.6s after the final point
and another at 5.5s before the anchor, plus untimed and zero-duration rows. The test reads
those rows through PostgREST the way the app does, runs the TypeScript helper, calls the SQL
twins on the same match, and demands equality on every field, including the tolerance edges
(147.7 accepted, 147.6 refused) and ten fault fixtures whose refusal slug must match exactly.
The project runs `extra_float_digits = 0`, so float8 values come back rendered to 15
significant digits; the test normalises the TypeScript value through that one rendering step
rather than hiding the difference under a tolerance, and the reviewer confirmed the setting
live before accepting it.

**follow-ups:**

1. `extra_float_digits = 0` truncates `real` columns on every read path — `points.video_time`
   1234.567 reads back as 1234.57 through PostgREST. Pre-existing platform config, not this
   feature's doing, but it caps Film seek precision past about 1000 seconds and deserves its
   own look.
2. Neither `types.ts` nor the SQL defines an HTTP mapping for SQLSTATE `22000`; the route
   wrappers in T8–T12 should map it to the `MatchVideoErrorCode` carried in the message.
3. Copy bookkeeping (`copy_id`, `copy_status`, `source_etag`) still has no RPC. T7's completion
   service can write it with the admin client, or T7/T10 may want a narrow
   `match_video_record_publication` RPC — worth deciding once rather than twice.

## T5 · Implement bounded shared media inspection — blocked

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: needs-work —
the second `done when:` line names five budgets and requires each to be enforced; the 8 MiB
cache budget (`MEDIA_PROBE_CACHE_BYTES`) is declared and passed to Mediabunny's `maxCacheSize`
but no test drives it, and the constant is never referenced from the spec. The other four
budgets (32 MiB total, 2 MiB chunk, 128 requests, 15s deadline) and abort/disposal are each
enforced and tested.

**changed:** Nothing committed. Stashed at `726273e360d40b5044ee130588e3d54dbbd27d1f`
(`git stash apply 726273e3`) — note `refs/stash` is shared across worktrees and other branches
have entries, so apply by SHA, not by index. The stash holds a substantially complete
implementation: `src/lib/match-video/media-inspection.ts` (isomorphic, injectable byte-source
seam for T6, no Azure/Supabase/Next imports, T1's error codes only),
`tests/match-video-probe.spec.ts` (24 passing cases) and `tests/fixtures/match-video/` — five
self-generated clips of 9–22 KB plus the `generate.mjs` that produced them via
Mediabunny/WebCodecs. The browser clock-agreement test is real: it serves the fixtures over a
range-capable server and seeks a live `<video>` element, comparing against the parser rather
than hardcoding numbers on both sides.

This run was also interrupted by the user partway through, so the implementing subagent never
wrote a final report; the verdict above comes from reviewing the artifacts directly.

**follow-ups:**

1. To unblock: apply the stash and add one test that drives the 8 MiB cache budget, then
   re-run. That is the only criterion gap the review found.
