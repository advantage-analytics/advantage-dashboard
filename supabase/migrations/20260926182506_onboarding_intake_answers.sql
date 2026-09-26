-- Onboarding intake answers (T1) — screens 1.5, 1.7 and 5.2.
--
-- The player-side answers live on public.users: onboarding already writes the
-- caller's own users row under the own-row RLS policy
-- ("Enable ALL permissions for users based on user_id", auth.uid() = id), and
-- there is exactly one row per account, so "how do you record" and "where did
-- you hear about us" have a natural home with no policy change — readable and
-- writable only by the row's owner, like every other users column.
--
-- The coach-side bands live on public.programs because they describe the
-- program, not the person answering: a roster size and a weekly film volume
-- outlive whichever coach happened to onboard. programs has a SELECT policy
-- and no client UPDATE policy — every write goes through a SECURITY DEFINER
-- RPC (update_program_settings is the precedent) — so set_program_intake
-- below is that RPC, owner-gated through user_program_role.
--
-- Screen 1.6 (level / UTR) is held; utr_id is untouched.
--
-- Applied to the live database via the Supabase MCP as
-- `onboarding_intake_answers` (version 20260926182506).

alter table public.users
  add column if not exists recording_source text,
  add column if not exists acquisition_source text,
  add column if not exists acquisition_source_detail text;

alter table public.programs
  add column if not exists roster_size_band text,
  add column if not exists weekly_film_band text;

-- The vocabularies mirror src/app/onboarding/answers.ts; the server actions
-- validate the same sets, these keep any other writer honest. All allow null:
-- an answer that was never asked (or skipped) is simply absent.
alter table public.users
  add constraint users_recording_source_values
    check (recording_source is null
           or recording_source in ('swing-vision', 'video', 'none')),
  add constraint users_acquisition_source_values
    check (acquisition_source is null
           or acquisition_source in ('coach_or_teammate', 'swingvision_community',
                                     'social', 'google', 'college_event', 'utr',
                                     'other')),
  add constraint users_acquisition_source_detail_length
    check (acquisition_source_detail is null
           or char_length(acquisition_source_detail) between 1 and 120),
  add constraint users_acquisition_source_detail_only_other
    check (acquisition_source_detail is null or acquisition_source = 'other');

alter table public.programs
  add constraint programs_roster_size_band_values
    check (roster_size_band is null
           or roster_size_band in ('1-6', '7-10', '11-15', '16+')),
  add constraint programs_weekly_film_band_values
    check (weekly_film_band is null
           or weekly_film_band in ('none', '1-3', '4-10', '10+'));

comment on column public.users.recording_source is
  'How the player captures matches today — screen 1.5. One of swing-vision, '
  'video or none; drives which upload provider the wizard defaults to. Null '
  'until the player onboarding step answers it.';

comment on column public.users.acquisition_source is
  'Where this person heard about Advantage Analytics — screen 1.7 (player) or '
  '5.2 (coach). One of the answers.ts ACQUISITION_SOURCES values; null when '
  'the step was skipped.';

comment on column public.users.acquisition_source_detail is
  'Free-text follow-up to acquisition_source = ''other'' ("Somewhere else"), '
  '1–120 characters. The only_other constraint keeps it null for every other '
  'answer.';

comment on column public.programs.roster_size_band is
  'How many players the program carries — screen 5.2, coach persona. One of '
  '1-6, 7-10, 11-15, 16+. Written only through set_program_intake.';

comment on column public.programs.weekly_film_band is
  'Matches the program films per week — screen 5.2, coach persona. One of '
  'none, 1-3, 4-10, 10+. Written only through set_program_intake.';

-- Owner-only writer for the two program bands. Mirrors update_program_settings:
-- SECURITY DEFINER with an empty search_path, every reference schema-qualified,
-- errcode 42501 on a failed guard, revoked from public and anon, EXECUTE to
-- authenticated only. A single check covers both the signed-out caller
-- (auth.uid() null → user_program_role null) and a member who is not the owner.
create or replace function public.set_program_intake(
  p_program_id uuid,
  p_roster_size_band text,
  p_weekly_film_band text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or public.user_program_role(p_program_id) is distinct from 'owner' then
    raise exception 'not authorized to change this program''s intake answers'
      using errcode = '42501';
  end if;

  update public.programs
     set roster_size_band = p_roster_size_band,
         weekly_film_band = p_weekly_film_band,
         updated_at       = now()
   where id = p_program_id;
end;
$$;

revoke all on function public.set_program_intake(uuid, text, text) from public, anon;
grant execute on function public.set_program_intake(uuid, text, text) to authenticated;
