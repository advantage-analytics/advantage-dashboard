# Tasks — claude/dashboard-research-drive-965c2b

> Scope: Beta launch plan prerequisites — staff-list refresh that drops departed coaches, and click-through pilot terms before team workspace creation.

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

## T1 · Add `source` column to program_contacts and stamp admin rows

- **status:** todo
- **model:** fable
- **files:** `supabase/migrations/<stamp>_program_contacts_source.sql` (new; stamp from `date -u +%Y%m%d%H%M%S`, must sort after `20260925194929_posthog_analytics_reader.sql`), `src/lib/services/programs/admin-program-actions.ts` (`inviteToClaim`, insert at ~line 399) — guess
- **done when:**
  - [ ] The new migration adds `source text` to `public.program_contacts` with a check constraint restricting it to `'scrape'` or `'admin'`, sets it `not null` only AFTER two backfill `update` statements (admin rows first, then everything still null set to `'scrape'`), and declares no column default, so every writer must name its source.
  - [ ] The admin backfill's predicate is written in the migration with a comment recording the live row count it matched at apply time and how that count was cross-checked (see notes); the migration also carries a `comment on column` stating that only `source = 'scrape'` rows may be deleted by the seed's prune pass.
  - [ ] `inviteToClaim`'s `program_contacts` insert includes `source: "admin"`; no other insert into `program_contacts` exists in `src/` without a `source` (grep `from("program_contacts")` returns only writers that set it).
  - [ ] `bash .claude/skills/create-migration/check.sh` passes on the diff.
- **notes:** Read `.claude/skills/create-migration/SKILL.md` first. `program_contacts` has RLS enabled with deliberately NO policies and all grants revoked (`20260817074012`, `20260818041110`) — the column needs no policy work; do not add one. Discriminator the code implies (verify against live before backfilling, do NOT guess): the seed (`scripts/seed-programs.ts`) always writes `email_domain`/`registrable_domain` from the CSV and ran 2026-08-17; `inviteToClaim` writes neither (`email_domain is null`), `source_url null`, `role = 'Head coach'`, `is_freemail = false`, and can only have run after the admin console shipped 2026-09-14. Candidate admin predicate: `source_url is null and email_domain is null and created_at > '2026-09-01'`; cross-check its count against the 88 null-`source_url` rows and against `created_at::date <> '2026-08-17'`, and stop and report if they disagree. Runner step (outside the diff): apply with `mcp__supabase__apply_migration`, then `get_advisors`, and record both counts in the run log.

## T2 · Seed script prunes departed scrape contacts, with a tested pure diff

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** `scripts/seed-programs.ts`, `scripts/lib/contact-prune.ts` (new), `tests/seed-contact-prune.spec.ts` (new) — guess
- **done when:**
  - [ ] `scripts/lib/contact-prune.ts` exports a pure `staleScrapeContacts(existing, dataset)` (no Supabase or fs imports) that returns the ids of existing rows with `source === "scrape"` whose program IS in the dataset and whose lowercased, trimmed email is NOT among that program's dataset emails.
  - [ ] `tests/seed-contact-prune.spec.ts` (offline, same shape as `tests/cleanup-orphan-attribution.spec.ts`) asserts: a departed scrape contact is returned; an `admin` row with the same absent email is never returned; a scrape row on a program absent from the dataset is never returned; an email differing only in case or whitespace is not pruned; an empty dataset prunes nothing.
  - [ ] `seed-programs.ts` sets `source: "scrape"` on every contact row it upserts, and after the contacts upsert runs a prune pass that deletes exactly the ids `staleScrapeContacts` returns (chunked `.in("id", …)`), guarded by `APPLY`.
  - [ ] Dry-run (no `--apply`) reads the current `program_contacts` rows for the dataset's programs, prints a line with the number of contacts the prune WOULD delete, and still performs no write (the existing "dry run — nothing written" path is preserved).
  - [ ] The header comment no longer claims contacts are "replaced per program"; it states: programs and domains upsert, contacts upsert then scrape-only prune, admin rows and programs absent from the dataset are never touched.
- **notes:** `program_contacts` has a unique index on `(program_id, lower(email))`, so the diff must compare on lowercased email. Runner step (outside the diff, after T1 is applied live): `npx tsx scripts/seed-programs.ts` against the current dataset dir and record the reported delete count in the run log — the author expects 0 for an unchanged dataset; a non-zero count is a finding, not a failure.

## T3 · Pilot terms acceptances table + RPC enforcement

- **status:** later
- **model:** fable
- **files:** `supabase/migrations/<stamp>_pilot_terms_acceptances.sql` (new), `src/lib/services/programs/pilot-terms.ts` (new: `PILOT_TERMS_VERSION`), `src/lib/services/programs/create-actions.ts`, `src/lib/services/programs/claim-actions.ts` (`completeClaim` ~838, `completeClaimWithToken` ~1000), `tests/pilot-terms-rls.spec.ts` (new, live-db) — guess
- **done when:**
  - [ ] The migration creates `public.pilot_terms_acceptances` (`id`, `user_id` → `auth.users` not null, `program_id` → `programs` nullable, `terms_version text not null`, `accepted_at timestamptz default now()`), enables RLS in the same file with an insert policy limited to `user_id = auth.uid()` and a select policy limited to own rows, no update/delete policy, and `anon` revoked; `check.sh` passes.
  - [ ] The current version exists in exactly two places that name each other in a comment: `public.current_pilot_terms_version()` (SQL, returns a literal) and `PILOT_TERMS_VERSION` in `pilot-terms.ts`; a `terms_version` that does not equal the current one is treated as no acceptance.
  - [ ] `complete_program_claim`, `complete_program_claim_with_token` AND `create_custom_program` are re-created to raise a single named SQLSTATE (documented in the migration header) when the acting user has no `pilot_terms_acceptances` row for the current version, and on success set `program_id` on that row; admin-side RPCs (`admin_create_program`) are unchanged.
  - [ ] `createCustomProgram` and `completeClaim`/`completeClaimWithToken` map that SQLSTATE to a new result reason `"terms-not-accepted"` in their result unions.
  - [ ] `tests/pilot-terms-rls.spec.ts` (pattern: `tests/saved-views-rls.spec.ts`, skipping on `PGRST205` before the migration lands and against prod) proves: `create_custom_program` fails with the named SQLSTATE without an acceptance and succeeds after the same session inserts one; a session cannot insert a row with another `user_id`; a stranger reads zero rows.
- **notes:** Promote to `todo` by hand once the pilot terms screen is designed in Claude Design and the author approves the frame. Design lives in the Claude Design audit project `afde9116-328b-445c-aeff-8b3c2a702d6f` (read with DesignSync `list_files` / `get_file`; if it 404s, DesignSync is authorized as the wrong account). If the frame changes the acceptance shape (e.g. per-program only), rewrite criterion 1 before promoting. Existing pattern for RPC-gate live specs: `tests/admin-program-rpcs.spec.ts`. `complete_program_claim_with_token` takes the claimant as a parameter (`p_claimant`), not `auth.uid()` — check the acceptance against that parameter. No existing spec calls `create_custom_program` or `complete_program_claim`, so the new refusal breaks nothing already in the suite. `program_id` is nullable because in the custom flow the program does not exist when the coach accepts; the RPC fills it in. Runner step: apply live with `apply_migration`, run `get_advisors`, record output.

## T4 · Pilot terms screen in both team-creation flows

- **status:** later
- **model:** opus
- **needs:** T3
- **files:** `src/lib/services/programs/pilot-terms.ts` (copy beside the version), `src/lib/services/programs/pilot-terms-actions.ts` (new server action), `src/components/claim/pilot-terms-form.tsx` (new), `src/app/claim/[programKey]/terms/page.tsx` (new), `src/app/claim/team/terms/page.tsx` (new), `src/app/claim/verify/route.ts`, `src/app/claim/team/setup/page.tsx` + `src/app/claim/team/actions.ts`, `tests/pilot-terms-copy.spec.ts` (new, offline), `MAP.md` (regenerated) — guess
- **done when:**
  - [ ] All five terms' strings live only in `pilot-terms.ts` next to `PILOT_TERMS_VERSION`; the form component renders from that module and contains no term prose literal; the end date comes from `formatPilotEnd()` and the hours from `getMonthlyCapHours()` — the module and component contain no literal `75`, `December 31` or `2026-12-31`.
  - [ ] `tests/pilot-terms-copy.spec.ts` (offline) imports the copy module and asserts: no U+2014 em dash anywhere, no `splitstep`/`SplitStep`, no `export`/`privacy` promise wording, and that the rendered date and hours equal `formatPilotEnd()` and `getMonthlyCapHours(...)` for the tier passed in.
  - [ ] Collegiate flow: `/claim/verify` first checks for an acceptance at the current version for the signed-in session and, when absent, redirects to the terms screen carrying `?token=` when present, only calling `completeClaim`/`completeClaimWithToken` on the return trip; the token is never dropped.
  - [ ] Custom flow: submitting `/claim/team/setup` reaches the terms screen before `createCustomTeam` runs; the accept server action writes the acceptance through the session (cookie) client, never `createAdminClient()`, and the form's single primary button uses `advButton()`.
  - [ ] `npm run map` output is committed (`MAP.md` lists both new routes), and `npm run typecheck` and `npm run lint` pass.
- **notes:** Promote to `todo` by hand once the pilot terms screen frame in Claude Design (audit project `afde9116-328b-445c-aeff-8b3c2a702d6f`, read via DesignSync) is approved; build from that frame — it owns layout, copy wording and where the screen sits in each flow. If it moves the screen, rewrite criteria 3–4 before promoting. Read `.skills/advantage-analytics-design/SKILL.md` before building. The custom-team flow (`/claim/team`) draws the INDIVIDUAL tier (2h) via `quotaTierFor()`, not 75h — term (1) must not claim 75 hours there; the frame decides whether copy branches by flow or prints `getMonthlyCapHours(quotaTierFor(...))`.
