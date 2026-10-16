# Player pricing (January 2027): build plan

Written 2026-10-16. A plan, not a spec: nothing here is built yet beyond the
`/design/plans` mock. Personal workspaces only. Team plans come after the fall
pilot and are out of scope.

## Decided

| Plan        | Price             | Video                   | Notes                     |
| ----------- | ----------------- | ----------------------- | ------------------------- |
| Free        | $0                | 1 match, once, up to 2h | Lifetime, not monthly     |
| Player      | $29/mo or $290/yr | 3h a month              | About 2 matches           |
| Player Pro  | $49/mo or $490/yr | 5h a month              | About 4 matches           |
| Credit pack | $14               | 1h                      | One-time, lasts 12 months |
| Credit pack | $60               | 5h                      | One-time, lasts 12 months |

- **Until Jan 1, 2027 (the pilot):** every personal workspace gets 2 free hours
  a month. SplitStep covers that cost. Nothing carries over into January.
- **No discounts.** Plans are list price for everyone.
- **Choosing a plan during the pilot** is allowed, but the plan isn't billed
  before January 1.
- **Credit packs can be bought during the pilot**, offered once the free 2 hours
  are used. Credits carry into January.
- **Order of use:** plan hours first, then credits, oldest-expiring first.
- **Not choosing a plan** moves the player to Free on January 1. Their matches
  and reports stay.
- Yearly is 10 months' price for 12. A plan change starts at the next billing
  date.

### Unit economics

At $7/h from SplitStep plus about $0.10/h for Azure and Gemini:

- **Player:** $29 against up to $21.30 of video, about 27% margin before
  Stripe's fee.
- **Player Pro:** $49 against up to $35.50, about 28%.
- **Credits:** $14/h is about 49%, and the 5h pack at $12/h is about 41%.

At $5/h, margins rise to about 47% on Player, 48% on Player Pro and 64% on the
1h pack. Most players don't use every hour, so real margins are higher. The
full analysis is in the pricing doc in the Claude project.

## What the code does today (checked on `splitstep-integration`)

- **The paid marker** is `users.plan`, constrained to `'free' | 'pro'`. Its
  helpers are in `src/lib/user/plan.ts` (`PRO_PLAN`, `isProPlan`,
  `planFacts`, `workspaceTier`). One legacy account is `pro`, from the retired
  $4.99 Lifetime product.
- **Checkout is retired.** `src/app/api/create-checkout-session/route.ts`
  answers 410. `src/app/api/webhooks/stripe/route.ts` still sets
  `plan = 'pro'` on `checkout.session.completed`. Stripe keys and prices live
  in `src/lib/stripe/config.ts` and `client.ts`.
- **Caps** are in `src/lib/services/splitstep/config.ts`:
  - `MONTHLY_CAP_HOURS`: individual is 2, program is 75.
  - `PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS` is 10, shared by 20 hand-picked
    players.
  - `OPEN_BETA_MONTHLY_CEILING_HOURS` is 20, the house-wide ceiling for
    everyone else.
  - `PILOT_ENDS_AT` is `2026-12-31`.
- **The one seam for a cap** is `monthlyCapSecondsFor()` and `quotaTierFor()`
  in `src/lib/services/splitstep/quota.ts`. Its comment already marks it as the
  place a paid plan raises the tier ("PAID-PLAN MARKER").
- **Enforcement happens in SQL.** `reserveQuota()` calls
  `reserve_processing_quota` and `reserve_individual_quota`. `peekQuota()`
  calls `individual_tier_usage`. `releaseQuota()` and `reconcileQuota()` settle
  a job. The ledger table is `processing_usage`. The live database is the
  source of truth; `supabase/migrations/` lags behind it.
- **Usage shows up in four places:**
  - the upload wizard (`new-match-wizard/FooterMeter.tsx`,
    `EligibilityNotice.tsx`, `validation.ts`, `useUploadMatchWizard.ts`);
  - the video attachment flow (`matches/match-video-attachment/`);
  - the header (`beta-header-meter.tsx`);
  - Settings › Usage (`settings/match-videos-usage-card.tsx`), with loaders in
    `src/lib/data/usage-server.ts`.
- **The live Plan page** is `src/app/dashboard/settings/plan/page.tsx`.
- **The target design** is the mock at `src/app/design/plans/plans-preview.tsx`,
  route `/design/plans`. It has a pilot stage and a January stage, each in a
  hours-left or out-of-hours state.

## Build phases

Each phase is one PR into `splitstep-integration`.

### 1. Entitlements in the database

- **Plans:** widen `users.plan` to `free | player | player_pro`, and keep
  `pro` as a legacy alias that reads as Player Pro. Add
  `plan_interval (month|year)`, `plan_status`, `plan_current_period_end`,
  `stripe_customer_id` and `stripe_subscription_id`.
- **Credits:** add a `video_credits` table with `user_id`, `seconds`,
  `remaining_seconds`, `expires_at`, `source (purchase|grant)`,
  `stripe_payment_intent` and `created_at`. RLS lets the owner read it; only
  the service role writes it.
- **Free:** record "has used the free match" in a column or a ledger query.
- **Reservation SQL:** teach the reservation functions the order "plan hours,
  then credits", in one transaction. Release and reconcile must give credit
  seconds back to the same rows.
- **After Jan 1:** the pilot's 2h a month ends. Gate on `PILOT_ENDS_AT` rather
  than deleting the code, so nothing has to ship on the night of Dec 31.
- **Grants:** new functions get grants per AGENTS.md. Nothing is executable
  by `anon`.

### 2. Caps in the app

- Make `monthlyCapSecondsFor()` read the plan: Player 3h, Player Pro 5h, Free
  0 a month plus the one-time match. During the pilot, a personal workspace
  keeps 2h.
- Add credits to `peekQuota()` and the `HoursLeft` shape, so every meter shows
  "plan hours left" plus "credits".
- Rewrite `quotaRefusalMessage()` and `capRefusalMessage()` copy for the
  out-of-hours case, so each one names the next step (credits or upgrade).

### 3. Stripe

- **Products:**
  - Player (monthly and yearly prices) and Player Pro (monthly and yearly).
  - Credit packs, 1h and 5h, as one-time prices.
  - Archive the old $4.99 price; don't delete it.
- **`POST /api/create-checkout-session`:** replace the 410 with a real route.
  - It takes `{ kind: "plan", plan, interval }` or `{ kind: "credits", pack }`.
  - It uses the signed-in user and `errorResponse()` / `jsonResponse()`.
  - Plans use subscription mode. During the pilot, set
    `subscription_data.trial_end` to Jan 1, 2027 00:00 UTC, so a card is taken
    now and the first charge lands on Jan 1.
  - Credits use payment mode.
- **The webhook** (`/api/webhooks/stripe`):
  - `checkout.session.completed` sets the plan, or inserts a `video_credits`
    row.
  - `customer.subscription.updated` and `.deleted` handle switches,
    cancellations and the move to Free.
  - `invoice.payment_failed` sets `plan_status` to `past_due`. Keep plan hours
    for a 7-day grace period, then fall to Free.
  - It must be idempotent on the event id.
- **Self-serve changes:** use the Stripe customer portal for card, invoices,
  cancel and plan switch. Configure the portal so changes apply at period end.
- Decide on Stripe Tax before launch (see open questions).

### 4. Settings › Plan

- Rebuild `/dashboard/settings/plan` from the `/design/plans` mock with real
  data, and delete the mock afterwards.
- It has four states: during the pilot, on a plan, out of hours and Free.
- Use the existing primitives: `SettingsCard`, `HoursMeter`, `StatePill`,
  `advButton`.

### 5. Where the paywall appears

Show a prompt only where the player is about to spend hours. Never block
reading existing matches, and never charge for SwingVision imports.

1. **Upload wizard, video step.** This is the main gate: show it when the
   trimmed duration is more than plan hours plus credits.
   - During the pilot, offer credit packs.
   - From January, offer Upgrade to the next plan, plus credit packs.
   - On Free with the free match used, offer to choose a plan.
   - Show it inline in the wizard footer area (`EligibilityNotice` /
     `FooterMeter`). Keep the trim step reachable, since a shorter trim may
     fit.
2. **Video attachment flow.** Use the same notice before an upload starts.
3. **Header meter** (`beta-header-meter.tsx`). Turn amber at 80% and link to
   Settings › Plan. No modal.
4. **Home.** Show a one-line notice when hours are spent, linking to the Plan
   page.
5. **In December, to pilot players:** a dismissible notice and an email saying
   "Free hours end Dec 31. Choose a plan or stay on Free."

Copy rules: lead with what's left, say when hours come back, name one next
step, and never use red for a sales message. Amber is for the meter state only.

### 6. Landing site

- Turn `advantage-landing`'s `/design/pricing` (PR #15) into the public
  `/pricing`, personal plans only.
- `src/lib/pilot.ts` already says "Plans aren't billed before then".

## Open questions for Cj

- **Stripe Tax:** turn it on? It adds about 0.5% per transaction.
- **The legacy Lifetime Pro account:** grandfather it to Player Pro, free for
  12 months?
- **Pilot players:** do the 20 hand-picked players keep anything after Jan 1,
  or move to plans like everyone else?
- **Refunds:** credits are non-refundable once used. Allow a refund within 14
  days if unused?
- **Grace period:** is 7 days after a failed payment right?

## Prompt for a new Claude Code session

> Read `docs/plans/2027-player-pricing.md` and AGENTS.md, then the
> `.skills/advantage-analytics-design` skill before any UI work. We're building
> January 2027 player pricing (personal workspaces only): Free, Player $29/mo,
> Player Pro $49/mo, yearly at 10× monthly, and credit packs of 1h for $14 and
> 5h for $60. During the pilot, every personal workspace gets 2 free hours a
> month until Jan 1, plans can be chosen but aren't billed until Jan 1, and
> credit packs can be bought once the free hours are used. Start with phase 1.
> Check the live database with the Supabase MCP (`list_tables`, and read
> `reserve_processing_quota`, `reserve_individual_quota` and
> `individual_tier_usage`), then propose the migration and the reservation
> change (plan hours, then credits) before writing it. Work on a branch off
> `splitstep-integration` and open a draft PR into it. Run
> `rls-boundary-reviewer` on the migration. Ask me the open questions in the
> plan as they become blocking, not all up front.
