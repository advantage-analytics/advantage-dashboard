# Tasks — claude/workspace-creation-no-account-70909e

> Scope: first-run onboarding questions 1.5 (recording source), 1.7 (heard about) and the coach intake screen 5.2 — data model, flow, wizard preselect, tests. Spec: ~/.claude/plans/okay-add-the-new-humble-hare.md; design: Claude Design project d37f61d4 → Onboarding Flow.dc.html.

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

## T1 · Add onboarding intake columns, `set_program_intake` RPC and `Viewer.recordingSource`

- **status:** done
- **model:** fable
- **needs:** T2
- **files:** supabase/migrations/<timestamp>_onboarding_intake_answers.sql (new), src/lib/workspace/types.ts, src/lib/workspace/active-workspace-server.ts (guess)
- **done when:**
  - [ ] A new `supabase/migrations/<timestamp>_onboarding_intake_answers.sql` adds `users.recording_source`, `users.acquisition_source`, `users.acquisition_source_detail`, `programs.roster_size_band`, `programs.weekly_film_band` (all `text`, `add column if not exists`), a `comment on column` for each of the five, and exactly these null-allowing constraints: `users_recording_source_values` (`swing-vision`,`video`,`none`), `users_acquisition_source_values` (`coach_or_teammate`,`swingvision_community`,`social`,`google`,`college_event`,`utr`,`other`), `users_acquisition_source_detail_length` (`char_length between 1 and 120`), `users_acquisition_source_detail_only_other` (`detail is null or acquisition_source = 'other'`), `programs_roster_size_band_values` (`1-6`,`7-10`,`11-15`,`16+`), `programs_weekly_film_band_values` (`none`,`1-3`,`4-10`,`10+`). The file is not prettier-formatted.
  - [ ] The same migration creates `public.set_program_intake(p_program_id uuid, p_roster_size_band text, p_weekly_film_band text) returns void` as `security definer set search_path = public`, raising `errcode '42501'` unless `auth.uid()` is non-null and `public.user_program_role(p_program_id)` is `'owner'` (mirroring `update_program_settings`), updating both bands and `updated_at = now()`, followed by `revoke all ... from public, anon` and `grant execute ... to authenticated`.
  - [ ] The migration header explains why the player answers live on `users` (own-row RLS, one row per account) and why the bands live on `programs` (no client UPDATE policy, hence the RPC), and ends with the sentence "Applied to the live database via the Supabase MCP as `onboarding_intake_answers` (version <timestamp>)" — the migration having been applied with `mcp__supabase__apply_migration` and `get_advisors` re-run with no new finding.
  - [ ] One live check: `select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name in ('recording_source','acquisition_source','acquisition_source_detail','roster_size_band','weekly_film_band')` returns exactly five rows (three on `users`, two on `programs`).
  - [ ] `Viewer` in `src/lib/workspace/types.ts` gains a doc-commented `recordingSource: RecordingSource | null` (type imported from `src/app/onboarding/answers.ts`); the `users` select string in `active-workspace-server.ts` includes `recording_source` and `toViewer` maps it (unknown or null values become `null`); `npm run typecheck` passes.
- **notes:** Verify `user_program_role`'s exact signature/return in the live DB (`supabase/migrations/20260817073930_program_members.sql:77` is the repo copy) before writing the guard. Style model: `supabase/migrations/20260830070408_guardian_onboarding_consent.sql`. Do not touch `utr_id` — screen 1.6 (level/UTR) is held. No policy changes: `users` already has the own-row `ALL` policy.

## T2 · Create the shared onboarding answer vocabulary with an offline spec

- **status:** done
- **model:** sonnet
- **files:** src/app/onboarding/answers.ts (new), tests/onboarding-answers.spec.ts (new) (guess)
- **done when:**
  - [ ] `src/app/onboarding/answers.ts` exports `RECORDING_SOURCES` (values `swing-vision`, `video`, `none`), `ACQUISITION_SOURCES` (values `coach_or_teammate`, `swingvision_community`, `social`, `google`, `college_event`, `utr`, `other`, each with a `playerLabel` and a `coachLabel`), `ROSTER_SIZE_BANDS` (`1-6`, `7-10`, `11-15`, `16+` labelled "1–6" … "16 or more"), `WEEKLY_FILM_BANDS` (`none`, `1-3`, `4-10`, `10+` labelled "None yet" … "More than 10"), `ACQUISITION_DETAIL_MAX = 120`, the derived types `RecordingSource`, `AcquisitionSource`, `RosterSizeBand`, `WeeklyFilmBand`, and the guards `isRecordingSource()`, `isAcquisitionSource()`, `isRosterSizeBand()`, `isWeeklyFilmBand()`.
  - [ ] `providerForRecordingSource(source: RecordingSource | null | undefined): ProviderId | null` returns `"swing-vision"` for `swing-vision`, `"splitstep"` for `video`, and `null` for `none`, `null` and `undefined`; `ProviderId` is imported as a type from `src/lib/services/upload/types.ts`.
  - [ ] `coachLabel` differs from `playerLabel` only for `coach_or_teammate` (coach label "Another coach or program"); `other` is labelled "Somewhere else" for both roles. The file has no import from `react`, `next/*`, `posthog-js` or `@/lib/supabase/*`.
  - [ ] `tests/onboarding-answers.spec.ts` (plain Playwright `test`, no browser or page fixture) asserts the provider mapping including `none`/`null` → `null`, that each guard rejects an unknown string and an empty string, and the coach-vs-player label rule; `npx playwright test tests/onboarding-answers.spec.ts` passes.
- **notes:** Player-facing labels come from the design canvas `Onboarding Flow.dc.html` (Claude Design project d37f61d4); if the canvas cannot be read, choose short sentence-case labels and say so in the commit body. This module is the single vocabulary for T3, T4 and T5 — keep it pure.

## T3 · Add onboarding steps 1.5 and 1.7 and persist the answers

- **status:** done
- **model:** opus
- **needs:** T1, T2
- **files:** src/app/onboarding/onboarding-flow.tsx, src/app/onboarding/actions.ts (guess)
- **done when:**
  - [ ] `Step` is `1 | 2 | 3 | 4 | 5 | 6` (5 = recording source, 6 = heard about; 4 stays the guardian branch); the eyebrows read exactly "Step 1", "Step 2", "Step 3 of 5", "Step 4 of 5", "Step 5 of 5"; step 3's Continue and Skip both `setStep(5)` (Skip leaves `college` null) and no `submit("solo")` call remains on step 3; the step-2 coach exit `submit("coach")` is unchanged.
  - [ ] Step 5 renders three persona-style cards (lucide `FileSpreadsheet`, `Video`, `Smartphone`) in an 840px shell with the strings "Your first upload is set up for this. You can use either later.", "Import the .xlsx export from the app.", "Upload the video and Advantage Intelligence analyses it." and "We'll show you where to put a phone before your next match." verbatim; Continue and Skip both go to step 6.
  - [ ] Step 6 renders two-column `RadioDot` rows from `ACQUISITION_SOURCES` using `playerLabel`; the "Somewhere else" row spans both columns and, when selected, reveals a `CLAIM_FIELD` input labelled "Where?" with placeholder "A podcast, a newsletter, a clinic" and `maxLength={ACQUISITION_DETAIL_MAX}`; the primary button reads "Go to my dashboard" and Skip submits with all three answers null.
  - [ ] `finishOnboarding` accepts nullable `recordingSource`, `acquisitionSource`, `acquisitionSourceDetail`; validates the two enums with `isRecordingSource`/`isAcquisitionSource` (rejecting anything else with a plain error, never a throw), trims the detail, forces it to `null` unless the source is `other`, rejects a trimmed detail longer than 120 with a plain error, and writes `recording_source`, `acquisition_source`, `acquisition_source_detail` in the same `users.update` as `onboarded_at`; the final `choice` is `college === "yes" ? "college" : "solo"`.
  - [ ] Before the action runs, inside `if (isPostHogConfigured)`, the client calls `posthog.setPersonProperties({ recording_source, acquisition_source })` and `posthog.capture("onboarding_completed", { persona, college, recording_source, acquisition_source })` — the free-text detail appears in neither; the shipped copy is fixed so the 1.3 coach card ends "…one shared allowance." and the 1.4 "No" row reads "Your own account, your own allowance."
- **notes:** Out of scope — do not build: screen 1.6 (level/UTR, held), Settings › Profile editing of these answers, a filming guide for "I don't record yet", back-filling existing users, server-side PostHog capture, admin/reporting views. Answers are write-once from onboarding; Skip stores null. Invite-link joins and completed claims keep bypassing every screen (`adoptMembership` / `completeClaim` stamp `onboarded_at`). PostHog: `import posthog from "posthog-js"` guarded by `isPostHogConfigured` from `src/lib/posthog-client.ts`, ids only, no emails. Reuse the step-2 card markup and step-3 radio rows already in the file.

## T4 · Build the coach intake screen at `/claim/team/about`

- **status:** done
- **model:** opus
- **needs:** T1, T2
- **files:** src/app/claim/team/about/page.tsx (new), src/app/claim/team/about/actions.ts (new), src/components/claim/program-intake-form.tsx (new), src/app/claim/team/actions.ts, src/app/claim/ready/page.tsx, MAP.md (guess)
- **done when:**
  - [ ] `src/app/claim/team/about/page.tsx` (Server Component under the existing `claim/team/layout.tsx` gate) resolves the program from the `WORKSPACE_COOKIE` value, requires the viewer's `program_members` role to be `owner` and otherwise `redirect("/dashboard/team")`; it renders `ClaimShell` with no `back`, `exitHref="/dashboard/team"`, `exitLabel="Go to my team"`, and `ClaimHeading` whose eyebrow is `<school_name> · <team>`, title "A few things about your program", body "Rough numbers are fine. They help us plan for teams like yours — nothing here changes your plan."
  - [ ] `src/components/claim/program-intake-form.tsx` (`"use client"`) renders two 4-across `RadioDot` rows from `ROSTER_SIZE_BANDS` and `WEEKLY_FILM_BANDS` under 13px question labels, a `ClaimSelect` labelled "How did you hear about Advantage?" using `coachLabel`, a `CLAIM_BUTTON` "Go to my team", and a `CLAIM_LINK` Skip pointing at `/dashboard/team`.
  - [ ] `saveProgramIntake({ programId, rosterSizeBand, weeklyFilmBand, acquisitionSource })` in `src/app/claim/team/about/actions.ts` validates every field with the `answers.ts` guards (nulls allowed), calls `rpc("set_program_intake", …)` first, then own-row `users.update({ acquisition_source })` only when non-null and only after the RPC succeeded, then `revalidatePath("/dashboard", "layout")` and `redirect("/dashboard/team")`; an RPC error returns a plain error with no `users` write.
  - [ ] `createCustomTeam` in `src/app/claim/team/actions.ts` ends with `redirect("/claim/team/about")`, and both the CTA `href` and `exitHref` in `src/app/claim/ready/page.tsx` point at `/claim/team/about`; `src/app/claim/review/**` is untouched.
  - [ ] `npm run map` has been run and the `MAP.md` diff adds a `/claim/team/about` row.
- **notes:** Reuse `ClaimShell`, `ClaimHeading`, `ClaimActions`, `CLAIM_BUTTON`, `CLAIM_FIELD`, `CLAIM_LABEL`, `CLAIM_LINK`, `CLAIM_MICRO`, `RadioDot`, `ClaimSelect` from `src/components/claim/claim-shell.tsx`. Cookie reader pattern: `active-workspace-server.ts:336`. Pending-review claims (`/claim/review`) have no program yet and never reach this screen. Same out-of-scope list as T3.

## T5 · Preselect the upload wizard source from `Viewer.recordingSource`

- **status:** done
- **model:** opus
- **needs:** T1, T2
- **files:** src/app/dashboard/matches/new/page.tsx, src/components/dashboard/matches/new-match-wizard/UploadMatchFlow.tsx, src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, src/components/dashboard/matches/new-match-wizard/resolve-starting-provider.ts (new), tests/upload-provider-preference.spec.ts (new) (guess)
- **done when:**
  - [ ] `src/app/dashboard/matches/new/page.tsx` computes `preferredProvider = providerForRecordingSource(viewer.recordingSource)` and passes it to `UploadMatchFlow`, which forwards it to `useUploadMatchWizard`; the existing `initialProvider` from `?source=` is passed unchanged.
  - [ ] A pure, exported `resolveStartingProvider({ linked, stored, preferred })` (new module beside the hook, no React import) returns the first supported value in the order `linked` > `stored` (via `isProviderSupported`) > `preferred` > `DEFAULT_PROVIDER_ID`, and the hook uses it both in the provider effect and in the progress-bar initialiser that reads the provider's kind, so the two agree.
  - [ ] Nothing writes `preferredProvider` to `localStorage` — no `setItem(STORAGE_KEYS.SELECTED_PROVIDER, …)` is added — and the branch carries a comment mirroring the existing "a default is not a choice" note.
  - [ ] `tests/upload-provider-preference.spec.ts` (plain Playwright `test`, offline) covers the four tiers, including that `linked` beats a `preferred` value and that a `preferred` of `null` falls through to `DEFAULT_PROVIDER_ID`; `npx playwright test tests/upload-provider-preference.spec.ts` passes.
- **notes:** Read `docs/ui-revamp-guardrails.md` first — the wizard's three attribution inputs must not move. Do not change the step order or `STEP_ORDER_BY_KIND`. If the hook's module imports pull `next/navigation` into the offline spec, keep the resolver in its own file so the spec imports only that (see the offline-component-specs memory).

## T6 · Cover the intake constraints and RPC with a live-db spec

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** tests/onboarding-intake-live.spec.ts (new), tests/fixtures/live-db-specs.ts (guess)
- **done when:**
  - [ ] `tests/onboarding-intake-live.spec.ts` exists, obtains its users through `poolLogins` from `tests/fixtures/live-db-pool.ts`, and `"onboarding-intake-live.spec.ts"` is added to `LIVE_DB_SPECS` in `tests/fixtures/live-db-specs.ts` in alphabetical position; `npx playwright test tests/live-db-target-guard.spec.ts` passes.
  - [ ] Tests assert that an own-row `users.update` succeeds for every allowed value of `recording_source` and `acquisition_source` and for `acquisition_source_detail` with `acquisition_source = 'other'`; that an invalid `recording_source`, and a non-null detail with any source other than `other`, both fail with Postgres code `23514`; and that updating another pool user's row affects 0 rows.
  - [ ] Tests assert that `rpc("set_program_intake")` as a non-owner fails with code `42501`, and that as the owner of a fresh program created through `create_custom_program` it writes both bands (read back via the owner's client); the program is removed in cleanup even when an assertion fails.
  - [ ] `npx playwright test --project=live-db tests/onboarding-intake-live.spec.ts --list` lists the tests; the spec skips against the production project unless `LIVE_DB_ALLOW_PROD=1`, and nothing in the diff sets that variable.
- **notes:** Never set `LIVE_DB_ALLOW_PROD` in the gate; the spec is run by hand once, never in a loop (see the 2026-09-23 auth-saturation incident in AGENTS.md). Follow `tests/teams-management.spec.ts` for the owner/non-owner RPC shape and `clearPoolLeftovers` for cleanup.

## T7 · Widen `users_acquisition_source_values` (reddit, linkedin) and tighten `users_acquisition_source_detail_only_other`, with a live-spec null-source case

- **status:** todo
- **model:** fable
- **files:** supabase/migrations/<timestamp>_acquisition_source_reddit_linkedin_null_detail.sql (new), tests/onboarding-intake-live.spec.ts (guess)
- **done when:**
  - [ ] A new migration under `supabase/migrations/` runs `alter table public.users drop constraint if exists users_acquisition_source_values` and re-adds it as `check (acquisition_source is null or acquisition_source in ('coach_or_teammate', 'swingvision_community', 'social', 'google', 'college_event', 'utr', 'reddit', 'linkedin', 'other'))`, and drops/re-adds `users_acquisition_source_detail_only_other` as `check (acquisition_source_detail is null or acquisition_source is not distinct from 'other')`. No other constraint, column or grant is touched; `20260926182506_onboarding_intake_answers.sql` is not edited; the file is not prettier-formatted.
  - [ ] The migration header explains both changes: the original `acquisition_source = 'other'` evaluates to NULL — and so passes — when `acquisition_source` is NULL, letting a detail be stored with no source (T6's finding), which `is not distinct from` closes; and the two values are added in the same migration so the live constraint accepts them before `answers.ts` (T8) offers them. It ends with the sentence "Applied to the live database via the Supabase MCP as `<name>` (version <timestamp>)", the file name carries the version the MCP assigned (rename after applying, as T1 did), and `get_advisors` has been re-run with no new finding.
  - [ ] One live check: `select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.users'::regclass and conname in ('users_acquisition_source_values', 'users_acquisition_source_detail_only_other') order by conname` returns exactly two rows; the `…_detail_only_other` definition contains `DISTINCT FROM 'other'::text` and no longer contains `acquisition_source = 'other'`; the `…_values` definition contains both `'reddit'` and `'linkedin'`.
  - [ ] `tests/onboarding-intake-live.spec.ts` gains a test titled `"a detail with no acquisition_source is refused with 23514"` placed directly after `"a detail beside any source but 'other' is refused with 23514"`, which updates the owner's own row with `{ acquisition_source: null, acquisition_source_detail: "no source given" }` and asserts `data` is null and `error.code` is `"23514"`; point 2 of the file's doc comment mentions the null-source case.
  - [ ] `npx playwright test --project=live-db tests/onboarding-intake-live.spec.ts --list` lists 9 tests, `npx playwright test tests/live-db-target-guard.spec.ts` passes, and nothing in the diff sets `LIVE_DB_ALLOW_PROD`.
- **notes:** Style model is `20260926182506_onboarding_intake_answers.sql`; apply with `mcp__supabase__apply_migration` (the MCP assigns the version — name the file to match, precedent in T1's log entry). Verify first via `execute_sql` that no live `users` row has `acquisition_source_detail is not null and acquisition_source is null` — the re-add would fail on such a row (none is expected: the app layer forces the detail null unless the source is `other`). The existing "every acquisition_source the onboarding step offers is accepted" test iterates `ACQUISITION_SOURCES`, so once T8 lands the two new values are covered with no further spec change; do not edit `answers.ts` in this task. Never set `LIVE_DB_ALLOW_PROD` in the gate; the live spec is run by hand once, never in a loop (2026-09-23 auth-saturation incident, AGENTS.md).

## T8 · Add `reddit` and `linkedin` to `ACQUISITION_SOURCES` with an exact-order offline assertion

- **status:** todo
- **model:** sonnet
- **needs:** T7
- **files:** src/app/onboarding/answers.ts, tests/onboarding-answers.spec.ts (guess)
- **done when:**
  - [ ] `ACQUISITION_SOURCES` in `src/app/onboarding/answers.ts` gains `{ value: "reddit", playerLabel: "Reddit", coachLabel: "Reddit" }` and `{ value: "linkedin", playerLabel: "LinkedIn", coachLabel: "LinkedIn" }`, inserted after `utr` and before `other`, so `other` remains the last entry; the block's doc comment still states that only `coach_or_teammate` differs between roles.
  - [ ] `tests/onboarding-answers.spec.ts` gains a test asserting `ACQUISITION_SOURCES.map((s) => s.value)` equals exactly `["coach_or_teammate", "swingvision_community", "social", "google", "college_event", "utr", "reddit", "linkedin", "other"]`, and a test asserting the `reddit` and `linkedin` entries read `"Reddit"` and `"LinkedIn"` for both `playerLabel` and `coachLabel`; `npx playwright test tests/onboarding-answers.spec.ts` passes, including the unchanged "coach_or_teammate is the only entry where the coach label differs" test.
  - [ ] `src/app/onboarding/onboarding-flow.tsx`, `src/components/claim/program-intake-form.tsx`, `src/app/onboarding/actions.ts` and `supabase/migrations/**` are untouched — both the 1.7 grid and the 5.2 `ClaimSelect` render from the array and `parseIntake` validates through `isAcquisitionSource`, so the new answers appear and persist with no further edit.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Depends on T7 because the live `users_acquisition_source_values` constraint must accept the two values before the UI offers them — otherwise picking Reddit fails at submit with "We couldn't save that." Layout: 1.7 is `grid gap-2 sm:grid-cols-2` with `other` on `sm:col-span-2`; eight non-other rows fill four rows and "Somewhere else" still spans the fifth, so no layout change is needed at nine entries (say so in the commit body, not in the code). Once this lands, `tests/onboarding-intake-live.spec.ts` covers the new values automatically because it iterates `ACQUISITION_SOURCES`.

## T9 · Fix the "shared budget" role-choice copy and make the 1.7 finish button honest on the college path

- **status:** todo
- **model:** sonnet
- **files:** src/components/claim/role-choice.tsx, src/app/onboarding/onboarding-flow.tsx (guess)
- **done when:**
  - [ ] In `src/components/claim/role-choice.tsx` the `coach` entry's `sub` reads exactly `"A roster of players, one shared allowance."` (matching onboarding 1.3 at `onboarding-flow.tsx:113`) and the word `budget` no longer appears in the file.
  - [ ] In `src/app/onboarding/onboarding-flow.tsx` step 6's primary button label is `college === "yes" ? "Find my program" : "Go to my dashboard"` (exact strings), with a one- or two-line comment noting that the `college` resolution in `actions.ts`'s `RESOLUTION` lands on `/claim/program?intent=join`, not the dashboard.
  - [ ] Nothing else on that button changes — `disabled={!acquisitionSource || isPending}`, `onClick={finishFromHeardAbout}` and `className={CLAIM_BUTTON}` are byte-identical — and the Skip link still reads `Skip`; no other string in either file changes.
  - [ ] `npm run typecheck`, `npm run lint` and `npx playwright test --project=offline` pass.
- **notes:** Both are T3's recorded follow-ups 1 and 2. `college` is `CollegeAnswer | null` state already in scope at step 6 (declared at line 170); a Skip on 1.4 leaves it `null`, which resolves to `solo` and so keeps "Go to my dashboard" — correct, since that path does land on `/dashboard`. The coach `RadioDot`/`ClaimSelect` surfaces are not involved.

## T10 · Add a browser spec that walks the player onboarding flow end to end against a local dev server

- **status:** todo
- **model:** opus
- **files:** tests/onboarding-flow-browser.spec.ts (new), tests/fixtures/live-db-specs.ts (guess)
- **done when:**
  - [ ] `tests/onboarding-flow-browser.spec.ts` exists, reads its base URL from `process.env.ONBOARDING_BROWSER_BASE_URL`, and skips with a one-sentence reason when that variable is unset or when `HAVE_ENV` from `tests/fixtures/live-db.ts` is false (so the production refusal applies exactly as in every live spec); a `beforeAll` asserts the base URL's hostname is `localhost` or `127.0.0.1` (the `WIZARD_REPRODUCTION_BASE_URL` pattern in `tests/upload-score-regression.spec.ts`). `"onboarding-flow-browser.spec.ts"` is added to `LIVE_DB_SPECS` in `tests/fixtures/live-db-specs.ts` in alphabetical position, and `npx playwright test tests/live-db-target-guard.spec.ts` passes.
  - [ ] The spec is `test.describe.configure({ mode: "serial" })`, creates exactly one throwaway user in `beforeAll` via `createLogin(admin, "player", { mark, password, authUserIds })` with `runMarker("onboarding-browser")`, opens one shared `page` from `browser.newPage()`, signs in once through `${baseURL}/login` by filling `#login-email` and `#login-password` and clicking `button[type="submit"]`, and waits for the URL to reach `/onboarding` (the dashboard layout redirects there while `onboarded_at` is null). No `poolLogin`/`poolLogins` and no second sign-in anywhere in the file.
  - [ ] Test 1 fills `#onboarding-first-name` / `#onboarding-last-name`, continues, clicks the radios labelled `"I play"`, then `"No — I play club, tournaments or juniors"`, then `"SwingVision"`, continues, clicks `"Somewhere else"`, types `"Reddit thread"` into `#onboarding-acquisition-detail`, clicks the button named `"Go to my dashboard"`, and asserts the page URL matches `/\/dashboard(\/|\?|$)/`; then, through `createAdminClient()`, asserts the `users` row has `recording_source = "swing-vision"`, `acquisition_source = "other"`, `acquisition_source_detail = "Reddit thread"`, `role = "player"` and a non-null `onboarded_at`.
  - [ ] Between tests the admin client resets the row (`onboarded_at`, `recording_source`, `acquisition_source`, `acquisition_source_detail` to null) and the page navigates to `${baseURL}/onboarding` again; test 2 walks the same 1.2 → "I play" → "No — …" path, clicks `Skip` on the "How do you record your matches?" step and `Skip` on the "How did you hear about Advantage?" step, asserts the URL reaches `/dashboard`, and asserts all three intake columns are null while `onboarded_at` is non-null.
  - [ ] `afterAll` closes the page and calls `deleteAuthUsers(admin, authUserIds)` unconditionally (it runs when an assertion failed too); `npx playwright test --project=live-db tests/onboarding-flow-browser.spec.ts --list` lists both tests; nothing in the diff sets `LIVE_DB_ALLOW_PROD`, adds a `webServer` or `use.browserName` to `playwright.config.ts`, or hardcodes a port.
- **notes:** This is the verification that would have caught the `permission denied for table users` failure fixed in `20260926201548_onboarding_intake_column_grants.sql` — the walk exercises the real `finishOnboarding` server action as an authenticated user; `tests/onboarding-intake-live.spec.ts`'s own-row update is the other regression check for a missing column grant. Deliberately uses "Somewhere else" + detail rather than clicking "Reddit", so it does not depend on T7/T8 and needs no `needs:` line. It runs under the `live-db` project by virtue of `LIVE_DB_SPECS`; Playwright's default `page`/`browser` fixtures launch chromium without any config change (precedent: `upload-score-regression.spec.ts`), and the repo's stance is no `webServer` in config, so the base URL is env-driven — the dev server for this worktree may already be listening on :3002 ("existing server" message) and must be loading the same `.env.local` project as the spec's Supabase keys. Radios are `role="radio"` buttons — use `page.getByRole("radio", { name })`; the primary buttons are `getByRole("button", { name: "Continue" })`, `{ name: "Go to my dashboard" }` and the Skip links `{ name: "Skip" }`. Give the sign-in and each step a generous `expect(...).toPass`/timeout — a cold `next dev` compiles `/onboarding` on first hit. Never set `LIVE_DB_ALLOW_PROD` in the gate; the criterion is `--list` plus the target guard, never a pass against prod — the user runs it by hand once, and the two sign-ins (one inside `createLogin`, one in the browser) are the whole auth footprint.
