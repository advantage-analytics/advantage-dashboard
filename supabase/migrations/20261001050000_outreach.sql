-- Outreach sent from /admin/outreach.
--
-- Two tables, both server-only (RLS on, no policies, no grants beyond the
-- service role): the recipient list an admin imported and reviewed, and one
-- row per send attempt. The list is imported from CSV through the admin page
-- rather than seeded here, because this repository is public and the rows are
-- people's addresses.

create table public.outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign text not null,
  email_no smallint not null check (email_no between 1 and 99),
  -- Program keys joined by ';' for program mail, the lower-cased address for
  -- mail to one person. What makes a re-import an update rather than a copy.
  row_key text not null,
  label text not null,
  division text,
  conference text,
  to_name text,
  to_last_name text,
  to_role text,
  to_email text not null,
  -- [{ "name": "...", "email": "..." }], head coach's staff.
  cc jsonb not null default '[]'::jsonb,
  program_keys text[] not null default '{}',
  -- Per-email extras: first_name, plan, program, first_send_resend_id, note.
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign, email_no, row_key)
);

comment on table public.outreach_recipients is
  'Reviewed outreach lists, imported from CSV on /admin/outreach. Server-only: no RLS policy and no grant.';

create table public.outreach_sends (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.outreach_recipients (id) on delete cascade,
  campaign text not null,
  -- Not always the recipient's own email_no: the day-7 follow-up (8) goes to
  -- the cold-outreach (7) rows.
  email_no smallint not null,
  status text not null check (status in ('sending', 'sent', 'scheduled', 'cancelled', 'failed', 'test')),
  resend_id text,
  to_email text not null,
  cc text[] not null default '{}',
  subject text not null,
  scheduled_at timestamptz,
  sent_by uuid references public.users (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.outreach_sends is
  'One row per outreach send attempt. At most one live (sending/sent/scheduled) row per recipient and email. Server-only.';

create index outreach_sends_recipient_idx on public.outreach_sends (recipient_id);
create index outreach_sends_campaign_idx on public.outreach_sends (campaign, email_no);

-- The guard against sending the same email to the same program twice. A send
-- claims its slot by inserting a 'sending' row BEFORE it calls Resend, so two
-- tabs pressing Send at once cannot both get through; a failed or cancelled
-- send frees the slot.
create unique index outreach_sends_one_live
  on public.outreach_sends (recipient_id, email_no)
  where status in ('sending', 'sent', 'scheduled');

alter table public.outreach_recipients enable row level security;
alter table public.outreach_sends enable row level security;

revoke all on public.outreach_recipients from anon, authenticated;
revoke all on public.outreach_sends from anon, authenticated;
