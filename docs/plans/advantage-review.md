# Advantage Review: build plan

Written 2026-10-26. A plan, not a spec. One step at a time: each step is one
PR into `splitstep-integration`, merged before the next starts. Each step ends
with a prompt for the session that builds it.

Read first, every step: `AGENTS.md`, the `.skills/advantage-analytics-design`
skill (before any UI), `docs/plans/2027-player-pricing.md` (payments and hours),
and this file. The approved screens are the **Advantage Review** design canvas
(https://claude.ai/artifact/3UWQZBd3MgXzdWTYK387Wj); the earlier
**Self-review and Verified** canvas (https://claude.ai/artifact/HqfmpaBTNqoAoQmNBExu8w)
holds the flag rules and role permissions step 2 reuses.

## What we're building

- **Verified by Advantage.** A match status, granted only by Advantage, after
  someone at Advantage checked every point against the video. It shows once,
  as the last fact in the report's match details line, with a click popover:
  what was checked, when, and "Something still wrong? Tell us".
- **Self review.** Free on every account: a player fixes points themselves on
  the match's Video tab. Their fixes show as "Edited by you" (or "Edited by
  Coach Rivera"). Not the full hand-labelling console.
- **Advantage Review.** The paid step up: the player asks for a review at
  upload (or after), an analyst works it from a queue in /admin, corrects
  points, writes a note, and publishing marks the match Verified by Advantage.
  The note sits in the report's main content, signed by the analyst.

Layers stack, never overwrite: Advantage Intelligence's reading, then the
player's fixes, then the analyst's corrections. Every change keeps the
original beside it (the label rows' `seed`).

## Decisions

Settled:

- The status reads **"Verified by Advantage"**. "Verified" is allowed for
  this status only. Landing copy, a player's own fixes and a coach's fixes say
  "reviewed", "checked" or "edited".
- Self review is free for every account. Advantage Review is paid.
- Payment is Stripe Embedded Checkout inside the dashboard, never a redirect
  (a redirect loses the wizard's in-memory video). All sales final.
- No paid plans before January 1, so Advantage Review sells at the
  free-account prices until then: one match $75, five matches $300, scout an
  opponent $100.
- **D1 (settled 2026-10-27):** a Verified match locks. Players, coaches and
  the self-review editor can't change its points, shots, score, result or
  players; "Something still wrong? Tell us" and an admin Reopen are the way
  back. Date, tournament, round and court stay editable.
- **D4 (settled 2026-10-27):** a team's owner and coaches can fix points on
  their team players' matches; staff and team players can only view — a team
  player's own team match included. A personal match is fixed by whoever
  recorded it.

Open, with the default this plan uses. Each step names the ones it needs.

| #   | Question                                                                         | Default                              |
| --- | -------------------------------------------------------------------------------- | ------------------------------------ |
| D2  | Does Verified cover shot details, or points only?                                | Points: who won and how it ended.    |
| D3  | Does a hand-labelled pilot team match become Verified when you mark it complete? | Yes. Coaches see the badge.          |
| D5  | Does a shared report show the analyst's note?                                    | Status only; the note stays private. |
| D6  | Can a coach request a review for a team player?                                  | Not in v1.                           |

## Step 0 · Close the write gap

**Why first.** Players can set `matches.verified` on their own matches today:
`authenticated` has INSERT and UPDATE on the column, "Users can update own
matches" lets a creator update their row, and `matches_block_client_regraft`
ignores it. It's harmless while the flag means nothing (only the Ask seed
sets it: 17 SwingVision matches on the eyes-on verifier account) and must be
closed before it means anything.

**Scope.** One migration and the seed script. No UI.

1. Reset the 17 seed rows, guarded:
   ```sql
   do $$ declare n int; begin
     select count(*) into n from public.matches
      where verified and created_by <> '18c34090-1857-422e-b207-b4850bef3c32';
     if n > 0 then raise exception 'refusing: % non-seed matches are verified', n; end if;
     update public.matches set verified = false
      where verified and created_by = '18c34090-1857-422e-b207-b4850bef3c32';
   end $$;
   ```
2. Columns: `verified_at timestamptz`, `verified_by uuid references
auth.users(id)`, `verified_review_id uuid` (FK in step 3a). Backfill nulls,
   then `verified not null default false`, and
   `check (verified = (verified_at is not null and verified_by is not null))`.
3. Write guard. A column revoke can't narrow a table-level grant, so extend
   `matches_block_client_regraft` (or add `matches_guard_verification`,
   `before insert or update`): for `authenticated`/`anon`, refuse an insert
   with `verified = true` or any `verified_*` value, and an update that
   changes any of the four columns. `42501`, "Only Advantage can verify a
   match".
4. `scripts/seed-ask-season.ts`: `verified: true` → `false` at lines 433 (the
   type) and 1407 (the row). Drop `verified?` from
   `new-match-wizard/types.ts:284`.

**Done when.** The migration applies to the live project; a signed-in client
update of `verified` is refused; the seed's dry run shows `verified: false`;
`rls-boundary-reviewer` passes.

**Prompt.**

> Read `docs/plans/advantage-review.md` and AGENTS.md. Build **step 0 only**.
> Check the live database with the Supabase MCP first (the `matches.verified`
> column, its grants, the policies on `matches`, and the body of
> `matches_block_client_regraft`), confirm the 17 seeded rows are still the
> only `verified = true` ones, then propose the migration before writing it.
> Branch off `splitstep-integration`, open a draft PR into it, run
> `rls-boundary-reviewer` on the migration. Add this plan file to
> `docs/plans/` in the same PR.

## Step 1 · Mark complete grants "Verified by Advantage"

**Scope.**

- **Grant.** When the console's Mark complete publishes
  (`completeLabelSession` → `writeLabelSessionComplete` in
  `src/lib/services/labels/session-status-session.ts`, publish in
  `apply-session.ts` `publishPlanned`), set `verified = true`, `verified_at`,
  `verified_by` = the admin, in the same server-side write. A
  `security definer` function `verify_match(p_match_id, p_actor)`,
  executable by `service_role` only, so the step 0 guard stays the only door.
- **Revoke.** `reopenLabelSession` clears the four columns. The confirm dialog
  says so: "Reopen and remove Verified by Advantage?"
- **Display** (one helper, `verificationFor(row)` in `src/lib/data/`):
  - Loaders: replace the four "Verified result" mappings
    (`matches-list-types.ts:115`, `match-detail-server.ts:198`,
    `match-page-hint-server.ts:70`, `home-recent-data.ts:205`), and add
    `verified_at` to the column lists that select `verified`.
  - `report-facts.tsx`: the last fact becomes a button with the
    verified-check icon and "Verified by Advantage", opening the click
    popover (canvas frame "Details on click"). Replaces `CircleCheck`, which
    is the outcome glyph.
  - `head-to-head-card.tsx:1319`: remove the green check (a banned
    confirmation tick, and a second copy of the status).
  - `match-card-gallery.tsx:133`: the verified-check icon instead of
    `BadgeCheck` in `#3B82F6`.
  - `match-metadata-row.tsx`: copy through the helper.
  - `match-analysis.ts`: drop `verified` from `importedAnalysis()` and
    `MatchAnalysis`.
- **Tell us.** The popover's link opens a short form ("What's still wrong?")
  that files an admin request on the match, using the existing /admin
  Requests flow.

**Needs.** D2 (popover copy), D3.

**Not in this step.** Locking (step 2), notes and payment (step 3).

**Done when.** Mark complete on a test match shows the status in the report's
details line, the matches list and Home; Reopen removes it everywhere; "Tell
us" lands in /admin Requests.

**Prompt.**

> Read `docs/plans/advantage-review.md`, AGENTS.md and the design skill.
> Build **step 1 only**. Open the Advantage Review canvas's "Verified or
> reviewed" page for the report's details line and popover. Start by reading
> `session-status-session.ts`, `apply-session.ts` and every file named in
> step 1, then propose the `verify_match` function and the display changes
> before writing them. Branch off `splitstep-integration`, draft PR into it.

## Step 2 · Self review and "Edited by"

**Scope.**

- **Where.** A "Fix points" mode on the match's Video tab
  (`match-detail/film/`), built like the design system's reorder mode: a mode
  banner stated once, Cancel and "Save N fixes" take the action slot, the
  point list becomes the editor. Canvas page "Self review".
- **What a player can change** (from the earlier canvas's permissions page):
  who won the point, and how it ended (Winner, Forced error, Unforced error,
  Ace, Double fault), with the last shot. Not the score, not structure
  (combine, split, game boundaries), not stroke or spin. Flag-led first: the
  four player flags from that canvas ("Was that ball in?", "Who won the
  point?") lead the list; any point stays fixable.
- **Storage.** Reuse the label tables and their `seed`: a self-review session
  per match and editor, so a later analyst review starts from the player's
  fixes and every point can go back.
- **Save.** Rewrites points and recomputes `match_stats`, as Mark complete
  does, but never sets `verified`. A score that no longer adds up says so and
  points to Edit match.
- **Provenance.** "Edited by you · 2 points" (or "Edited by Coach Rivera")
  joins the match details line; edited rows say so in the point list.
- **Lock (D1).** On a Verified match, Fix points, "Review score" and Edit
  match's score fields show the lock with "Something still wrong? Tell us".
  The database refuses client writes to a verified match's score, result,
  players, points and shots (extend the step 0 guard; date, tournament,
  round and court stay editable).

**Needs.** D1, D4 (both settled above).

**As built** (migration `20261028025013_self_review`):

- One `kind = 'self'` label session per match, shared by everyone allowed to
  fix it (one per editor would let two saves overwrite each other). Its
  `label_points` are seeded from the published points, joined back by
  `point_id`, with the original reading in `seed`; new columns `error_kind`
  (forced/unforced), `last_stroke`, `edited_by`, `edited_at`.
- Save patches `points.won_by_player1` and `result_type` in place, then runs
  `calculate_match_stats` and `backfill_returns_in_and_net_points`, then asks
  for new insights. Point ids never change, so bookmarks stay; it works on
  SwingVision matches too. Three definer functions are the only door:
  `can_fix_match_points`, `self_review_state`, `self_review_save`.
- The lock is `matches_guard_verification` (score, result, stop reason,
  format, player names; not the player ids, which account deletion and
  roster merges re-point under the caller's JWT) plus `zz_points_guard_verified_match` /
  `zz_shots_guard_verified_match` on client writes, the Edit match route's
  `match_verified` refusal, and the rebuild route's refusal (it writes on the
  service role, which the triggers let through).
- Only analyst sessions protect a match or an account from deletion; a
  match's self session is deleted with it.
- Paused on 2026-10-28 (#579 reverted the app code and
  `20261028120000_self_review_paused` revoked the functions from
  `authenticated`). Bringing it back needs
  `20261028130000_self_review_resumed`, which re-grants
  `can_fix_match_points`, `self_review_state` and `self_review_save`.
- Not yet: a rebuild of the analysis after fixes replaces the points, and the
  fixes stay in the session unlinked (`point_id` null) rather than being
  re-applied. Step 3a's "start from the player's fixes" is where they join
  back, by point number.

**Done when.** A player fixes three points, saves, sees the stats move and
"Edited by you · 3 points"; Reset restores a point; a Verified match refuses
all of it with the lock shown.

**Prompt.**

> Read `docs/plans/advantage-review.md`, AGENTS.md and the design skill, then
> the "Self review" page of the Advantage Review canvas and the "Flags and
> permissions" boards of the Self-review and Verified canvas. Build **step 2
> only**. Map how the label tables (`label_sessions`, `label_points`, their
> `seed`) and Mark complete's publish work before proposing how a player's
> session reuses them. Branch off `splitstep-integration`, draft PR into it,
> `rls-boundary-reviewer` on any migration.

## Step 3a · Requests, the queue and the note (no payment)

**Scope.**

- **Table** `advantage_reviews`: `match_id`, `requested_by`, `kind` (match |
  pack_item | scouting), `request_text`, `status` (waiting | in_review |
  published | reopened), `analyst_id`, `note`, `points_checked`,
  `points_corrected`, `stats_changed`, timestamps, `payment_ref` (null until
  3b). RLS: the requester reads their own row; admins read and write all.
  Add the FK from `matches.verified_review_id`.
- **Asking for one.** Step 4 of the upload wizard ("Analysis" section, canvas
  page "Review at upload", variation A, B or C, pick one) and the match
  report's ⋯ menu for a match already uploaded. "Anything to look for?" is
  saved as `request_text`. Until 3b, the request is free and only shown to
  an allow-list of test accounts.
- **Capacity.** A monthly cap in config ("12 of 20 reviews this month"); when
  full, the option gives way to "Reviews are full this month. New spots open
  on the 1st." No counts shown to players.
- **Admin.** /admin "Reviews" tab with the queue (canvas "1 · Review queue"),
  the workspace on the console's full-screen mode (canvas "2"), and the note
  screen (canvas "3"). Publishing (`publish_advantage_review`,
  `service_role` only) applies the corrections, recomputes stats, saves the
  note and calls step 1's `verify_match`. Publish is refused until every
  point is checked and the note isn't empty. The summary after publishing:
  "7 points corrected · 2 stats changed · note added".
- **Report.** The note card in the report's main content, above the Advantage
  Intelligence summary, signed "Cj · Advantage analyst".
- **Emails** (Resend, the existing templates): to Cj when a request comes in;
  to the player when the review is published. No ETAs anywhere.

**Needs.** D5, D6, and the wizard variation.

**Done when.** A test account asks for a review at upload, it appears in the
queue, Cj works it, publishes, and the player sees the note and Verified by
Advantage, with both emails sent.

**Prompt.**

> Read `docs/plans/advantage-review.md`, AGENTS.md, the design skill, and the
> Advantage Review canvas's "Analyst review" and "Review at upload" pages.
> Build **step 3a only**, with no payment. Propose the `advantage_reviews`
> migration and its RLS first. Reuse the label console for the workspace;
> don't change existing /admin behaviour. Branch off `splitstep-integration`,
> draft PR into it, `rls-boundary-reviewer` on the migration.

## Step 3b · Payment

**Depends on** stage 1 of `docs/plans/2027-player-pricing.md`: the checkout
route (`/api/create-checkout-session`, today a 410), the webhook, and the
wizard's Embedded Checkout dialog (frame B3b.5). Build that first if it isn't
merged.

**Scope.**

- **Products.** Stripe products "Advantage Review · one match" ($75), "· five
  matches" ($300), "· scout an opponent" ($100). Stripe Tax on. "All sales
  final" in the dialog, the product description and the Terms.
- **One checkout.** The same Embedded Checkout dialog as credit packs. When a
  video also needs credit hours, one session carries both lines.
- **Hours.** A free account's reviewed match spends none of its free hours:
  a third source in the reservation order ("covered by the review"), in the
  same transaction as the review row.
- **Webhook.** `checkout.session.completed` sets `payment_ref` and moves the
  review to `waiting`; idempotent on the event id. A review is only created
  in the queue once it's paid.
- **Five-pack.** Five `pack_item` credits on the account, spent one per
  request; the written summary of patterns is a sixth queue item once five
  are published.
- **Remove the allow-list** from 3a.

**Done when.** A test card buys one review in the wizard, the match uploads,
the request lands in the queue paid, and a free account's meter reads
"Covered by Advantage Review".

**Prompt.**

> Read `docs/plans/advantage-review.md` and `docs/plans/2027-player-pricing.md`.
> Check whether pricing stage 1's checkout and Embedded Checkout dialog are
> merged; if not, stop and say so. Build **step 3b only**. Branch off
> `splitstep-integration`, draft PR into it.

## Step 4 · Legal and the landing page

**Scope.**

- **Privacy Policy:** a named Advantage analyst may watch a player's match
  video to do a review they paid for. Under-18 accounts exist, so the
  Guardian Terms say the same.
- **Terms:** Advantage Review as a paid service, all sales final, what
  happens if a review can't be done in the month, and that Verified by
  Advantage means every point was checked by a person, not a guarantee.
- **advantage-landing `/review`:** update to the decisions above (the Verified
  naming, free self review, pre-January prices, adding a review at upload),
  wire its buttons to sign-up and the wizard, and link it from the footer and
  the Access section (already drafted, uncommitted, in the advantage-landing
  worktree `advantage-review-page-e256a7`, branch
  `claude/advantage-review-page-e256a7`). Turn on only when 3b is live.

**Done when.** The legal pages carry the new lines (with version bumps), and
/review is live, linked, and every button leads somewhere real.

**Prompt.**

> Read `docs/plans/advantage-review.md`. Build **step 4 only**: the legal
> wording in both repos and the /review page in advantage-landing (start from
> the `claude/advantage-review-page-e256a7` branch's draft). Confirm 3b is
> live before linking the page.

## Not in v1

Coach-requested reviews (D6), shot-level verification (D2), a public
"reviewed" badge on shared reports (D5), a second analyst.
