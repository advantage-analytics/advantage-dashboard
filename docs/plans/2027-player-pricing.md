# Player pricing: build plan

Written 2026-10-16. A plan, not a spec. Personal workspaces only. Team plans
come after the fall pilot and are out of scope.

**The approved screens are `/design/credits`** (`src/app/design/credits/`),
also published as the "Credit Packs Mockups" design canvas. Frames marked
PICKED there are the build target; the rest are rejected alternatives. The
older `/design/plans` mock (PR #467) is superseded for stage 1.

Two stages. **Stage 1 is what players get now, until January 1, and is built
first.** Stage 2 is the paid plans from January; its details, including the
Free tier, are decided later and are not built yet.

## Stage 1: now until January 1 (build this first)

- Every personal workspace gets **2 free hours of film a month**. SplitStep
  covers that cost. It ends January 1 and nothing carries over.
- Once a player has used their 2 hours, they can buy **credit packs**: 1h for
  $14 or 5h for $60. Credits last 12 months, so unused hours carry into
  January.
- Order of use: the free monthly hours first, then credits, oldest-expiring
  first.
- No plans are sold or billed in this stage, and there are no discounts.

### Stage 1 decisions (Cj, 2026-10-16)

These override anything below that disagrees.

- **No shared house pool.** A personal player's hours are their own (2h free,
  10h for a pilot player, plus their credits); a team's hours are the team's,
  paid for by the owner. The 20h `OPEN_BETA_MONTHLY_CEILING_HOURS` came from a
  misreading of the pilot terms: remove it and its `bandFull` / "fully booked"
  copy. Never put a shared limit in front of paid credits.
- **Pilot players can buy credits** like everyone else, after their 10h.
- **Credits are personal.** They belong to the user and spend only in their
  personal workspace.
- **Attaching a video to an existing match spends no hours**
  (`MatchVideoAttachmentFlow.tsx`), so it gets no paywall. SwingVision imports
  stay free.
- **All sales final.** No refunds; say so in the pack footnote, the dialog and
  the Stripe product description.
- **Stripe Tax on.**
- **Stripe copy:** product "Advantage Intelligence — 1 video hour" (and the
  5-hour equivalent); card statement descriptor "ADVANTAGE INTELLIGENCE"
  (exactly 22 characters).
- **Vercel:** Hobby forbids commercial use; the project moves to Pro before
  credits go on sale. Cj's action, not code.

Picked screens (frame ids in `/design/credits`):

- **Wizard paywall = dialog B3b.5.** Continue stays enabled on the trim step;
  when the trim is longer than free hours plus credits it opens a dialog in
  the beta welcome dialog's style (`beta-welcome-dialog.tsx`: 520px, brand
  mesh band with `LiveDots`, white logo and Beta tag, 40px light display line,
  56px headline figure of the shortfall), then the two packs as **boxed
  selection tiles** (the smallest pack that covers the video pre-selected),
  the "All sales final" aside, "Shorten the trim instead" on the left and
  "Pay $14 and send" on the right.
- **Checkout must not leave the wizard.** The picked video is an in-memory
  `File`; a redirect to Stripe loses it. Use Stripe Embedded Checkout inside
  the dialog. Settings › Plan may redirect.
- **Settings › Plan = A1 hours card + A2b.** One meter, free hours then
  credits; the packs collapse to one line while hours remain and become the
  full pack card (A2a) once low or spent. Credit history (A3), the pilot
  variant (A4) and the back-from-checkout strip (A5) as drawn.
- **Header pill = C1, C2, C3, C4 with the ring kept white** (no amber). The
  credits state reads "3.7h credits"; the click goes to Settings › Plan
  instead of the beta dialog.
- **Home = both D1/D2 (usage footer) and D3 (title subline).**
- **Settings › Usage = E1:** both buckets on one meter, "Manage on Plan" link,
  no packs repeated there.
- B4 (all spent, said on the file step before upload) as drawn.

## Stage 2: from January 1 (decide later)

Draft only. Decide these by **December 1**, when players get the "free hours
end Dec 31" notice and email, so the move on January 1 has somewhere to land.

| Plan       | Price              | Video           | Status                       |
| ---------- | ------------------ | --------------- | ---------------------------- |
| Free       | $0                 | to be decided   | One-time 2h, or 0? Undecided |
| Player     | $29/mo or $290/yr  | 3h a month      | Draft                        |
| Player Pro | $49/mo or $490/yr  | 5h a month      | Draft (see open questions)   |
| Credits    | $14 / 1h, $60 / 5h | Same as stage 1 | Decided                      |

- Players who don't choose a plan move to Free on January 1, and their matches
  and reports stay.
- Yearly is 10 months' price for 12. A plan change starts at the next billing
  date.

## Unit economics (draft stage 2 prices)

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

## Stage 1 build

Each step is one PR into `splitstep-integration`.

### 1. Credits in the database

- Add a `video_credits` table with `user_id`, `seconds`, `remaining_seconds`,
  `expires_at`, `source (purchase|grant)`, `stripe_payment_intent` and
  `created_at`. RLS lets the owner read it; only the service role writes it.
- Teach the reservation SQL the order "monthly hours, then credits", in one
  transaction. Release and reconcile must give credit seconds back to the same
  rows.
- Remove the 20h house-wide ceiling (`OPEN_BETA_MONTHLY_CEILING_HOURS`, the
  open band in `individual_tier_usage` / the reserve functions, and the
  `bandFull` / "fully booked" copy) — decided above. Read the live function
  bodies first; the repo's migrations lag the database. The pilot pool (20 ×
  10h) never refuses before a player's own cap, so it can go in the same
  change.
- New functions get grants per AGENTS.md. Nothing is executable by `anon`.

### 2. Credits in the app

- Add credits to `peekQuota()` and the `HoursLeft` shape, so every meter shows
  "free hours left" plus "credits".
- Rewrite the refusal copy (`quotaRefusalMessage()`, `capRefusalMessage()`) so
  out of hours names the next step: buy credits, or wait for the 1st.

### 3. Stripe checkout for credits

- Create two one-time prices: 1h for $14 and 5h for $60. Archive the old $4.99
  price; don't delete it.
- Replace the 410 in `POST /api/create-checkout-session` with
  `{ kind: "credits", pack }` in payment mode. Use the signed-in user and
  `errorResponse()` / `jsonResponse()`.
- In `/api/webhooks/stripe`, make `checkout.session.completed` insert a
  `video_credits` row. It must be idempotent on the event id.

### 4. Where the paywall appears

Show a prompt only where the player is about to spend hours. Never block
reading existing matches, and never charge for SwingVision imports.

1. **Upload wizard, trim step.** The main gate: when the trimmed duration is
   more than free hours plus credits, Continue opens the B3b.5 dialog with
   Stripe Embedded Checkout (see the decisions above). "Shorten the trim
   instead" closes it back to the trim. B2's footer says the free/credit split
   when a video spills into credits; B4 says "out of hours" on the file step.
2. **No paywall on the video attachment flow** — it spends no hours.
3. **Header meter** (`beta-header-meter.tsx`). Ring stays white; a credits
   state; the click goes to Settings › Plan. No modal.
4. **Home.** Usage footer line and title subline when hours are spent (D1–D3).

Copy rules: lead with what's left, say when hours come back, name one next
step, and never use red for a sales message.

### 5. Settings › Plan

- Rebuild `/dashboard/settings/plan` from `/design/credits` frames A1, A2b
  (→ A2a when low or spent), A3, A4 and A5. No "Plans from January" card until
  stage 2 is decided. Settings › Usage's personal card becomes E1.
- Use the existing primitives: `SettingsCard`, `HoursMeter`, `StatePill`,
  `advButton`.

### 6. Landing site

- `advantage-landing`'s `src/lib/pilot.ts` already says "Plans aren't billed
  before then". Add one line about credit packs to the individual beta copy.

## Stage 2 build (after Cj decides the plans)

- **Plans in the database:** widen `users.plan` to `free | player |
player_pro`, and keep `pro` as a legacy alias that reads as Player Pro. Add
  `plan_interval`, `plan_status`, `plan_current_period_end`,
  `stripe_customer_id` and `stripe_subscription_id`. Reservation becomes "plan
  hours, then credits".
- **Caps:** `monthlyCapSecondsFor()` reads the plan. Its comment already marks
  it as the seam ("PAID-PLAN MARKER"). Gate the pilot's 2h on `PILOT_ENDS_AT`
  rather than deleting it, so nothing ships on the night of Dec 31.
- **Stripe subscriptions:**
  - Checkout runs in subscription mode. If plans open before January, set
    `trial_end` to Jan 1 so nothing is billed early.
  - The webhook handles `customer.subscription.updated` and `.deleted`, and
    sets `past_due` on `invoice.payment_failed`, with a grace period.
  - Use the customer portal for self-serve changes.
- **Paywall:** the wizard offers Upgrade plus credits. Free with nothing left
  offers to choose a plan.
- **December:** a notice and an email to every player saying "Free hours end
  Dec 31."
- **Website:** turn `/design/pricing` (landing PR #15) into the public
  `/pricing`.

## Open questions for Cj

Stage 1's questions (house ceiling, refunds, Stripe Tax) are answered in
"Stage 1 decisions" above.

- **For stage 2:**
  - What does Free include (one-time 2h, or nothing)?
  - Player Pro costs more per hour than Player ($9.80 vs $9.67), so price Pro
    at $45?
  - What happens to the legacy Lifetime Pro account and the 20 hand-picked
    pilot players?
  - What grace period after a failed payment?

## Prompt for a new Claude Code session

> Read `docs/plans/2027-player-pricing.md` and AGENTS.md, then the
> `.skills/advantage-analytics-design` skill before any UI work. Build
> stage 1 only: until January 1, every personal workspace gets 2 free hours of
> film a month, and once those are used a player can buy credit packs (1h for
> $14, 5h for $60, lasting 12 months, used after the free hours). No plans are
> sold yet. Start with step 1. Check the live database with the Supabase MCP
> (`list_tables`, and read `reserve_processing_quota`,
> `reserve_individual_quota` and `individual_tier_usage`), confirm how the 2h
> and the 20h house ceiling (being removed) work today, then propose the `video_credits`
> migration and the reservation change before writing it. Work on a branch off
> `splitstep-integration` and open a draft PR into it. Run
> `rls-boundary-reviewer` on the migration. Ask me the open questions as they
> become blocking, not all up front.
