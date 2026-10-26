-- Legal acceptances: which version of the Terms and Conditions, the Privacy
-- Policy and the Guardian Terms each account agreed to, and when. Modelled on
-- `pilot_terms_acceptances` (20260926181544).
--
-- The version literals live in exactly two places that name each other:
--   * `public.current_legal_version()` below (SQL)
--   * `LEGAL_VERSIONS` in src/lib/legal/versions.ts
-- Bump both in the same change (a new migration replacing the function body).
-- A row whose `version` is not the current one counts as no acceptance: the
-- dashboard shows the "Our terms have changed" screen until a current row
-- exists. The pages themselves live in the advantage-landing repo.
--
-- Rows are written three ways:
--   * sign-up — `handle_new_user` records terms and privacy when the sign-up
--     form's metadata names the current versions (the consent box ticked);
--   * guardian onboarding — `finishGuardianOnboarding` inserts the guardian
--     row beside `users.guardian_consent_at`;
--   * the terms screen — whatever the account is missing.
--
-- Access model, as for pilot terms:
--   * authenticated may INSERT its own row, only at the current version, and
--     may write only `user_id`, `document` and `version`;
--   * authenticated may SELECT its own rows;
--   * no UPDATE or DELETE: an acceptance is a fact. Rows go with the account
--     (`on delete cascade`);
--   * anon has nothing.

create table public.legal_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade
              default auth.uid(),
  document    text not null
              check (document in ('terms', 'privacy', 'guardian')),
  version     text not null,
  accepted_at timestamptz not null default now()
);

comment on table public.legal_acceptances is
  'One row per acceptance of a legal document. A version other than '
  'current_legal_version(document) counts as no acceptance.';

create index legal_acceptances_user_document_idx
  on public.legal_acceptances (user_id, document, version);

-- ── The current versions ────────────────────────────────────────────────────
--
-- Mirrors `LEGAL_VERSIONS` in src/lib/legal/versions.ts. Immutable on purpose,
-- like `current_pilot_terms_version()`: a bump is a new migration.

create or replace function public.current_legal_version(p_document text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_document
    when 'terms' then '2.0'
    when 'privacy' then '1.4'
    when 'guardian' then '1.1'
  end;
$$;

comment on function public.current_legal_version(text) is
  'The current version of a legal document (terms, privacy, guardian). '
  'Mirrors LEGAL_VERSIONS in src/lib/legal/versions.ts.';

revoke execute on function public.current_legal_version(text) from public, anon;
grant execute on function public.current_legal_version(text)
  to authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.legal_acceptances enable row level security;

create policy "Users insert their own current acceptance"
  on public.legal_acceptances
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and version = public.current_legal_version(document)
  );

create policy "Users read their own legal acceptances"
  on public.legal_acceptances
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on public.legal_acceptances from public, anon, authenticated;
grant select on public.legal_acceptances to authenticated;
grant insert (user_id, document, version) on public.legal_acceptances
  to authenticated;
grant all on public.legal_acceptances to service_role;

-- ── Sign-up consent ─────────────────────────────────────────────────────────
--
-- The sign-up form cannot insert a row itself: until the address is confirmed
-- there is no session. It sends the versions its consent sentence linked to as
-- `legal_terms_version` / `legal_privacy_version` metadata, and this records
-- them at the moment the account is created — only when they are the current
-- versions, so a stale tab records nothing and the terms screen asks instead.
-- Google sign-ups carry no such metadata and are asked on the terms screen.
--
-- The rest of the body is unchanged from the live definition.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_full_name text;
  v_first     text;
  v_last      text;
begin
  -- Google hands us full_name/name; email signups have neither. Split on the
  -- first space so "Ana Maria Vasquez" keeps "Maria Vasquez" as the surname.
  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if v_full_name is not null then
    v_first := split_part(v_full_name, ' ', 1);
    v_last  := nullif(trim(substr(v_full_name, length(v_first) + 1)), '');
  end if;

  insert into public.users (id, email, first_name, last_name)
  values (new.id, new.email, v_first, v_last)
  on conflict (id) do nothing;

  -- Its own block, so a failed consent row never takes the profile row with
  -- it: the terms screen asks again, and nothing else is lost.
  begin
    insert into public.legal_acceptances (user_id, document, version)
    select new.id, d.document, d.version
    from (values
      ('terms', new.raw_user_meta_data ->> 'legal_terms_version'),
      ('privacy', new.raw_user_meta_data ->> 'legal_privacy_version')
    ) as d (document, version)
    where d.version = public.current_legal_version(d.document);
  exception
    when others then
      raise warning 'handle_new_user could not record consent for %: %',
        new.id, sqlerrm;
  end;

  return new;
exception
  when others then
    -- A raise here would abort the signup itself, so a profile that cannot be
    -- written must never cost the user their account. The row is recoverable;
    -- the failed signup is not.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$function$;
