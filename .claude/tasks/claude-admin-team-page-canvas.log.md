# Run log — claude/admin-team-page-canvas

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add per-team pilot columns and admin pilot RPCs — done

**gate:** mechanical `GATE PASS` (typecheck first reported only `.next/` route-type
errors — stale output from the pre-detach base — which `check.sh` cleared and re-ran
clean automatically); completion review `VERDICT: pass`, all five criteria met.

**changed:** New `supabase/migrations/20260926075216_admin_program_pilot.sql` adds
`programs.pilot_ends_on / pilot_approved_by / pilot_approved_at / pilot_ended_at`,
rewrites `program_audit_log_action_check` to 25 values (every live action, including
the two `console.*` ones applied from the unmerged admin-uploads branch, plus
`pilot.end_changed` and `pilot.ended`), and adds `admin_set_pilot_end(uuid, date)` and
`admin_end_pilot(uuid)` — both `security definer`, `set search_path = ''`, gated on
`public.is_admin()`, revoked from `public`/`anon`, granted to `authenticated`, each
writing one audit row naming `auth.uid()`. `admin_end_pilot` writes only
`pilot_ended_at`, `pilot_ends_on` (never extending) and `updated_at`; it deliberately
leaves `programs.status` alone, because `programs_status_check` offers no value that
means "pilot over" and `programStatusFor()` would overwrite an invented one — reasoning
recorded in the migration header. Applied to the live DB via Supabase MCP
`apply_migration`; live verified (four columns, both functions' `prosecdef`/`proconfig`,
the 25-value constraint). Tests: `tests/admin-program-pilot-rpcs.spec.ts` (+ registered
in `tests/fixtures/live-db-specs.ts`).

Two deviations, both deliberate and recorded rather than papered over:

1. The `done when:` list named `tests/database/admin-program-pilot.test.mjs`. That
   harness does not exist on this branch — no `tests/database/`, no `test:database`
   script, no PGlite; it lives only on the unmerged admin-uploads branch. The `files:`
   line was marked "(guess)" and guessed wrong. The task's four assertions were written
   against this repo's real convention instead (`tests/admin-program-pilot-rpcs.spec.ts`,
   modelled on `tests/admin-program-rpcs.spec.ts`). The reviewer judged the substitution
   as satisfying the criterion.
2. The backfill is scoped to `org_type = 'college'`, narrower than the criterion's
   literal "active programs". An `rls-boundary-reviewer` finding caught that custom orgs
   are `active` with no claim and bill on the individual tier, and the one live active
   program (a `high_school` org) had been wrongly stamped. The guard was added to the
   repo file and that row's pilot fields nulled on live, so live now has zero piloted
   programs — an admin sets one explicitly.

**follow-ups:**

1. **The queue's own T2 and T3 criteria repeat the `tests/database/` mistake** — both
   name a `tests/database/*.test.mjs` file that cannot exist on this branch. Correct
   them to this repo's live-DB spec convention before those tasks run, or they will hit
   the same deviation. Author's call via `/task-add`; the runner cannot edit criteria.
2. Nothing server-side stops at pilot end: `reserve_processing_quota` checks only the
   monthly cap and `PILOT_ENDS_AT` is UI-only. Wire the gate into `reserveQuota()` /
   `explainVideoRefusal()` and the upload-url handler (refuse when
   `pilot_ended_at is not null or pilot_ends_on < current_date`), then retire
   `PILOT_ENDS_AT` from UI copy in favour of the per-program column.
3. The new `pilot_*` columns are anon-readable through `programs`' table-level SELECT
   grant plus its unconditional college policy. Column-level REVOKE cannot narrow a
   table-level GRANT, so fixing it means moving `programs`' public projection behind a
   view — a whole-table exposure change, out of scope here.
4. `admin-teams-server.ts` still derives `plan: 'pilot'` from `status = 'active'`; T4+
   should read `pilot_ends_on` / `pilot_ended_at` instead.
5. Provenance note: the migration was applied before the `org_type` guard was added, so
   the ledger's stored SQL for version `20260926075216` lacks that `where` clause. Net
   live state matches the repo file; only the recorded text differs. No corrective
   migration needed — but anyone diffing migration history against live should know.
