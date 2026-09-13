# Run log — claude/roster-new-player-form-abafe7

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add neutral icons to the roster drawer's Options menu — done

- **gate:** mechanical pass (lint/typecheck/tests), completion review pass
- **changed:** In `src/components/dashboard/team/player-drawer.tsx`'s `MemberMenu`, added leading Lucide glyphs (`Upload`, `Pencil`, `Trash2`) to the three Options-popover rows, each `size-[13px]` `strokeWidth={1.5}` `aria-hidden` `text-[var(--ink-400)]` in a shared `shrink-0` column with `gap-2.5` to the text. No gating/behaviour logic touched.

## T2 · Drop the event/school suffix from the drawer's recent-match rows — done

- **gate:** mechanical pass (lint/typecheck/tests), completion review pass
- **changed:** Removed the ` · {match.event}` suffix from the drawer's recent-match row in `player-drawer.tsx`; removed `RosterRecentMatch.event`, `DbMatchRow.tournament_name`, the select column, and the map assignment in `team-roster-server.ts`. `tests/team-roster-ids.spec.ts`'s fixture at ~163 builds an unrelated `DbRecentMatch` type from `team-home-server.ts` and needed no change — verified independently, not just taken on the subagent's word.

## T3 · Never send a localhost link from a deployed build — done

- **gate:** mechanical pass (lint/typecheck/tests), completion review pass
- **changed:** `siteUrl()` in `src/lib/site-url.ts` now falls back through `VERCEL_ENV=production → VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_ENV=preview → VERCEL_URL` before ever reaching `http://localhost:3000`, and warns once via `console.warn` when the localhost fallback fires under `NODE_ENV=production`. `layout.tsx`'s `metadataBase` and the checkout route's redirect base now call `siteUrl()` instead of holding their own private fallback. Added `tests/site-url.spec.ts` (6 tests) pinning the behaviour. Note for the author: `NEXT_PUBLIC_SITE_URL` still needs to be set on Vercel (Preview and Production) — this task only stops the worst case when it's missing.

## T4 · Email the program owner when someone requests to join — done

- **gate:** mechanical pass (lint/typecheck/tests), completion review pass
- **changed:** Added `joinRequestOwnerNoticeEmail` template (`invite-request.ts`) and a new `getProgramOwner(programId)` helper (`src/lib/services/programs/program-owner.ts`, admin-client lookup on `program_members.role = 'owner'`, returns `null` if none) exported for T5. `fileRequest()` in `claim-actions.ts` now reports whether it created a genuinely new row; `requestInvite()` sends the owner notice inside `after()` (from `next/server`) only on that `created: true` branch, so a resubmit never double-mails the owner and the caller's return value/timing is unaffected either way. `index.ts`'s trigger table and qualification paragraph updated to describe both emails. A failed send only `console.warn`s, never fails the request.
- **follow-ups:** Owner-only recipient was a deliberate scope call (per the author's original wording) — the template's header comment flags that coaches/staff could be added as a widen-the-recipient-list follow-up if that decision changes.
