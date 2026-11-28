# 2027 pricing: build plan

Written 2026-11-25, design-review decisions added 2026-11-26, **final pricing
added 2026-11-27** (see "Final pricing", which overrides everything else
here). Replaces stage 2 of
[`2027-player-pricing.md`](2027-player-pricing.md), whose "Player $29 / Player
Pro $49" draft is superseded: the personal plans are called Player and Player
Pro again, at the prices below. Stage 1 of that doc (credit packs, PR #468) is
shipped and stays the record of how credits work.

From **January 1, 2027** the dashboard sells, enforces and says what the
landing site (`advantage-landing`) sells. Every figure below is a price we
charge.

## Source of truth

**`src/lib/billing/plans.ts`** holds every price, hour count, match count and
Ask limit the dashboard shows, and pages, quota code, Stripe setup and emails
read from it. Nothing is typed into a page; `tests/billing-plans.spec.ts`
pins each figure. The landing site keeps its own copy
(`advantage-landing/src/lib/plans.ts`; the two repos share no code), brought
in line by [`2027-landing-handoff.md`](2027-landing-handoff.md).

### Personal plans (personal workspaces): for players and parents

| id           | Name       | Monthly | Yearly | Headline                         | Sub-copy                                       | Ask (app + connector) |
| ------------ | ---------- | ------- | ------ | -------------------------------- | ---------------------------------------------- | --------------------- |
| `free`       | Free       | $0      | —      | Free for SwingVision users       | no video hours                                 | 20 questions a month  |
| `player`     | Player     | $150    | $1,650 | About 3 verified matches a month | 5 hours of match video · every match verified  | 150 questions a month |
| `player-pro` | Player Pro | $300    | $3,300 | About 6 verified matches a month | 10 hours of match video · every match verified | 300 questions a month |

Yearly is 11 months' price. Hours don't carry over to the next month. The
match counts (3 and 6) are stated figures, not worked out from the hours. One
person per account: a parent with two juniors needs two plans.

### College programs (team workspaces), by the season

Price · hours · about N verified matches.

| id        | Name    | Spring (Jan–May)      | Full year             | Covers                                 | Ask, team pool a month |
| --------- | ------- | --------------------- | --------------------- | -------------------------------------- | ---------------------- |
| `starter` | Starter | $3,000 · 80 h · 45    | $4,800 · 130 h · 70   | Your top courts, every dual            | 500                    |
| `program` | Program | $7,500 · 225 h · 125  | $10,500 · 325 h · 180 | Nearly every singles match, every dual | 1,000                  |
| `elite`   | Elite   | $12,000 · 400 h · 220 | $16,500 · 550 h · 305 | Every match, plus fall and practice    | 2,000                  |

**Rush and Priority are not in any plan.** Every job is Standard; where a
plan's contents are listed there is one line, "Rush and Priority: coming
soon" (`RUSH_PRIORITY_COMING_SOON`). `rushIncluded` is 0 and there are no
Priority hours on every college plan, and `admin_set_program_plan` stamps
`rush_included = 0`. Roster caps are not decided and nothing stores one.

### Rules across plans

- Hours are **hours of match video analyzed**, about 1.8 per singles match
  (longer matches use more). They are counted on the trimmed video when the
  player trims, as now.
- Every plan is **headlined in matches, with its hours as sub-copy**. A price
  per hour is shown in one place only: the extra-hours line.
- **Extra hours are $35 each**, bought at any time by anyone, with or without a
  plan, and they last 12 months. The line reads "$35 an hour (about $60 per
  extra match)"; the $60 is a stated figure in the plan module. They replace
  the $14 / $60 credit packs.
- Order of spend: plan hours first, then purchased hours (old credits and new
  extra hours together), soonest-expiring first.
- Emails at **80%** of a period's hours and when they **run out**.
- An email when a match is ready (exists today).
- Singles only.

## Final pricing (Cj, 2026-11-27)

Decided after the 2027 build merged. These override the decisions and stages
below wherever they disagree; the tables above already show them.

**What was reversed**

| Was                                                                   | Now                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Coach / Coach Pro (ids `coach`, `coach-pro`), for players and coaches | **Player / Player Pro** (ids `player`, `player-pro`): "For players and parents." One person per account.   |
| First month 50% off ($75 / $150)                                      | **First month 30% off** ($105 / $210). Still monthly only, first-time customers only, applied by checkout. |
| A Free player's extra hours earn Verified by Advantage (decision 5)   | **Verified is for a paid plan only**: Player, Player Pro, a team's season plan or a pilot.                 |
| Ask on a college plan: 300 a person a month                           | **One team pool a month**: Starter 500, Program 1,000, Elite 2,000.                                        |
| Program 3 Rush a season; Elite 6 Rush and 30 Priority hours a month   | **Rush and Priority are in no plan**: one "coming soon" line.                                              |
| Player Pro (then Coach Pro): about 5 matches                          | **About 6 verified matches a month** (stated).                                                             |
| Program $7,500 · 200 h / $10,500 · 280 h                              | **$7,500 · 225 h · 125 / $10,500 · 325 h · 180**                                                           |
| Elite $11,000 · 300 h / $15,000 · 400 h                               | **$12,000 · 400 h · 220 / $16,500 · 550 h · 305**                                                          |

Starter is unchanged ($3,000 · 80 h · 45 / $4,800 · 130 h · 70), as are the
personal prices and hours and the $35 extra hour.

**How it is built**

- **Names and ids.** `PersonalPlanId` is `free | player | player-pro`
  everywhere: types, view models, copy, emails, the preview fixtures, the
  Stripe setup script (products `advantage_player`, `advantage_player_pro`,
  lookup keys to match) and the env names (`STRIPE_PRICE_PLAYER_MONTHLY`,
  `STRIPE_PRICE_PLAYER_YEARLY`, `STRIPE_PRICE_PLAYER_PRO_MONTHLY`,
  `STRIPE_PRICE_PLAYER_PRO_YEARLY`). A subscription's description in Stripe
  reads "Advantage Player, monthly". "Coach" now only ever means a person: a
  team role or a persona.
- **Old links still work.** `?plan=coach` and `?plan=coach-pro` (and a
  plan-intent cookie set before the rename) are read as `player` and
  `player-pro` (`personalPlanIdFrom()`), so the landing site can change on its
  own schedule.
- **Database.** `20261127060000_plans_2027_final_pricing.sql` (not applied
  yet; apply after the follow-ups migration, with this build, before plans go
  on sale): moves any `coach` / `coach-pro` row to the new id (live held none
  on 2026-11-27), replaces `users_plan_check` with `free | player |
player-pro` (plus the legacy `pro` while the check still allows it), and
  replaces three functions, each a copy of its latest body with one change:
  `reserve_plan_personal_quota` (the plan ids), `label_review_eligibility`
  (counts `plan`, `season` and `pilot` only) and `admin_set_program_plan`
  (stamps `rush_included = 0`). The unapplied billing migration's final check
  is `free | player | player-pro`.
- **Verified, paid plans only.** The reservation still writes
  `processing_usage.paid_basis = 'extra_hours'` for a purchased credit spent
  off a plan: it records how the match was paid for. The review gate no
  longer counts it. A subscriber spending extra hours is marked `plan`, so
  they keep review; a match sent before January 1 stays eligible.
- **First month.** `FIRST_MONTH_DISCOUNT_PERCENT = 30`, and every sentence is
  built from it ("30% off your first month", "$105 today, then $150 a
  month"). The coupon's id carries the percentage,
  `advantage-first-month-30-2027`, so the setup script makes a new coupon; the
  50% one an earlier run made (`advantage-first-month-2027`) is unused and can
  be deleted. `STRIPE_COUPON_FIRST_MONTH` takes the new id.
- **Stripe prices.** A Price cannot be edited. Where an earlier run of the
  setup script created the Coach products or the old Elite invoice prices,
  archive them; the script creates the new ones under the new ids and lookup
  keys.
- **Ask.** The plan module exposes the numbers (`ASK_QUESTIONS_PER_MONTH`,
  `ASK_TEAM_QUESTIONS_PER_MONTH`); enforcing them belongs to the Ask session
  and is not part of this change.

## Decisions (Cj, 2026-11-20 to 2026-11-25)

These override anything else in this doc or in `2027-player-pricing.md`,
except where "Final pricing" above reverses them (marked inline).

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
   film of any team they belong to. ~~A Free player who buys extra hours gets
   Verified by Advantage on those matches.~~ **Reversed 2026-11-27:** Verified
   by Advantage is for a paid plan only; extra hours bought on Free are
   analysed and not reviewed.
6. The paywall offers **30% off the first month** (Player $105, Player Pro
   $210; it was 50% until 2026-11-27), **monthly only**, first-time customers
   only. Our checkout applies it; nobody
   types a code. Yearly already has a month free and gets no discount. The
   paywall also links a sample match report.

**Plans and billing**

7. **Upgrades** (Player → Player Pro) start a new billing month the day they
   happen: a full month of Player Pro charged, less a credit for the unused
   part of Player, and the full 10 hours fresh. The credit is the **smaller**
   of the share of the month left and the share of the plan's hours left
   (half the month left but 24m of 5h left credits $12, not $75), so hours
   already used are never refunded. **Downgrades and cancellations** take
   effect at renewal.
8. A subscription bought in December is billed that day and its hours start
   that day.
9. **Ask on paid plans.** The figures live in the plan module, never in the
   gate: Player 150 and Player Pro 300 a month; a college team shares one pool
   a month (Starter 500, Program 1,000, Elite 2,000; it was 300 a person until
   2026-11-27); an agent-mode question counts as 3. At the limit the message
   is "Contact us", not a paywall.

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
- **Discount:** 30% off the first month (50% until 2026-11-27), monthly only,
  Player and Player Pro, first-time customers.
- **Failed payment:** the plan stays while Stripe retries, then drops to Free.
- **Extra hours for teams:** allowed on top of a season, mainly for academies
  and federations; colleges usually budget the year up front.
- **One checkout dialog, every door:** Choose a plan, Upgrade, the landing
  link and the upload paywall all open the same dialog. Upgrade shows Player
  Pro chosen, the current plan beside it, and the credit with both numbers
  (days left and hours left). There is no checkout page and no separate
  upgrade confirm.
- **Settings › Plan** has the same two cards for every player: a Video hours
  balance (figure, split, reset, "See usage ↗", no meter) and a Plan card whose
  rows hold every action (choose/upgrade, pay yearly, extra hours, billing).
  The comparison lives only in the dialog.
- **Settings › Usage** owns your meter and history: the personal card with a
  "This month" list of matches (name, date, time; no bars) and storage. Team
  hours are not here (see the Settings bullet below).
- **Season view:** on its team page, a team on a season plan sees its season,
  not a month ("Spring 2027 · Jan 1 – May 31"). A Full-year plan reads
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
  `pro` until the Lifetime account is moved, then drop it in stage C). The
  final-pricing migration renames the two paid ids to `player` and
  `player-pro`. Add
  `plan_period` (`monthly | yearly`), `plan_status`, `plan_period_start`,
  `plan_period_end`, `stripe_customer_id`, `stripe_subscription_id`. Check
  `users` column grants first (players must not write any of these).
- **Migration:** on `programs`, add `plan_id` (`starter | program | elite`),
  `plan_term` (`spring | full_year`), `plan_starts_on`, `plan_ends_on`,
  `plan_rush_included`, `plan_set_by`, `plan_set_at`, `plan_note` (invoice or
  PO reference). New teams default to coaches-only uploads: set the default
  `upload_policy` to `owner_coaches` (`players_can_upload` is derived from
  it; check the live schema for how before writing the migration).
- **`src/lib/billing/plans.ts`:** every figure above, typed like the landing
  site's (`PERSONAL_PLANS`, `COLLEGE_PLANS`, `EXTRA_HOUR_PRICE`,
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
  - personal: Free 0, Player 5 h, Player Pro 10 h a **billing month**, which
    is the subscription's own period (`plan_period_start`–`plan_period_end`),
    not the calendar month the beta used. Reservations and the meter key on
    that period, so an upgrade's new period starts with fresh hours and
    usage logged under the old period doesn't count against it. The admin
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
  plan hours then purchased hours; expiry order; no rollover; a subscription
  period that straddles two calendar months; an upgrade mid-period; pilot end
  date;
  the January 1 switch on both sides of midnight UTC.

### C. Stripe subscriptions and extra hours

- Products: Player and Player Pro, each with a monthly and a yearly price;
  "Extra hour" at $35 a unit; the six college products for invoices. Stripe
  Tax on, the existing statement descriptor.
- **Checkout** stays Embedded Checkout inside the upload wizard so the picked
  file isn't lost, and also opens from Settings › Plan. Monthly and yearly side
  by side. The first-month discount is added by our server only for a
  monthly price and a customer with no earlier payment.
- **Extra hours** use the same checkout in one-time mode with a quantity. They
  write `video_credits` rows (12 months), so one spend path covers old credits
  and new hours. Remove the $14 / $60 packs from the paywall and Settings ›
  Plan.
- **Landing link:** signs the player up or in (onboarding first for a new
  account), then lands on Settings › Plan with `?plan=&period=` opening the
  checkout dialog (see the design review) on that plan; `plan=free` lands on
  Home.
- **Webhook:** `checkout.session.completed`, `customer.subscription.created`,
  `.updated`, `.deleted`, `invoice.paid`, `invoice.payment_failed`. It writes
  `users.plan`, the period dates and status. Upgrades run with
  `billing_cycle_anchor = now` and `proration_behavior: "none"`; the server
  adds decision 7's credit itself (a customer-balance credit, since Stripe's
  proration only counts days), and the new period's hours start fresh. Downgrades are scheduled for renewal. A failed payment keeps the plan
  until Stripe's retries end, then drops to Free.
- **Customer Portal** for card, invoices and cancelling; plan changes go
  through our own Upgrade button.
- Move the Lifetime account to Free (decision 4), then drop `pro` from the
  check.
- Tests: webhook handling with Stripe fixture events (create, upgrade,
  downgrade, cancel, failed payment), the discount only on monthly, sign-up
  parameters.

### D. Gating

- Server-side checks, never only hidden buttons:
  - Human review: a match goes to the review queue when it was analysed on a
    paid plan (Player, Player Pro, a season or a pilot). Extra hours bought
    on Free do not earn it (final pricing), and neither does a Free player's
    SwingVision import.
  - Ask: `ask_reserve_question()` reads the plan's limit from the plan
    module (Free 20; paid figures per decision 9) and the connector's `ask`
    tool goes through the same reservation. The connector's call-rate limit
    stays.
- Upgrade prompt for Free users at each gate, with the plan module's figures.
- Tests: a match paid with extra hours on a Free account is not reviewed, a
  subscriber's is, and an unpaid import is not; Ask refuses at each limit; the MCP `ask` tool spends
  from the same allowance.

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

Figures are the Player example; templates fill them from the plan module.

|           | December notice                                                                                                                                                                                                                    | 80% used                                                                                                                                                                                                                         | Used up                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject   | Free beta hours end December 31                                                                                                                                                                                                    | 1h of match video left this month                                                                                                                                                                                                | You've used this month's video hours                                                                                                                                                                       |
| Preheader | From January 1, a new match needs a plan or extra hours. Everything you've uploaded stays.                                                                                                                                         | About half a match left on Player. Your hours reset Feb 14.                                                                                                                                                                      | New uploads wait until Feb 14. Add hours to send one sooner.                                                                                                                                               |
| Heading   | Free beta hours end December 31                                                                                                                                                                                                    | 1h of match video left this month                                                                                                                                                                                                | You've used this month's 5h of match video                                                                                                                                                                 |
| Body      | From January 1, analyzing a new match needs a plan or extra hours. **Everything you've already uploaded stays**: your matches, reports and film. SwingVision imports stay free. Your first month of a monthly plan is **30% off**. | You've used 4h of your 5h on Player. The hour left covers about half a match, and your hours reset on February 14. / Playing more before then? Extra hours are $35 each and last 12 months, or Player Pro gives you 10h a month. | New matches wait until your hours reset on February 14. Anything you've already sent keeps processing. / To analyze a match sooner, add extra hours at $35 each, or move up to Player Pro for 10h a month. |
| Facts     | Player · Player Pro · Extra hours                                                                                                                                                                                                  | Left: 1h · about half a match; Resets: Feb 14                                                                                                                                                                                    | Used: 5h of 5h; Resets: Feb 14                                                                                                                                                                             |
| Button    | Choose a plan                                                                                                                                                                                                                      | Add hours                                                                                                                                                                                                                        | Add hours                                                                                                                                                                                                  |
| Note      | Nothing is charged until you choose a plan.                                                                                                                                                                                        | the "Analysis allowance alerts" opt-out                                                                                                                                                                                          | the same                                                                                                                                                                                                   |

## Out of scope for this build

- **Rush and Priority (stage E).** In no plan, and "coming soon" wherever
  plan contents are listed. Every job is Standard: no queue field, no speed
  choice, no charge, `processing_jobs.priority` stays `'standard'`. The
  vendor's faster queues have small monthly capacity, so the later build needs
  a monthly limit on Rush. It waits on Christian's request field.
- College sales terms (instalments, PO, price lock, second-team discount)
  stay in Stripe invoices and the plan note.
- Doubles.

## Landing site changes for Cj

A ready-to-paste prompt: [`2027-landing-handoff.md`](2027-landing-handoff.md).
This repo doesn't change `advantage-landing`; the handoff lists what it needs.

## Check

For each stage: `npm run typecheck`, `npm run lint`, `npm run format:check`,
the Playwright tests and `tests/database`. The last PR ends with a table of
every figure in `src/lib/billing/plans.ts` against
`advantage-landing/src/lib/plans.ts`; every row must match once the landing
changes in the handoff are made.

## Still open

- 8 more labelled matches are due to SplitStep by May 2027 (not dashboard
  work).
