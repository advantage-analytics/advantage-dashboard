-- First-match feedback: one question, asked once, after a player has read
-- their first match report and come back to the dashboard.
--
-- Two `users` stamps, read by the dashboard layout's existing `users` select
-- (`getWorkspaceContext`) exactly as the tour and hint columns are:
--
--   first_report_seen_at          when the player first opened a published
--                                 report of a personal match they filed. The
--                                 match page stamps it server-side
--                                 (`markFirstReportSeen`); null = not yet.
--   first_match_feedback_done_at  when the prompt was answered or dismissed.
--                                 Answered: submit_product_feedback() below,
--                                 in the same transaction as the row.
--                                 Dismissed: markTourDone("first-match-feedback")
--                                 through TOUR_COLUMN (src/lib/onboarding/tours.ts).
--
-- The column grant travels with the ALTERs: public.users has column-scoped
-- UPDATE since 20260914100000_users_block_admin_self_update.sql, and a column
-- added without being named in a grant fails every client write with
-- "permission denied for table users" before RLS gets a say
-- (20261012224442_users_onboarding_hints.sql tells the story).
--
-- The answer itself lives in `product_feedback`: one row per (user, prompt),
-- a 1–5 rating, an optional note of up to 1000 characters, and a jsonb
-- context the route fills (when the first report was seen, how long ago).
-- `prompt` is an enumerated text so a later question can share the table.
-- Owner-only reads and NO write policy: the one write is
-- submit_product_feedback(), security definer, which inserts the row and
-- stamps users.first_match_feedback_done_at together. A second answer to the
-- same prompt is refused by the unique (23505), which the route reads as
-- "already answered". Nothing for anon or public; service_role reads all of
-- it, for the admin reader that follows.
--
-- Applied to the live database on 2026-10-25 as version 20261025063957
-- (`first_match_feedback`). VERIFIED the same day in a rolled-back
-- transaction as two real accounts (`set_config` role + jwt claims): the
-- function inserts the row with the trimmed note and the context and stamps
-- the column in one call; a second answer is refused (23505); a direct
-- insert is refused (42501); an unknown prompt (22023) and a rating of 6
-- (23514) are refused; the owner reads their one row and another signed-in
-- user reads none; with no signed-in user the call is refused (42501).
--
-- Rollback:
--   drop function if exists public.submit_product_feedback(text, smallint, text, jsonb);
--   drop table if exists public.product_feedback;
--   revoke update (first_report_seen_at, first_match_feedback_done_at)
--     on public.users from authenticated;
--   alter table public.users drop column if exists first_report_seen_at;
--   alter table public.users drop column if exists first_match_feedback_done_at;

alter table public.users add column if not exists first_report_seen_at timestamptz;

alter table public.users add column if not exists first_match_feedback_done_at timestamptz;

grant update (first_report_seen_at, first_match_feedback_done_at)
  on public.users to authenticated;

comment on column public.users.first_report_seen_at is
  'When the player first opened a published report of a personal match they filed (stamped by the match page). NULL = not yet.';

comment on column public.users.first_match_feedback_done_at is
  'When the first-match feedback prompt was answered (submit_product_feedback) or dismissed (markTourDone). NULL = may still be asked.';

create table if not exists public.product_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  prompt      text not null check (prompt in ('first_match')),
  rating      smallint not null check (rating between 1 and 5),
  note        text check (note is null or char_length(note) between 1 and 1000),
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, prompt)
);

comment on table public.product_feedback is
  'One answer per (user, prompt) to a product question asked once in the dashboard: a 1–5 rating, an optional note, and the context the route recorded. Written only by submit_product_feedback().';

create index if not exists product_feedback_created_idx
  on public.product_feedback (created_at desc);

alter table public.product_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'product_feedback'
       and policyname = 'product_feedback_select'
  ) then
    create policy product_feedback_select on public.product_feedback
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end
$$;

revoke all on public.product_feedback from public, anon, authenticated;
grant select on public.product_feedback to authenticated;
grant all on public.product_feedback to service_role;

-- Save the caller's answer to one prompt and stamp the prompt done, together.
-- Refuses a call with no signed-in user (42501) and a prompt the table does
-- not know (22023); the rating range and the note's length are the table's
-- own checks, so a bad value is refused there (23514).
create or replace function public.submit_product_feedback(
  p_prompt text,
  p_rating smallint,
  p_note text default null,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'submit_product_feedback: no signed-in user'
      using errcode = '42501';
  end if;

  if p_prompt is distinct from 'first_match' then
    raise exception 'submit_product_feedback: unknown prompt %', p_prompt
      using errcode = '22023';
  end if;

  insert into public.product_feedback (user_id, prompt, rating, note, context)
  values (v_uid, p_prompt, p_rating, v_note, coalesce(p_context, '{}'::jsonb));

  update public.users
     set first_match_feedback_done_at = now()
   where id = v_uid
     and first_match_feedback_done_at is null;
end;
$$;

comment on function public.submit_product_feedback(text, smallint, text, jsonb) is
  'Saves the signed-in user''s answer to one product prompt (product_feedback) and stamps users.first_match_feedback_done_at in the same transaction. A second answer is refused by the unique.';

revoke execute on function public.submit_product_feedback(text, smallint, text, jsonb) from public, anon;
grant execute on function public.submit_product_feedback(text, smallint, text, jsonb) to authenticated, service_role;
