-- Separate paid entitlement from profile persona.
--
-- users.role previously carried two vocabularies: the profile form writes
-- persona values (player/coach/parent/academy) while the Stripe webhook wrote
-- 'founder' to mark a paid user — so saving the profile silently cleared Pro.
-- Entitlement now lives in users.plan; role stays persona-only.

alter table public.users
  add column plan text not null default 'free'
  constraint users_plan_check check (plan in ('free', 'pro'));

comment on column public.users.plan is
  'Paid entitlement (free | pro). Written only by the Stripe webhook via the service role; users_block_plan_self_update blocks client writes.';

comment on column public.users.role is
  'Self-described profile persona (player | coach | parent | academy). Not an entitlement.';

-- Existing Founder''s Pass holders keep Pro. role=''founder'' values are left in
-- place so already-deployed code (which still reads role) keeps working until
-- the app deploy that reads plan; nothing writes ''founder'' after that, and the
-- next profile save replaces it with a persona (or null).
update public.users
set plan = 'pro'
where role = 'founder';

-- The users RLS policy grants ALL on your own row, so without a guard any
-- signed-in user could PATCH plan='pro' on themselves. This fires only when an
-- UPDATE's SET list includes plan: the profile form never sends plan, and the
-- Stripe webhook runs as service_role.
create function public.users_block_plan_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan is distinct from old.plan
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
         in ('authenticated', 'anon') then
    raise exception 'plan is managed by billing and cannot be changed by clients'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_block_plan_self_update
  before update of plan on public.users
  for each row
  execute function public.users_block_plan_self_update();
