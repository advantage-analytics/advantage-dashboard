-- A refund or dispute takes away a purchase's UNSPENT hours.
--
-- `revokeCreditsForCharge()` (services/credits/checkout.ts) computes how much
-- of the pack is still paid for and calls this to lower the lot to at most
-- that, in one statement: a reservation holding the row's lock finishes
-- first, and a redelivered event computes the same cap and changes nothing.
-- Hours already spent stay spent. Service role only, like every quota
-- function. Returns the lot's remaining seconds, or null with no such lot.
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
     set remaining_seconds = least(remaining_seconds, greatest(0, p_max_remaining))
   where stripe_payment_intent = p_payment_intent
  returning remaining_seconds;
$function$;

revoke execute on function public.cap_video_credit(text, integer)
  from public, anon, authenticated;
grant execute on function public.cap_video_credit(text, integer) to service_role;
