-- Structured role on invite requests (design 6.4).
--
-- The request form asks "your role" as an optional select using the same five
-- values the claim setup form offers (src/lib/services/programs/claim-roles.ts):
-- one vocabulary product-wide. Nullable, because the field is optional and every
-- existing row predates it; NULL passes the CHECK, so requests without a role
-- file exactly as they always did.
--
-- The server action allowlists the value before writing, and this CHECK is the
-- database's own copy of that rule — the column is read back by admins, so it
-- must never hold arbitrary client text.
alter table public.program_requests
  add column role text
    constraint program_requests_role_check
    check (role in ('head_coach', 'assistant_coach', 'director_of_tennis', 'operations', 'other'));
