-- Who put the video on a public match link.
--
-- `include_video` (20261012065311) is re-checked every time the public page
-- is read: may the person who shared the video still share it? That question
-- was being asked of the link's MAKER (`created_by`), who need not be the
-- person who ticked the box — a link is one row per match, made by whoever
-- shared it first. Two wrong answers followed:
--
--   * staff add the video to a link a player made, with the program's
--     "players can share video" off: the page asked about the player, said
--     no, and the box the coach had just ticked showed nothing;
--   * a player adds the video to a link staff made, with the setting on, and
--     the setting is later turned off: the page asked about the staff maker,
--     said yes, and the video stayed.
--
-- `video_shared_by` records the caller `set_match_share_video` authorised, and
-- is cleared when the video comes off. Like `include_video` it has no column
-- grant: the function is the only writer. A null (the account is gone) reads
-- as "nobody vouches for this video" and the page does not show it.

alter table public.match_share_links
  add column video_shared_by uuid references auth.users (id) on delete set null;

comment on column public.match_share_links.video_shared_by is
  'Who turned include_video on. The public page re-checks that this person may still share the video. Written only by set_match_share_video.';

-- Rows that already carry the video were all set before this column existed;
-- the maker is the only person on record for them.
update public.match_share_links
   set video_shared_by = created_by
 where include_video;

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
     set include_video = v_include,
         video_shared_by = case when v_include then (select auth.uid()) end
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
