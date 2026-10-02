-- A seat is an account with access to a program.
--
-- The product had no such limit: no column, no check, no Stripe quantity, and
-- `/dashboard/settings/plan` says seats are arranged offline with sales. The
-- roster dialogs need to state a real number, so here it is.
--
-- ── What counts ─────────────────────────────────────────────────────────────
-- Members plus unexpired unaccepted invites, every role. A coach-managed
-- profile costs nothing until it is claimed — that is the product: build the
-- whole squad on day one, pay for the logins you actually hand out.
--
-- Reserving at INVITE time rather than at acceptance is the important half.
-- The alternative fails at the worst possible moment: a coach on 20 seats sends
-- 30 invites, and the 21st athlete creates an account, sets a password, clicks
-- through, and hits a wall they can do nothing about. Reserving puts the
-- refusal in front of the coach, who is the only person able to free a seat.

alter table public.programs
  add column if not exists seats integer not null default 25;

alter table public.programs drop constraint if exists programs_seats_check;
alter table public.programs add constraint programs_seats_check check (seats >= 1);

-- Deliberately NOT added to `update_program_settings`. That function is a
-- named-column allowlist, and the allowlist is what keeps `status` and
-- `owner_user_id` unreachable from the settings form. `seats` is a billing
-- field of the same class: it moves by admin or service role, not by a coach
-- editing their team's name.

create or replace function public.program_seat_usage(p_program_id uuid)
returns table (seats integer, used integer, pending integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.seats,
    (select count(*)::int from public.program_members pm where pm.program_id = p.id),
    (select count(*)::int from public.program_invites i
      where i.program_id = p.id
        and i.accepted_at is null
        and i.expires_at > now())
  from public.programs p
  where p.id = p_program_id
    and p_program_id in (select public.user_program_ids());
$$;

revoke all on function public.program_seat_usage(uuid) from public;
-- Any member may read it. It returns three integers and names nobody, exactly
-- like `program_usage_total`.
grant execute on function public.program_seat_usage(uuid) to authenticated;

comment on column public.programs.seats is
  'How many accounts may hold a membership. Coach-managed profiles cost nothing until claimed. Not writable through update_program_settings.';
comment on function public.program_seat_usage(uuid) is
  'Seats, members holding one, and unexpired open invites reserving one.';
