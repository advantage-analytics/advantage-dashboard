-- The Ask MCP connector's first two writes (docs/ask-mcp-connector.md §3):
-- `update_match` fixes the metadata on a match the caller created, and
-- `prepare_video_upload` saves a wizard draft that `/dashboard/matches/new?draft=`
-- resumes. A connector token cannot write through PostgREST
-- (`oauth_client_request_guard`, 20261016050115), so each is a function the
-- guard lists, called as the user:
--
--   ask_patch_match(p_match_id, p_update)   the already-normalised update
--                                           `normalizeMatchPatch()` produced,
--                                           applied to the caller's own row
--   ask_seed_match_draft(...)               one `match_drafts` row for the
--                                           caller, in a workspace they hold
--
-- Both are SECURITY INVOKER: RLS on `matches` and `match_drafts` still
-- decides, and `auth.uid()` names the writer. Neither takes a user id.

-- ── ask_patch_match ─────────────────────────────────────────────────────────
-- Keys the connector may send; anything else in p_update is ignored. The
-- score, the format, the player and the opponent's program are deliberately
-- absent (the page's Edit dialog owns those; a score edit also decides a
-- rebuild). `private` is forced true as `PATCH /api/matches/[id]` does
-- (BETA_FORCE_PRIVATE). The date arrives as the normaliser spells it,
-- `YYYY-MM-DDT12:00:00`, so the stored day survives every zone (match-day.ts).
create or replace function public.ask_patch_match(p_match_id uuid, p_update jsonb)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  updated uuid;
begin
  if p_update is null or jsonb_typeof(p_update) <> 'object' then
    raise exception 'ask_patch_match: p_update must be an object' using errcode = '22023';
  end if;
  if not (p_update ?| array['tournament_name', 'round', 'date', 'match_type', 'court_type', 'player2_name', 'opponent_school', 'opponent_hand', 'opponent_backhand']) then
    raise exception 'ask_patch_match: nothing to change' using errcode = '22023';
  end if;

  update public.matches m
     set tournament_name   = case when p_update ? 'tournament_name'   then p_update ->> 'tournament_name'   else m.tournament_name end,
         round             = case when p_update ? 'round'             then p_update ->> 'round'             else m.round end,
         date              = case when p_update ? 'date'              then (p_update ->> 'date')::timestamptz else m.date end,
         match_type        = case when p_update ? 'match_type'        then p_update ->> 'match_type'        else m.match_type end,
         court_type        = case when p_update ? 'court_type'        then p_update ->> 'court_type'        else m.court_type end,
         player2_name      = case when p_update ? 'player2_name'      then p_update ->> 'player2_name'      else m.player2_name end,
         opponent_school   = case when p_update ? 'opponent_school'   then p_update ->> 'opponent_school'   else m.opponent_school end,
         opponent_hand     = case when p_update ? 'opponent_hand'     then p_update ->> 'opponent_hand'     else m.opponent_hand end,
         opponent_backhand = case when p_update ? 'opponent_backhand' then p_update ->> 'opponent_backhand' else m.opponent_backhand end,
         private           = true
   where m.id = p_match_id
     and m.created_by = (select auth.uid())
  returning m.id into updated;

  if updated is null then
    raise exception 'ask_patch_match: match not found' using errcode = 'P0002';
  end if;
  return updated;
end;
$$;

comment on function public.ask_patch_match(uuid, jsonb) is
  'The MCP connector''s update_match: applies a normalised metadata patch (tournament, round, date, type, surface, opponent name/school/hand/backhand) to a match the caller created. Never the score, format or player.';

revoke all on function public.ask_patch_match(uuid, jsonb) from public, anon;
grant execute on function public.ask_patch_match(uuid, jsonb) to authenticated, service_role;

-- ── ask_seed_match_draft ────────────────────────────────────────────────────
-- A program draft needs the caller in that program: `match_drafts` RLS only
-- checks `user_id`, and a draft resumed in a workspace the author does not
-- hold is refused at the wizard anyway (`draftBelongsToWorkspace`) — refusing
-- here keeps the row from existing at all.
create or replace function public.ask_seed_match_draft(
  p_id uuid,
  p_program_id uuid,
  p_payload jsonb,
  p_step text,
  p_step_index integer,
  p_step_count integer,
  p_provider text,
  p_player_name text,
  p_event_label text
)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  inserted uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'ask_seed_match_draft: p_payload must be an object' using errcode = '22023';
  end if;
  if p_program_id is not null and not exists (
    select 1 from public.program_members pm
     where pm.program_id = p_program_id
       and pm.user_id = (select auth.uid())
  ) then
    raise exception 'ask_seed_match_draft: not a member' using errcode = '42501';
  end if;

  insert into public.match_drafts (id, user_id, program_id, step, step_index, step_count, provider, file_name, player_name, event_label, payload)
  values (p_id, (select auth.uid()), p_program_id, p_step, p_step_index, p_step_count, p_provider, null, p_player_name, p_event_label, p_payload)
  returning id into inserted;
  return inserted;
end;
$$;

comment on function public.ask_seed_match_draft(uuid, uuid, jsonb, text, integer, integer, text, text, text) is
  'The MCP connector''s prepare_video_upload: saves one upload-wizard draft for the caller, in their personal workspace or a program they belong to, for /dashboard/matches/new?draft= to resume.';

revoke all on function public.ask_seed_match_draft(uuid, uuid, jsonb, text, integer, integer, text, text, text) from public, anon;
grant execute on function public.ask_seed_match_draft(uuid, uuid, jsonb, text, integer, integer, text, text, text) to authenticated, service_role;

-- ── The guard's allowlist, with the two above ───────────────────────────────
-- Same function as 20261016050115, same hook (pgrst.db_pre_request is already
-- set on the authenticator role); only the list changes. tests/mcp-auth.spec.ts
-- holds this list equal to the user-side ask_* calls in src/lib/services/mcp/.
create or replace function public.oauth_client_request_guard()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  method text := coalesce(current_setting('request.method', true), '');
  path text := coalesce(current_setting('request.path', true), '');
begin
  if claims is null or claims ->> 'client_id' is null then
    return;
  end if;
  if method in ('GET', 'HEAD', 'OPTIONS') then
    return;
  end if;
  if method = 'POST'
     and path ~ '^(/rest/v1)?/rpc/(ask_mcp_count_call|ask_reserve_question|ask_quota|ask_data_version|ask_cache_get|ask_cache_put|ask_save_exchange_ids|ask_record_run|ask_patch_match|ask_seed_match_draft)$'
  then
    return;
  end if;
  raise exception using
    errcode = '42501',
    message = 'Apps connected to Advantage have read-only access.',
    hint = 'oauth_client_read_only';
end;
$$;

grant execute on function public.oauth_client_request_guard() to anon, authenticated, service_role;
notify pgrst, 'reload config';
