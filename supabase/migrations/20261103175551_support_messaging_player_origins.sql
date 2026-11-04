-- support_messaging_player_origins
--
-- send_support_message() accepted every origin the support_threads check
-- allows, so a player calling it directly could start their own thread as
-- 'admin' ("Started by Advantage") or 'first_match_feedback' and misfile it in
-- Admin › Messages. A player can now name only the places a player starts
-- from: account_menu, match_report, help. 'first_match_feedback' belongs to
-- the product_feedback trigger (support_messaging_triggers) and 'admin' to
-- staff, both of which write the table directly, so the table's check keeps
-- all five.
--
-- `create or replace` with the same signature keeps the function's grants
-- (authenticated + service_role; not public or anon) — verified after apply.
-- Every other line of the body is unchanged from 20261103055820.
--
-- Rollback: re-apply send_support_message from 20261103055820, whose origin
-- check lists all five.

create or replace function public.send_support_message(
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

  -- Only the places a player can start from. 'first_match_feedback' is the
  -- feedback trigger's and 'admin' is staff's; a player naming either would
  -- misfile their own thread under "Started from".
  if p_origin is null or p_origin not in ('account_menu', 'match_report', 'help') then
    raise exception 'send_support_message: unknown origin %', p_origin
      using errcode = '22023';
  end if;
  if p_topic is not null and p_topic not in
     ('match', 'upload', 'billing', 'team', 'idea', 'other') then
    raise exception 'send_support_message: unknown topic %', p_topic
      using errcode = '22023';
  end if;

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
