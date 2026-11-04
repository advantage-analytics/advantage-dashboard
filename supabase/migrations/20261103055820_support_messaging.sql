-- In-app player messaging (T1): one private support thread per player.
--
-- Design canvas "Player Messaging". A player writes to the Advantage team
-- from inside the app; staff reply from the admin console. Decisions:
--
--   * One thread per player (`support_threads.user_id` is unique), private
--     to that player — a coach never sees it, so there is no program-scoped
--     policy. Staff replies land through the service role (T5), so there is
--     no staff policy either: `is_admin` users are not special here.
--   * `support_messages.author_name` is the staff member's first name
--     snapshotted at send. The player's loader runs as the player, and
--     users' RLS would not let it read a staff member's row; a player row
--     leaves it null (the check enforces that).
--   * The player's only write path is `send_support_message()`. It creates
--     the thread on first use (origin = where the composer was opened), always
--     writes `author_role = 'player'` and `author_id = auth.uid()`, and refuses:
--     a signed-out caller (42501); a blank or over-4000-character body
--     (22023); an unknown origin or topic (22023); a match the caller cannot
--     see (42501) — visible means `matches.created_by = auth.uid()` or
--     `player1_id` / `player2_id` in `public.my_player_ids()`, which resolves
--     both id spaces the player columns hold (the login uid and a claimed
--     `program_players.id`); and the 21st player message in any rolling hour
--     (`support_rate_limited`, P0001 — the number is ours, the author named
--     none). The thread row is locked `for update` so two concurrent sends
--     count the same window.
--   * `mark_support_thread_read()` stamps the caller's `player_read_at`.
--   * The after-insert trigger stamps `last_player_message_at` /
--     `last_staff_message_at` by `author_role`; an 'event' row stamps neither.
--
-- RLS: enabled on both tables with exactly one policy each — SELECT to
-- authenticated where the thread's user_id is the caller (messages through
-- their thread). No INSERT / UPDATE / DELETE policy for any role; the two
-- functions are security definer and the service role bypasses RLS.
--
-- Applied to the live database on 2026-11-03 as version 20261103055820
-- (`support_messaging`). Post-apply information_schema.role_table_grants:
--
--   support_messages  authenticated  SELECT
--   support_messages  postgres       DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   support_messages  service_role   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   support_threads   authenticated  SELECT
--   support_threads   postgres       DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   support_threads   service_role   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- Nothing for anon (the default-grants sweep gives a new table no anon
-- privilege, and the explicit revoke above makes it so regardless). Function
-- execute: send_support_message and mark_support_thread_read to authenticated
-- and service_role only (anon false); the trigger function to service_role
-- only. The trigger runs as whichever role inserts — the security-definer
-- sender (the owner) or the service role, both of which may update threads;
-- a role granted INSERT on support_messages later would also need UPDATE on
-- support_threads for the stamp.
--
-- VERIFIED the same day in a rolled-back transaction as an authenticated
-- user: a send with the caller's own match succeeds and creates one thread
-- whose origin is the first send's; blank, 4001-character and unknown-origin
-- bodies are refused 22023; a random match id and another user's match id
-- are refused 42501; a direct insert into support_messages as authenticated
-- is refused 42501 (no policy, so RLS denies the write); sends 2–20 succeed
-- and the 21st raises `support_rate_limited`; a second user reading both
-- tables sees zero rows; a signed-out call is refused 42501.
-- tests/support-messaging-rls.spec.ts proves the same through PostgREST.
--
-- Rollback:
--   drop function public.mark_support_thread_read();
--   drop function public.send_support_message(text, text, uuid, text);
--   drop table public.support_messages;   -- drops its trigger
--   drop function public.support_messages_stamp_thread();
--   drop table public.support_threads;

create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  origin text not null check (
    origin in ('first_match_feedback', 'account_menu', 'match_report', 'help', 'admin')
  ),
  last_player_message_at timestamptz,
  last_staff_message_at timestamptz,
  player_read_at timestamptz,
  staff_read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  author_role text not null check (author_role in ('player', 'staff', 'event')),
  -- The staff member's first name, snapshotted at send: the player's loader
  -- runs as the player, and users' RLS would not let it read a staff row.
  author_name text check (author_role <> 'player' or author_name is null),
  body text not null check (length(body) <= 4000 and btrim(body) <> ''),
  topic text check (topic in ('match', 'upload', 'billing', 'team', 'idea', 'other')),
  match_id uuid references public.matches(id) on delete set null,
  email_copy_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index support_messages_thread_created_idx
  on public.support_messages (thread_id, created_at);
create index support_messages_author_idx on public.support_messages (author_id);
create index support_messages_match_idx on public.support_messages (match_id);

-- Stamp the thread on every insert, by who wrote. An 'event' row stamps
-- nothing: it is a system line, not a message anyone is waiting on.
create function public.support_messages_stamp_thread()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_role = 'player' then
    update public.support_threads
       set last_player_message_at = greatest(coalesce(last_player_message_at, new.created_at), new.created_at)
     where id = new.thread_id;
  elsif new.author_role = 'staff' then
    update public.support_threads
       set last_staff_message_at = greatest(coalesce(last_staff_message_at, new.created_at), new.created_at)
     where id = new.thread_id;
  end if;
  return new;
end;
$$;
revoke all on function public.support_messages_stamp_thread() from public, anon, authenticated;

create trigger support_messages_stamp_thread
  after insert on public.support_messages
  for each row execute function public.support_messages_stamp_thread();

-- RLS: the player reads their own thread; nobody inserts, updates or
-- deletes through a policy. Writes come only through the two functions
-- below (as the player) and the service role (staff replies, T5).
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

revoke all on public.support_threads from public, anon, authenticated, service_role;
revoke all on public.support_messages from public, anon, authenticated, service_role;
grant select on public.support_threads to authenticated;
grant select on public.support_messages to authenticated;
grant all on public.support_threads to service_role;
grant all on public.support_messages to service_role;

create policy support_threads_own_read on public.support_threads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy support_messages_own_thread_read on public.support_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_threads t
       where t.id = support_messages.thread_id
         and t.user_id = (select auth.uid())
    )
  );

-- The player's one door for writing: creates the thread on first use,
-- always as 'player' and always as the caller.
create function public.send_support_message(
  p_body text,
  p_topic text,
  p_match_id uuid,
  p_origin text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_thread_id uuid;
  v_recent integer;
  v_message_id uuid;
begin
  if v_uid is null then
    raise exception 'send_support_message: no signed-in user'
      using errcode = '42501';
  end if;

  if v_body = '' then
    raise exception 'send_support_message: message is blank'
      using errcode = '22023';
  end if;
  if length(v_body) > 4000 then
    raise exception 'send_support_message: message is over 4000 characters'
      using errcode = '22023';
  end if;

  if p_origin is null or p_origin not in
     ('first_match_feedback', 'account_menu', 'match_report', 'help', 'admin') then
    raise exception 'send_support_message: unknown origin %', p_origin
      using errcode = '22023';
  end if;
  if p_topic is not null and p_topic not in
     ('match', 'upload', 'billing', 'team', 'idea', 'other') then
    raise exception 'send_support_message: unknown topic %', p_topic
      using errcode = '22023';
  end if;

  -- A match may be attached only when the caller can see it: they recorded
  -- it, or they are one of its players in either id space (the login, or a
  -- claimed program_players row — public.my_player_ids() resolves both).
  if p_match_id is not null and not exists (
    select 1
      from public.matches m
     where m.id = p_match_id
       and (
         m.created_by = v_uid
         or m.player1_id in (select public.my_player_ids())
         or m.player2_id in (select public.my_player_ids())
       )
  ) then
    raise exception 'send_support_message: match not found'
      using errcode = '42501';
  end if;

  insert into public.support_threads (user_id, origin)
  values (v_uid, p_origin)
  on conflict (user_id) do nothing;

  -- Lock the thread so two concurrent sends count the same window.
  select id into v_thread_id
    from public.support_threads
   where user_id = v_uid
   for update;

  select count(*) into v_recent
    from public.support_messages
   where thread_id = v_thread_id
     and author_role = 'player'
     and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'support_rate_limited'
      using errcode = 'P0001',
            detail = 'At most 20 messages an hour; try again later.';
  end if;

  insert into public.support_messages
    (thread_id, author_id, author_role, author_name, body, topic, match_id)
  values
    (v_thread_id, v_uid, 'player', null, v_body, p_topic, p_match_id)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

revoke all on function public.send_support_message(text, text, uuid, text) from public, anon;
grant execute on function public.send_support_message(text, text, uuid, text) to authenticated, service_role;

create function public.mark_support_thread_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.support_threads
     set player_read_at = now()
   where user_id = (select auth.uid());
$$;

revoke all on function public.mark_support_thread_read() from public, anon;
grant execute on function public.mark_support_thread_read() to authenticated, service_role;
