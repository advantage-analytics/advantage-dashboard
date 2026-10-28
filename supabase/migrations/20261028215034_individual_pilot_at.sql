-- When a player joined the individual pilot (Admin › Pilots' "Added" column,
-- and the page's New-since-you-last-looked dot).
--
-- Stamped by `users_individual_pilot_guard`, the trigger that already owns
-- every change to `individual_pilot`: set to now() when the flag turns on,
-- cleared when it turns off. Pilots added before this migration have no
-- record of when, so they stay null and the page prints "—" for them.
-- Operator-owned like the flag itself: no client UPDATE grant.

alter table public.users
  add column if not exists individual_pilot_at timestamptz;

comment on column public.users.individual_pilot_at is
  'When individual_pilot last turned on. Stamped by users_individual_pilot_guard; null when off or added before 2026-10-28.';

create or replace function public.users_individual_pilot_guard()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if not (
       (tg_op = 'INSERT' and new.individual_pilot is true)
       or (tg_op = 'UPDATE' and new.individual_pilot is distinct from old.individual_pilot)
     ) then
    return new;
  end if;

  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       in ('authenticated', 'anon') then
    raise exception 'individual_pilot is managed by operators and cannot be changed by clients'
      using errcode = '42501';
  end if;

  if new.individual_pilot is true then
    perform pg_advisory_xact_lock(hashtext('users.individual_pilot'));
    if (select count(*) from public.users
         where individual_pilot and id <> new.id) >= 20 then
      raise exception 'the individual pilot is full: at most 20 players'
        using errcode = '54000';
    end if;
    new.individual_pilot_at := now();
  else
    new.individual_pilot_at := null;
  end if;

  return new;
end;
$function$;
