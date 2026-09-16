# Tasks — claude/admin-conferences-e1812c

> Scope: Admin console Phase 2a — Conferences table, admin RPCs and the /admin/conferences page (plan: ~/.claude/plans/synchronous-cuddling-phoenix.md, Phase 2a).

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

## T1 · Migration: conferences table, programs.conference_id, backfill, sync triggers

- **status:** done
- **model:** fable
- **files:** supabase/migrations/20260915100000_conferences_table.sql (new; guess — applied live via MCP apply_migration)
- **done when:**
  - [ ] The migration file creates `public.conferences` (id, name, short_name, division, website, stored generated `label` = `name || ' (' || short_name || ')'` or bare `name`, created_at, updated_at) with DO-block CHECKs (name 2–120 trimmed; short_name 1–12 chars, no parentheses; division in D1/D2/D3/NAIA/JUCO; website ≤ 200), unique indexes on `lower(btrim(name))` and `lower(label)`, an `updated_at` touch trigger, RLS on with `select … using (true)` for `authenticated`, and `revoke insert, update, delete` from `anon, authenticated`.
  - [ ] It adds `programs.conference_id uuid references conferences(id) on delete restrict` (if not exists) plus partial index `programs_conference_id_status_idx on programs (conference_id, status) where conference_id is not null`, and defines `public.conference_id_for(p_label, p_division, p_create boolean) returns uuid` (security definer, `set search_path=''`), the BEFORE trigger `programs_sync_conference` (INSERT OR UPDATE OF conference, conference_id; create-if-missing only when `new.org_type = 'college'`) and the AFTER trigger `conferences_mirror_label` (UPDATE OF name, short_name).
  - [ ] The backfill DO block parses `^(.*\S)\s*\(([^()]{1,12})\)$`, falls back to `(full, null)` on recomposition mismatch or `lower(name)` collision, sets `division = mode()` of carrying programs, and ends with two `raise exception` assertions: college `(conference is null) = (conference_id is null)` for every row, and `conference is not distinct from (select label from conferences where id = conference_id)` for every row.
  - [ ] Live after apply (`mcp__supabase__execute_sql`): `select count(*) from conferences` = 137; `select count(*) from programs where conference_id is null` = 2; `select count(*) from programs p left join conferences c on c.id = p.conference_id where p.conference is distinct from c.label` = 0; `select * from search_programs('b1g', 8)` returns the same rows as before the migration.
  - [ ] Inside a rolled-back transaction, `update conferences set short_name = 'ZZZ' where label = 'Ivy League (IVY)'` followed by `select distinct conference from programs where conference_id = <that id>` yields exactly `Ivy League (ZZZ)`.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A1 (read "Design decisions" 1 and the Context bullet on conferences first). Design decisions this task owns: `programs.conference` stays as a trigger-fed mirror of `conferences.label`, so the backfill changes zero bytes of existing text; the `programs` trigger accepts writes on either column (id → text follows; text → id resolved, **create-if-missing only for `org_type='college'`**; early return when text already equals the id's label); invariant for college rows `conference is null ⇔ conference_id is null`. Verified live today: 1,942 programs, 137 distinct strings, every string in exactly one division. Migration must be idempotent. Load the `supabase:supabase-postgres-best-practices` skill before writing DDL; use `(select auth.uid())` if any policy needs it; partial indexes must match their WHERE. Capture `search_programs('b1g', 8)` output before applying so criterion 4 can be compared.

## T2 · Migration: admin conference RPCs + audit action

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** supabase/migrations/20260915100100_admin_conference_rpcs.sql (new; guess — applied live via MCP apply_migration)
- **done when:**
  - [ ] The file defines `admin_upsert_conference(p_id, p_name, p_short_name, p_division, p_website) returns uuid`, `admin_merge_conferences(p_source, p_target) returns integer`, `admin_delete_conference(p_id)`, `admin_set_program_conference(p_program_id, p_conference_id)` and `admin_list_conferences() returns table (id, name, short_name, division, website, label, teams int, on_advantage int, pilot int, schools int, has_mens bool, has_womens bool, updated_at)`; every body is `security definer`, `set search_path = ''`, opens with `if not public.is_admin() then raise exception … using errcode = '42501'`, and each has `revoke all … from public, anon; grant execute … to authenticated`.
  - [ ] `admin_merge_conferences` requires `p_source <> p_target`, locks both rows `for update` in id order, inserts one `program_audit_log` row per moved program (`action = 'program.conference_changed'`, `details {from, to, by_admin: true, reason: 'merge'}`), updates `programs.conference_id`, deletes the source and returns the moved count; `admin_set_program_conference` locks the program, no-ops when unchanged, writes the same audit shape with `reason: 'set'`, and accepts null (remove); `admin_delete_conference` raises `P0001` with message "This conference still has N teams — merge it into another one first." when any program points at it.
  - [ ] `admin_list_conferences` is `stable` and computes Teams = all programs with the id, On Advantage = `status in ('active','claim_pending')`, Pilot = `status = 'active'`, `schools = count(distinct school_group)` and has_mens/has_womens via one `left join lateral` grouped query.
  - [ ] The `program_audit_log_action_check` constraint is re-created from the current live list (`pg_get_constraintdef`) plus `'program.conference_changed'`; live `select pg_get_constraintdef(oid) from pg_constraint where conname = 'program_audit_log_action_check'` contains that string.
  - [ ] Live: `select count(*), sum(teams) from admin_list_conferences()` run as an admin returns `137, 1940`; `select proacl from pg_proc where proname like 'admin_%conference%'` shows no `anon` or `PUBLIC` execute grant on any of the five.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A2. Pattern file: `supabase/migrations/20260914100200_admin_program_rpcs.sql` — but **copy live bodies via `pg_get_functiondef` (e.g. of `admin_create_program`, `is_admin`), never the repo folder**, which is ~100 migrations behind. Let unique-violation `23505` bubble from upsert (TS in T4 maps it to "A conference with that name already exists."). The merge relies on T1's `conferences_mirror_label`/`programs_sync_conference` triggers to rewrite `programs.conference` text. Migration idempotent (`create or replace`, drop/re-add the CHECK by name). The live spec in T3 covers merge behaviour repeatably.

## T3 · Live spec: conference RPC gates + sync invariant

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** tests/admin-conferences-rpcs.spec.ts (new; guess), tests/fixtures/live-db.ts (read only)
- **done when:**
  - [ ] The spec is `test.describe.serial`, uses `tests/fixtures/live-db.ts` and mirrors the structure of `tests/admin-program-rpcs.spec.ts`; it `test.skip`s when the live-DB env is absent, and `npm test` without env reports it skipped, not failed.
  - [ ] It asserts: admin creates two conferences whose name `"<mark> League (ML)"` parses to `short_name = 'ML'`; a non-admin user receives errcode `42501` from all five RPCs (`admin_upsert_conference`, `admin_merge_conferences`, `admin_delete_conference`, `admin_set_program_conference`, `admin_list_conferences`).
  - [ ] It asserts the trigger paths: `admin_create_program(p_conference => labelA)` yields `conference_id = A`; an unseen label on an `org_type='college'` program creates a `conferences` row with a parsed `short_name`, while the same on a club leaves `conference_id` null; `admin_set_program_conference` moves the program, rewrites `programs.conference` to the target label and inserts a `program.conference_changed` audit row.
  - [ ] It asserts renaming B rewrites `programs.conference` for every pointing program; `admin_merge_conferences(A, B)` moves A's programs, deletes A and returns the count; `admin_delete_conference` on a populated conference rejects with `P0001` and succeeds once the programs are moved off.
  - [ ] Cleanup (`afterAll`) deletes the created programs before the created conferences, and the spec passes end-to-end against the live DB with env set.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A3. Depends on T1's triggers (mirror-label, create-if-missing only for college) and T2's RPCs. Use a unique run mark in every name so parallel runs and leftovers cannot collide with real conferences; never touch real `programs` rows.

## T4 · Conferences loader, server actions, pure helpers

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** src/lib/data/admin-conferences-server.ts (new), src/lib/services/programs/admin-conference-actions.ts (new), src/lib/services/programs/conference-format.ts (new), src/lib/data/programs-server.ts (edit) — all guesses per the plan's file tree
- **done when:**
  - [ ] `admin-conferences-server.ts` exports `AdminConferenceRow { id, name, shortName, division, website, label, teams, onAdvantage, pilot, schools, squads: 'mens'|'womens'|'both'|null, updatedAt }`, `AdminConferencesView = 'all'|'on_advantage'|'missing'`, `AdminConferencesSort = 'most_teams'|'name_asc'`, and `listAdminConferences()` wrapped in React `cache()` that calls `requireAdminOrNotFound()`, invokes `.rpc('admin_list_conferences')` on the **session** client, and performs one service-role `head: true` count of programs with null `conference_id`, returning `{ rows, unplaced }`; it also exports `getAdminConferenceTeams(conferenceId)` (service role, `programDisplayName` + `crestUrl` from `teams-server.ts`).
  - [ ] Pure exports `applyConferenceView` (all / `onAdvantage > 0` / any of shortName, website, division null), `sortConferences` (most_teams = teams desc then name; name_asc = `localeCompare`) and `conferenceMeta(row)` producing e.g. "Division I · 8 schools, men's and women's", dropping null halves, singular "1 school", "men's only"/"women's only"; `programs-server.ts` gains `divisionLongLabel()` ("Division I" …) next to `divisionLabel`.
  - [ ] `conference-format.ts` exports pure `normalizeWebsite` (strip scheme and trailing slash, lower-case host, whitespace-only → null), `websiteHref` (prefixes `https://`), `conferenceInitials(name, shortName)` (short name when ≤ 3 chars, else initials with digits kept: "Big 12" → "B12"), and `conferenceChanged(saved, draft)` (null ↔ "" and whitespace-only are not changes).
  - [ ] `admin-conference-actions.ts` is `"use server"`, follows `admin-program-actions.ts`, and exports `createConference`, `saveConference`, `mergeConferences`, `deleteConference`, `addTeamToConference`, `loadConferenceTeams`; each calls `requireAdmin()` first, uses the session client for the RPC, returns `{ ok: true, … } | { ok: false, error }`, maps Postgres `23505` to "A conference with that name already exists." and `P0001` to the RPC's message, and mutating actions call `revalidatePath("/admin", "layout")`.
  - [ ] `npm run typecheck` is green, and a throwaway server-component check (deleted before commit) or a scratch script logs `rows.length === 137` and `unplaced === 2` from `listAdminConferences()`.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A4. Design decisions: `requireAdmin()` then **session client** for writes so `auth.uid()` in audit rows is the admin; service role only for the member-scoped null-count and team listing. `createConference` should return the new id so T7 can `syncUrl(newId)`. Service-role code must stay server-only — keep `"use server"` and no client imports.

## T5 · Move existing conference readers to the conferences table

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/data/team-settings-server.ts, src/lib/data/admin-teams-server.ts, src/lib/data/admin-search-server.ts (edits; guesses per plan)
- **done when:**
  - [ ] `getConferenceOptions` in `team-settings-server.ts` issues a single `conferences.select('label').order('label')` (with `.eq('division', …)` when a division is passed), still returns `string[]` of labels, the `CONFERENCE_PAGE` constant and the paging loop are removed, and the doc comment describes the new source; `grep -rn CONFERENCE_PAGE src` returns nothing.
  - [ ] `listAdminTeamFacets` in `admin-teams-server.ts` derives conferences from `conferences.select('label')` and divisions from the fixed D1/D2/D3/NAIA/JUCO list sorted by `divisionLabel`; states logic is unchanged and the `?conference=` label filter (`.eq("conference", …)`) is untouched.
  - [ ] `admin-search-server.ts` selects `conference_id` and `AdminSearchResult` gains `conferenceId: string | null` and `conferenceLabel: string | null`.
  - [ ] `ConferenceSelect`, `create-team-dialog.tsx`, `team-identity-card.tsx` and `dual-school-step.tsx` have no diff, and `npm run typecheck` and `npm run lint` are green.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A5 and design decision 5 (return shapes unchanged). Correctness of the untouched label filter relies on T1's exact mirror (`programs.conference` = `conferences.label`). Independent of T4; can run in parallel with T6.

## T6 · ConferenceMark + conferences table

- **status:** done
- **model:** opus
- **needs:** T4
- **files:** src/components/admin/conference-mark.tsx, src/components/admin/conferences-table-layout.ts, src/components/admin/conferences-table.tsx (new; guesses per plan)
- **done when:**
  - [ ] `ConferenceMark({ name, shortName, size: 24 | 28 | 40 })` renders a square with `rounded-[var(--radius-button)]`, `bg-[var(--surface-subtle)]` and initials from `conferenceInitials`; no `rounded-full`.
  - [ ] `conferences-table-layout.ts` exports `COL` (conference `min-w-0 flex-1`, division `w-[64px]`, teams `w-[56px] text-right`, onAdvantage `w-[104px] text-right`, pilot `w-[48px] text-right`), `ROW`, `CONFERENCES_COLUMNS` and `conferenceRowId(id)`, matching the frame grid `minmax(0,1fr) 64px 56px 104px 48px`.
  - [ ] `ConferencesTable` follows `requests-table.tsx`: container rows with `role="button"`, persistent selected wash, no chevron, `TableEmptyBody` for zero rows; cells are `ConferenceMark` 28 + name (13px/500), `divisionLabel` or `EmptyMark`, and three `tabular-nums` counts where a zero is coloured `--ink-600`.
  - [ ] `node scripts/check-design-drift.mjs` reports seeds unchanged, and `npm run typecheck` + `npm run lint` are green.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A6. Frame (source of truth for metrics/colours, not the plan text): `/private/tmp/claude-501/-Users-cjgimena-Desktop-vscode-advantage-dashboard--claude-worktrees-remove-title-attributes-e1812c/6be4629b-eb27-4993-8822-bf4f8a330486/scratchpad/canvas-p2/Conferences.dc.html` (markup lines 844–1052). Read `.skills/advantage-analytics-design/SKILL.md` + `reference/tables.md` first. Deviation on record: Division column reads "D-I" via Phase 1's `divisionLabel`. Radius only via tokens; no nested cards; no `focus-visible:ring-*`.

## T7 · /admin/conferences page, page content, Add conference dialog

- **status:** done
- **model:** opus
- **needs:** T6
- **files:** src/app/admin/conferences/page.tsx (replace stub), src/components/admin/conferences-page-content.tsx (new), src/components/admin/add-conference-dialog.tsx (new) — guesses per plan
- **done when:**
  - [ ] `page.tsx` no longer renders `ComingSoon`, exports `dynamic = "force-dynamic"`, parses `view | sort | division | id` search params with `one()`, awaits `listAdminConferences()` and renders `ConferencesPageContent`; `npm run map` produces no diff.
  - [ ] `ConferencesPageContent` copies `requests-page-content.tsx`'s selection machine (`selectedId`/`drawerId`/`closing`, 240ms fallback, `syncUrl('id')`, Esc and ↑/↓ over `shown`, render-time reset) and `teams-page-content.tsx`'s `pushCut({ view, sort, division })`; `visible = sortConferences(applyConferenceView(rows))` then division filter; `shown = expanded ? visible : visible.slice(0, 50)`; drawer counter uses `shown.length`.
  - [ ] Title slot renders `<h1 className="text-display">Conferences</h1>`, a `text-body-sm` summary "N conferences · M teams placed · K with none" (K = `unplaced`), and a primary "Add conference" button built with `advButton("primary", "md")` + `Plus`; toolbar is `ViewPills` (All · With teams on Advantage · Missing details) · spacer · `FilterTrigger` + `FloatMenu` (Any · D-I · D-II · D-III · NAIA · JUCO) · `SortTrigger` + `FloatMenu` (Most teams / Name A–Z); the strip reads "50 of 137 · Show all" (blue text button) unfiltered, or the grey cut sentence "Division I · 24 of 137 · Clear filter" with a division filter; the page wraps in `AdminPage className={cn("gap-4", drawerRow && "pr-10")}` with `rail={<ConferenceDrawer …/>}` (a placeholder drawer export is acceptable until T8).
  - [ ] `AddConferenceDialog` is a 440px `Dialog` following `create-team-dialog.tsx`'s one-step shape with Name · Short name · Division (`MenuSelect` underline) · Website via `advField("underline")`, Cancel + primary "Add conference" disabled until trimmed Name length ≥ 2, `DialogProblem` for errors; on success it calls `syncUrl(newId)` then `router.refresh()`.
  - [ ] `npm run typecheck`, `npm run lint` and `node scripts/check-design-drift.mjs` are green with seeds unchanged.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A7 and design decisions 4 and 6 (URL-held view/sort/filter as Requests; load all 137, render 50, client-side Show all, no cursor). Frame: `/private/tmp/claude-501/-Users-cjgimena-Desktop-vscode-advantage-dashboard--claude-worktrees-remove-title-attributes-e1812c/6be4629b-eb27-4993-8822-bf4f8a330486/scratchpad/canvas-p2/Conferences.dc.html` (markup 844–1052) is the source of truth for layout/colours. Design skill + `chrome.md`/`tables.md`; no numeric badges; `advButton()` only; Filters carries exactly one facet (Division). Run the `trace-route` skill before editing `page.tsx`.

## T8 · Conference drawer

- **status:** done
- **model:** opus
- **needs:** T7
- **files:** src/components/admin/conference-drawer.tsx (new; guess), src/components/admin/conferences-page-content.tsx (wire the rail)
- **done when:**
  - [ ] `ConferenceDrawer` follows `request-drawer.tsx`: `PeekDrawerFrame kind="Conference" label={row.name} focusKey={row.id}` with `onChanged={() => router.refresh()}`; identity row is `ConferenceMark` 40 + name in `text-title-lg` (wrapping) + `conferenceMeta(row)` at 11px `--ink-500`.
  - [ ] Fields are a 2-col grid `gap-x-4 gap-y-5`: Name (span 2), Short name, Division (`MenuSelect variant="underline"`, helper "A conference sits inside one division."), Website (span 2, with an `ArrowUpRight` link to `websiteHref(website)` when set); the draft state is seeded from `row` and re-seeded in an effect keyed on `row.id`.
  - [ ] Footer is a full-width `advButton("primary", "md")` "Save changes" that is `disabled` unless `conferenceChanged(row, draft)`, reads "Saving…" while pending, shows a `role="alert"` error line on failure, and on success calls `saveConference` then `onChanged()` (which refreshes row, table and summary; `programs.conference` follows via T1's mirror trigger).
  - [ ] Teams section: `eyebrow-sm` "Teams" + count (`--ink-500`, 400) + a 12px blue "Add a team" text button; rows load via `loadConferenceTeams(row.id)` in `useEffect` behind a module-level `Map` cache keyed by id (the `match-drawer.tsx` details-cache shape) that is invalidated after writes; each row is `ProgramCrest size={26}` + `Link` to `/admin/teams/[id]` + right-side `PilotPill` for `active`, else 11px `--ink-500` "Claim pending"/"Unclaimed"; first 5 then "N more · Show all"; empty state "No teams yet.".
  - [ ] "Add a team" opens a `Popover` reusing the `admin-search.tsx` input with debounced `adminSearchTeams`; a result with no conference calls `addTeamToConference` immediately, one in a different conference opens `ConfirmDialog` "Move {name} to {this}?" / "Move team" before calling it, and one already in this conference renders an inline "already here" row with no action; after a successful add the cache entry is invalidated and `onChanged()` runs so Teams increments.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A8. Frame: `/private/tmp/claude-501/-Users-cjgimena-Desktop-vscode-advantage-dashboard--claude-worktrees-remove-title-attributes-e1812c/6be4629b-eb27-4993-8822-bf4f8a330486/scratchpad/canvas-p2/Conferences.dc.html` (markup 844–1052). Deviations on record: drawer meta uses "Division I" (`divisionLongLabel`); team rows use 26px `ProgramCrest`; "Add a team" confirms only when the team leaves another conference; website stored normalised via `normalizeWebsite`, linked with `https://`. Rail drawer pattern memory: CSS width-keyframe shell + selection model (re-click closes, Esc, ↑/↓, `?id=`). Uses `conferenceId`/`conferenceLabel` from T5's `AdminSearchResult` — if T5 has not landed, read `program.conference_id` directly and note it.

## T9 · Merge and Delete conference

- **status:** done
- **model:** opus
- **needs:** T8
- **files:** src/components/admin/conference-drawer.tsx (actions menu), src/components/admin/merge-conference-dialog.tsx (new) — guesses per plan
- **done when:**
  - [ ] The drawer's `actions` slot renders a `ChromeTooltip label="Conference actions"` around the ⋯ `ICON_BUTTON` opening a `FloatMenu width={244}` with "Merge into…" (`Merge` glyph, description "Moves every team, then removes this one."), a hairline, then exactly one of: when `row.teams === 0` a destructive "Delete" row (`Trash2`, `DESTRUCTIVE_ROW` classes from `request-drawer.tsx`) that opens `ConfirmDialog tone="danger"` "Delete {name}?" / "Delete conference" → `deleteConference`; when `row.teams > 0` a `FloatMenuNote` "Delete is available once no team points here — merge it into another conference first." and no Delete row.
  - [ ] `MergeConferenceDialog` is a 440px `Dialog` titled "Merge {source} into…" with a typeahead over the already-loaded `rows` minus the source (`useListboxNav`; filters on name and short name; option row = `ConferenceMark` 24 + name + "N teams").
  - [ ] Once a target is chosen, the dialog shows a `ConfirmList` with "{N} teams move to {target}", "{source} is deleted", "Every reader of the conference name sees {target}'s", and Cancel + `danger-solid` "Merge conferences" calling `mergeConferences(source, target)`; on success it calls `syncUrl(targetId)` then `router.refresh()` so the drawer lands on the target.
  - [ ] `deleteConference`'s `{ ok: false, error }` (the RPC's `P0001` message) is surfaced in the confirm dialog's problem slot rather than swallowed, so a populated conference driven from the console still cannot be deleted.
  - [ ] `npm run typecheck`, `npm run lint` and `node scripts/check-design-drift.mjs` are green.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A9. Frame: `/private/tmp/claude-501/-Users-cjgimena-Desktop-vscode-advantage-dashboard--claude-worktrees-remove-title-attributes-e1812c/6be4629b-eb27-4993-8822-bf4f8a330486/scratchpad/canvas-p2/Conferences.dc.html`. Deviations on record: Delete on a populated conference is a `FloatMenuNote`, not a disabled row; drawer ⋯ gets a `ChromeTooltip` (icon-only rule). Merge semantics (moves programs, rewrites `programs.conference` text through the mirror trigger, deletes source, audit rows) live in T2's `admin_merge_conferences` — the UI only calls `mergeConferences`.

## T10 · Pure tests, route smoke, housekeeping

- **status:** done
- **model:** sonnet
- **needs:** T3, T5, T9
- **files:** tests/admin-conferences-logic.spec.ts (new), tests/admin-routes.spec.ts (edit) — guesses per plan
- **done when:**
  - [ ] `tests/admin-conferences-logic.spec.ts` covers `applyConferenceView` (all three views), `sortConferences` (most_teams ties broken by name; name_asc `localeCompare`), and `conferenceMeta` (four squad/school combinations plus null division).
  - [ ] The same spec covers `conferenceInitials` ("Southeastern Conference"/"SEC" → "SEC"; "Big 12 Conference"/null → "B12"; a 4-char short name falls back to initials), `normalizeWebsite` ("https://IvyLeague.com/" → "ivyleague.com"; "not a url" → null) and `conferenceChanged` (whitespace-only edits and null ↔ "" are not changes).
  - [ ] `tests/admin-routes.spec.ts` includes `/admin/conferences` in its route list.
  - [ ] `npm test` passes with no live-DB env (live specs skip), `npm run map` produces no diff, and `node scripts/check-design-drift.mjs` reports seeds unchanged.
  - [ ] With live env set, `tests/admin-conferences-rpcs.spec.ts` and `tests/admin-program-rpcs.spec.ts` both pass.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md §A10. Pure helpers live in `src/lib/data/admin-conferences-server.ts` and `src/lib/services/programs/conference-format.ts` (T4). Follow the existing pure-spec style in `tests/`. Do not add browser-driven tests.

## T11 · Verification 2a pass + follow-up ledger

- **status:** done
- **model:** opus
- **needs:** T10
- **files:** src/lib/data/admin-conferences-server.ts (comment block only); no other source edits expected
- **done when:**
  - [ ] `npm run lint && npm run typecheck && npm test && npm run map && node scripts/check-design-drift.mjs` all exit 0 with MAP unchanged and seeds matched (output recorded in the run notes).
  - [ ] Live via `mcp__supabase__execute_sql`: `count(*) from conferences` = 137; `count(*) from programs where conference_id is null` = 2; mirror mismatch count = 0; `pg_indexes` lists `programs_conference_id_status_idx`, `conferences_name_key`, `conferences_label_key`; `pg_trigger` lists `programs_sync_conference` and `conferences_mirror_label`; each of the five `admin_*conference*` bodies (`pg_get_functiondef`) contains `is_admin()` before any DML; `proacl` shows no `anon`/`PUBLIC` execute; `search_programs('b1g', 8)` matches the pre-T1 capture.
  - [ ] `get_advisors` (security and performance) reports no new findings attributable to `conferences`, its policies, indexes or the five RPCs.
  - [ ] Route protection is confirmed from code: `src/app/admin/layout.tsx` still wraps `/admin/conferences` in `requireAdminOrNotFound` (non-admin → 404) and the signed-out path still lands on `/login`; `update_program_settings` still takes a text conference and the live trigger sets `conference_id` (verified with a rolled-back `update programs set conference = … ` on a test row).
  - [ ] A comment block atop `admin-conferences-server.ts` lists the optional follow-ups verbatim from the plan: `getConferenceTable` (`opponents-server.ts:289`), `dual-school-step.tsx`, the Teams `?conference=` filter, `search_programs` tiers 2–3, `update_program_settings`/`admin_create_program` `p_conference_id`, `ConferenceSelect` ids, `scripts/seed-programs.ts`, and eventually dropping `programs.conference` + its two text indexes.
- **notes:** plan: ~/.claude/plans/synchronous-cuddling-phoenix.md — "Verification 2a" items 1, 2, 4, 5 plus the "Optional follow-ups" paragraph. Item 3 (manual clicking as the admin) is not verifiable from a diff; do it if a browser session is available and record what was clicked in the run notes, but it is not a gate. Any failure found here is fixed in a new task via `/task-add`, not by expanding this one.

## T12 · Migration: owner-gated conference minting, merge/set lock order, list rewrite

- **status:** done
- **model:** fable
- **files:** supabase/migrations/20260916100000_conferences_owner_gate_and_locks.sql (new; guess — applied live via MCP `apply_migration`, file byte-identical to what was applied)
- **done when:**
  - [ ] `programs_sync_conference` (body copied from live `pg_get_functiondef`, then edited) passes `p_create => new.org_type = 'college' and (public.is_admin() or (select auth.role()) = 'service_role')`; live probe inside one `execute_sql` transaction ending in `rollback` — `set local request.jwt.claims` to a non-admin owner's `{"sub","role":"authenticated"}`, `update programs set conference = 'Probe Owner League (POL)' where id = <that owner's college program>` — leaves `conference = 'Probe Owner League (POL)'`, `conference_id is null`, and `select count(*) from conferences where name like 'Probe Owner%'` = 0; the same update with admin claims yields a non-null `conference_id`.
  - [ ] `conference_id_for`'s create path is `insert … on conflict do nothing returning id into v_id`, followed by the same label/name re-lookup when `v_id is null`; the migration header comment states the relaxed college invariant: `conference_id is null` may now co-exist with owner-typed text, so the T1 check `(conference is null) = (conference_id is null)` is replaced by "`conference_id is not null ⇒ conference = label`" (live: `select count(*) from programs p join conferences c on c.id = p.conference_id where p.conference is distinct from c.label` = 0).
  - [ ] `admin_merge_conferences` locks the source `for update` and the target `for key share` in two explicit statements in id order (lower id first), and its audit insert and programs update are one statement: `with moved as (update public.programs … where conference_id = p_source returning id) insert into public.program_audit_log … select … from moved`, with the returned count taken from that CTE; `admin_set_program_conference` locks the program `for no key update`. `pg_get_functiondef` of both live bodies contains those exact lock clauses and no remaining `for update` on the target.
  - [ ] `admin_list_conferences` is a single `select … from public.conferences c left join public.programs p on p.conference_id = c.id group by c.id … order by c.name, c.label` (no `left join lateral`), and `select md5(string_agg(row_to_json(t)::text, ',' order by id)) from admin_list_conferences() t` (run with admin claims) is identical before and after apply; `explain analyze` of the new body runs in under 50 ms live.
  - [ ] All five `admin_*conference*` RPCs and the two trigger functions still begin `security definer` / `set search_path = ''`; `proacl` shows no `anon`/`PUBLIC` execute; `get_advisors` (security, performance) reports no finding attributable to this migration beyond the pre-accepted "Signed-In Users Can Execute SECURITY DEFINER Function"; `select count(*) from conferences where name = 'Owner Conference'` = 0 and no probe rows remain.
- **notes:** Load `supabase:supabase-postgres-best-practices` first. Live DB is the only source of truth: **copy every function body via `pg_get_functiondef` before editing** — `supabase/migrations/` is ~100 migrations behind. Apply via MCP `apply_migration` and write the file byte-identical; every write probe runs in one `execute_sql` call ending in `rollback`; leave no live residue (conferences count back to its pre-task value, no probe programs/conferences/audit rows). To emulate a session in raw SQL, `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'` — `is_admin()` reads `users.is_admin` for `auth.uid()`. Record one caveat in the file header: a direct `postgres`-role write (MCP `execute_sql`, no JWT) no longer creates conferences either — the seed path is the service-role client (`auth.role() = 'service_role'`), which still does. The recurring `Owner Conference` orphan is the symptom this closes. Deadlock reasoning: the FK from `programs.conference_id` takes `KEY SHARE` on the target row, which conflicts with `FOR UPDATE` but not with `FOR KEY SHARE`. The full `npm test` includes live specs that share a Supabase sign-in rate limit — run `npx playwright test admin-conferences-rpcs` on its own, not the whole suite, to check nothing regressed.

## T13 · Live spec: owner cannot mint, merge audit matches moved rows

- **status:** done
- **model:** opus
- **needs:** T12
- **files:** tests/admin-conferences-rpcs.spec.ts (edit), tests/fixtures/live-db.ts (read only) — guesses
- **done when:**
  - [ ] A new serial test creates an `owner` login (`createLogins` gains an `"owner"` label), inserts a `program_members` row `{ role: 'owner' }` for it on a fixture college program (the `admin-program-rpcs.spec.ts` shape), and has the owner call `update_program_settings` with `p_conference = "${MARK}-owner League (OL)"`; it asserts the program row reads `conference === "${MARK}-owner League (OL)"`, `conference_id === null`, and `admin.from("conferences").select("id").like("name", \`${MARK}-owner%\`)` returns zero rows.
  - [ ] A second new test has the service-role client run the same update with `"${MARK}-svc League (SL)"` on a college fixture and asserts a `conferences` row with `short_name === 'SL'` now exists and is linked; the existing test 4 (admin session creates a parsed conference on a college; club stays null) is unchanged and still passes.
  - [ ] The existing merge test additionally asserts that the count of `program_audit_log` rows with `action = 'program.conference_changed'`, `details->>'reason' = 'merge'` and `subject_id = B` equals the RPC's returned count, and that their `program_id` set equals the set of programs that pointed at A before the merge.
  - [ ] The spec's header comment describes the relaxed invariant (owner text may sit unlinked; linked text always equals the label), `afterAll` still deletes programs before conferences and removes the new owner's auth user, and `npx playwright test admin-conferences-rpcs` passes live; `npm test` with env blanked reports the spec skipped, not failed.
- **notes:** Depends on T12's gate — before it, the owner test fails by creating the conference. The `update_program_settings` argument list is in `src/components/dashboard/settings/team-actions.ts:150` (pass `p_season: ""` and the policy args exactly as it does). Use the run mark in every name; never touch real programs. Live specs share the project's sign-in rate limit — do not run the full suite repeatedly; one focused run is the evidence. After the run, verify no `admin-conf-%` conferences, programs or audit rows remain.

## T14 · Conference loaders: null-division options, surfaced errors, unlinked facet text

- **status:** done
- **model:** opus
- **files:** src/lib/data/team-settings-server.ts, src/lib/data/admin-conferences-server.ts, src/lib/data/admin-teams-server.ts, src/app/admin/error.tsx (new, only if no boundary exists above `/admin/conferences`) — guesses
- **done when:**
  - [ ] `getConferenceOptions` with a division uses `.or(\`division.eq.${division},division.is.null\`)`instead of`.eq("division", …)`, and its doc comment says a conference with no division is offered in every division; the call with a null division is unchanged.
  - [ ] `listAdminConferences` throws (an `Error` carrying the Supabase message) when either the RPC or the unplaced count errors, instead of logging and returning `{ rows: [], unplaced: 0 }`; `readConferenceTeams` throws on error instead of returning `[]` — its only caller `loadConferenceTeams` already catches and returns `{ ok: false }`, so the drawer's error state renders; `grep -n 'return \[\];' src/lib/data/admin-conferences-server.ts` no longer matches the error branch.
  - [ ] `src/app/admin/**` has an `error.tsx` client boundary above `/admin/conferences` (add a minimal one following the repo's existing `error.tsx` pattern if `find src/app/admin -name error.tsx` is empty), so a thrown loader error renders a page-level error, not a "0 conferences" table.
  - [ ] `listAdminTeamFacets` adds a third query — `programs.select("conference").is("conference_id", null).not("conference", "is", null)` — and unions its distinct values into `conferences` before the `localeCompare` sort; the doc comment above it explains that unlinked non-college text is still matched by `?conference=` and so must be offered.
  - [ ] `npm run typecheck` and `npm run lint` are green and `npm run map` produces no diff (an `error.tsx` is not a route).
- **notes:** Findings #4, #6, #9 from `/pr-check`. Error convention here is the `admin-teams-server.ts` cursor helpers' `throw new Error(...)`, not the `console.error` + empty fallback the list loaders use — keep the change to the two conference loaders named; don't sweep the Teams list loaders (branch scope). The Teams facet union is a small set (T1 verified two unlinked programs live); no paging needed.

## T15 · Drawer save race + unhandled rejections in drawer and Add-team popover

- **status:** done
- **model:** opus
- **files:** src/components/admin/conference-drawer.tsx, src/components/admin/add-team-popover.tsx — guesses
- **done when:**
  - [ ] `save()` captures `savedId = row.id` and the sent draft before awaiting `saveConference`; after it resolves it applies the normalised draft only when the drawer is still on `savedId` (read from a ref updated every render, not the stale closure), and applies it with a functional `setDraft(current => …)` that keeps any field the user changed during the save (field-wise: keep `current[k]` when it differs from the sent value, otherwise use the normalised saved value); `setError` from a failed save is likewise skipped when `row.id !== savedId`.
  - [ ] `useConferenceTeams`'s `loadConferenceTeams(...).then(...)` gains a `.catch` (or try/await) that, when not stale, sets `{ status: "error", error: "Couldn't load that conference's teams." }`, so the section never stays on "Loading…" after a rejected action.
  - [ ] `AddTeamPopover`'s debounced `adminSearchTeams(query).then(...)` handles rejection by setting the existing `error` state to "Couldn't search teams." and resetting `answered` to `{ query, rows: [] }` when `latest.current === query`, so "Searching…" ends.
  - [ ] `npm run typecheck`, `npm run lint` and `node scripts/check-design-drift.mjs` are green with seeds unchanged; no new `useEffect` setState lint suppression is added.
- **notes:** Findings #3 and #7. Failure the first criterion closes: Save on conference A, press ↓ to B while pending, Save on B — the old code wrote A's draft into B's fields and a second Save renamed B to A. The `draftFor` state is already re-seeded on `row.id` change; the ref is the render-time "current id" the resolved promise compares against. Not verifiable in a browser (no admin session) — criteria are code facts.

## T16 · Conferences page: alertdialog keydown guard + hidden landing target

- **status:** todo
- **model:** opus
- **files:** src/components/admin/conferences-page-content.tsx — guess
- **done when:**
  - [ ] The keydown handler's dialog guard matches both roles: `target.closest('[role="dialog"], [role="alertdialog"]')` filtered so the drawer's own non-modal `[DRAWER_ATTR] [role="dialog"]` is still excluded (one selector string; the comment names `ConfirmDialog`'s `alertdialog`); ↑/↓/Esc inside a confirm therefore return early.
  - [ ] In the pending-id pass, the `index < 0` branch (target loaded but not in the current cut) closes the drawer — `setSelectedId(null); setDrawerId(null); setClosing(false)` — and clears `?id=` via `syncUrl(null)` moved into an effect keyed on a small `clearUrl` flag (no `history.replaceState` during render); the comment states the decision: "the landing target is not in this view → close and clear the URL" rather than switching to the All view.
  - [ ] The `onMerged` handler no longer leaves the drawer on the merged-away source when the target is hidden: after the refresh the source row's disappearance still closes the drawer via the existing "row gone" pass, and `?id=` never names a hidden row (both the merge and Add-conference landings go through the same branch).
  - [ ] `npm run typecheck`, `npm run lint` and `node scripts/check-design-drift.mjs` are green with seeds unchanged; `tests/admin-conferences-logic.spec.ts` still passes.
- **notes:** Findings #5 and #8 (#5 was T9's follow-up 2). Decision recorded here: close + clear, not "switch to All" — the All view is a URL-held cut (`pushCut`) and switching it on the user's behalf would discard their filter. Selection machine is copied from `requests-page-content.tsx`; keep the fix local to this file (branch scope), and note in the run notes if Requests has the same `alertdialog` gap so it can get its own task.
