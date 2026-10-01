-- /admin/outreach, part two: edit the emails on the page and hold recipients.
--
-- outreach_templates holds an admin's own subject and HTML for one email of a
-- campaign. With no row the email renders from the copy in code
-- (src/lib/services/email/templates/outreach.ts); deleting the row is "reset
-- to original". Merge fields like {{school}} are filled in per recipient.
--
-- outreach_recipients.held keeps a row in the list but out of every send.

alter table public.outreach_recipients
  add column held boolean not null default false;

create table public.outreach_templates (
  campaign text not null,
  email_no smallint not null check (email_no between 1 and 99),
  subject text not null,
  html text not null,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (campaign, email_no)
);

comment on table public.outreach_templates is
  'Admin-edited subject and HTML per outreach email, edited on /admin/outreach. No row means the built-in copy. Server-only.';

alter table public.outreach_templates enable row level security;
revoke all on public.outreach_templates from anon, authenticated;
