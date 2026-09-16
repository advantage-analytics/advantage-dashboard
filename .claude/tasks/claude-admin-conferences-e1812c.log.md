# Run log — claude/admin-conferences-e1812c

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Migration: conferences table, programs.conference_id, backfill, sync triggers — blocked

**gate:** mechanical: pass · completion: needs-work
**failed stage:** completion review. Criterion 4 requires `count(*) from conferences` = 137; live it is 138.
**reason:** the extra row is `Owner Conference` (0 programs, created 07:35:49, after the migration at 07:31:29). The gate's `npm test` ran the live `tests/teams-management.spec.ts`, which sets `p_conference: "Owner Conference"` on a throwaway college program. T1's `programs_sync_conference` trigger created a conferences row for it (create-if-missing for colleges, by design), and the spec's cleanup deletes the program but not the conference. So every live test run can leave conference rows behind. The other four criteria were judged met, including two justified deviations: `conferences_label_key` is `unique (label)`, not `lower(label)`, because live data has both `Ivy League (IVY)` and `Ivy League (Ivy)`; and the name-collision fallback demotes only the losing variant.
**live DB state:** the migration IS applied live (schema_migrations version 20260916073129, `conferences_table`). Backfill verified: 137 migration rows, 2 null `conference_id`, 0 mirror mismatches, conference text md5 unchanged. The orphan `Owner Conference` row was NOT deleted; that is a live-data write left for the author.
**stash:** b82355e52895acee020d20ca9b3422f0e21921f5 (the migration file; it matches what was applied live)
**to unblock (author's call):** decide how test-fixture conferences are cleaned up — e.g. `teams-management.spec.ts` cleanup deletes conference rows it caused, or the trigger stops auto-creating — then delete the orphan row, restore the stash, and reset T1 to `todo`. Criterion 4's "137" holds only while no fixture rows exist.
**follow-ups:**

1. Merge `Ivy League (Ivy)` into `Ivy League (IVY)` once T2/T9 land, then tighten `conferences_label_key` to `lower(label)`.
2. Rename `Northern Sun Intercollegiate Conference  (NSIC)` (double space) to name + `NSIC` via the admin UI.
3. `programs` has no `updated_at` touch trigger; separate task if audit needs it.

## T1 · Migration: conferences table, programs.conference_id, backfill, sync triggers — done

**gate:** mechanical: pass · completion: pass
**changed:** Unblocked by the author choosing to fix the test. `tests/teams-management.spec.ts` now names its owner conference per run (`Owner Conference ${MARK}`) and `afterAll` deletes the conferences row that T1's create-if-missing trigger mints for it. The orphan `Owner Conference` row (0 programs) was deleted live. Stash b82355e5 was restored and dropped. The migration file `supabase/migrations/20260915100000_conferences_table.sql` (already live as schema_migrations 20260916073129) is committed unchanged. After a gate run with the live spec executing: 137 conferences, 0 fixture rows, 2 null `conference_id`, 0 mirror mismatches. Deviations accepted by review: `conferences_label_key` is `unique (label)` (live data holds both `Ivy League (IVY)` and `Ivy League (Ivy)`), and the name-collision fallback demotes only the losing variant.
**follow-ups:**

1. Any other live spec that writes a new college conference name must clean up its conferences row the same way.
2. Merge `Ivy League (Ivy)` into `Ivy League (IVY)` once T2/T9 land, then tighten `conferences_label_key` to `lower(label)`.
3. Rename `Northern Sun Intercollegiate Conference  (NSIC)` (double space) to name + `NSIC` via the admin UI.
4. `programs` has no `updated_at` touch trigger; separate task if audit needs it.
