-- 2027 pricing, stage C · billing
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Apply it AFTER
-- `20261126060000_plans_2027_plan_model.sql` (which widens `users.plan` and
-- adds the billing columns the Stripe webhook writes) and BEFORE plans go on
-- sale. Decisions cited below are in docs/plans/2027-pricing.md.
--
-- PROVENANCE. Read from the LIVE database on 2026-11-25
-- (`pg_get_constraintdef`, `pg_proc.prosrc`, `pg_views.definition`), not from
-- this folder:
--   - `users_plan_check` is still `plan = any (array['free', 'pro'])` (stage A
--     is not applied yet) and exactly ONE row holds `pro`;
--   - no function or view in `public` names `'pro'`;
--   - `video_credits_pack_check` is `pack = any (array['1h', '5h'])` and
--     `video_credits_source_check` is `source = any (array['purchase',
--     'grant'])`, with `stripe_checkout_session`, `stripe_payment_intent` and
--     `stripe_event_id` each UNIQUE.
--
-- What it does:
--
--   users   Decision 4: the one legacy `pro` (Lifetime) account moves to
--           Free. Then `pro` leaves the check: free | coach | coach-pro.
--           In that order — the check cannot be narrowed while a row still
--           holds the value.
--
-- What it deliberately does NOT do:
--
--   video_credits   no change. An extra-hours purchase (decision: $35 an
--           hour, 12 months) is a row with `source = 'purchase'` and a NULL
--           `pack` — a pack names one of the two retired bundles, and a
--           by-the-hour purchase is told apart by having none. Both live
--           checks already allow that (a CHECK passes on NULL), the row still
--           needs its `stripe_checkout_session` (`video_credits_check1`), and
--           the three unique columns are what make the webhook and
--           `/api/billing/confirm` record one purchase once. `1h` / `5h`
--           stay valid so old credits and history read as before.
--
-- RE-RUNNABLE. The update matches nothing the second time, and the check is
-- replaced inside an existence-checked block (no bare DROP), so a second run
-- changes nothing.

-- ── users: the Lifetime account moves to Free, then `pro` leaves the check ──

-- Runs as the migration role, which `users_block_plan_self_update` lets
-- through: the trigger refuses only a client JWT (`authenticated` / `anon`).
update public.users
   set plan = 'free'
 where plan = 'pro';

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'users_plan_check'
       and conrelid = 'public.users'::regclass
  ) then
    alter table public.users drop constraint users_plan_check;
  end if;

  alter table public.users
    add constraint users_plan_check
    check (plan = any (array['free', 'coach', 'coach-pro']));
end;
$$;

comment on column public.users.plan is
  'Paid entitlement: free | coach | coach-pro. Written only by the Stripe webhook via the service role; users_block_plan_self_update blocks client writes.';

comment on column public.video_credits.pack is
  'The retired $14 / $60 bundle a purchase was (1h | 5h). NULL for an admin grant and for extra hours bought by the hour (source = purchase) from 2027.';

-- ── Assertions: fail the migration rather than leave it half true ──────────

do $$
begin
  if exists (select 1 from public.users where plan = 'pro') then
    raise exception 'plans_2027_billing: a users row still holds plan = pro';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'users_plan_check'
       and conrelid = 'public.users'::regclass
       and pg_get_constraintdef(oid) not like '%''pro''%'
       and pg_get_constraintdef(oid) like '%''coach-pro''%'
  ) then
    raise exception 'plans_2027_billing: users_plan_check was not narrowed';
  end if;
end;
$$;
