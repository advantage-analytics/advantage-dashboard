-- Program invites — how everyone who is not the claimant gets in.
-- Applied live 2026-08-17 as version 20260817073957.
--
-- Program, team and role are fixed by the inviter and NOT editable by the
-- invitee: the acceptance screen asks for a name and a password and nothing
-- else. An invited assistant coach should be inside in under thirty seconds,
-- and every extra field is a place for someone to give themselves a role the
-- owner did not intend.

create table if not exists public.program_invites (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs(id) on delete cascade,
  -- Stored lowercased by the application. The invite is bound to this address:
  -- accepting from a different one is a distinct, designed error state, not a
  -- silent re-bind.
  email            text not null,
  role             text not null,
  upload_enabled   boolean not null default false,
  -- Hashed like the claim token, for the same reason.
  token_hash       text not null,
  invited_by       uuid references public.users(id) on delete set null,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_user_id uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.program_invites
  drop constraint if exists program_invites_role_check;
alter table public.program_invites
  add constraint program_invites_role_check
  check (role in ('coach', 'staff', 'player'));

-- Owner is deliberately absent from that list. Ownership moves by transfer, not
-- by invitation — a program with two owners has no answer to "who decides".

-- One outstanding invite per address per program. Re-inviting someone should
-- refresh the existing row rather than leave two live tokens, either of which
-- would work.
create unique index if not exists program_invites_open_email_key
  on public.program_invites (program_id, lower(email))
  where accepted_at is null;

-- Acceptance looks the invite up by token hash and nothing else.
create unique index if not exists program_invites_token_key
  on public.program_invites (token_hash);

create index if not exists program_invites_program_idx
  on public.program_invites (program_id);

alter table public.program_invites enable row level security;

grant select on public.program_invites to authenticated;

-- Staff can see the invites they have sent, so the members screen can show
-- who is outstanding. Invitees do not read this table at all — acceptance goes
-- through a server route holding the raw token, which is the only thing that
-- proves they are the intended recipient.
drop policy if exists "Program staff can read invites" on public.program_invites;
create policy "Program staff can read invites"
  on public.program_invites for select
  using (public.is_program_staff(program_id));

comment on table public.program_invites is
  'Outstanding and accepted program invitations. Role is fixed by the inviter and never editable by the invitee.';
