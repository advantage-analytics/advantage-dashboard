# Tasks — claude/player-messaging-design-55f785

> Scope: in-app player messaging — one support conversation per player, Admin › Messages, the player's tray row and dialog, and the reply email (design canvas https://claude.ai/artifact/XYHQdNxmpnf2HV3G1ABAHP).

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

## T1 · support_threads / support_messages: tables, RLS, send and mark-read RPCs

- **status:** todo
- **model:** fable
- **files:** supabase/migrations/<live-version>_support_messaging.sql (new), tests/support-messaging-rls.spec.ts (new) — a guess
- **done when:**
  - [ ] A migration creates `public.support_threads` (`id`, `user_id` unique → `users`, `origin` check in `first_match_feedback|account_menu|match_report|help|admin`, `last_player_message_at`, `last_staff_message_at`, `player_read_at`, `staff_read_at`, `created_at`) and `public.support_messages` (`id`, `thread_id` → threads on delete cascade, `author_id` → `users` nullable, `author_role` check in `player|staff|event`, `author_name` text — the staff first name snapshotted at send, null for player rows, `body` text check `length ≤ 4000` and not blank, `topic` nullable check in `match|upload|billing|team|idea|other`, `match_id` → `matches` on delete set null, `email_copy_sent_at`, `created_at`), with an index on `(thread_id, created_at)`; an after-insert trigger stamps the thread's `last_player_message_at` / `last_staff_message_at` by `author_role`.
  - [ ] RLS is enabled on both tables with exactly one policy each, `SELECT TO authenticated` where the thread's `user_id = (select auth.uid())` (messages via their thread); no INSERT/UPDATE/DELETE policy exists for any role; grants are `SELECT` to `authenticated` and all to `service_role`, nothing to `anon`; the migration's header states the post-apply `information_schema.role_table_grants` listing for both tables.
  - [ ] `public.send_support_message(p_body text, p_topic text, p_match_id uuid, p_origin text) returns uuid` is `security definer`, `set search_path = ''`, creates the caller's thread on first use (`origin` = `p_origin`), always writes `author_role = 'player'` and `author_id = auth.uid()`, refuses (raised exception) a null `auth.uid()`, a blank or over-4000 body, and a `p_match_id` not visible to the caller — visible means `matches.created_by = auth.uid()` or `player1_id`/`player2_id` in `public.my_player_ids()` (both id spaces) — and refuses the 21st message in any rolling hour (`support_rate_limited`); `public.mark_support_thread_read()` sets the caller's `player_read_at = now()`. Both are granted to `authenticated` and `service_role` only, revoked from `public` and `anon`.
  - [ ] The DDL is applied live with `apply_migration`, the repo file is named to the version `list_migrations` reports, and the header records the rollback statements.
  - [ ] tests/support-messaging-rls.spec.ts is a live-DB spec (tests/fixtures/live-db.ts + live-db-pool, serial under the lock) asserting with two pool accounts A and B: A's `send_support_message` creates one thread and B's `select` on `support_threads`/`support_messages` returns none of A's rows; a direct `insert` into `support_messages` as A with `author_role = 'staff'` errors `42501`; A sending with B's match id errors; the 21st send inside the hour errors with the rate-limit message; and everything seeded is deleted in `afterAll` via the service role.
- **notes:** Design canvas https://claude.ai/artifact/XYHQdNxmpnf2HV3G1ABAHP ("Player Messaging"). Decisions: one thread per player, private to the player (coaches never see it — hence no program-scoped policy), any `is_admin` replies via the service role (T5), so no staff policy is needed. `author_name` is a snapshot because the player's loader runs as the player and `users` RLS would not let it read a staff member's first name. Rate limit is 20/hour — the author named no number. Verify base tables live (`list_tables`), not from supabase/migrations/ (~100 behind). Not exposed through MCP: do not touch src/lib/services/mcp/server.ts. Never set LIVE_DB_ALLOW_PROD in a gate. After the gate, run `rls-boundary-reviewer` over this diff.

## T2 · Internal alerts accept kind `support_message`

- **status:** todo
- **model:** opus
- **files:** src/lib/services/notifications/internal-activity-mail.ts, src/lib/services/email/templates/internal-activity.ts, src/lib/services/email/index.ts, tests/internal-activity-email.spec.ts — a guess
- **done when:**
  - [ ] `parseInternalEvent` accepts `{ kind: "support_message", id }` (a fifth `InternalEventKind`) and `notifyInternalEvent` routes it to a `notifySupportMessage` that reads `support_messages` + its thread's `users` row back with the service role, answers `not_found` for a missing row or one whose `author_role` is not `player`, `test_account` for an `@example.com|org|net` player, and `duplicate` when `claimSend("support_message_internal:<id>")` already fired.
  - [ ] `supportMessageInternalEmail({ to, messageId, userId, playerName, playerEmail, topic, matchTitle, body, adminUrl })` in templates/internal-activity.ts returns all four `EmailMessage` parts with `tags.type = "support_message_internal"`, the body in full, and a CTA to `${emailOrigin()}/admin/messages?id=<thread_id>`; it is exported from index.ts with a row in the doc-comment table.
  - [ ] The route doc comment in src/app/api/webhooks/internal-events/route.ts names the fifth kind and its trigger table.
  - [ ] tests/internal-activity-email.spec.ts gains cases: `parseInternalEvent` accepts the new kind and still rejects an unknown one; the rendered HTML and text of `supportMessageInternalEmail` contain the body and the admin URL.
- **notes:** The sequencing hazard: pg_net does not retry, so this must be deployed before T3's trigger goes live (T3 `needs` it). Follow `notifyFeedback` verbatim in shape. `/admin/messages` is built in T6; the link is fine to emit now.

## T3 · Triggers: feedback opens the thread, Chang backfill, internal alert on player messages

- **status:** todo
- **model:** fable
- **needs:** T1, T2
- **files:** supabase/migrations/<live-version>_support_messaging_triggers.sql (new), tests/support-messaging-rls.spec.ts — a guess
- **done when:**
  - [ ] A migration adds an after-insert trigger on `public.product_feedback` that, when `new.note` is non-blank, upserts the player's `support_threads` row (`origin = 'first_match_feedback'` only when newly created) and inserts one `support_messages` row with `author_role = 'player'`, `author_id = new.user_id`, `body = new.note`, `topic = null`; a rating with no note opens nothing.
  - [ ] The same migration backfills feedback row `1621c2fd-7724-4d17-af51-82c9d54cf2c8` (user `b9db6c4d-7f7f-4009-8868-09f5ff614670`) through the same function body, with `created_at` copied from the feedback row, and is idempotent (re-running inserts nothing).
  - [ ] An after-insert trigger on `public.support_messages` calls `internal_alerts_private.post_event('support_message', new.id)` only when `new.author_role = 'player'`, modelled on `on_feedback_submitted()` (security definer, `search_path = ''`, revoked from public/anon/authenticated); the file's header says the route accepting the kind (T2) was deployed first.
  - [ ] Applied live with `apply_migration`, the repo file named to the live version, and the header records the post-apply query showing Chang's thread has exactly one player message.
  - [ ] tests/support-messaging-rls.spec.ts gains a case: stamp a pool account's `users.first_report_seen_at` via the service role, call `submit_product_feedback` with a note as that user, and assert one `support_threads` row with `origin = 'first_match_feedback'` and one message whose body equals the note; cleaned up in `afterAll`.
- **notes:** `submit_product_feedback` refuses (42501) until `first_report_seen_at` is set — the spec must stamp it first. The backfill must not re-fire T2's internal alert loudly: either disable the message trigger around the backfill or accept one email (say which in the header). The verifier account seeded in T9 inserts via the service role and will fire this trigger unless its address is a test-account one — see T9.

## T4 · Player reply email: `support-reply.ts`

- **status:** todo
- **model:** sonnet
- **files:** src/lib/services/email/templates/support-reply.ts (new), src/lib/services/email/index.ts, tests/support-reply-email.spec.ts (new) — a guess
- **done when:**
  - [ ] `supportReplyEmail({ to, playerFirstName, adminFirstName, body, sentAt })` returns `to`, `subject` ("{adminFirstName} at Advantage replied"), `html` via `renderEmail`, `text` via `renderText`, `tags.type = "support_reply"`, and `replyTo = SUPPORT_ADDRESS` (team@, from config.ts), built as an `EmailContent` per docs/email-system.md §3 — never hand-written HTML.
  - [ ] The content carries the reply text in full as paragraphs (newlines preserved as separate paragraphs), a sign-off line "{adminFirstName} at Advantage", and one `ctaBlock` whose primary button reads "Reply in Advantage" and links to `${emailOrigin()}/dashboard?messages=open`.
  - [ ] It is exported from index.ts with a row in the doc-comment table naming T5's `sendStaffMessage` as the one caller, and the "Written but not yet wired" section of docs/email-system.md is not touched.
  - [ ] tests/support-reply-email.spec.ts (offline) asserts the rendered HTML and text both contain the body, the sign-off, the "Reply in Advantage" label and the `/dashboard?messages=open` href, and that `replyTo` equals `SUPPORT_ADDRESS`.
- **notes:** No email is ever sent to the player for their OWN message (no receipt) — this template is for staff replies only; T5 enforces that. `sendEmail()` already checks suppression. Preview with the appendix recipe in docs/email-system.md. Canvas artboard 9 "your reply also arrives by email" shows the layout.

## T5 · Support data layer and server actions

- **status:** todo
- **model:** opus
- **needs:** T1, T4
- **files:** src/lib/data/support-server.ts (new), src/lib/data/support-admin-server.ts (new), src/lib/data/support-view.ts (new, pure), src/app/dashboard/support-actions.ts (new), src/app/admin/messages/actions.ts (new), tests/support-view.spec.ts (new) — a guess
- **done when:**
  - [ ] support-server.ts (session client, RLS as the player) exports `getSupportThread(supabase)` → `{ thread, messages } | null`, `getSupportUnread(supabase)` → `{ hasThread, unreadStaff: boolean, latestStaff: { authorName, preview, createdAt, matchId } | null }` computed as `last_staff_message_at > coalesce(player_read_at, '-infinity')`, and `getRecentMatchesForSupport(supabase)` → the viewer's 5 newest matches as `{ id, label, dayLabel, scoreText }` using `formatMatchDay*` from match-day.ts.
  - [ ] support-admin-server.ts runs `requireAdminOrNotFound()` then the service role, like ask-admin-server.ts: `listSupportThreads()` → rows `{ threadId, userId, playerName, avatarUrl, origin, lastAt, lastAuthorRole, waitingOn: "you" | "them" }`; `getSupportThreadForAdmin(threadId)` → the thread, every message, and the player's `email` + name; `countMessagesForNav()` → threads whose last message is the player's; `markStaffRead(threadId)` sets `staff_read_at`.
  - [ ] `sendPlayerMessage({ body, topic, matchId, origin })` (server action, session client) calls `send_support_message` and returns `{ ok } | { ok: false, error }` with the RPC's rate-limit and foreign-match messages mapped to sentences; `markPlayerThreadRead()` calls `mark_support_thread_read()`. Neither sends mail.
  - [ ] `sendStaffMessage({ threadId, body, emailCopy })` (server action) runs `requireAdminOrNotFound()`, inserts with the service role `author_role = 'staff'`, `author_id` = the admin, `author_name` = the admin's `users.first_name`, and when `emailCopy` is true (the caller's default) sends `supportReplyEmail` to the player's address with `claimSend("support_reply:<message_id>")`, stamping `email_copy_sent_at` only after `sendEmail` returned `ok: true`; a failed send leaves it null and returns `{ ok: true, emailed: false }`.
  - [ ] support-view.ts holds the pure helpers (`waitingOn()`, `foldOlderDays(messages, today)` → `{ earlier: Message[], recent: Message[] }` with everything before today's and yesterday's days in `earlier`, `topicLabel()`, `originLabel()`) and tests/support-view.spec.ts covers each.
- **notes:** `requireAdminOrNotFound` is in src/lib/services/programs/admin-guard.ts. Service role only in support-admin-server.ts and `sendStaffMessage`; every player path stays on the session client. The "add event message" action from the brief is dropped — nothing in this phase writes an `event` row. Nav count semantics: "waiting on you" = last message is the player's.

## T6 · Admin › Messages page and header tab

- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** src/app/admin/messages/page.tsx (new), src/components/admin/messages-page-content.tsx (new), src/components/admin/messages-table.tsx (new), src/components/admin/support-thread-drawer.tsx (new), src/components/admin/admin-header.tsx, src/lib/data/admin-nav-server.ts, MAP.md — a guess
- **routes:** /admin/messages
- **done when:**
  - [ ] admin-header.tsx gains a sixth `TABS` entry `{ href: "/admin/messages", label: "Messages", key: "messages" }` between Labels and More, printed through `withCount` as "Messages · N" where N comes from `countMessagesForNav()` wired into `loadAdminNav` through `settle()`; zero prints "Messages".
  - [ ] /admin/messages is `force-dynamic`, loads `listSupportThreads()` and renders `MessagesPageContent` modelled on ask-feedback-page-content.tsx: `CountPills` "Waiting on you · Waiting on them · All" with live counts, a `FilterMenuPill` "Started from" over the five origin labels, and a table with columns Player · Started from · Last (relative time + "You" / the player's first name); a deep link `?id=<threadId>` lands with that row open, mirrored by `replaceState`.
  - [ ] Clicking a row opens `SupportThreadDrawer` on `PeekDrawerFrame` (kind "Thread"): messages in order with the player's on the left and staff/event rows styled distinctly, days older than yesterday folded behind a "Show N earlier" button (`foldOlderDays`), each staff message showing "Read" when `player_read_at ≥ created_at`, and opening the drawer calls `markStaffRead`.
  - [ ] The drawer footer pins a reply textarea, an "Also email a copy" checkbox checked by default, and an `advButton()` primary "Send" that calls `sendStaffMessage` and appends the new message without a reload; a match-linked message shows an "Open the match" ghost link to `/admin/matches/<matchId>`.
  - [ ] `npm run map` was run and MAP.md's route table includes `/admin/messages`.
- **notes:** Canvas artboards "admin compose + thread drawer" and "long threads". Read `.skills/advantage-analytics-design/SKILL.md` + reference/tables, chrome first. The brief says "Open the match in Labels" but `/admin/labels/[sessionId]` is keyed by session, not match — link to `/admin/matches/<id>` unless label-overview-server exposes a match→session lookup. Counts are plain text, never a badge.

## T7 · SupportThreadDialog, "Message Advantage" row, `?messages=open`

- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** src/components/dashboard/support/support-thread-dialog.tsx (new), src/components/dashboard/support/support-dialog-mount.tsx (new), src/components/dashboard/dashboard-shell.tsx, src/app/dashboard/header.tsx, src/app/dashboard/layout.tsx, tests/support-dialog.spec.ts (new) — a guess
- **routes:** /dashboard?messages=open, /dashboard/team?messages=open
- **done when:**
  - [ ] `SupportThreadDialog` renders on `RosterDialog` (width 520) titled "Message Advantage": when the viewer has a thread it shows the messages (older days folded behind "Show N earlier") with a reply textarea; otherwise a compose form with the "About" `MenuSelect` whose options are group "Your matches" (the 5 recent matches, label + score) and group "Something else" (Uploading a video, Plan and billing, My team — only in a team workspace, An idea or request, Something else), optional; Send calls `sendPlayerMessage` with `topic`/`matchId` from the selection and `origin = "account_menu"`.
  - [ ] Opening the dialog with an existing thread calls `markPlayerThreadRead()`; a rate-limit or foreign-match refusal from the action is shown as its sentence under the textarea and the draft is kept.
  - [ ] The dialog is mounted once in `DashboardShell` and its open state IS the URL: `?messages=open` (read with `useSearchParams`) opens it, closing removes the param with `router.replace`, so a deep link, the menu row and T8's tray row share one mechanism and it works in every workspace.
  - [ ] header.tsx's account menu gains a "Message Advantage" row (`MENU_ROW_CLASS`, `MessageSquare` icon at the Help row's size) directly after Help that sets `?messages=open`; `posthog.capture("support_message_sent", { topic, origin })` fires on a successful send with no body, match id or free text.
  - [ ] tests/support-dialog.spec.ts (offline component spec, like tests/widget-states or the other offline specs) asserts the compose form renders the five "Something else" options, omits "My team" outside a team workspace, and the thread view renders a seeded message body.
- **notes:** Canvas artboards "account-menu entry + compose dialog with About MenuSelect", "player note dialog", "long threads". `MenuOption.group` is the grouping API (src/components/ui/menu-select.tsx). `RosterDialog` from src/components/dashboard/team/dialog-shell.tsx. Mirror the first-match-feedback dialog's mount in dashboard-shell.tsx. Read the design skill's chrome + focus references before building.

## T8 · Activity tray row for a staff note

- **status:** todo
- **model:** opus
- **needs:** T7
- **files:** src/components/dashboard/activity/activity-tray.tsx, src/components/dashboard/activity/activity-tray-loader.tsx, src/lib/data/support-server.ts — a guess
- **routes:** /dashboard, /dashboard/team
- **done when:**
  - [ ] activity-tray-loader.tsx adds `getSupportUnread(supabase)` to its `Promise.all` and passes `support` to `ActivityTray`; the read is not workspace-scoped and answers `{ hasThread: false, unreadStaff: false, latestStaff: null }` on failure so the tray still renders.
  - [ ] When `latestStaff` exists the tray renders one row copying the invitation row's anatomy (`--surface-subtle` #F5F5F5 wash, 6px blue dot lead only while `unreadStaff`): title "Note from {authorName} at Advantage", a one-line preview sub line, a blue text action "Read and reply" that navigates to `?messages=open`, and a grey "Open match" link to `/dashboard/matches/<matchId>` only when the note is match-linked.
  - [ ] An unread staff message counts toward the trigger's solid blue dot and the tooltip, alongside invitations; a read one does not.
  - [ ] The row sits above invitations and the tray's doc comment's row-anatomy list names it.
- **notes:** Canvas artboard "player tray row". The tray's own comment (lines ~60–90) explains the one-blue rule — the dot belongs to rows waiting on the reader, which this is. Run the widget-states audit on the edited tray.

## T9 · Seed one support thread on the eyes-on verifier

- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** scripts/eyes-on/seed-support-thread.ts (new), .claude/skills/pr-check/SKILL.md — a guess
- **done when:**
  - [ ] `npx tsx scripts/eyes-on/seed-support-thread.ts` is a dry run that prints the rows; `--write` upserts, on the `EYES_ON_EMAIL` account resolved via `.env.local`, one `support_threads` row (`origin = 'account_menu'`, `player_read_at` null) and two `support_messages` on deterministic ids (namespace + verifier id, as seed-failure-classes.ts does): a player message and a staff reply with `author_name = "Eyes-on seed"` and a body starting "Eyes-on seed ·"; `--cleanup --write` deletes only rows on the verifier's thread whose bodies carry that marker, and the script refuses to run against a project other than the one `.env.local` names without `--write`.
  - [ ] The script's header explains that the player row fires T3's internal-alert trigger once per fresh seed unless the verifier address is a test-account one (`isTestAccountEmail`), and that the staff row leaves the thread unread so the tray row and dot are visible.
  - [ ] pr-check's SKILL.md Stage 3b verifier brief gains one line: the verifier may open "Message Advantage" and the tray row but must not Send.
- **notes:** Writes to production through the service role like scripts/eyes-on/seed-failure-classes.ts — nothing without `--write`, and running it is a human step outside the gate. Never name `.env.local` in a Bash command (secrets hook). T7/T8 carry the `routes:` lines the harness opens; this task just makes those screens non-empty.
