-- Legal versions: Terms 2.1, Privacy 1.5, Guardian Terms 1.2 (advantage-landing,
-- 2026-11-07). The video analysis provider trains on every video it receives,
-- including video of players under 18, so the "never train on junior video"
-- promise is replaced with a disclosure. Every account sees the "Our terms
-- have changed" screen once; guardian accounts agree to the Guardian Terms
-- again there.
--
-- Mirrors `LEGAL_VERSIONS` in src/lib/legal/versions.ts. Apply together with
-- the deploy that ships that constant: applied ahead of it, the terms screen
-- and sign-up record versions the database refuses.

create or replace function public.current_legal_version(p_document text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_document
    when 'terms' then '2.1'
    when 'privacy' then '1.5'
    when 'guardian' then '1.2'
  end;
$$;

-- The training exclusion flag (20261026061018) no longer reflects a promise.
-- It is kept, still maintained by its trigger, in case the vendor adds a
-- do-not-train field.
comment on column public.matches.exclude_from_training is
  'Match of a guardian or under-18 account, or a high school / academy team. '
  'Terms before 2.1 promised these were never used for training; they now '
  'are. Kept to feed a vendor do-not-train field if one is added. Not sent.';
