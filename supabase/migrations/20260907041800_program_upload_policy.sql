-- "Who can upload team matches" grows from a switch to a ladder.
--
-- `players_can_upload` said one thing: whether players may send video. It
-- could not say that only the owner may, or the owner and coaches but not
-- staff — and a program with a volunteer coach and an operations account is
-- exactly the program that wants to. `upload_policy` is the whole answer:
--
--   owner          only the owner sends team video
--   owner_coaches  the owner and coaches
--   staff          anyone on the coaching staff (the old "coaches only")
--   everyone       players too, each still subject to their own row's
--                  `upload_enabled` (the old "anyone")
--
-- `players_can_upload` stays, derived: true exactly when the policy is
-- `everyone`. Every reader of the boolean keeps its meaning — the roster's
-- "Let players send their own video" switch, the quota's refusal messages,
-- the upload page's gate — and the finer levels are read from the policy by
-- `canUploadForProgram()`. The two columns are written together, only here.
--
-- `update_program_settings` gains a ninth argument with a default, so the
-- callers that send eight (the roster switch) keep working: when
-- `p_upload_policy` is null, the boolean decides — true means `everyone`,
-- false narrows `everyone` to `staff` and leaves any tighter policy alone,
-- which is what a coach flipping "players may upload" off should mean.

alter table public.programs
  add column if not exists upload_policy text not null default 'everyone';

alter table public.programs
  drop constraint if exists programs_upload_policy_check;

alter table public.programs
  add constraint programs_upload_policy_check
  check (upload_policy in ('owner', 'owner_coaches', 'staff', 'everyone'));

update public.programs
   set upload_policy = case when players_can_upload then 'everyone' else 'staff' end;

comment on column public.programs.upload_policy is
  'Who may send team video: owner | owner_coaches | staff | everyone. '
  'players_can_upload is derived from it (= everyone) and kept in step by '
  'update_program_settings; read the policy for the finer levels.';

comment on column public.programs.players_can_upload is
  'Derived: upload_policy = ''everyone''. Kept so existing readers keep their '
  'meaning; written only alongside upload_policy in update_program_settings.';

-- A ninth argument is a new signature, so the eight-argument function is
-- dropped rather than left as a second overload PostgREST would have to pick
-- between.
drop function if exists public.update_program_settings(uuid, text, text, text, text, text, text, boolean);

create function public.update_program_settings(
  p_program_id uuid,
  p_school_name text,
  p_team text,
  p_conference text,
  p_home_venue text,
  p_default_surface text,
  p_season text,
  p_players_can_upload boolean,
  p_upload_policy text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cur record;
  v_policy text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  if p_team is not null and p_team not in ('mens', 'womens') then
    raise exception 'unknown squad %', p_team using errcode = '22023';
  end if;

  if p_upload_policy is not null
     and p_upload_policy not in ('owner', 'owner_coaches', 'staff', 'everyone') then
    raise exception 'unknown upload policy %', p_upload_policy using errcode = '22023';
  end if;

  select school_name, team, conference, upload_policy
    into v_cur
    from public.programs
   where id = p_program_id
     for update;

  if not found then
    raise exception 'program not found' using errcode = 'P0002';
  end if;

  if not public.is_program_owner(p_program_id) and (
       coalesce(nullif(trim(p_school_name), ''), v_cur.school_name) is distinct from v_cur.school_name
    or coalesce(p_team, v_cur.team)                                   is distinct from v_cur.team
    or coalesce(nullif(trim(p_conference), ''), v_cur.conference)     is distinct from v_cur.conference
  ) then
    raise exception 'Only the owner can change the program''s name, squad or conference.'
      using errcode = '42501';
  end if;

  v_policy := coalesce(
    p_upload_policy,
    case
      when p_players_can_upload then 'everyone'
      when v_cur.upload_policy = 'everyone' then 'staff'
      else v_cur.upload_policy
    end
  );

  update public.programs
     set school_name        = coalesce(nullif(trim(p_school_name), ''), school_name),
         team               = coalesce(p_team, team),
         conference         = coalesce(nullif(trim(p_conference), ''), conference),
         home_venue         = coalesce(nullif(trim(p_home_venue), ''), home_venue),
         default_surface    = coalesce(p_default_surface, default_surface),
         season             = coalesce(nullif(trim(p_season), ''), season),
         upload_policy      = v_policy,
         players_can_upload = (v_policy = 'everyone'),
         updated_at         = now()
   where id = p_program_id;
end;
$function$;

revoke all on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean, text) from public;
revoke execute on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean, text) from anon;
grant execute on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean, text) to authenticated;
