-- Do-not-train: which matches' video must never be used to train models.
--
-- Terms and Conditions 2.0 §6 and Privacy Policy 1.4 §3/§10: our video
-- analysis provider (SplitStep) may train only on adults' video — never video
-- from guardian (junior) accounts, accounts of players under 18, or high
-- school / junior teams. SplitStep's job API has no field for this yet
-- (src/lib/services/splitstep/job-request.ts carries the TODO), so the flag is
-- stored on the match, where it is ready to send and to hand the vendor as a
-- list in the meantime.
--
-- A match is excluded when any of these holds:
--   * its program is a high school or academy team (`org_type`);
--   * the account that created it, or the player on it (`player1_id`, either
--     id space — see reference_player1_id_two_id_spaces), is a guardian
--     account (`role = 'parent'` or a `guardian_consent_at`), or is under 18
--     by `users.dob`, which onboarding's age gate records.
--
-- The flag only ever turns on. A trigger recomputes it on every insert and
-- update and ORs in the old value, so a client cannot clear it and a match
-- that was once a junior's stays excluded after the player turns 18.

alter table public.matches
  add column exclude_from_training boolean not null default false;

comment on column public.matches.exclude_from_training is
  'Video of this match must never be used to train models (guardian or '
  'under-18 account, or a high school / academy team). Only ever turns on; '
  'see training_excluded_for().';

create or replace function public.training_excluded_for(
  p_program_id uuid,
  p_created_by uuid,
  p_player1_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.programs p
      where p.id = p_program_id
        and p.org_type in ('high_school', 'academy')
    )
    or exists (
      select 1
      from public.users u
      where u.id in (
          p_created_by,
          p_player1_id,
          (select pp.claimed_by_user_id
             from public.program_players pp
            where pp.id = p_player1_id)
        )
        and (
          u.role = 'parent'
          or u.guardian_consent_at is not null
          or u.dob > (current_date - interval '18 years')
        )
    );
$$;

comment on function public.training_excluded_for(uuid, uuid, uuid) is
  'Whether a match with this program, creator and player must be excluded '
  'from model training. Read by the matches_training_exclusion trigger.';

revoke execute on function public.training_excluded_for(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.training_excluded_for(uuid, uuid, uuid)
  to service_role;

create or replace function public.stamp_match_training_exclusion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.exclude_from_training :=
    coalesce(new.exclude_from_training, false)
    or (tg_op = 'UPDATE' and old.exclude_from_training)
    or public.training_excluded_for(
      new.program_id, new.created_by, new.player1_id
    );
  return new;
end;
$$;

revoke execute on function public.stamp_match_training_exclusion()
  from public, anon, authenticated;

create trigger matches_training_exclusion
  before insert or update on public.matches
  for each row execute function public.stamp_match_training_exclusion();

-- Backfill every existing match.
update public.matches m
   set exclude_from_training = true
 where not m.exclude_from_training
   and public.training_excluded_for(m.program_id, m.created_by, m.player1_id);
