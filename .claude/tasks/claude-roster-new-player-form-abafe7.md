# Tasks — claude/roster-new-player-form-abafe7

> Scope: Roster page (`/dashboard/team/roster`) — the new-player form and the drawer/table polish around it.

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

## T1 · Add neutral icons to the roster drawer's Options menu

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/team/player-drawer.tsx (guess — the Options popover inside `PlayerDrawer`, ~lines 353–455)
- **done when:**
  - [ ] In the drawer's Options popover, each of the three setting rows carries a leading Lucide glyph already in the Glyph Registry: `Upload` on "Can send video", `Pencil` on "Edit player", `Trash2` on "Remove from roster". The "No account yet…" note and the hairline divider get no glyph.
  - [ ] Every added glyph renders `size-[13px]`, `strokeWidth={1.5}`, `aria-hidden`, and `text-[var(--ink-400)]` — none carries `--blue` or `--danger`, at rest or on hover (the Remove row's label may still turn `--danger` on hover; its icon does not).
  - [ ] The glyphs sit in one `shrink-0` fixed-width leading column with `gap-2.5` to the text, so the three labels start on the same x; on "Can send video" the description still stacks under the label and the `AdvSwitch` stays at the trailing edge.
  - [ ] Behaviour and gating are untouched: `canToggleSend`/`canEdit`/`canRemove`, the switch's optimistic write, `onEdit`, the archive-vs-remove branch and `w-[248px]` all read the same in the diff — only the three rows' JSX and the `lucide-react` import change.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** "Neutral" is deliberate: `FloatMenuItem`'s icon slot defaults to `--blue` and `schedule/static/event-actions-menu.tsx` paints `Trash2` in `--danger` — do not copy either. This menu is hand-built on `Popover`; migrating it to `FloatMenu` (chrome.md says every dropdown should be) is out of scope here and belongs on its own branch.

## T2 · Drop the event/school suffix from the drawer's recent-match rows

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/team/player-drawer.tsx (recent-matches row, ~line 758), src/lib/data/team-roster-server.ts (`RosterRecentMatch.event`, `DbRecentMatch.tournament_name`, the select at ~367, the map at ~575), tests/team-roster-ids.spec.ts (fixture at ~163) — guess
- **done when:**
  - [ ] In the drawer's Recent matches list, each row's middle cell renders only `match.opponent`; the ` · {match.event}` suffix and its conditional are gone, and no row shows a trailing or leading "·"
  - [ ] Result mark, `ScoreLine`, date and chevron in that row are unchanged (same grid, same classes)
  - [ ] `RosterRecentMatch` no longer declares `event`, and the roster loader no longer selects or maps `tournament_name` for recent matches; `tests/team-roster-ids.spec.ts`'s recent-match fixture is updated to match and `npm run typecheck` passes
  - [ ] The `SetupLine`/identity line ("#3 singles · Freshman") and the chart tooltip ("opponent · date") in the same drawer still render their "·" — nothing outside the recent-matches row changes
- **notes:** `match.event` is `matches.tournament_name`, which for a dual holds the opposing program's name (`src/lib/schedule/actions.ts:896`) — that is the "school name". The player-profile page uses its own loader and is out of scope. Not a duplicate of T1; both touch player-drawer.tsx but different sections.

## T3 · Never send a localhost link from a deployed build

- **status:** done
- **model:** sonnet
- **files:** `src/lib/site-url.ts`, `src/app/layout.tsx`, `src/app/api/create-checkout-session/route.ts`, new `tests/site-url.spec.ts` (guess — `siteUrl()` is the one resolver every email template and `claim-actions.ts` already import; the other two files hold the last private `localhost:3000` fallbacks its header says it replaced; `tests/date-value.spec.ts` is the precedent for a pure unit spec under Playwright)
- **done when:**
  - [ ] With `NEXT_PUBLIC_SITE_URL` unset and `VERCEL_ENV=production`, `siteUrl()` returns `https://` + `VERCEL_PROJECT_PRODUCTION_URL`; with `VERCEL_ENV=preview` it returns `https://` + `VERCEL_URL`; with neither Vercel var set it still returns `http://localhost:3000` — all three pinned by a spec in `tests/` that passes under `npm test`
  - [ ] When `NEXT_PUBLIC_SITE_URL` is set, `siteUrl()` returns it unchanged apart from trailing-slash stripping (existing behaviour, pinned by the same spec)
  - [ ] When the localhost fallback is taken and `NODE_ENV === "production"`, `siteUrl()` emits one `console.warn` naming `NEXT_PUBLIC_SITE_URL` as the fix; in development it stays silent (the header comment's "a localhost link is exactly the right link locally" still holds)
  - [ ] `grep -rn "localhost:3000" src` returns only `src/lib/site-url.ts` — `layout.tsx`'s `metadataBase` and the checkout route's redirect base both call `siteUrl()` instead
  - [ ] `npm run typecheck` and `npm run lint` pass
- **notes:** The code was already reading `NEXT_PUBLIC_SITE_URL`; a localhost link means the variable is empty in the environment that sent the mail. The author still has to set it on Vercel — Preview (`advantage-analytics.dev` today) and Production (`https://app.advantage-analytics.com`), per `.env.example` lines 15–25 — this task only stops the worst case. Do NOT touch `resolveWebhookUrl()` in `src/lib/services/splitstep/config.ts` or `deployment-config.ts`: they deliberately reject localhost for the vendor webhook and must keep their own behaviour. `VERCEL_URL` carries no protocol, so prefix `https://`.

## T4 · Email the program owner when someone requests to join

- **status:** done
- **model:** fable
- **files:** `src/lib/services/email/templates/invite-request.ts`, `src/lib/services/email/index.ts`, `src/lib/services/programs/claim-actions.ts` (`requestInvite`), new helper e.g. `src/lib/services/programs/program-owner.ts` (guess — `requestInvite()` is the anonymous filing action and already holds an admin client; the invite-request template family lives in `invite-request.ts`; `index.ts` is both the export barrel and the "what fires what" table and currently states there is no owner notice)
- **done when:**
  - [ ] A new `joinRequestOwnerNoticeEmail` template renders through `renderEmail`/`renderText` with the requester's email, their name (or a greeting that reads without it), the program name, and a CTA to `${siteUrl()}/dashboard/team/roster`; the roster page is where the request is approved
  - [ ] A shared server-only helper resolves a program id to its owner's `{ userId, email, name }` by reading the `program_members` row with `role = 'owner'` via the admin client, returning `null` when there is none — exported for T5 to reuse
  - [ ] After `requestInvite()` files the row, the owner notice is sent to that address; the requester's own receipt behaviour is unchanged (still gated on the signed-in caller typing their own address)
  - [ ] The owner notice is sent only when `fileRequest` created a **new** open request, never on an idempotent repeat of the same `(email, program)` — so a resubmitted form cannot mail the owner twice — and the action's return value and observable timing to the caller are identical whether or not the owner send fired (no new timing oracle; run the send without awaiting its result, or await it on both branches)
  - [ ] `index.ts`'s trigger table gains a row for the owner notice and its qualification paragraph no longer says there is no notice to the owner; a failed send is logged with `console.warn` and never fails the request (same shape as the existing receipt)
- **notes:** `program_requests` has no RLS policies on purpose — only the admin client or SECURITY DEFINER RPCs read it (`join-requests-server.ts` header). Read `docs/email-system.md` §4–§5 before writing the template. Owner only, per the author's wording — coaches/staff can also approve but are not in scope; note that in the template's header comment if you think it is wrong rather than widening the recipient list. The one-owner index means there is at most one recipient.

## T5 · Email the program owner when an invitee accepts and joins

- **status:** done
- **model:** opus
- **files:** `src/lib/services/email/templates/invite-request.ts` (or a sibling `member-joined.ts`), `src/lib/services/email/index.ts`, `src/lib/services/programs/join-actions.ts` (guess — the three accept actions `acceptInvite`, `acceptPendingInvite` and `createAccountAndAccept` all pass through `adoptMembership(admin, …)` then `finishJoin(programId)`, which is the one funnel after membership is confirmed; the admin client is already in hand there)
- **needs:** T4
- **done when:**
  - [ ] A new `memberJoinedOwnerEmail` template renders the joiner's display name (falling back to their address), the role they joined as, the program name, and a CTA to `${siteUrl()}/dashboard/team/roster`
  - [ ] All three accept paths send it to the owner (resolved with T4's helper) exactly once, only after `acceptWithSession`/`acceptPendingWithSession` returned `ok` — a refused accept sends nothing
  - [ ] The owner is not emailed about their own acceptance (skip when the joiner's `user_id` equals the owner's `userId`)
  - [ ] A failed send is logged and does not change the accept's outcome: `finishJoin` still activates the workspace and redirects to `/dashboard/team`
  - [ ] `index.ts` exports the template and its trigger table gains a "Member joined" row naming `join-actions.ts` as the caller
- **notes:** The joiner's role is read back off the `program_members` row the RPC just wrote (see `adoptMembership`) — never from an argument. `finishJoin` calls `redirect()`, which throws; send the email before it, not after. Reuse T4's owner helper rather than adding a second lookup.

## T6 · Migration: `restore_program_player` + `program_former_players`

- **status:** todo
- **model:** fable
- **files:** new `supabase/migrations/2026MMDDhhmmss_restore_program_player.sql` (guess — model it on `supabase/migrations/20260822090700_program_player_writes.sql` for the write shape, `20260822120100_accept_invite_claims_profile.sql:85-94` for the seat check, `20260907034749_set_program_member_role.sql:96-121` for the drop-and-re-add of the audit constraint, and `20260822150700_pooled_reads_as_functions.sql` for the `user_program_ids()`-gated read)
- **done when:**
  - [ ] The migration defines `public.restore_program_player(p_player_id uuid)` as `SECURITY DEFINER` with `set search_path = ''`, execute revoked from `public` and `anon` and granted to `authenticated`; it requires `auth.uid()`, looks up `program_id, claimed_by_user_id, email` where `id = p_player_id and archived_at is not null and merged_into_id is null`, returns silently when no such row exists (a live row, a merged row, an unknown id), raises `42501` when `is_program_staff(program_id)` is false, and otherwise sets `archived_at = null, updated_at = now()` on that row
  - [ ] When the archived row carries an email that a **live** row in the same program already holds, the function raises `23505` with the message `'<name> is already on this roster with that email'` — the same sentence family `add_program_player` uses — before touching the row
  - [ ] When `claimed_by_user_id` is not null, the function runs the seat check (`programs.seats` vs `count(program_members)` for the program) and raises `22023` with message `'no seats left — free one in Settings › Teams first'` if full; otherwise it inserts `program_members (program_id, user_id, role, upload_enabled, invited_by)` as `('player', false, auth.uid())` with `on conflict (program_id, user_id) do nothing`. An unclaimed row inserts no membership
  - [ ] Every successful restore writes a `program_audit_log` row with `action = 'player.restored'` and `jsonb_build_object('had_account', claimed_by_user_id is not null)` in its details, and the migration drops and re-creates `program_audit_log_action_check` with the **current live** allowlist plus `'player.restored'` — the list in the migration matches what `execute_sql` returns for the constraint on the live DB, not what any file in `supabase/migrations/` says
  - [ ] The migration also defines `public.program_former_players(p_program_id uuid) returns table (profile_id uuid, display_name text, email text, archived_at timestamptz, match_count bigint)` as `language sql stable security definer`, gated on `p_program_id in (select public.user_program_ids())`, returning `program_players` rows where `archived_at is not null and merged_into_id is null` with `match_count` = count of the program's `matches` whose `player1_id` or `player2_id` equals the profile id — zero rows for a caller who is not a member; the grants mirror the restore function; and both functions exist live after `apply_migration` (`execute_sql` on `pg_proc` shows them)
- **notes:** Approved design: `~/.claude/plans/shiny-wibbling-abelson.md` §1 — do not re-litigate. Why restore re-seats a claimed profile: `accept_program_invite` requires `claimed_by_user_id is null`, so a claimed profile can never be re-claimed; a restored-but-seatless claimed profile would be a dead state, and the person already consented to this program once. Why an error sentence rather than a status for no-seats: this is a staff action with a `DialogProblem` to land in. **Schema truth is the live database** (AGENTS.md; `supabase/migrations/` is ~100 behind) — before writing, confirm via the Supabase MCP `execute_sql` the current `program_audit_log_action_check` definition, the `programs.seats` column, the partial unique index `program_players_email_key`, and that no restore/unarchive function already exists live. Apply the migration live with `apply_migration` as part of this task (memory `feedback_gate_finding_permit_migration`: DDL goes to live too). Leave `add_program_player` permissive — its duplicate check stays on live rows only, so a genuinely different same-named athlete can still be added; `merge_program_players` remains the fallback for a duplicate that was already minted. Never hand-format `supabase/migrations/` (`.prettierignore`). The Supabase MCP in the runner's session must be authorized; if it isn't, the task is blocked, not done.

## T7 · Restore server action, former-players loader and prop plumbing

- **status:** todo
- **model:** sonnet
- **needs:** T6
- **files:** `src/components/dashboard/team/roster-actions.ts` (next to `archiveProgramPlayer`, ~L505-540), `src/lib/data/team-roster-server.ts` (`RosterMember` types ~L124-160, `shortDate`, the loader that calls `program_roster_full` ~L344), `src/app/dashboard/team/roster/page.tsx` (~L272 `RosterHeaderButtons`), `src/components/dashboard/team/roster-header-buttons.tsx` (props ~L21-40, `AddPlayerDialog` at ~L113), `src/components/dashboard/team/add-player-dialog.tsx` (props ~L122-141) — guess
- **done when:**
  - [ ] `roster-actions.ts` exports `restoreProgramPlayer(profileId: string): Promise<AddPlayerResult>` with the same team-workspace guard and `createClient()` as `archiveProgramPlayer`, calling `supabase.rpc("restore_program_player", { p_player_id: profileId })`; a Postgres error's trimmed `message` is passed through as `error` (fallback sentence only when empty), and success returns `{ ok: true, profileId }` after `revalidatePath` on `ROSTER_PATH`, `SETTINGS_PATH` and `TEAM_HOME_PATH`
  - [ ] `team-roster-server.ts` exports a `FormerPlayer` type `{ profileId: string; name: string; email: string | null; archivedOn: string; matchCount: number }` and `getFormerPlayers(programId: string): Promise<FormerPlayer[]>` that calls `supabase.rpc("program_former_players", { p_program_id })` through the server client and formats `archivedOn` server-side with the same `shortDate` helper `addedOn` uses (the L144 comment says why not in the browser); a null/error RPC result yields `[]`, not a throw
  - [ ] The roster page loads `getFormerPlayers` alongside its existing roster fetch (in the same `Promise.all`, not a serial await) and passes it as `former` to `RosterHeaderButtons`, which declares `former: FormerPlayer[]` with a doc comment in the file's existing voice and forwards it to `AddPlayerDialog`, whose props type gains `former: FormerPlayer[]` — the dialog's behaviour is otherwise unchanged in this task (T8 consumes the prop)
  - [ ] No other call site of `AddPlayerDialog` or `RosterHeaderButtons` is left without the new prop, and `npm run typecheck` and `npm run lint` pass
- **notes:** Plan §2 of `~/.claude/plans/shiny-wibbling-abelson.md`. `SETTINGS_PATH` is added to the plan's revalidate list on purpose: restoring a claimed profile re-inserts a `program_members` row, which is the seat count Settings › Teams shows — same reason `archiveProgramPlayer` revalidates it. Read through an RPC rather than a server-client `select` because the roster page reads pooled data via SECURITY DEFINER functions and staff visibility of an archived player's matches under `visible_match_ids()` is not something the dialog should depend on. Plan §5 (docs) is a no-op — `grep -rn archive_program_player docs/` returns nothing, so there is no roster/membership doc to extend; do not create one. `npm run map` is not needed (no new route).

## T8 · Add player dialog offers Restore for a removed player

- **status:** todo
- **model:** opus
- **needs:** T7
- **files:** `src/components/dashboard/team/add-player-dialog.tsx` (header comment ~L56-90, `sameName` check ~L301-315, `submit()` ~L320-365, footer ~L378-400, notes ~L435/471), new `tests/former-player-match.spec.ts` (precedent `tests/date-value.spec.ts` — pure spec, no browser) — guess
- **done when:**
  - [ ] `add-player-dialog.tsx` exports a pure `formerPlayerMatch(former: FormerPlayer[], typed: { firstName: string; lastName: string; email: string })` that returns the archived profile whose lowercased trimmed email equals the typed one, else the one whose `normalizedPersonName(name)` equals `normalizedPersonName(firstName, lastName)` (the roster's own duplicate rule, same as the `sameName` check), else `null`; an email match wins over a name match, and an empty typed email never matches an empty stored one
  - [ ] `tests/former-player-match.spec.ts` pins those four behaviours (email match, name match, email-beats-name, no match / empty email) and passes under `npm test` without a dev server
  - [ ] When `formerPlayerMatch` returns a profile, the form renders a `RosterNote` with the lucide `RotateCcw` icon, in the neutral register of the two existing notes (not `DialogProblem`), reading like _"Jane Doe was removed on Aug 20 with 14 matches. Restore their profile instead? If this is somebody else, you can still add them."_ (name, `archivedOn`, `matchCount` from the match; pluralise "match"; no gendered pronoun — "their"), and the footer gains an `advButton("outline")` button labelled "Restore <name>" between Cancel and "Add to roster"; "Add to roster" stays enabled and unchanged, and with no match neither the note nor the button renders
  - [ ] Clicking Restore runs a `restore()` that mirrors `submit()`: `startTransition`, `restoreProgramPlayer(match.profileId)`; an `ok: false` result lands in `DialogProblem`; on success, if `alsoInvite` is checked and the typed email is set, it calls `inviteMember({ email, role: "player", playerId: profileId })` with the same half-done handling `submit()` uses (L337-359: a failed invite after a successful restore reports the invite failure and keeps the dialog open with `created` set so a retry doesn't restore twice); then `reset()` and close. Both buttons are disabled while either transition is pending
  - [ ] The file's header comment gains a short section ("The player who was removed", in the existing voice) explaining why restore is a note plus a secondary button rather than a refusal — two athletes can share a name — and `npm run typecheck`, `npm run lint` and `npm test` pass
- **notes:** Plan §3 of `~/.claude/plans/shiny-wibbling-abelson.md`. Restoring is offered, never forced: `add_program_player` deliberately keeps its duplicate check on live rows only, so "Add to roster" must still create a second distinct row for a same-named different athlete. The note is keyed on typed values, so `formKey` already covers exclusion — do not add `former` to it unless something actually breaks. Read `.skills/advantage-analytics-design/SKILL.md` before the UI edit; primary/secondary buttons come from `advButton()`, never hand-rolled. `inviteMember` is `@/components/dashboard/settings/team-actions`, already imported. Only invite against an **unclaimed** profile — a claimed one already has its account (and T6 gave the seat back); use the `FormerPlayer` email/claimed state you have, and if the loader does not expose claimed-ness, gate on the RPC's success and let `inviteMember` refuse as it does today rather than adding a loader field in this task.

## T9 · Say in the drawer's Remove row that matches are kept and the player can be restored

- **status:** todo
- **model:** sonnet
- **files:** `src/components/dashboard/team/player-drawer.tsx` (`MemberMenu`'s Remove row, ~L440-462) — guess
- **done when:**
  - [ ] When `member.profileId` is non-null (the archive branch), the Remove row renders a description stacked under its "Remove from roster" label in the same label+description shape and classes the "Can send video" row already uses in this menu, reading "Their matches stay. Adding them again offers to restore this profile." — one sentence pair, no icon change
  - [ ] When `member.profileId` is null (the `removeMember` branch — a seat with no profile), no description renders and the row reads exactly as before
  - [ ] The row's behaviour is untouched: `canRemove`, `pending`, the `archiveProgramPlayer`/`removeMember` branch, the `Trash2` glyph and its neutral `--ink-400` colour, the `hover:text-[var(--danger)]` on the label and the popover's `w-[248px]` all read the same in the diff
  - [ ] `npm run typecheck` and `npm run lint` pass
- **notes:** Plan §4 assumed a confirm dialog whose sentence could be reworded; there is none — the Remove row calls the action straight from the menu (L443-456), so the only user-visible copy is the row itself. This description line is the smallest change that carries the plan's sentence; do NOT add a confirm step, that is new behaviour and out of scope. The description colour and size should match the existing description under "Can send video" (T1 kept the menu hand-built on `Popover`; keep it that way). Independent of T6–T8 — it can run in any order.
