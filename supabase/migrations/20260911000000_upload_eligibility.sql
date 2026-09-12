-- Upload eligibility on direct writes (T14).
--
-- WHAT THIS CLOSES. `matches_block_client_regraft` already refuses a client
-- that files a match under a program it is not in, attaches a line it does
-- not run, or attributes `player1_id` to somebody who is on neither
-- `program_players` nor `program_members` for that program. It is blind to
-- two things the upload contract (`src/lib/workspace/upload-eligibility.ts`)
-- decides on the client and that nothing enforces once a request bypasses the
-- wizard:
--   1. ROLE of the attribution. A coach's own `program_members` row satisfies
--      the membership arm, so a staff login can be written as the athlete —
--      which hands that coach the athlete's read access (`player1_id` is half
--      the `matches` SELECT policy) and files the match under the wrong person.
--   2. APPROVAL of the program. `programs.status = 'claim_pending'` (and
--      `suspended` / `unclaimed`) is never consulted, so a member of a program
--      still waiting on its claim can record a match for it.
-- Plus the ladder `programs.upload_policy` and a player's own
-- `program_members.upload_enabled`, which only the page checked.
--
-- ONE RULE, THREE SEAMS. `upload_eligibility_refusal()` is the database's
-- reading of the five questions in `upload-eligibility.ts`, in the same order
-- and with the same sentences, so a refusal here reads as the one the wizard
-- would have shown. It is asked at each transition that turns a row into an
-- upload, for the row the transition is about, by the login making it:
--   - `matches` INSERT of an upload-shaped row (source_provider set, or
--     analysis_method other than 'manual'), and an UPDATE that turns a
--     manual row into one — extending the regraft trigger, whose other rules
--     are unchanged.
--   - `processing_jobs` INSERT — the video transition. The wizard's
--     "existing match" path (a scheduled line whose row was recorded by hand)
--     never inserts a match; this is the write that attaches the video.
--   - `match_files` INSERT — the same transition for a SwingVision import.
--
-- WHAT IT LEAVES ALONE, on purpose. A manual score-only entry
-- (`analysis_method = 'manual'`, `source_provider` null — `recordScore` in
-- `src/lib/schedule/actions.ts`) keeps today's rules, because its athlete is
-- the line's first `player_user_ids` entry, which may legitimately be a staff
-- login, and it is not an upload. Reads are untouched. UPDATEs that do not
-- turn a row into an upload are untouched. Service-role sessions (edge
-- functions, webhooks, cron) skip every check, as they skip the regraft
-- trigger's. `event_entry_id` keeps its existing staff-only rule. A null
-- `player1_id` still passes (a doubles line or a hand-typed name is a real
-- answer — see the wizard's `MatchMetadata.playerId`); the database refuses
-- WRONG attributions, and leaves "an athlete is required" to the page.
--
-- ATHLETE IDS accepted for a team upload, mirroring `RosterIdentity`: a live
-- `program_players` row of this program (not archived, not merged) — which is
-- what an owner who holds a genuine player profile writes — or a login id that
-- is either a player-role member here or the claimant of a live profile here
-- (an older row's era of id). A login that is only staff is refused.
--
-- LOCAL VERIFICATION IS NOT A PRODUCTION PROOF. `tests/upload-write-
-- eligibility.spec.ts` runs this file against a local Docker stack seeded from
-- `tests/fixtures/local-supabase/live-baseline.sql`, a RECONSTRUCTION of the
-- live objects this migration touches, transcribed on 2026-09-11 — because
-- `supabase/migrations/` cannot bootstrap a database. Green there proves the
-- file applies over those definitions and behaves as written; it does not
-- prove behaviour on the live schema. Re-read the live function and policies
-- before applying.
--
-- APPLICATION. Not applied by the task that wrote it. To apply: re-inspect
-- live (`pg_get_functiondef('public.matches_block_client_regraft'::regproc)`
-- must still equal the body in 20260824211820_matches_bound_program_attribution.sql,
-- and `programs.upload_policy`, `program_members.upload_enabled`,
-- `program_players.archived_at` / `merged_into_id` / `claimed_by_user_id` must
-- exist), then run this file as one transaction through the Supabase MCP
-- `apply_migration` or the SQL editor, then confirm with the query at the
-- bottom of this file. It takes a brief ACCESS EXCLUSIVE lock on `matches`,
-- `processing_jobs` and `match_files` to (re)create triggers.
--
-- ROLLBACK. The reverse block at the bottom of this file (commented) drops the
-- two new triggers, the transition guard, the shape helper and the refusal
-- function, and recreates the regraft trigger on its previous column list;
-- then re-run the `create or replace function public.matches_block_client_regraft()`
-- from 20260824211820_matches_bound_program_attribution.sql to restore the
-- previous body. No data changes to undo.

-- ---------------------------------------------------------------------------
-- 1. Which rows are uploads.
-- ---------------------------------------------------------------------------

create or replace function public.match_is_upload_shaped(
  p_source_provider text,
  p_analysis_method text
) returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Every row the wizard writes carries a provider ('swing-vision',
  -- 'splitstep', ...) or a non-manual method ('elc', 'ai'). A hand-recorded
  -- score carries neither: `source_provider` null, `analysis_method`
  -- 'manual'. Nulls on both sides are treated as an upload, not as manual —
  -- a client that omits both is not thereby recording a score.
  select p_source_provider is not null
      or p_analysis_method is distinct from 'manual';
$$;

comment on function public.match_is_upload_shaped(text, text) is
  'True when a matches row is an upload (a provider is named, or analysis_method is not ''manual''). A hand-recorded score is the only non-upload shape.';

-- ---------------------------------------------------------------------------
-- 2. The rule. NULL = eligible; otherwise one sentence for the person.
-- ---------------------------------------------------------------------------

create or replace function public.upload_eligibility_refusal(
  p_program_id uuid,
  p_player1_id uuid,
  p_created_by uuid,
  p_uploader   uuid
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program record;
  v_member  record;
  v_name    text;
  v_policy  text;
  v_may     boolean;
begin
  if p_uploader is null then
    return 'Sign in to record a match.';
  end if;

  -- 1 · WORKSPACE, personal. The uploader is the athlete, by definition
  --     (`upload-eligibility.ts`, question 5): the row is the uploader's own,
  --     and if it names an athlete it names them. There is no claim, policy or
  --     roster to ask about.
  if p_program_id is null then
    if p_created_by is distinct from p_uploader then
      return 'A personal match can only be uploaded by the account that recorded it.';
    end if;
    if p_player1_id is not null and p_player1_id <> p_uploader then
      return 'A personal match is recorded against your own account.';
    end if;
    return null;
  end if;

  -- 1 · WORKSPACE, team. Not a member = no workspace, the same sentence
  --     `billingWorkspaceFor()` returning undefined produces on the page.
  select p.status, p.upload_policy, p.school_name
    into v_program
    from public.programs p
   where p.id = p_program_id;
  if not found then
    return 'You do not have access to the workspace this match belongs to.';
  end if;
  v_name := v_program.school_name;

  select pm.role, pm.upload_enabled
    into v_member
    from public.program_members pm
   where pm.program_id = p_program_id
     and pm.user_id = p_uploader;
  if not found then
    return 'You do not have access to the workspace this match belongs to.';
  end if;

  -- 2 · APPROVAL. Only `active` records. `claim_pending` is the notice the
  --     wizard shows (PENDING_APPROVAL_NOTICE, one spelling); the other two
  --     are a different sentence, as on the page.
  if v_program.status = 'claim_pending' then
    return 'Your team is awaiting approval. You can upload matches once your claim has been approved.';
  elsif v_program.status = 'suspended' then
    return v_name || ' is suspended, so matches can''t be recorded for it until that''s resolved.';
  elsif v_program.status <> 'active' then
    return v_name || ' isn''t an active program, so matches can''t be recorded for it.';
  end if;

  -- 3 · ROLE — `canUploadForProgram()`, verbatim: the ladder, then a player's
  --     own switch under `everyone`. Staff never reach the switch.
  v_may := case v_program.upload_policy
    when 'owner'         then v_member.role = 'owner'
    when 'owner_coaches' then v_member.role in ('owner', 'coach')
    when 'staff'         then v_member.role in ('owner', 'coach', 'staff')
    else                      v_member.role in ('owner', 'coach', 'staff')
                              or (v_member.role = 'player' and v_member.upload_enabled)
  end;
  if not coalesce(v_may, false) then
    v_policy := case v_program.upload_policy
      when 'owner'         then 'owner only'
      when 'owner_coaches' then 'owner and coaches'
      when 'staff'         then 'all staff'
      else                      'everyone on the team'
    end;
    if v_member.role in ('owner', 'coach', 'staff') then
      return v_name || ' limits uploads to ' || v_policy
        || ', so a match can''t be recorded from your account. The owner can widen it in Team settings.';
    elsif v_program.upload_policy <> 'everyone' then
      return v_name || ' limits uploads to ' || v_policy
        || ', so a match can''t be recorded from your account. A coach can record it, or the program can open uploads to players in Team settings.';
    else
      return 'Uploading for ' || v_name
        || ' isn''t switched on for your account. A coach can turn on "Can send video" on your roster row.';
    end if;
  end if;

  -- 4 · LINE is the regraft trigger's own rule (staff-only event_entry_id)
  --     and is not repeated here.

  -- 5 · ATHLETE. Null is allowed (see the header). Otherwise a live profile on
  --     this roster, or a login that is a player here or holds a live profile
  --     here. A login that is only staff satisfies none of these.
  if p_player1_id is null then
    return null;
  end if;

  if exists (
       select 1 from public.program_players pp
        where pp.id = p_player1_id
          and pp.program_id = p_program_id
          and pp.merged_into_id is null
          and pp.archived_at is null
     )
     or exists (
       select 1 from public.program_members pm
        where pm.user_id = p_player1_id
          and pm.program_id = p_program_id
          and pm.role = 'player'
     )
     or exists (
       select 1 from public.program_players pp
        where pp.claimed_by_user_id = p_player1_id
          and pp.program_id = p_program_id
          and pp.merged_into_id is null
          and pp.archived_at is null
     ) then
    return null;
  end if;

  return 'That player isn''t on ' || v_name
    || '''s roster, so the match can''t be recorded for them.';
end;
$$;

comment on function public.upload_eligibility_refusal(uuid, uuid, uuid, uuid) is
  'The database''s reading of src/lib/workspace/upload-eligibility.ts: may p_uploader record an upload for this (program_id, player1_id, created_by)? NULL when yes; otherwise the sentence the wizard would have shown. Personal rows: uploader must be the creator and the only athlete. Team rows: member, program active, upload_policy / upload_enabled admit the uploader, and player1_id (when set) is a live roster profile or a player login here — never a staff-only login.';

-- ---------------------------------------------------------------------------
-- 3. `matches`: the regraft trigger, extended. Everything above the new
--    block is the live body, unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.matches_block_client_regraft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_client boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
  v_refusal text;
begin
  if not v_is_client then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.program_id is not null
       and new.program_id not in (select public.user_program_ids()) then
      raise exception 'a match can only be filed under a program you belong to'
        using errcode = '42501';
    end if;

    if new.event_entry_id is not null then
      if not public.is_program_staff(new.program_id) then
        raise exception 'only a program''s staff can attach a match to a scheduled line'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.program_event_entries e
         where e.id = new.event_entry_id
           and e.program_id is not distinct from new.program_id
      ) then
        raise exception 'that line belongs to a different program'
          using errcode = '42501';
      end if;
    end if;

    if new.program_id is not null
       and new.player1_id is not null
       and not exists (
         select 1 from public.program_players pp
          where pp.id = new.player1_id
            and pp.program_id = new.program_id
       )
       and not exists (
         select 1 from public.program_members pm
          where pm.user_id = new.player1_id
            and pm.program_id = new.program_id
       ) then
      raise exception
        'that player is not on this program''s roster, so the match cannot be filed under it'
        using errcode = '42501';
    end if;

    -- T14: an upload-shaped row answers the upload contract as well. A
    -- hand-recorded score does not — see the file header.
    if public.match_is_upload_shaped(new.source_provider, new.analysis_method) then
      v_refusal := public.upload_eligibility_refusal(
        new.program_id, new.player1_id, new.created_by, (select auth.uid()));
      if v_refusal is not null then
        raise exception '%', v_refusal using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: neither column may move at all. Where a match is filed is decided
  -- when it is created.
  if new.program_id is distinct from old.program_id
     or new.event_entry_id is distinct from old.event_entry_id then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;

  -- UPDATE: attribution may move, but only within the same roster. Guarded on
  -- an actual change so a write that restates the current value never fails.
  if new.player1_id is distinct from old.player1_id
     and new.program_id is not null
     and new.player1_id is not null
     and not exists (
       select 1 from public.program_players pp
        where pp.id = new.player1_id
          and pp.program_id = new.program_id
     )
     and not exists (
       select 1 from public.program_members pm
        where pm.user_id = new.player1_id
          and pm.program_id = new.program_id
     ) then
    raise exception
      'a match can only be re-attributed to someone on the same program''s roster'
      using errcode = '42501';
  end if;

  -- T14: turning a hand-recorded row into an upload is an upload. Guarded on
  -- the transition only, so a score correction or any other update to a row
  -- that is already an upload — or already manual — never meets this rule.
  if public.match_is_upload_shaped(new.source_provider, new.analysis_method)
     and not public.match_is_upload_shaped(old.source_provider, old.analysis_method) then
    v_refusal := public.upload_eligibility_refusal(
      new.program_id, new.player1_id, new.created_by, (select auth.uid()));
    if v_refusal is not null then
      raise exception '%', v_refusal using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.matches_block_client_regraft() is
  'Refuses a client write that files a match under a program it does not belong to, attaches it to a scheduled line the caller does not run, or attributes it to somebody who is not on that program. INSERT: program_id must be one of yours, event_entry_id needs staff and must match program_id, player1_id must be a program_players row or a program_members user of program_id (null is allowed -- doubles lines carry no single account). UPDATE: program_id and event_entry_id may not change, and player1_id may only move to someone on the same roster. T14: an upload-shaped row (match_is_upload_shaped) on INSERT, or an UPDATE that makes a row upload-shaped, must also pass upload_eligibility_refusal -- program active, uploader admitted by upload_policy / upload_enabled, player1_id a roster athlete rather than a staff-only login. Hand-recorded scores are exempt. Service-role sessions skip everything.';

-- The two shape columns join the firing list so the UPDATE transition is seen.
drop trigger if exists matches_block_client_regraft on public.matches;
create trigger matches_block_client_regraft
  before insert or update of program_id, event_entry_id, player1_id,
                              source_provider, analysis_method
  on public.matches
  for each row
  execute function public.matches_block_client_regraft();

-- ---------------------------------------------------------------------------
-- 4. `processing_jobs` and `match_files`: the existing-match transitions.
-- ---------------------------------------------------------------------------

create or replace function public.match_upload_transition_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_client boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
  v_match   record;
  v_refusal text;
begin
  -- Service role (edge functions, webhooks, cron, resubmission) is not a
  -- client and is not gated: processing keeps working on any row.
  if not v_is_client then
    return new;
  end if;

  -- match_files.match_id is nullable; a row with no match is not a transition.
  if new.match_id is null then
    return new;
  end if;

  select m.program_id, m.player1_id, m.created_by
    into v_match
    from public.matches m
   where m.id = new.match_id;
  if not found then
    -- The foreign key would say the same; this says it first, in the same
    -- code the rest of this guard uses.
    raise exception 'That match does not exist.' using errcode = '42501';
  end if;

  v_refusal := public.upload_eligibility_refusal(
    v_match.program_id, v_match.player1_id, v_match.created_by, (select auth.uid()));
  if v_refusal is not null then
    raise exception '%', v_refusal using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.match_upload_transition_guard() is
  'BEFORE INSERT on processing_jobs and match_files: a client attaching a video or an import file to an existing match must pass upload_eligibility_refusal for THAT match''s program, athlete and creator -- the same rule the matches INSERT asks, re-asked at the write that makes an already-recorded row an upload. Service-role sessions skip it.';

drop trigger if exists processing_jobs_guard_upload_eligibility on public.processing_jobs;
create trigger processing_jobs_guard_upload_eligibility
  before insert on public.processing_jobs
  for each row
  execute function public.match_upload_transition_guard();

drop trigger if exists match_files_guard_upload_eligibility on public.match_files;
create trigger match_files_guard_upload_eligibility
  before insert on public.match_files
  for each row
  execute function public.match_upload_transition_guard();

-- Clients never call these directly; the triggers run them. Keep the
-- public-schema default of executable-by-anyone off the SECURITY DEFINER one.
revoke execute on function public.upload_eligibility_refusal(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.match_upload_transition_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Post-apply check (run by hand; expected: 3 rows, one per trigger, and the
-- matches trigger's column list naming source_provider and analysis_method).
--
--   select c.relname, t.tgname, pg_get_triggerdef(t.oid)
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where t.tgname in ('matches_block_client_regraft',
--                       'processing_jobs_guard_upload_eligibility',
--                       'match_files_guard_upload_eligibility');
--
-- ---------------------------------------------------------------------------
-- Rollback (reverse order; then restore the previous regraft body from
-- 20260824211820_matches_bound_program_attribution.sql):
--
--   drop trigger if exists match_files_guard_upload_eligibility on public.match_files;
--   drop trigger if exists processing_jobs_guard_upload_eligibility on public.processing_jobs;
--   drop function if exists public.match_upload_transition_guard();
--   drop trigger if exists matches_block_client_regraft on public.matches;
--   create trigger matches_block_client_regraft
--     before insert or update of program_id, event_entry_id, player1_id
--     on public.matches
--     for each row execute function public.matches_block_client_regraft();
--   drop function if exists public.upload_eligibility_refusal(uuid, uuid, uuid, uuid);
--   drop function if exists public.match_is_upload_shaped(text, text);
--   -- then: create or replace function public.matches_block_client_regraft() ... (previous body)
-- ---------------------------------------------------------------------------
