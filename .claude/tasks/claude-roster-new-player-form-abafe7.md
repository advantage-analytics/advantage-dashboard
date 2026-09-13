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

- **status:** todo
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
