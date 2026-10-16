-- Close the two refund races the rls-boundary-reviewer re-review found.
--
-- 1. Deleting a job no longer hands any hours back, started or not.
--    `external_job_id` is written only after the vendor's POST returns, so
--    between the reservation and that write a player could delete their own
--    job (owner DELETE policy) and get the hours back while the vendor still
--    analysed the video. Nothing legitimate needs the refund: the jobs route
--    reserves and submits in one request and releases on every failure it
--    sees, and a queued job is cancelled through the cancel flow, which
--    releases properly. So a reservation stays spent unless the server
--    releases it — the rule Cj set ("deleted after analysis started keeps its
--    hours") with the window before the vendor answers closed too. The
--    trigger stays, as the one place this rule is written down.
--
-- 2. A full refund or dispute also expires the lot. `cap_video_credit` lowered
--    `remaining_seconds`, but a job holding that lot's seconds that later
--    failed would give them back through `release_processing_quota`, reviving
--    hours whose money was returned. An expired lot can be credited back but
--    never spent again (every reservation filters `expires_at > now()`).
create or replace function public.release_unstarted_job_quota()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Deliberately refunds nothing; see 20261016132127. The usage and spend
  -- rows outlive the job with job_id set null.
  return old;
end;
$function$;

revoke execute on function public.release_unstarted_job_quota()
  from public, anon, authenticated;

create or replace function public.cap_video_credit(
  p_payment_intent text,
  p_max_remaining integer
)
returns integer
language sql
security definer
set search_path to ''
as $function$
  update public.video_credits
     set remaining_seconds = least(remaining_seconds, greatest(0, p_max_remaining)),
         expires_at = case
           when coalesce(p_max_remaining, 0) <= 0 then least(expires_at, now())
           else expires_at
         end
   where stripe_payment_intent = p_payment_intent
  returning remaining_seconds;
$function$;

revoke execute on function public.cap_video_credit(text, integer)
  from public, anon, authenticated;
grant execute on function public.cap_video_credit(text, integer) to service_role;
