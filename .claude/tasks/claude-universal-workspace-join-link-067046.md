# Tasks — claude/universal-workspace-join-link-067046

> Scope: the team join link — one reusable `/join/<token>` link per program that admits players (open or with approval), its Settings › Teams / Roster UI, the `/join` screens and tests.

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

## T1 · Migration: `program_join_links` table, RLS and five RPCs

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-version>_program_join_links.sql (new; name it to the version `list_migrations` reports after the live apply), supabase/migrations/20260921050000_seats_count_roster_players.sql (read only — source of the player-branch body to factor out)
- **done when:**
  - [ ] The new migration file creates `public.program_join_links` with exactly the plan's columns — `token text not null unique` (plaintext, like `match_share_links.token`; NOT hashed), `mode text not null default 'open' check (mode in ('open','approve'))`, `created_by uuid references users(id) on delete set null`, `revoked_at timestamptz`, `uses integer not null default 0` — plus a partial unique index on `(program_id) where revoked_at is null`; enables RLS with one `select` policy gated on `is_program_staff(program_id)` and no insert/update/delete policy; `grant select on public.program_join_links to authenticated` and nothing to `anon`.
  - [ ] The file defines five `security definer` functions with `set search_path = ''`: `set_program_join_link(p_program_id uuid, p_token text, p_mode text) returns uuid` (staff or `is_admin`; revokes the live row, inserts the new one, audit `join_link_created`), `set_program_join_link_mode(p_program_id uuid, p_mode text)` (owner/coach — the same gate `set_program_member_role` uses), `revoke_program_join_link(p_program_id uuid)` (stamps `revoked_at`, audit `join_link_revoked`), `accept_program_join_link(p_token text) returns table(status text, program_id uuid)`, and `program_join_link_preview(p_token text)` returning `(program_name, org_type, mode, seats_free boolean, created_by_name, roster_match_name)` where `roster_match_name` is the unclaimed, unarchived `program_players` row matching `auth.email()` in that program (null when signed out or no match) and the function returns no row for an unknown/revoked token. Grants in the same file: all five `to authenticated`; `program_join_link_preview` additionally `to anon` with a comment saying why (signed-out landing names the program), and no other function is anon-executable.
  - [ ] `accept_program_join_link` returns `not_found` (no live row), `unconfirmed` (session email not confirmed — same rule as `accept_pending_invite`), `no_seats` (via `program_seat_counts` after locking the `programs` row `for update`), `requested` (mode `approve`: idempotent `program_requests` insert, kind `invite_request`, role `player`, email = session email, name from `users`), or `ok` (mode `open`: claim-by-email or create `program_players` row, insert `program_members (program_id, user_id, 'player', upload_enabled = programs.players_can_upload, invited_by = created_by)`, `uses = uses + 1`, audit `join_link.accepted`; an existing-member conflict also returns `ok`).
  - [ ] The claim-by-email-or-create-row logic is a private helper function (e.g. `public._ensure_program_player_row(...)`, authenticated/service_role only), and the file re-creates `accept_program_invite` so its `role = 'player'` branch calls the same helper instead of carrying a second copy; `accept_program_invite`'s grants are re-stated after the `create or replace` (repo rule: drop+create resets grants).
- **notes:** Plan: /Users/cjgimena/.claude/plans/a-user-was-asking-moonlit-blum.md (sections "Data layer", "Token storage: plaintext", "Decisions"). Canvas https://claude.ai/artifact/NMy33ZNUtSs1H41cinSUpu — board `Flow` only (no UI in this task). Load the `supabase-postgres-best-practices` skill before writing SQL. Apply live via Supabase MCP `apply_migration` and then confirm with `execute_sql`: `has_function_privilege('anon','public.accept_program_join_link(text)','execute')` = false, `…program_join_link_preview(text)…` = true — this live step is required but is not a `done when:` because its evidence is not in the diff. Never hand-format `supabase/migrations/` (`.prettierignore`). The `created_by_name` / `roster_match_name` preview columns are an addition to the plan so T5's `link_ready` body ("{Coach} shared this link", "already on the roster as {First Last}") has data. Gate with `rls-boundary-reviewer`.

## T2 · Service layer: link states, join actions, team actions, settings loader

- **status:** todo
- **model:** fable
- **needs:** T1
- **files:** src/lib/services/programs/invite-acceptance.ts, src/lib/services/programs/join-actions.ts, src/lib/services/programs/join-links.ts, src/components/dashboard/settings/team-actions.ts, src/lib/data/team-settings-server.ts, src/lib/services/programs/tokens.ts (read — token minting helper)
- **done when:**
  - [ ] `JoinState` in `invite-acceptance.ts` gains `{ kind: "link_ready"; programName; programOrgType; mode; seatsFree; inviterName; rosterMatchName: string | null }`, `{ kind: "link_sign_up"; programName; programOrgType; mode }`, `{ kind: "link_requested"; programName }` and `{ kind: "link_full"; programName }`; `resolveJoinState()` still tries `program_invites` first and, only on a miss, calls `program_join_link_preview` — returning `not_found` when it yields no row, `link_sign_up` when signed out, `link_full` when `seats_free` is false, `link_requested` when an open `program_requests` row already exists for the session email in that program, else `link_ready`. Every pre-existing branch's return value is unchanged.
  - [ ] `acceptVia()`'s rpc-name union includes `accept_program_join_link`, and `AcceptOutcome` maps the new `requested` status (plus `no_seats`/`unconfirmed`) to typed outcomes; `join-actions.ts` exports `acceptJoinLink(token)` and `createAccountAndJoinByLink(token, { email, firstName, lastName, password })`, both of which on `ok` call `adoptMembershipAndNotify(...)` then `finishJoin(programId)`, and on `requested` redirect to `joinHref(token)`; the generic sign-up form is not touched.
  - [ ] `team-actions.ts` exports `createJoinLink(programId, mode)`, `setJoinLinkMode(programId, mode)`, `resetJoinLink(programId)` and `revokeJoinLink(programId)`; the raw token is minted server-side with the helper in `tokens.ts`, stored as-is (plaintext column), and the create/reset actions return `{ ok: true, url }` where `url` comes from a new `joinLinkUrl(token)` in `join-links.ts` built on `siteUrl()` the way `matchShareUrl()` is; each action calls `revalidatePath` for `/dashboard/settings/teams/[programId]` and `/dashboard/team/roster`.
  - [ ] `TeamSettingsData` gains `joinLink: { url: string; mode: "open" | "approve"; createdAt: string; createdByName: string | null; createdByMe: boolean; uses: number } | null`, populated by `getTeamSettings()` from the program's row with `revoked_at is null` (null when none).
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Plan: /Users/cjgimena/.claude/plans/a-user-was-asking-moonlit-blum.md (sections "Server code", "Sign-up return path", "Token storage: plaintext"). Canvas https://claude.ai/artifact/NMy33ZNUtSs1H41cinSUpu — board `Flow` (state transitions). Correction to the plan: `acceptVia` and `AcceptOutcome` live in `invite-acceptance.ts`, not `join-actions.ts`. `/join` GET must never join — acceptance stays a POST server action. Leave `join-role.ts` alone. Gate with `rls-boundary-reviewer` (service-role client must stay server-side).

## T3 · Join-link popover + Members card (extract share-panel primitives)

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** src/components/ui/share-panel.tsx (new), src/components/dashboard/matches/match-detail/share-match-button.tsx, src/components/dashboard/settings/teams/join-link-popover.tsx (new), src/components/dashboard/settings/teams/team-members-card.tsx, src/components/dashboard/settings/teams/team-detail.tsx, src/components/dashboard/settings/teams/types.ts (guess — if member-card props are typed there)
- **routes:** /dashboard/settings/teams
- **done when:**
  - [ ] `src/components/ui/share-panel.tsx` exports `UrlRow`, `AccessOption`, `SECONDARY_BUTTON` and `moveFocusBetweenRungs`, moved verbatim out of `share-match-button.tsx`; that file imports them and its local copies are deleted, with no other line of its JSX or class strings changed.
  - [ ] New `join-link-popover.tsx` renders a 320px panel cloned from `SharePopoverPanel`: a radiogroup labelled "Who can join with this link" with three rungs and the canvas subtitles — "Link off" / "Players join by email invite only", "Anyone with the link" / "Joins as a player right away" (+ `SeatBoxes` trailing), "Anyone, with approval" / "Staff approve each person on the Roster"; when a link is on, a `UrlRow` + Copy and a second row with "Reset link" (ghost) and "Email" (mailto carrying the program name); a note line reading "Made {Mon D} by {you|Name} · {n} joined", or "Players join with no upload rights until a coach allows it" when `playersCanUpload` is false, or lock icon + "Only coaches can change this" for role `staff` (ladder `aria-disabled`, Copy still enabled).
  - [ ] Stepping the ladder to "Link off" swaps the body in place for the confirm "Turn off the link? Everyone who has it loses it. Turning it back on makes a new one." with "Keep link" and a danger-solid "Turn off"; `revokeJoinLink` is called only from "Turn off". The other rungs call `createJoinLink` (from off) or `setJoinLinkMode` (open↔approve), Reset calls `resetJoinLink`, and the `UrlRow` shows the URL returned by the action without a page reload.
  - [ ] `team-members-card.tsx` header gains a `SettingsButton` "Invite link" (lucide `Link`) rendered left of "Invite staff" that opens the popover; when `joinLink` is non-null the list renders one row at the top — `Link` icon in a 22px circle, text "Join link · Anyone with the link" or "Join link · With approval", meta "{uses} joined", `StatePill` outline "On" — that opens the same popover; the owner's footer copy adds "A join link admits players only."; `team-detail.tsx` passes `joinLink`, `role` and `playersCanUpload` through.
  - [ ] The widget-states mark covers the Members card edit (loading/empty states for the new row and button), and `npm run typecheck` and `npm run lint` pass.
- **notes:** Plan: /Users/cjgimena/.claude/plans/a-user-was-asking-moonlit-blum.md (UI §1 Popover, §2 Members card). Canvas https://claude.ai/artifact/NMy33ZNUtSs1H41cinSUpu — boards `Main`, `Popover-Open`, `Popover-Approve`, `Popover-Off`, `Popover-Locked`: copy layout literally, copy text as written unless false against the data. Read `.skills/advantage-analytics-design/SKILL.md` (+ `reference/components`, `settings`, `chrome`) and `docs/ui-revamp-guardrails.md` first; use `trace-route` to confirm `team-members-card.tsx` is the one rendered at `/dashboard/settings/teams/[programId]`. Primary buttons via `advButton()`; `rounded-[6px]` on buttons, `rounded-full` only on the StatePill. The eyes-on route is the Teams list — the card is on the per-program page `/dashboard/settings/teams/[programId]`, which needs a program the verifier account can see. Gate with `pipeline-guardrails-reviewer`.

## T4 · Roster Invite dialog: "Share a join link instead"

- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/team/roster-invite-dialog.tsx, src/components/dashboard/team/roster-header-buttons.tsx, src/components/dashboard/team/roster-view.tsx (guess — prop plumbing), src/app/dashboard/team/roster/page.tsx + src/lib/data/roster-server.ts (guess — load `joinLink` for the roster page)
- **routes:** /dashboard/team/roster
- **done when:**
  - [ ] `CopyInviteLink()` (`roster-invite-dialog.tsx` ~L934) and its "never shown here" doc comment are gone; in their place, under the email field, a hairline and one quiet row — lucide `Link` + "Share a join link instead" + `ArrowUpRight` — with a doc comment that names `program_join_links` as the capability the old button was waiting for.
  - [ ] Clicking that row closes the Invite dialog and opens `JoinLinkPopover` (from T3) anchored to the roster header's Invite button; `roster-header-buttons.tsx` owns the popover's open state and passes `programId`, `joinLink`, `role` and `playersCanUpload`, loaded server-side for the roster page the same way `getTeamSettings` builds `joinLink` (shared loader, not a second query shape).
  - [ ] The dialog's email path is otherwise untouched: `inviteMember`, the target picker and the quota footer keep their current markup, and the row is the only addition below the email field.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Plan: /Users/cjgimena/.claude/plans/a-user-was-asking-moonlit-blum.md (UI §3, "Un-disable CopyInviteLink()"). Canvas https://claude.ai/artifact/NMy33ZNUtSs1H41cinSUpu — board `Roster-Invite`. Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first; `trace-route` the Roster before editing (several roster components share names). The dialog's job stays email — keep the addition to one link row. Gate with `pipeline-guardrails-reviewer`.

## T5 · `/join/[token]` link screens

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** src/app/join/[token]/page.tsx, src/components/join/join-forms.tsx, src/components/join/join-terms.tsx (read — `JoinSharingTerms`), src/components/join/nothing-sent.tsx (guess — `not_found` copy may live here)
- **routes:** /join/not-a-real-token
- **done when:**
  - [ ] `page.tsx` branches on `link_ready`, `link_sign_up`, `link_requested` and `link_full`, rendering new `JoinLinkReady`, `JoinLinkSignUp`, `JoinLinkRequested` and `JoinLinkFull` from `join-forms.tsx` inside `JoinPane` with the program name as eyebrow; the `not_found` body now reads "That link isn't valid. It may have been turned off or replaced. Ask whoever shared it for a new one."
  - [ ] `JoinLinkReady`: title "Join {program}", body "You'll join as a player. {inviterName} shared this link." plus, when `rosterMatchName` is set, "Your coach already has you on the roster as {rosterMatchName} — your matches will be waiting."; `JoinSharingTerms`, `JoinQuotaFooter`, primary `advButton()` "Join {program}" submitting `acceptJoinLink` as a form action (a GET never joins), and `NotNowLink`.
  - [ ] `JoinLinkSignUp`: title "Set up your account"; email, first name, last name and password fields using the existing `CLAIM_FIELD` styles, submitting `createAccountAndJoinByLink`; "Sign in with Google instead" → `signInThenHref(joinHref(token))`; an "Already have an account? Sign in" link to `/login?next=/join/<token>`.
  - [ ] `JoinLinkRequested`: title "Request sent", body "{Program}'s coaches will see your request on their roster. You'll get an email when they approve it.", button "Go to your dashboard" → `/dashboard`. `JoinLinkFull`: title "{Program} is full", body "Every player seat is taken. Ask a coach to free one, then open this link again.", button "Go to your dashboard" when signed in or "Go to sign in" (→ `/login`) when not.
  - [ ] `npm run typecheck` and `npm run lint` pass.
- **notes:** Plan: /Users/cjgimena/.claude/plans/a-user-was-asking-moonlit-blum.md (UI §4, "Sign-up return path"). Canvas https://claude.ai/artifact/NMy33ZNUtSs1H41cinSUpu — boards `Join-Ready`, `Join-SignUp`, `Join-Requested`, `Join-Full`: layout literally, copy as written unless false against the data. Read `.skills/advantage-analytics-design/SKILL.md` first (`/join` is outside `src/components/dashboard/` but still uses `advButton()` and the DS tokens). The eyes-on route only reaches `not_found` (no live token to commit); the other four screens are verified by T6's offline spec and manually per the plan's "Verification" list. Gate with `pipeline-guardrails-reviewer`.

## T6 · Tests: offline state machine + live RLS probe

- **status:** todo
- **model:** opus
- **needs:** T2, T3, T4, T5
- **files:** tests/join-link-state.spec.ts (new, offline), tests/join-link-rls.spec.ts (new, live — named like tests/match-share-links-rls.spec.ts), tests/fixtures/vm-modules.ts (read — `createLoader`), tests/fixtures/live-db.ts + tests/fixtures/live-db-pool.ts (read), tests/fixtures/live-db-specs.ts (guess — update if it enumerates live specs)
- **done when:**
  - [ ] `tests/join-link-state.spec.ts` loads `invite-acceptance.ts` through `createLoader()` with a stubbed Supabase client and asserts `resolveJoinState()`'s return for every `JoinState` kind, including: an invite hit wins over a link with the same token, unknown/revoked token → `not_found`, signed out → `link_sign_up`, `seats_free=false` → `link_full`, approve mode with an open `program_requests` row → `link_requested`, open mode signed in → `link_ready` carrying `rosterMatchName` from the preview row.
  - [ ] `tests/join-link-rls.spec.ts` uses the `live-db` / `live-db-pool` fixtures in serial mode and skips with `SKIP_REASON` when env is missing or the target is production (same pattern as `match-share-links-rls.spec.ts`); it seeds a program + live link through the service role, then asserts: a `player` member's `select` on `program_join_links` returns zero rows while a `coach` sees the row; an anon client's `rpc("accept_program_join_link")` is refused with a permission error; an anon `rpc("program_join_link_preview")` returns the program name; a `staff` member calling `set_program_join_link_mode` is refused while a `coach` succeeds; fixture rows are removed in `afterAll`.
  - [ ] Neither spec sets `LIVE_DB_ALLOW_PROD`, and no test touches `tests/fixtures/live-db-lock.ts`'s locking.
  - [ ] `npm test -- tests/join-link-state.spec.ts` passes, and `npm test` passes with the live spec reporting skipped (no live env in the gate).
- **notes:** Plan: /Users/cjgimena/.claude/plans/a-user-was-asking-moonlit-blum.md ("Files to touch" → `tests/`, "Verification" step 6). Canvas https://claude.ai/artifact/NMy33ZNUtSs1H41cinSUpu — board `Flow` is the state map the offline spec covers. Offline specs: Playwright's JSX transform breaks `renderToStaticMarkup` on imported .tsx, so test the pure `.ts` state function, not the forms (memory: reference_offline_component_specs). Live specs: never run in a loop; the auth rate limit is shared (AGENTS.md "Live-DB specs"). Gate with `rls-boundary-reviewer`.
