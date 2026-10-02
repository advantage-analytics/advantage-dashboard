-- What an anonymous visitor may learn about a program before claiming it.
-- Applied live 2026-08-17 as version 20260817074759.
--
-- Screen F3.3 says "Elena V. manages Advantage here" — a first name and a last
-- initial, never an address. That cannot be a client-side join: `users` is
-- scoped to `auth.uid() = id`, so a visitor cannot read the owner's row at all,
-- and loosening that policy to show a name would expose every user's email
-- alongside it.
--
-- SECURITY DEFINER, returning exactly the fields the three status screens
-- render and nothing else. The owner's email, id and role stay behind it.
create or replace function public.program_public_status(p_program_key text)
returns table (
  program_key   text,
  school_name   text,
  team          text,
  division      text,
  conference    text,
  state         text,
  status        text,
  -- 'Elena V.' — never an address.
  owner_display text,
  -- How old the pending claim is. A coach deciding whether to wait or object
  -- needs to know if this happened six hours ago or six weeks ago (F3.4).
  claimed_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.program_key,
    p.school_name,
    p.team,
    p.division,
    p.conference,
    p.state,
    p.status,
    case
      when u.id is null then null
      else trim(
        coalesce(u.first_name, '') ||
        case when u.last_name is not null and u.last_name <> ''
             then ' ' || left(u.last_name, 1) || '.'
             else '' end
      )
    end,
    p.claimed_at
  from public.programs p
  left join public.users u on u.id = p.owner_user_id
  where p.program_key = p_program_key;
$$;

revoke all on function public.program_public_status(text) from public;
-- anon too: the claim flow's first screens run before an account exists.
grant execute on function public.program_public_status(text) to anon, authenticated;

comment on function public.program_public_status(text) is
  'Public projection for the claim status screens. Returns an owner as "First L." and never an address.';
