# Tasks — claude/onboarding-college-claim-flow-8e73c4

> Scope: Onboarding + custom-org claim flow: existing-team search, join requests, step Back

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

## T1 · Add an authenticated search over existing custom orgs

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<timestamp>_search_custom_programs.sql (new), src/lib/data/programs-server.ts, src/app/api/programs/custom-search/route.ts (new, guess), tests/custom-program-search.spec.ts (new), tests/custom-program-search-rls.spec.ts (new, live), tests/fixtures/live-db-specs.ts
- **done when:**
  - [ ] A new SECURITY DEFINER function `search_custom_programs(p_term text, p_org_type text, p_limit int default 8)` returns only rows with `org_type <> 'college'`, matched case-insensitively on `school_name` (prefix hits first, then substring, same tiering as `search_programs`), narrowed to `p_org_type` when it is one of club/high_school/academy/other, and projects exactly `program_id, school_name, org_type, owner_display` — never `owner_user_id`, `status`, or any contact column. EXECUTE is granted to `authenticated` and revoked from `anon` and `public`.
  - [ ] `searchCustomPrograms(supabase, term, orgType)` in `programs-server.ts` returns `CustomProgramSearchResult[]` (`programId, name, orgType, ownerDisplay`), returns `[]` below two characters without calling the RPC, and an offline spec asserts the two-character floor and the row mapping (including `titleCaseName` on `ownerDisplay`).
  - [ ] `GET /api/programs/custom-search?q=&type=` returns 401 with no session, `{ results: [] }` for a term under two characters, and otherwise the mapped rows with `Cache-Control: private, no-store` — it must not reuse the public `s-maxage` header of `/api/programs/search`.
  - [ ] A live spec (added to `LIVE_DB_SPECS`) creates one custom org as user A and shows: anon calling the RPC gets a permission error; user B (a non-member) searching the org's name gets one row with the name, type and owner initial and no `owner_user_id`; user B's plain `from("programs").select()` for that row still returns nothing (the member-only SELECT policy is untouched).
- **notes:** Custom orgs are private workspaces by policy (migration 20260830050000). This task deliberately publishes three facts about them to signed-in users — name, type, owner initial — because that is the minimum a second coach at "Centennial" needs to recognise the existing team. Nothing else leaks: keep the projection list closed the way `redactForPlayer` does. A separate route rather than a `?kind=` on `/api/programs/search`: that route is anon, public-cached and filtered to college at the SQL layer on purpose. Check the live schema through the Supabase MCP before writing SQL — `supabase/migrations/` runs behind.

## T2 · Show matching existing teams under the 7.2 team-name field

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/claim/team-setup-form.tsx, src/components/claim/existing-team-matches.tsx (new, guess), tests/existing-team-matches.spec.ts (new)
- **done when:**
  - [ ] While the coach types in `#teamName`, once the trimmed value is two or more characters the form fetches `/api/programs/custom-search?q=<term>&type=<orgType from 7.1>` after a 180 ms debounce with the same latest-request guard `ProgramSearch` uses; below two characters no request is made and no list renders.
  - [ ] Matches render as a list directly beneath the field, each row showing the team name, the org-type label from `TYPE_LABEL` (e.g. "High school"), and the owner initial (or "Set up" when null) — capped at the 8 rows the endpoint returns, with the row for an exact case-insensitive name match placed first.
  - [ ] Above the list, one line reads "Already on Advantage. If this is your team, ask its owner to add you instead of creating another." — the same instruction `reasonMessage("limit-reached")` already gives; Continue stays enabled (creating a same-named team is still permitted).
  - [ ] An offline spec renders `ExistingTeamMatches` through `tests/fixtures/vm-modules.ts` `createLoader()` with fixture rows and asserts the markup for: no rows (nothing rendered, no "Nothing matched" line), three rows with the labels above, and an exact match ordered first.
  - [ ] The form's existing behaviour is unchanged: `continueToPilotTerms` is still called with `{ name, orgType, ownerName }` and the parked-value round trip through `/claim/team/terms` still prefills `#teamName`.
- **notes:** The list is informational only in this task; the action on a row ("Ask to join") is T3, so do not add a click handler that goes nowhere. Keep the list component a leaf (no `next/*`, no server imports) so the offline spec can load it with only `react` — that is why it is its own file rather than inline in the form. Design routing: this is claim-flow chrome (`.skills/advantage-analytics-design/SKILL.md`, `reference/components.md`), reuse `CLAIM_MICRO`/`text-body-sm` and the `ProgramSearch` row border tokens rather than new styles.

## T3 · Let a coach ask to join an existing custom org from 7.2

- **status:** todo
- **model:** fable
- **needs:** T1, T2
- **files:** src/lib/services/programs/claim-actions.ts (requestInvite, ~line 1235), src/app/claim/team/actions.ts, src/components/claim/existing-team-matches.tsx, src/app/claim/team/requested/page.tsx (new, guess), supabase/migrations/<timestamp>_invite_request_by_program_id.sql (only if the write RPC is keyed by program_key), tests/custom-org-join-request.spec.ts (new, live)
- **done when:**
  - [ ] Each row from T2 gains an "Ask to join" button; pressing it calls a server action with `{ programId }` (never a name or key typed by the client) that files a `program_requests` row of kind `invite_request` for that program with the signed-in coach's account email and profile name, and inserts no new `programs` row.
  - [ ] The action refuses (returns `{ ok: false, reason }`) when the caller is already owner or member of that program, and when the program is `org_type = 'college'` — college joins stay on `/claim/[programKey]/request`.
  - [ ] The org owner's roster join-requests list (`getPendingJoinRequests(programId)`) returns the new request, and the existing invite-request email template is sent to the owner with the org's name — no new template.
  - [ ] After a successful request the coach lands on a confirmation screen inside `ClaimShell` that names the team and says its owner has been asked, with a single link back to `/dashboard`; the pending-team cookie is not written.
  - [ ] A live spec (added to `LIVE_DB_SPECS`) creates a custom org as user A, files a request as user B through the action, and asserts the request row, the empty result of a second identical request (or its explicit `already-requested` reason), and that `programs` still has exactly one row with that name.
- **notes:** Assumes "pick the existing team" means "request to join it" (the same `invite_request` mechanism college players use, surfaced on the owner's roster). The lighter alternative is T2 alone. `requestInvite` currently resolves by ITA key via `programForKey`; custom orgs have `program_key IS NULL`, so either the action gains a program-id path or the write RPC does. Check the live schema through the Supabase MCP before writing SQL.

## T4 · Add Back to every onboarding step after the first

- **status:** todo
- **model:** opus
- **files:** src/app/onboarding/onboarding-flow.tsx, src/app/onboarding/steps.ts (new), tests/onboarding-steps.spec.ts (new), tests/onboarding-flow-browser.spec.ts
- **done when:**
  - [ ] A pure module `steps.ts` (no react/next imports, like `answers.ts`) exports `previousStep(step)` returning `1` for 2, `2` for 3 and 4, `3` for 5, `5` for 6, and `null` for 1; an offline spec asserts all six.
  - [ ] Steps 2, 3, 4, 5 and 6 each render a `<button type="button">Back</button>` styled `CLAIM_LINK`, placed in the step's `ClaimActions` row before Skip (and alone beside Continue on 3.1 and 1.3, which have no Skip); step 1 renders none. The button is `disabled` while `isPending`.
  - [ ] Pressing Back calls `setStep(previousStep(step))` and `setError(null)` and clears nothing else: `persona`, `college`, `recordingSource`, `acquisitionSource`, `acquisitionDetail`, `playerName`, `classYear` and `consent` all survive, so the previous step re-renders with its answer still selected.
  - [ ] Back does not write: no call to `finishOnboarding` or `finishGuardianOnboarding` is reachable from it (the two `startTransition` blocks are untouched).
  - [ ] `tests/onboarding-flow-browser.spec.ts` gains one test that walks 1.2 → "I play" → 1.4, presses Back, asserts the heading "How do you use Advantage?" is visible and the "I play" radio has `aria-checked="true"`, presses Back again and asserts `#onboarding-first-name` still holds "Onboarding".
- **notes:** Step state is `useState<Step>` (`onboarding-flow.tsx:214`), not a URL — the browser's own Back leaves the page, which is the gap this fills. The junior branch's Back (4 → 2) lets a parent who tapped the wrong persona recover without reloading. Keep the step-number eyebrows ("Step 3 of 5") as they are. The browser spec runs on demand against a local dev server (`ONBOARDING_BROWSER_BASE_URL`).
