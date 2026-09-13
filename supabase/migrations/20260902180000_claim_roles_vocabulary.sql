-- One role vocabulary for claims and invite requests, revised.
--
-- The list in src/lib/services/programs/claim-roles.ts is now:
--   head_coach, associate_coach, assistant_coach, director_of_operations,
--   player, other
--
-- "director_of_tennis" and "operations" leave the list; "associate_coach",
-- "director_of_operations" and "player" join it. Verified before this ran that
-- no row in either table held a departing value, so the constraint can be
-- swapped rather than migrated.
--
-- Both CHECKs are rewritten in the same change because they are the database's
-- copy of one list — a form and a column disagreeing is how an optional select
-- turns into a failed insert.

alter table public.program_requests
  drop constraint program_requests_role_check;
alter table public.program_requests
  add constraint program_requests_role_check
  check (role in (
    'head_coach', 'associate_coach', 'assistant_coach',
    'director_of_operations', 'player', 'other'
  ));

alter table public.program_claims
  drop constraint program_claims_role_check;
alter table public.program_claims
  add constraint program_claims_role_check
  check (claimant_role in (
    'head_coach', 'associate_coach', 'assistant_coach',
    'director_of_operations', 'player', 'other'
  ));
