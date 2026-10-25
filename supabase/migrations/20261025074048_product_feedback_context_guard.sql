-- submit_product_feedback(): the server decides the context, not the caller.
--
-- /pr-check's rls-boundary review of the first-match feedback branch: the
-- function is executable by `authenticated`, so a signed-in user can call it
-- from the browser and skip the route — and as first written it stored any
-- `p_context` the caller sent (any size, a forged "hours since the report")
-- and accepted an answer from someone who had never read a report. The
-- exposure was their own row only, but the internal alert mail reads the
-- hours from that context.
--
-- Now the function requires `users.first_report_seen_at` to be set (the
-- prompt is only ever shown after it is), refuses a context that is not a
-- JSON object or is over 4 KiB, and overwrites the two facts it can derive
-- itself — `first_report_seen_at` and `hours_since_first_report` — from the
-- caller's own row, so whatever arrives in `p_context` cannot misstate
-- them. The route still passes `last_sign_in_at`, which the function cannot
-- read for itself without reaching into auth.users.
--
-- Same signature, so `create or replace` is enough and no grant changes.
-- Applied to the live database on 2026-10-25 as version 20261025074048
-- (`product_feedback_context_guard`). VERIFIED the same day in a rolled-back
-- transaction as an authenticated user: refused before any report was read
-- (42501), refused a non-object and a 5 KB context (22023), and overwrote a
-- forged hours_since_first_report / first_report_seen_at with the row's own
-- values while keeping last_sign_in_at as sent.
--
-- Rollback: re-apply the function body from
-- 20261025063957_first_match_feedback.sql.

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
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_seen timestamptz;
begin
  if v_uid is null then
    raise exception 'submit_product_feedback: no signed-in user'
      using errcode = '42501';
  end if;

  if p_prompt is distinct from 'first_match' then
    raise exception 'submit_product_feedback: unknown prompt %', p_prompt
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_context) <> 'object' or pg_column_size(v_context) > 4096 then
    raise exception 'submit_product_feedback: context must be a small object'
      using errcode = '22023';
  end if;

  select first_report_seen_at into v_seen
    from public.users where id = v_uid;
  if v_seen is null then
    raise exception 'submit_product_feedback: no report read yet'
      using errcode = '42501';
  end if;

  v_context := v_context || jsonb_build_object(
    'first_report_seen_at', v_seen,
    'hours_since_first_report',
      round(extract(epoch from (now() - v_seen)) / 3600)::int
  );

  insert into public.product_feedback (user_id, prompt, rating, note, context)
  values (v_uid, p_prompt, p_rating, v_note, v_context);

  update public.users
     set first_match_feedback_done_at = now()
   where id = v_uid
     and first_match_feedback_done_at is null;
end;
$$;
