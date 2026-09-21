-- Visualizations Phase 2B: depth / contact bands — ONE record per workspace.
-- Every return chart in the workspace follows it; it is never part of a saved view.
-- No row = the defaults (thirds; contact at the baseline and 5 ft behind), so
-- nothing is backfilled and no existing number moves.
create table public.viz_band_settings (
  account_id          uuid primary key,   -- Workspace.id: auth uid (personal) or programs.id (team); same key as saved_views
  depth_scheme        text not null default 'thirds'
                      check (depth_scheme in ('none','thirds','deepMidShort','inside','custom')),
  -- Feet from the baseline toward the net (0 = baseline, 39 = net). Only read when depth_scheme = 'custom'.
  depth_dividers_ft   numeric(5,2)[]
                      check (
                        depth_dividers_ft is null
                        or (array_ndims(depth_dividers_ft) = 1
                            and cardinality(depth_dividers_ft) = 2
                            and depth_dividers_ft[1] > 0
                            and depth_dividers_ft[2] < 39
                            and depth_dividers_ft[1] < depth_dividers_ft[2])
                      ),
  -- Feet from the baseline: negative = inside the court, positive = behind it.
  contact_dividers_ft numeric(5,2)[] not null default '{0,5}'
                      check (
                        array_ndims(contact_dividers_ft) = 1
                        and cardinality(contact_dividers_ft) = 2
                        and contact_dividers_ft[1] >= -39
                        and contact_dividers_ft[2] <= 30
                        and contact_dividers_ft[1] < contact_dividers_ft[2]
                      ),
  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint viz_band_settings_custom_needs_dividers
    check (depth_scheme <> 'custom' or depth_dividers_ft is not null)
);

-- Who changed it, and when, is the server's fact — never the client's.
create function public.viz_band_settings_stamp() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

create trigger viz_band_settings_stamp
  before insert or update on public.viz_band_settings
  for each row execute function public.viz_band_settings_stamp();

alter table public.viz_band_settings enable row level security;

-- Read: your own workspace's record, or a team's if you are a member (any role).
create policy viz_band_settings_select on public.viz_band_settings for select to authenticated
  using (
    account_id = (select auth.uid())
    or public.user_program_role(account_id) is not null
  );

-- Write: your personal record, or a team's if you are owner / coach / staff.
-- Players read the bands; they never change what "deep" means for the team.
create policy viz_band_settings_insert on public.viz_band_settings for insert to authenticated
  with check (
    account_id = (select auth.uid())
    or public.is_program_staff(account_id)
  );

create policy viz_band_settings_update on public.viz_band_settings for update to authenticated
  using (
    account_id = (select auth.uid())
    or public.is_program_staff(account_id)
  )
  with check (
    account_id = (select auth.uid())
    or public.is_program_staff(account_id)
  );

-- Supabase's default privileges grant ALL (incl. TRUNCATE, which RLS never covers) to anon and
-- authenticated on every new table. Start from nothing. account_id is immutable for every
-- non-service-role writer (a record cannot be moved to another workspace); there is no DELETE —
-- "reset" is an UPDATE back to the defaults.
revoke all on public.viz_band_settings from public, anon, authenticated;
grant select, insert on public.viz_band_settings to authenticated;
grant update (depth_scheme, depth_dividers_ft, contact_dividers_ft) on public.viz_band_settings to authenticated;
grant all on public.viz_band_settings to service_role;

revoke all on function public.viz_band_settings_stamp() from public, anon, authenticated;
