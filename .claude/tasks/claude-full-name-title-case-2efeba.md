# Tasks — claude/full-name-title-case-2efeba

> Scope: show a person's full name, in title case, everywhere in the claim/join flow.

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

## T1 · Add `titleCaseName` and its offline spec
- **status:** done
- **model:** opus
- **files:** src/lib/data/person-name.ts, tests/person-name-display.spec.ts (new) — guess
- **done when:**
  - [ ] `titleCaseName(value: string): string` is exported from `src/lib/data/person-name.ts` beside `normalizedPersonName`; it never throws and returns `""` for `""` and whitespace-only input, and trims and collapses internal whitespace
  - [ ] Re-cased: `clajerson gimena` and `CLAJERSON GIMENA` → `Clajerson Gimena`; `o'brien` → `O'Brien`; `smith-jones` → `Smith-Jones`; `MCCARTHY` → `McCarthy`; `iii` → `III`
  - [ ] Untouched, asserted as identity: `McCarthy`, `O'Brien`, `DeMarco`, `MacLeod`, `III`; and the declined cases are pinned: `DE LA CRUZ` → `De La Cruz`, `macon` → `Macon`
  - [ ] The doc comment states the rules in order — R1 mixed-case token wins, R1b roman-numeral token, R2 re-case, R2a the `mc` exception — plus the two declined decisions (particles; no `mac` rule, with `Macon`/`Macey`/`Mackey` as the reason) and the note that this side collapses `\s+` including U+00A0 while the SQL side's `btrim` does not, and why that is harmless for display
  - [ ] `npx playwright test tests/person-name-display.spec.ts` passes offline — no browser, no database — following `score-format.spec.ts` / `person-name-matching.spec.ts`; `npm run lint` clean; no other file changes
- **notes:** The design's R1 as written is contradicted by its own examples — `GIMENA` holds an uppercase after the first character, so literal R1 would leave it alone. The correct reading, confirmed with the human at stage 04: **R1 fires only on a MIXED-case token** (an uppercase after the first character AND at least one lowercase letter). That makes an all-caps suffix fall through to R2, so the human added **R1b**: a token made entirely of `i`/`v`/`x` letters, length 2 or more, is uppercased whole — `III` survives as typed and `iii` becomes `III`. Rule order is R1 → R1b → R2 (with R2a inside it). Nothing in the app calls this yet, so no screen changes.

## T2 · Wire the two choke points and correct the TypeScript-side stale comments
- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** src/lib/data/programs-server.ts (`toResult` ~line 130, the file header ~line 7, the `ownerDisplay` doc ~line 29), src/lib/services/programs/invite-acceptance.ts (`displayName` ~line 194), src/app/api/programs/search/route.ts (doc block ~line 11) — guess
- **done when:**
  - [ ] `toResult` returns `ownerDisplay: titleCaseName((row.owner_display as string | null) ?? "") || null` — the `|| null` survives, so a blank composes to `null` and never to `""`
  - [ ] `displayName` title-cases the composed name before returning and still returns `null`, not `""`, when both parts are blank; the rest of its doc comment is unchanged
  - [ ] In `route.ts` the sentence "the owner comes back as \"D. Wu\" with no address" now says the full name comes back and still never an address; the paragraph below it explaining the `?intent=join` redaction is byte-for-byte unchanged
  - [ ] `grep -rn "First L\.\|D\. Wu\|Elena V\." src/lib/data/programs-server.ts` returns nothing — the `ownerDisplay` doc at `:29` and the file header at `:7-8` both state the old abbreviation as a promise, and are the only two occurrences this task owns. Scoped to that one file on purpose: a repo-wide grep also hits `src/components/claim/contact-owner-form.tsx:45`, which criterion 5 requires left untouched
  - [ ] `npm run lint` and `npm run build` pass; `redactForPlayer` and every file under `src/app/claim/`, `src/app/join/`, `src/components/claim/`, `src/components/join/` are untouched
- **notes:** Two behavioural lines; the rest is comments. Known, approved spillover: `displayName` also feeds `/onboarding`, `/invitations/[inviteId]`, `components/join/invite-offer.tsx` and the dashboard activity tray, which inherit corrected casing only — do not touch those files. Until T3 lands, the claim surfaces still render `Clajerson G.` because the abbreviation is still in SQL; that is expected, not a failure.

## T3 · Migration: both definer functions return the full name, with corrected comments
- **status:** done
- **model:** fable
- **files:** supabase/migrations/<timestamp>_full_owner_name.sql (new); the live database via the Supabase MCP — guess
- **done when:**
  - [ ] One migration with `create or replace` for `public.program_public_status(text)` and `public.search_programs(text, integer)`; both `returns table(...)` column lists are identical to the live definitions (`owner_display text` stays), and the only body change is the owner expression becoming `btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))` — `program_public_status` keeps its `case when u.id is null then null` wrapper
  - [ ] Both carry `stable`, `security definer` and `set search_path to ''` verbatim, and re-state `revoke all ... from public` plus `grant execute ... to anon, authenticated`, matching `20260817074759_program_public_status.sql`
  - [ ] Both `comment on function` texts say the full name is returned, still never an address, and record why: the page is reachable by anonymous visitors and showing the surname was a deliberate product decision — so the next reader does not "fix" it back
  - [ ] The migration is applied to the live database; both live definitions read back after apply match the file, and the task report quotes them
  - [ ] `grep -rn "First L\.\|D\. Wu" supabase/` matches only migrations older than this one; no TypeScript file changes
- **notes:** The live database is the source of truth — the repo is ~100 migrations behind, so read both current definitions from live before writing, not from the migration folder. Sanity check after apply, reported not gated: `program_public_status()` for the ZZ Test Program returns the owner's full name with no trailing `.`, and `search_programs` on that school returns the same rather than `C. Gimena`. If the Supabase MCP is unavailable to the subagent, the file may be written but the task must end `blocked` — do not claim it was applied. Independent of T1 and T2: the SQL and the TypeScript are separate halves of one result.

## T4 · Live-database regression fence for both functions
- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** tests/program-owner-name-live.spec.ts (new), tests/fixtures/live-db.ts (read only) — guess
- **done when:**
  - [ ] A new live-database spec follows `join-requests-staff-read.spec.ts`: the same `fixtures/live-db` imports, `test.skip` when the environment is absent, rows created with the service-role client in `beforeAll` under a per-run marker and deleted in `afterAll`
  - [ ] The fixture is a program whose owner's `public.users` row is stored with deliberately non-title casing in both `first_name` and `last_name`, so the assertion cannot pass by accident
  - [ ] Exactly two assertions on the owner string, one per function, both through an anon rather than service-role client: `program_public_status(key)` and `search_programs(term)` each return `owner_display` equal to `${first_name} ${last_name}` verbatim — raw casing, since SQL does not title-case — and containing no `.`
  - [ ] `npx playwright test tests/program-owner-name-live.spec.ts` passes with `.env.local` present and skips cleanly without it; `npm test` passes
  - [ ] No source files change — this task adds a spec only
- **notes:** A fence, not a suite — resist widening. The plan's test strategy commits to these two assertions but no plan step owned the file, which is why this is its own task; it is also the only diff-observable proof that T3 changed behaviour on live. The `handle_new_user` trigger creates the `public.users` row, so set the names on it via the admin client after the login is created. Custom-org rows are filtered out of `search_programs`, so the fixture program must satisfy the college-fields check.
