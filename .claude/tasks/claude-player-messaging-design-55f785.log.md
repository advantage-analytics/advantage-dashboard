# Run log — claude/player-messaging-design-55f785

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · support_threads / support_messages: tables, RLS, send and mark-read RPCs — done

**gate:** mechanical pass (one full-suite failure in `tests/admin-writes.spec.ts:142` "Delete conference … boundary", unreachable from this diff; re-run alone 24/24 — load-only flake) · completion `VERDICT: pass`
**changed:** Live migration `20261103055820_support_messaging` — `support_threads` + `support_messages`, stamp trigger, one owner-SELECT policy each, SELECT-only grants to authenticated, `send_support_message()` (definer; match visibility via `my_player_ids()`; 20/hour limit) and `mark_support_thread_read()`. Live-DB spec `tests/support-messaging-rls.spec.ts` registered in `tests/fixtures/live-db-specs.ts`. rls-boundary-reviewer: no high/medium.
**follow-ups:**

1. Drop `'admin'` from the origins a player may pass to `send_support_message` (keep it in the table check for service-role threads).
2. Players can read staff `author_id`, `email_copy_sent_at`, `staff_read_at` on their rows — select explicit columns in T5's loader; column-level grants later if it matters.
3. Migration header overstates the stamp trigger's grant (it is revoked from everyone, granted to no one) — fix the comment next time the file is touched.

## T2 · Internal alerts accept kind `support_message` — done

**gate:** mechanical pass · completion `VERDICT: pass`
**changed:** `support_message` is a fifth internal-event kind: `notifySupportMessage` (service role; player rows only; test-account and `claimSend` duplicate guards; match named "A vs. B") and `supportMessageInternalEmail` (full body, facts, "Reply in admin" → `/admin/messages?id=<thread>`), exported with a doc-table row; route doc comment lists all five kinds; spec cases for parse + render.
**follow-ups:**

1. Must be deployed to production before T3's trigger goes live (pg_net does not retry).
2. Route comment names the T3 migration `support_messaging_triggers` — update it if T3 picks another name.
3. Topic labels live only in the email template; share one source with the player UI in T5/T7.
4. `templates/internal-activity.ts` header still says "the two FYIs" (stale since the feedback alert).

## T4 · Player reply email: `support-reply.ts` — done

**gate:** mechanical pass · completion `VERDICT: pass`
**changed:** New `supportReplyEmail()` (EmailContent through the shell: eyebrow "Message from Advantage", heading "{admin} replied", reply as paragraphs, sign-off "{admin} at Advantage", CTA "Reply in Advantage" → `/dashboard?messages=open`, replyTo `SUPPORT_ADDRESS`, tag `support_reply`), exported with a doc-table row naming `sendStaffMessage()`; offline spec 4/4.
**follow-ups:**

1. `playerFirstName` and `sentAt` are accepted but not rendered (the canvas has no greeting or timestamp) — add a "Hi {name}" line if wanted.
2. The index.ts row says "WIRED once T5 lands" — correct once T5 commits.

## T5 · Support data layer and server actions — done

**gate:** mechanical pass · completion `VERDICT: pass`
**changed:** `support-view.ts` (pure helpers, shared topic/origin labels and types), `support-server.ts` (player thread, unread state, 5 recent matches — explicit columns, no staff ids), `support-admin-server.ts` (admin guard + service role: list, thread, nav count, markStaffRead), `support-actions.ts` (sendPlayerMessage, markPlayerThreadRead) and `admin/messages/actions.ts` (sendStaffMessage with the email copy under claimSend, stamped only after a successful send). Internal email now imports topic labels from support-view.ts. Not run against the live DB — specs cover the pure helpers.
**follow-ups:**

1. No `revalidatePath` after writes — T6/T7 must refresh or add it.
2. `markStaffRead` is a loader, not a server action — T6 needs a small action wrapping it if called from the browser.
3. `listSupportThreads` limits 200 by `created_at` before sorting by activity — order by last activity once threads exceed 200.
4. `internal-activity-mail.ts` keeps its own `SUPPORT_TOPICS` list; import support-view's.

## T6 · Admin › Messages page and header tab — done

**gate:** mechanical pass (full suite again failed only `tests/admin-writes.spec.ts:142` "Delete conference … boundary" — same as T1's gate, before any admin change; with this diff it ran 120/120 under `--repeat-each=5` — load-only flake) · completion `VERDICT: pass`
**changed:** "Messages · N" tab in admin-header.tsx fed by `countMessagesForNav()` through `loadAdminNav`; `/admin/messages` (force-dynamic) with view pills, "Started from" filter, Player · Started from · Last table and `?id=` deep links; `SupportThreadDrawer` on PeekDrawerFrame (kind "Thread") with folded older days, Read receipts, match links to `/admin/matches/<id>`, and a pinned reply with "Also email a copy" checked by default; `openSupportThread` action wraps the load + `markStaffRead`; MAP.md regenerated. Not opened in a browser.
**follow-ups:**

1. No `src/app/admin/messages/loading.tsx` skeleton, unlike other admin pages.
2. The list has no last-message preview or message count (the canvas shows both) — needs a loader change.
3. "<Player> was last in …" needs a last-seen field the loaders don't have.
4. `sendStaffMessage` doesn't return `created_at` / author name, so an appended reply uses the browser clock and "You" until reload.
5. No offline or eyes-on spec for Admin › Messages yet.
6. "Open the match" goes to `/admin/matches/<id>`; a Labels link needs a match→session lookup.
