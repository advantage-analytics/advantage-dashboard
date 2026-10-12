-- Video on a public match link, and who may put it there.
--
-- `include_visualizations` (20261012020324) was the link's first option and
-- anyone who may share the match may set it. Video is a different exposure —
-- real people on camera, an opponent who agreed to nothing — so it gets its
-- own column and a narrower rule:
--
--   * a personal match: whoever may share it (`can_share_match`);
--   * a team match: the program's staff, and its players only once the
--     program says so (`programs.players_can_share_video`, off by default).
--
-- The column has no UPDATE grant. An UPDATE policy's WITH CHECK sees the whole
-- new row, so "video only by staff" written there would also refuse a player
-- changing `include_visualizations` on a link staff had put video on. Instead
-- `set_match_share_video` is the one way to turn video on, and the INSERT
-- policy refuses a row that arrives with it already set — a new link always
-- starts without video.
--
-- Turning video OFF is anyone's who may share the match: a player on camera
-- can take their own match's video back down.
--
-- The public page re-checks the rule for the link's maker every time it is
-- read (`getSharedMatchData`), so a program that turns the setting off, or a
-- maker who leaves the team, takes the video off the page without touching
-- this row.

alter table public.programs
  add column players_can_share_video boolean not null default false;

comment on column public.programs.players_can_share_video is
  'Players may put a match''s video on its public share link. Staff always may. Written by set_program_players_can_share_video.';

alter table public.match_share_links
  add column include_video boolean not null default false;

comment on column public.match_share_links.include_video is
  'The public page also shows the match video. Set only through set_match_share_video.';

create or replace function public.can_share_match_video(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches m
    left join public.programs p on p.id = m.program_id
    where m.id = p_match_id
      and public.can_share_match(m.id)
      and (
        m.program_id is null
        or public.is_program_staff(m.program_id)
        or coalesce(p.players_can_share_video, false)
      )
  );
$$;

revoke all on function public.can_share_match_video(uuid) from public, anon;
grant execute on function public.can_share_match_video(uuid) to authenticated, service_role;

create or replace function public.set_match_share_video(
  p_match_id uuid,
  p_include boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_include boolean := coalesce(p_include, false);
begin
  if not public.can_share_match(p_match_id) then
    raise exception 'not authorized to share this match'
      using errcode = '42501';
  end if;
  if v_include and not public.can_share_match_video(p_match_id) then
    raise exception 'Only team staff can share this match''s video.'
      using errcode = '42501';
  end if;

  update public.match_share_links
     set include_video = v_include
   where match_id = p_match_id;

  -- No link to change: the caller turns the link on first.
  if not found then
    raise exception 'This match has no public link.'
      using errcode = 'P0002';
  end if;

  return v_include;
end;
$function$;

revoke all on function public.set_match_share_video(uuid, boolean) from public, anon;
grant execute on function public.set_match_share_video(uuid, boolean) to authenticated, service_role;

drop policy "match_share_links_insert_sharers" on public.match_share_links;
create policy "match_share_links_insert_sharers"
  on public.match_share_links
  for insert
  to authenticated
  with check (
    public.can_share_match(match_id)
    and created_by = (select auth.uid())
    and not include_video
  );

alter table public.program_audit_log
  drop constraint program_audit_log_action_check;
alter table public.program_audit_log
  add constraint program_audit_log_action_check check (action = any (array[
    'player.added', 'player.updated', 'player.archived', 'player.claimed',
    'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'member.role_changed', 'seats.changed',
    'member.account_deleted', 'lineup.set', 'ownership.transferred',
    'event.deleted', 'player.restored', 'match.attached', 'member.left',
    'program.conference_changed', 'console.result_added',
    'console.analysis_attached', 'join_request.approved',
    'join_request.declined', 'pilot.end_changed', 'pilot.ended',
    'program.details_changed', 'member.upload_changed', 'program.crest_changed',
    'console.submission_reconciled', 'match.detached', 'match.round_changed',
    'pilot.eligibility_changed', 'join_link.created', 'join_link.revoked',
    'join_link.accepted', 'join_link.mode_changed',
    'program.video_sharing_changed'
  ]));

create or replace function public.set_program_players_can_share_video(
  p_program_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before boolean;
  v_enabled boolean := coalesce(p_enabled, false);
begin
  -- Any staff of THIS program: owner, coach or staff. Looser than the
  -- owner-only upload and events policies, by product decision (2026-10-11).
  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  select p.players_can_share_video into v_before
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'program not found' using errcode = 'P0002';
  end if;

  if v_before is not distinct from v_enabled then
    return;
  end if;

  update public.programs
     set players_can_share_video = v_enabled
   where id = p_program_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, details)
  values (
    p_program_id,
    (select auth.uid()),
    'program.video_sharing_changed',
    jsonb_build_object('from', v_before, 'to', v_enabled)
  );
end;
$function$;

revoke all on function public.set_program_players_can_share_video(uuid, boolean) from public, anon;
grant execute on function public.set_program_players_can_share_video(uuid, boolean) to authenticated, service_role;
