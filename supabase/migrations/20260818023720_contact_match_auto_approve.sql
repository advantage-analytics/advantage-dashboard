-- Auto-approve a claim when the address is one we already recorded for that
-- exact program. Applied live 2026-08-18 as version 20260818023720.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- The original design auto-approved on a DOMAIN match and protected that with
-- an announcement: every other scraped contact on the program got an email
-- naming the claimant, with a one-click objection link. Cutting the
-- announcement (unsolicited bulk mail to scraped addresses) removed the only
-- thing that could ever produce an objection, so `objection_window` would have
-- meant "approved silently, forever, with no check". Rather than ship that,
-- 20260817213546 collapsed the completion RPC to always land on
-- `pending_review`.
--
-- That was the safe move, not the right one. It routes every coach through a
-- human even when the evidence is stronger than a domain match ever was, and
-- it contradicts /claim/review's own promise that "a recognized address never
-- sees this page at all".
--
-- ── The signal that stands on its own ───────────────────────────────────────
-- A domain match says "someone at this school" — a student, an alum with a
-- lifetime address, a professor in the chemistry department. An EXACT match
-- against `program_contacts` says "the person listed on this team's staff
-- page". That is identity evidence, and unlike a domain match it does not need
-- an announcement standing behind it.
--
-- Coverage: 1,842 of 1,940 programs (95%) have at least one non-freemail
-- contact; 3,075 of 3,117 recorded addresses qualify.
--
-- `domain_matched` and `skips_manual_review` are still recorded, and still
-- shown to a reviewer as evidence. They no longer decide anything.
--
-- ── The guard ───────────────────────────────────────────────────────────────
-- `not is_freemail`. A gmail address on a staff page is a normal thing for a
-- D2/D3/NAIA coach to have, but it is weaker evidence and likelier to be
-- personal and stale. Those 42 addresses route to review; they are not
-- rejected.
--
-- The match is scoped to `program_id`, so a contact recorded for the women's
-- team does not approve a claim on the men's.
--
-- ── The risk, and why the window stays open ─────────────────────────────────
-- The dataset's own warning: 17 of 18 duplicated coaches had changed schools
-- inside two months. That cuts both ways, and the harmless direction is the
-- common one — a newly hired coach is not on the page yet, so they fall to
-- review and a human approves them. The real exposure is a DEPARTED coach
-- claiming the program they left.
--
-- So an auto-approved claim lands on `objection_window`, not `approved`. Both
-- derive to a program status of `active` and both allow video, so this costs
-- the claimant nothing. The difference is in the state machine: `object` is a
-- legal transition out of `objection_window` and an illegal one out of
-- `approved`. Keeping the claim in the window keeps that door open for exactly
-- the case above, reachable from the program's public status screen.
--
-- Nothing settles the window to `approved` today — there is no scheduled job,
-- and adding one would change no capability. `objection_window_ends_at` is
-- recorded so a future settle has a date to read rather than one to invent.
--
-- ── Why the return type changed to jsonb ────────────────────────────────────
-- 20260817213546 declared `returns table (program_id uuid, ...)`. In plpgsql an
-- OUT parameter is a variable, and `program_id` then collides with the column
-- of the same name inside
--
--   on conflict (program_id, user_id) do nothing
--
-- which is an expression context, not a column list. Postgres raises
--
--   42702: column reference "program_id" is ambiguous
--
-- at RUNTIME — `create function` accepts it happily, so the bug was invisible
-- until the function was actually called. It never was: the claim flow has
-- never been run end to end, and `program_claims` has zero rows. Every claim
-- would have failed at the final step.
--
-- Returning a single `jsonb` removes the OUT parameters, and with them the
-- entire class of collision. The caller reads one object instead of a row.

-- Which signal approved this claim. The one that decides.
alter table public.program_claims
  add column if not exists contact_matched boolean not null default false;

comment on column public.program_claims.contact_matched is
  'The claimed address is a recorded non-freemail contact for this exact program. The only signal that auto-approves.';

drop function if exists public.complete_program_claim(text, text, text, text, boolean, boolean, text);

create function public.complete_program_claim(
  p_program_key   text,
  p_claimed_email text,
  p_claimant_name text,
  p_claimant_role text,
  p_domain_matched      boolean,
  p_skips_manual_review boolean,
  p_match_reason        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_email   text := (select auth.email());
  v_program public.programs%rowtype;
  v_claim   public.program_claims%rowtype;
  v_status  text;
  v_contact boolean;
  v_ends_at timestamptz;
begin
  -- GUARD 1: authenticated. The whole point of this function is that nothing
  -- anonymous reaches these tables.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- GUARD 2: the caller proved THIS address. The claim is looked up by the
  -- session's email rather than anything in the URL, so there is no id to
  -- tamper with — but the submitted address rides in a cookie, which the client
  -- could in principle reach, so it is checked against the verified one here.
  if v_email is null or lower(v_email) <> lower(p_claimed_email) then
    raise exception 'claimed address does not match the verified session'
      using errcode = '42501';
  end if;

  select * into v_program from public.programs p where p.program_key = p_program_key;
  if not found then
    raise exception 'unknown program %', p_program_key using errcode = 'P0002';
  end if;

  -- Already the owner: clicking the link twice is ordinary, not an error. The
  -- real claim is echoed back so the caller routes to the same screen it would
  -- have the first time.
  if v_program.owner_user_id = v_uid then
    select * into v_claim
      from public.program_claims c
     where c.program_id = v_program.id
       and c.claimant_user_id = v_uid
     order by c.created_at desc
     limit 1;

    return jsonb_build_object(
      'program_id',      v_program.id,
      'status',          coalesce(v_claim.status, 'approved'),
      'already_owned',   true,
      'contact_matched', coalesce(v_claim.contact_matched, false)
    );
  end if;

  if v_program.status <> 'unclaimed' then
    raise exception 'program is already being set up' using errcode = '23505';
  end if;

  -- THE DECISION. Against the verified session address, scoped to this program.
  --
  -- Reads a table with no policies and no grants, which is the reason this
  -- function is SECURITY DEFINER. What leaves is a boolean: the contact list
  -- never crosses the wire, and no client can ask "is this address on staff?"
  -- — which would be an enumeration oracle over 3,117 real people's work
  -- addresses.
  select exists (
    select 1
      from public.program_contacts c
     where c.program_id = v_program.id
       and lower(c.email) = lower(p_claimed_email)
       and not c.is_freemail
  ) into v_contact;

  if v_contact then
    v_status  := 'objection_window';
    v_ends_at := now() + interval '24 hours';  -- OBJECTION_WINDOW_HOURS
  else
    v_status  := 'pending_review';
    v_ends_at := null;
  end if;

  insert into public.program_claims (
    program_id, claimant_user_id, claimed_email, claimant_name, claimant_role,
    domain_matched, skips_manual_review, contact_matched, match_reason,
    status, objection_window_ends_at
  ) values (
    v_program.id, v_uid, lower(p_claimed_email), p_claimant_name, p_claimant_role,
    p_domain_matched, p_skips_manual_review, v_contact,
    case
      when v_contact then 'recorded staff contact for this program - approved automatically'
      else p_match_reason
    end,
    v_status, v_ends_at
  );

  -- The claimant owns the workspace either way. `pending_review` withholds
  -- video submission, not the workspace: they can invite staff and build a
  -- roster while the check happens, which is what /claim/review promises.
  insert into public.program_members as m (program_id, user_id, role, upload_enabled)
  values (v_program.id, v_uid, 'owner', true)
  on conflict (program_id, user_id) do nothing;

  -- Derived, not hand-written. `programStatusFor('objection_window')` is
  -- 'active' and `programStatusFor('pending_review')` is 'claim_pending';
  -- keeping that mapping in one place is why the function exists.
  update public.programs
     set owner_user_id = v_uid,
         claimed_at    = now(),
         status        = case when v_contact then 'active' else 'claim_pending' end,
         updated_at    = now()
   where id = v_program.id;

  return jsonb_build_object(
    'program_id',      v_program.id,
    'status',          v_status,
    'already_owned',   false,
    'contact_matched', v_contact
  );
end;
$$;

revoke all on function public.complete_program_claim(text, text, text, text, boolean, boolean, text) from public;
grant execute on function public.complete_program_claim(text, text, text, text, boolean, boolean, text) to authenticated;

comment on function public.complete_program_claim(text, text, text, text, boolean, boolean, text) is
  'Verified magic-link click -> claim + owner membership + program status, atomically. Auto-approves when the address is a recorded non-freemail contact for this exact program; everything else routes to review.';
