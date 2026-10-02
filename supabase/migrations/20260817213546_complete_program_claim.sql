-- Turn a verified magic-link click into ownership, atomically.
-- Applied live 2026-08-17 as version 20260817213546.
--
-- Three writes that must not half-apply: the claim row, the owner's membership,
-- and the program's status. Doing them as three round trips from the route was
-- the earlier shape, and an insert that succeeded followed by an update that
-- failed left a live claim on a program the directory still showed as
-- unclaimed — with the one-open-claim index then blocking the next legitimate
-- claimant for no visible reason.
--
-- SECURITY DEFINER because it writes tables with no write policies at all. The
-- authorization is the two guards below, not RLS.
create or replace function public.complete_program_claim(
  p_program_key   text,
  p_claimed_email text,
  p_claimant_name text,
  p_claimant_role text,
  p_domain_matched      boolean,
  p_skips_manual_review boolean,
  p_match_reason        text
)
returns table (program_id uuid, claim_status text, already_owned boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_email   text := (select auth.email());
  v_program public.programs%rowtype;
  v_status  text;
begin
  -- GUARD 1: authenticated. The whole point of this function is that nothing
  -- anonymous reaches these tables.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- GUARD 2: the caller proved THIS address. The claim is looked up by the
  -- session's email rather than anything in the URL, so there is no id to
  -- tamper with — but the submitted address rides in a cookie, which the
  -- client could in principle reach, so it is checked against the verified one
  -- here.
  if v_email is null or lower(v_email) <> lower(p_claimed_email) then
    raise exception 'claimed address does not match the verified session'
      using errcode = '42501';
  end if;

  select * into v_program from public.programs p where p.program_key = p_program_key;
  if not found then
    raise exception 'unknown program %', p_program_key using errcode = 'P0002';
  end if;

  -- Already the owner: clicking the link twice is ordinary, not an error.
  if v_program.owner_user_id = v_uid then
    return query select v_program.id, 'approved'::text, true;
    return;
  end if;

  if v_program.status <> 'unclaimed' then
    raise exception 'program is already being set up' using errcode = '23505';
  end if;

  -- Every claim reaches a human. A domain match records why it is low risk; it
  -- no longer decides on its own. At the pilot's own estimate of 5-15 decisions
  -- this is minutes of work, and it is what replaced mailing a program's
  -- scraped contacts on every claim.
  v_status := 'pending_review';

  insert into public.program_claims (
    program_id, claimant_user_id, claimed_email, claimant_name, claimant_role,
    domain_matched, skips_manual_review, match_reason, status
  ) values (
    v_program.id, v_uid, lower(p_claimed_email), p_claimant_name, p_claimant_role,
    p_domain_matched, p_skips_manual_review, p_match_reason, v_status
  );

  -- The claimant owns the workspace immediately. `pending_review` withholds
  -- video submission, not the workspace: they can invite staff and build a
  -- roster while the check happens, which is what /claim/review promises.
  insert into public.program_members (program_id, user_id, role, upload_enabled)
  values (v_program.id, v_uid, 'owner', true)
  on conflict (program_id, user_id) do nothing;

  -- Derived, not hand-written. `programStatusFor('pending_review')` is
  -- 'claim_pending'; keeping the mapping in one place is why that function
  -- exists.
  update public.programs
     set owner_user_id = v_uid,
         claimed_at    = now(),
         status        = 'claim_pending',
         updated_at    = now()
   where id = v_program.id;

  return query select v_program.id, v_status, false;
end;
$$;

revoke all on function public.complete_program_claim(text, text, text, text, boolean, boolean, text) from public;
grant execute on function public.complete_program_claim(text, text, text, text, boolean, boolean, text) to authenticated;

comment on function public.complete_program_claim(text, text, text, text, boolean, boolean, text) is
  'Verified magic-link click -> claim + owner membership + program status, atomically. Requires an authenticated session whose email matches the claim.';
