-- "Director of operations" leaves the claim/request role vocabulary, minutes
-- after 20260902180000 added it: the list settled on head, associate and
-- assistant coach, player and other. No row held the value.

alter table public.program_requests
  drop constraint program_requests_role_check;
alter table public.program_requests
  add constraint program_requests_role_check
  check (role in ('head_coach', 'associate_coach', 'assistant_coach', 'player', 'other'));

alter table public.program_claims
  drop constraint program_claims_role_check;
alter table public.program_claims
  add constraint program_claims_role_check
  check (claimant_role in ('head_coach', 'associate_coach', 'assistant_coach', 'player', 'other'));
