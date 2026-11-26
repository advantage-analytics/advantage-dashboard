# 2027 pricing: build plan

Written 2026-11-25. Replaces stage 2 of
[`2027-player-pricing.md`](2027-player-pricing.md), whose "Player $29 / Player
Pro $49" draft is superseded. Stage 1 of that doc (credit packs, PR #468) is
shipped and stays the record of how credits work.

From **January 1, 2027** the dashboard sells, enforces and says what the
landing site (`advantage-landing`) sells. Vendor rates are confidential and
are not in this repo; every figure below is a price we charge.

## Source of truth

`advantage-landing/src/lib/plans.ts` (checked at `4690315`, 2026-11-19) holds
every price and hour count. The dashboard copies them into **one module,
`src/lib/billing/plans.ts`**, and pages, quota code, Stripe setup and emails
read from it. Nothing is typed into a page. The last check of the build is a
table of every figure in that module against `plans.ts` (see "Check").

### Players and coaches (personal workspaces)

| id          | Name      | Monthly | Yearly | Video hours     | Verified by Advantage | Ask (app + connector) |
| ----------- | --------- | ------- | ------ | --------------- | --------------------- | --------------------- |
| `free`      | Free      | $0      | —      | none            | No                    | 20 questions a month  |
| `coach`     | Coach     | $150    | $1,650 | 5 a month (~3)  | Every match           | Unlimited (fair use)  |
| `coach-pro` | Coach Pro | $300    | $3,300 | 10 a month (~5) | Every match           | Unlimited (fair use)  |

Yearly is 11 months' price. Hours don't carry over to the next month.

### College programs (team workspaces), by the season

| id        | Name    | Spring (Jan–May) | Full year       | Rush included | Priority                  |
| --------- | ------- | ---------------- | --------------- | ------------- | ------------------------- |
| `starter` | Starter | $3,000 · 80 h    | $4,800 · 130 h  | 0             | Not available             |
| `program` | Program | $7,500 · 200 h   | $10,500 · 280 h | 3 a season    | Add-on, +15%              |
| `elite`   | Elite   | $11,000 · 300 h  | $15,000 · 400 h | 6 a season    | Up to 30 h/month included |

Rush and Priority figures live in the module for the later build, but **this
build ignores them**: every job is Standard (see "Out of scope").

### Rules across plans

- Hours are **hours of match video analyzed**, about 1.8 per singles match.
  They are counted on the trimmed video when the player trims, as now.
- **Extra hours are $35 each**, bought at any time by anyone, with or without a
  plan, and they last 12 months. They replace the $14 / $60 credit packs.
- Order of spend: plan hours first, then purchased hours (old credits and new
  extra hours together), soonest-expiring first.
- Emails at **80%** of a period's hours and when they **run out**.
- An email when a match is ready (exists today).
- Singles only.

## Decisions (Cj, 2026-11-20 to 2026-11-25)

These override anything else in this doc or in `2027-player-pricing.md`.

**Who pays from January 1**

1. Everyone pays. The 2 h beta allowance, the 10 h individual pilot and the
   automatic 75 h for every college end on December 31. Matches and reports
   stay.
2. **No free match.** The Free plan has no video hours. The landing site's
   `FREE_MATCH_OFFER` switch has to go off (see "Landing site changes").
3. **Pilots stay for four schools only:** UGA, UCLA (men's and women's),
   Babson and TCU. Cj can end any pilot from Admin at any time. All pilots end
   by May 31, 2027 at the latest. UCSD Club Tennis, Centennial High School and
   Coach Scott move to paying.
4. The legacy `pro` Lifetime account (one user) moves to **Free**.

**Free plan and the paywall**

5. Free is for SwingVision: imports, 20 Ask questions a month, and the team
   film of any team they belong to. A Free player who buys extra hours gets
   Verified by Advantage on those matches (they paid for them). The Ask limit
   on paid plans is being decided in the Ask session.
6. The paywall offers **50% off the first month** (Coach $75, Coach Pro $150),
   **monthly only**, first-time customers only. Our checkout applies it; nobody
   types a code. Yearly already has a month free and gets no discount. The
   paywall also links a sample match report.

**Plans and billing**

7. **Upgrades** (Coach → Coach Pro) start a new billing month the day they
   happen: a full month of Coach Pro charged, less a credit for the unused
   part of Coach, and the full 10 hours fresh. The credit is the **smaller**
   of the share of the month left and the share of the plan's hours left
   (half the month left but 24m of 5h left credits $12, not $75), so hours
   already used are never refunded. **Downgrades and cancellations** take
   effect at renewal.
8. A subscription bought in December is billed that day and its hours start
   that day.
9. **Ask on paid plans** has a fair-use limit we don't advertise: Coach 150,
   Coach Pro 300, college 300 per person, a month. An agent-mode question
   counts as 3. At the limit the message is "Contact us", not a paywall.

**Colleges**

10. Colleges buy on a sales call. Cj **assigns the plan in Admin › Teams**
    (plan, Spring or Full year, start and end dates). The team's hours start
    when it is saved, not when it is paid.
11. Billing is a **Stripe invoice** sent from the Stripe Dashboard: card, ACH
    or PO, up to 5 instalments, 12-month price lock, 20% off a second team. All
    manual. There are six Stripe products/prices (3 plans × 2 terms) so
    invoices read the same; the app never checks them.
12. Season defaults: Spring Jan 1–May 31; admin can extend a Spring plan to
    June 30 for a team still playing (NCAA championships). Full year Aug 1–Jul
    31, and it is never labelled "Spring". Admin can set any dates. Unused
    hours expire at the end date.
13. **New teams default to coaches-only uploads** (`players_can_upload =
false`). Existing teams keep their setting. A player can always upload to
    their own workspace on their own plan or extra hours; that never draws the
    team's hours.

## Decisions from the design review (Cj, 2026-11-26)

The mockups are on the "2027 Pricing Screens" design canvas. These settle what
the canvas shows and override anything above that disagrees.

- **December notice:** wording approved (the canvas's email and Home strip).
  Send on Cj's go-ahead.
- **Pilots:** SplitStep confirmed UCLA, Babson and TCU as pilots from January 1.
- **Discount:** 50% off the first month, monthly only, Coach and Coach Pro,
  first-time customers.
- **Failed payment:** the plan stays while Stripe retries, then drops to Free.
- **Extra hours for teams:** allowed on top of a season, mainly for academies
  and federations; colleges usually budget the year up front.
- **One checkout dialog, every door:** Choose a plan, Upgrade, the landing
  link and the upload paywall all open the same dialog. Upgrade shows Coach
  Pro chosen, the current plan beside it, and the credit with both numbers
  (days left and hours left). There is no checkout page and no separate
  upgrade confirm.
- **Settings › Plan** has the same two cards for every player: a Video hours
  balance (figure, split, reset, "See usage ↗", no meter) and a Plan card whose
  rows hold every action (choose/upgrade, pay yearly, extra hours, billing).
  The comparison lives only in the dialog.
- **Settings › Usage** owns the meter and the history: the personal card with
  a "This month" list of matches in the team card's row form, the team card,
  and storage.
- **Season view:** a team on a season plan sees its season in place of the
  month stepper ("Spring 2027 · Jan 1 – May 31"). A Full-year plan reads
  "2026–27 season · Aug 1 – Jul 31", never "Spring".
- **File step:** a one-line grey hours notice above the drop zone (Free: "No
  video hours yet."; out-of-hours: "This video is longer than your 23m
  left."). Payment stays at Send.
- **Notice strips are one line, never wrapped**, now a design-system rule
  (`.skills/advantage-analytics-design/reference/primitives.md`).
- **Settings is about you; each team keeps its own page.** The rail and the
  Teams list stay as they are today (Teams › <team>, with "← Teams"). Plan and
  Usage never switch with the workspace and show only your own plan, hours
  and storage (Usage drops the team card). On a team's page the first card
  becomes **Plan & hours**: the season or pilot and its dates, hours left with
  the meter, "Breakdown by person" collapsed, and one line on renewing. It
  does not repeat what the page already says (seats are on Members; Verified
  is on every college plan). The header pill and Team Home card stay the
  glance and link here. The `TeamPlanContent` branch in
  `settings/plan/page.tsx` goes away.
- **Admin:** a college's plan, pilot and hours are managed on the one team
  page, not behind a separate view.
- **Landing site:** handed off in
  [`2027-landing-handoff.md`](2027-landing-handoff.md).

## What the dashboard has today (checked 2026-11-25)

- `users.plan` is `CHECK (plan in ('free','pro'))`. Helpers in
  `src/lib/user/plan.ts`: `isProPlan`, `workspaceTier`, `planFacts`,
  `BETA_PLAN_ROWS`, `betaPlanRows`, `PAID_PLANS_BEGIN`. Callers: Settings ›
  Plan, `plan-terms-content.tsx`, `settings-pending.tsx`, `roles.ts`.
- Caps: `src/lib/services/splitstep/config.ts` (`MONTHLY_CAP_HOURS` 2 / 75,
  `PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS` 10, `PILOT_ENDS_AT` 2026-12-31,
  `freeHoursReturnOn`) and `quota.ts` (`quotaTierFor`, `monthlyCapSecondsFor`,
  the PAID-PLAN MARKER). A college is a `program` tier because of
  `org_type = 'college'`; a non-college team only through `pilot_eligible`.
  `users.video_hours_override` and the admin's unlimited workspace override
  the personal figure.
- SQL: `reserve_processing_quota`, `reserve_personal_quota`,
  `reserve_individual_quota`, `reserve_individual_pool_quota`,
  `admin_reserve_video_quota`, `release_*`, `reconcile_processing_quota`,
  `individual_tier_usage`, `individual_pool_usage`, `program_usage_*`. Ledger
  `processing_usage`; credits in `video_credits` / `video_credit_spends`
  (`cap_video_credit`).
- Pilots: `programs.pilot_eligible`, `pilot_ends_on`, `pilot_approved_by/at`,
  `pilot_ended_at`; RPCs `admin_set_pilot_eligible`, `admin_set_pilot_end`,
  `admin_end_pilot`; UI in Admin › Pilots and the team page's
  `PilotUsageCard`; `src/lib/services/programs/admin-pilot-actions.ts`.
- Ask: `ask_quota()` / `ask_reserve_question()` (20 a month for everyone,
  admins uncapped), `ask_usage`; the connector's own `ask_mcp_usage` and
  `src/lib/services/mcp/rate-limit.ts` (calls per window, not questions).
- Stripe: `src/lib/stripe/`, the credit checkout in
  `src/lib/services/credits/checkout.ts` and `/api/credits/confirm`, the
  webhook at `/api/webhooks/stripe` (no longer sets `plan = 'pro'`), the old
  `/api/create-checkout-session` returning 410.
- Email: `usage-alert.ts` already sends a team's 80% mail; nothing for a
  personal plan or for running out.
- `processing_jobs.priority` defaults to `'standard'`.
- Sign-up (`src/app/(auth)/sign-up/page.tsx`) ignores `?plan=&period=`.

## Stages

One PR per stage, each into `splitstep-integration`, in this order. The live
database is checked before every migration (`supabase/migrations/` lags it).

### 0. December notice (ship by December 1)

Copy only, so it can go first.

- An in-app notice (Home and the wizard) and one email to every player and
  every team owner: free hours end December 31; from January 1 an upload needs
  a plan or extra hours; matches and reports stay. Pilot teams get their own
  wording with their end date.
- Files: a new `src/lib/services/email/templates/plans-2027-notice.ts`, a
  one-off send script or admin action, the beta header meter's text.
- Read `docs/email-system.md` first. Send only on Cj's go-ahead.

### A. Plan model

- **Migration:** widen `users.plan` to `free | coach | coach-pro | pro` (keep
  `pro` until the Lifetime account is moved, then drop it in stage C). Add
  `plan_period` (`monthly | yearly`), `plan_status`, `plan_period_start`,
  `plan_period_end`, `stripe_customer_id`, `stripe_subscription_id`. Check
  `users` column grants first (players must not write any of these).
- **Migration:** on `programs`, add `plan_id` (`starter | program | elite`),
  `plan_term` (`spring | full_year`), `plan_starts_on`, `plan_ends_on`,
  `plan_rush_included`, `plan_set_by`, `plan_set_at`, `plan_note` (invoice or
  PO reference). Change the `players_can_upload` default to `false`.
- **`src/lib/billing/plans.ts`:** every figure above, typed like the landing
  site's (`COACH_PLANS`, `COLLEGE_PLANS`, `EXTRA_HOUR_PRICE`,
  `HOURS_PER_MATCH`, Ask limits, `FIRST_MONTH_DISCOUNT_PERCENT`,
  `PLANS_BEGIN = 2027-01-01`). `credits/packs.ts` keeps reading old credits;
  its packs stop being offered.
- **Replace `isProPlan` / `planFacts` / `BETA_PLAN_ROWS`** with
  `planFor(user)` and `programPlanFor(program)` and update their callers.
- **Admin › Teams:** a Plan card beside the pilot card: pick plan and term,
  dates prefilled from the term, note field. Saving writes through a new
  `admin_set_program_plan` RPC (admin-only, audited like the pilot RPCs). The
  card's layout gets a screenshot and Cj's yes before it is committed.
- Tests: plan-module unit tests; a database test that only an admin can call
  `admin_set_program_plan` and that a player can't write the new `users`
  columns.

### B. Allowances

- `quotaTierFor()` / `monthlyCapSecondsFor()` read the plan from January 1:
  - personal: Free 0, Coach 5 h, Coach Pro 10 h a billing month; the admin
    override and the admin's unlimited workspace stay as they are.
  - team: the program plan's hours over **its own window**
    (`plan_starts_on`–`plan_ends_on`), not a month. A team on pilot keeps 75 h
    a month until its pilot ends; a team with neither has 0.
  - The beta 2 h, the individual pilot 10 h and the automatic college tier are
    off from January 1 (keyed on the date, so nothing ships on December 31).
- **SQL:** the reserve functions take the window from the plan. Reservation
  stays atomic: plan hours first, then purchased hours soonest-expiring. Plan
  hours never roll over. No shared house limit in front of paid hours.
- Update `individual_tier_usage`, `individual_pool_usage` and
  `admin_reserve_video_quota` together (they spell the same predicate).
- Pilots: `pilot_ends_on` is required and can't be later than 2027-05-31.
  Before January 1, set it for the four schools and turn `pilot_eligible` on
  for them (they are colleges, which today get 75 h without the switch).
- **Tests (`tests/database`, plus unit tests for the cap math):** monthly
  plan; season window, including a reservation on the last day; Free has 0;
  plan hours then purchased hours; expiry order; no rollover; pilot end date;
  the January 1 switch on both sides of midnight UTC.

### C. Stripe subscriptions and extra hours

- Products: Coach and Coach Pro, each with a monthly and a yearly price;
  "Extra hour" at $35 a unit; the six college products for invoices. Stripe
  Tax on, the existing statement descriptor.
- **Checkout** stays Embedded Checkout inside the upload wizard so the picked
  file isn't lost, and also opens from Settings › Plan. Monthly and yearly side
  by side. The 50% first-month discount is added by our server only for a
  monthly price and a customer with no earlier payment.
- **Extra hours** use the same checkout in one-time mode with a quantity. They
  write `video_credits` rows (12 months), so one spend path covers old credits
  and new hours. Remove the $14 / $60 packs from the paywall and Settings ›
  Plan.
- **One checkout dialog, three doors.** The same dialog (the paywall's mesh
  band, plan rows, Monthly/Yearly, then Embedded Checkout) opens from
  Settings › Plan's "Choose Coach" / "Choose Coach Pro", from the landing site,
  and as the wizard paywall with the match on top. There is no separate
  checkout page. The landing link signs the player up or in (onboarding first
  for a new account), then lands on Settings › Plan with
  `?plan=&period=` opening the dialog on that plan; `plan=free` lands on Home.
- **Webhook:** `checkout.session.completed`, `customer.subscription.created`,
  `.updated`, `.deleted`, `invoice.paid`, `invoice.payment_failed`. It writes
  `users.plan`, the period dates and status. Upgrades run with
  `billing_cycle_anchor = now` and `proration_behavior: "none"`; the server
  adds decision 7's credit itself (a customer-balance credit, since Stripe's
  proration only counts days), and the new period's hours start fresh. Downgrades are scheduled for renewal. A failed payment keeps the plan
  until Stripe's retries end, then drops to Free.
- **Customer Portal** for card, invoices and cancelling; plan changes go
  through our own Upgrade button.
- Move the Lifetime account to Coach with no subscription, then drop `pro`
  from the check.
- Tests: webhook handling with Stripe fixture events (create, upgrade,
  downgrade, cancel, failed payment), the discount only on monthly, sign-up
  parameters.

### D. Gating

- Server-side checks, never only hidden buttons:
  - Human review: a Free user's match doesn't go to the review queue.
  - Ask: `ask_reserve_question()` reads the plan's limit (Free 20, Coach 150,
    Coach Pro 300, team member 300) and the connector's `ask` tool goes
    through the same reservation. The connector's call-rate limit stays.
- Upgrade prompt for Free users at each gate, with the plan module's figures.
- Tests: a Free user's match skips review; Ask refuses at each limit; the MCP
  `ask` tool spends from the same allowance.

### F. Copy and emails

- Settings › Plan, the header pill, Home's usage footer, Settings › Usage, the
  wizard paywall and the beta welcome dialog read the plan module. No "Beta",
  "Lifetime", "Pilot" (except on pilot teams) or "2 hours a month" after
  January 1. Product wording: "Verified by Advantage", "hours of match video",
  "about N matches".
- Emails: 80% and out-of-hours for personal plans and for program seasons
  (extend `usage-alert.ts`), one each a period.
- These are copy changes in existing places; any change of layout gets
  before/after screenshots and Cj's yes first.

## Email copy (drafts on the canvas)

Figures are the Coach example; templates fill them from the plan module.

|           | December notice                                                                                                                                                                                                                     | 80% used                                                                                                                                                                                                                       | Used up                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject   | Free beta hours end December 31                                                                                                                                                                                                     | 1h of match video left this month                                                                                                                                                                                              | You've used this month's video hours                                                                                                                                                                      |
| Preheader | From January 1, a new match needs a plan or extra hours. Everything you've uploaded stays.                                                                                                                                          | About half a match left on Coach. Your hours reset Feb 14.                                                                                                                                                                     | New uploads wait until Feb 14. Add hours to send one sooner.                                                                                                                                              |
| Heading   | Free beta hours end December 31                                                                                                                                                                                                     | 1h of match video left this month                                                                                                                                                                                              | You've used this month's 5h of match video                                                                                                                                                                |
| Body      | From January 1, analyzing a new match needs a plan or extra hours. **Everything you've already uploaded stays**: your matches, reports and film. SwingVision imports stay free. Your first month of a monthly plan is **half off**. | You've used 4h of your 5h on Coach. The hour left covers about half a match, and your hours reset on February 14. / Playing more before then? Extra hours are $35 each and last 12 months, or Coach Pro gives you 10h a month. | New matches wait until your hours reset on February 14. Anything you've already sent keeps processing. / To analyze a match sooner, add extra hours at $35 each, or move up to Coach Pro for 10h a month. |
| Facts     | Coach · Coach Pro · Extra hours                                                                                                                                                                                                     | Left: 1h · about half a match; Resets: Feb 14                                                                                                                                                                                  | Used: 5h of 5h; Resets: Feb 14                                                                                                                                                                            |
| Button    | Choose a plan                                                                                                                                                                                                                       | Add hours                                                                                                                                                                                                                      | Add hours                                                                                                                                                                                                 |
| Note      | Nothing is charged until you choose a plan.                                                                                                                                                                                         | the "Analysis allowance alerts" opt-out                                                                                                                                                                                        | the same                                                                                                                                                                                                  |

## Out of scope for this build

- **Rush and Priority (stage E).** Every job is Standard: no queue field, no
  speed choice, no charge, `processing_jobs.priority` stays `'standard'`. The
  vendor's faster queues have small monthly capacity, so the later build needs
  a monthly limit on Rush. It waits on Christian's request field.
- College sales terms (instalments, PO, price lock, second-team discount)
  stay in Stripe invoices and the plan note.
- Doubles.

## Landing site changes for Cj

Now a ready-to-paste prompt: [`2027-landing-handoff.md`](2027-landing-handoff.md).

This repo doesn't change `advantage-landing`. It needs:

1. `FREE_MATCH_OFFER = false` (no free match), and the Free plan's line.
2. Free's Ask: "20 questions a month" instead of No; paid plans "Unlimited"
   with a fair-use note.
3. Rush and Priority marked "coming soon", or kept off the plans, until they
   are built.
4. The first-month offer (50% off monthly), if it should be advertised.
5. Schedule isn't live; leave it out of the college feature list.

## Check

For each stage: `npm run typecheck`, `npm run lint`, `npm run format:check`,
the Playwright tests and `tests/database`. The last PR ends with a table of
every figure in `src/lib/billing/plans.ts` against
`advantage-landing/src/lib/plans.ts`; every row must match or be one of the
landing changes above.

## Still open

- Confirm with SplitStep that UCLA, Babson and TCU count as pilots and that
  their 3 months start January 1.
- 8 more labelled matches are due to SplitStep by May 2027 (not dashboard
  work).
