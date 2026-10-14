-- Platform admins ask without a monthly limit.
--
-- Decided 2026-10-14: an account with users.is_admin = true (Advantage
-- staff — the accounts that can open /admin) has no cap on Ask questions.
-- Every question is still reserved and counted in ask_usage, exactly as for
-- everyone else, so what Ask costs stays visible; only the refusal is gone.
-- Both functions answer `cap: null` for such an account, which the page
-- draws as "Unlimited questions" instead of a meter.
--
-- Everyone else keeps 20 a calendar month. Replaces both function bodies in
-- place: same signatures, so their grants are kept.
--
-- Applied to the live database on 2026-10-14 as version 20261014212126
-- (`ask_admin_unlimited`). VERIFIED in a rolled-back transaction: an admin
-- reserved 25 questions, never refused, all counted, cap null; a non-admin
-- was refused at 20 (54000).

create or replace function public.ask_reserve_question()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user  uuid := auth.uid();
  v_cap   integer;
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
  v_used  integer;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Null: a platform admin, no limit.
  select case when u.is_admin then null else 20 end
    into v_cap
    from public.users u
   where u.id = v_user;
  if not found then
    v_cap := 20;
  end if;

  perform pg_advisory_xact_lock(hashtext('ask_usage:' || v_user::text));

  select count(*)
    into v_used
    from public.ask_usage
   where user_id = v_user
     and billing_month = v_month;

  if v_cap is not null and v_used >= v_cap then
    raise exception 'ask_limit_reached: % questions this month, resets on %',
      v_cap, (v_month + interval '1 month')::date
      using errcode = '54000';
  end if;

  insert into public.ask_usage (user_id, billing_month)
  values (v_user, v_month)
  returning id into v_id;

  return jsonb_build_object(
    'usage_id',  v_id,
    'used',      v_used + 1,
    'cap',       v_cap,
    'resets_on', (v_month + interval '1 month')::date
  );
end;
$function$;

create or replace function public.ask_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user  uuid := auth.uid();
  v_cap   integer;
  v_month date := (date_trunc('month', now() at time zone 'utc'))::date;
  v_used  integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select case when u.is_admin then null else 20 end
    into v_cap
    from public.users u
   where u.id = v_user;
  if not found then
    v_cap := 20;
  end if;

  select count(*)
    into v_used
    from public.ask_usage
   where user_id = v_user
     and billing_month = v_month;

  return jsonb_build_object(
    'used',      v_used,
    'cap',       v_cap,
    'resets_on', (v_month + interval '1 month')::date
  );
end;
$function$;
