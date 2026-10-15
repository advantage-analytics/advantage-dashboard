-- ask_examples_follow_feedback, serialised per (user, question). Two
-- concurrent retractions of the same user's thumbs-up on the same question
-- each saw the other's thumb still up in their snapshot, both took the
-- re-point branch, and the example survived pointing at a retracted answer.
-- A transaction-scoped advisory lock makes the second wait for the first to
-- commit; under READ COMMITTED its next statement then sees that commit.
-- Body otherwise unchanged from 20261015181529; `create or replace` keeps the
-- owner and grants.
--
-- Applied to the live database on 2026-10-15 as version 20261015204837
-- (`ask_examples_follow_feedback_serialised`). VERIFIED: SECURITY DEFINER,
-- search_path '', proacl {postgres,authenticated,service_role}=X unchanged,
-- body contains pg_advisory_xact_lock.

create or replace function public.ask_examples_follow_feedback()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_question text := old.question ->> 'text';
  v_scope text := case when old.program_id is null then 'personal' else 'team' end;
  v_next uuid;
begin
  if tg_op = 'UPDATE' and new.rating is not distinct from 'up' then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'ask_examples_follow_feedback:' || old.user_id::text || ':'
        || v_scope || ':' || coalesce(md5(v_question), old.message_id::text),
      0
    )
  );

  -- The newest thumbs-up of the same user on the same question in the same
  -- scope that is still up (this row is excluded: deleted, or no longer up).
  select f.message_id
    into v_next
    from public.ask_feedback f
   where f.user_id = old.user_id
     and f.message_id <> old.message_id
     and f.rating = 'up'
     and v_question is not null
     and f.question ->> 'text' = v_question
     and (f.program_id is null) = (old.program_id is null)
   order by f.updated_at desc
   limit 1;

  if v_next is null then
    delete from public.ask_examples e
     where e.source = 'feedback'
       and (e.message_id = old.message_id
            or (v_question is not null
                and e.user_id = old.user_id
                and e.scope = v_scope
                and md5(e.question) = md5(v_question)));
  else
    -- Still taught by a thumb that stands: keep the example, name that answer.
    update public.ask_examples e
       set message_id = v_next,
           updated_at = now()
     where e.source = 'feedback'
       and e.message_id = old.message_id;
  end if;
  return null;
end;
$function$;
