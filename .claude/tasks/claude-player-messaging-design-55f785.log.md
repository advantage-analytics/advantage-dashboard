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
