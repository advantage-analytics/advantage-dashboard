-- Verified by Advantage, backfill (docs/plans/advantage-review.md, after
-- step 1). Step 1 made the label console's Mark complete grant the status;
-- the 16 hand-labelling sessions completed before it shipped never did. Each
-- of those matches had every point checked against the video by an Advantage
-- admin, so it gets the status now, as that labeller, dated when the session
-- was completed — not today — so the report's popover says when the check
-- actually happened.
--
-- Applied live as 20261028055935. One-off, and guarded to the set checked
-- live on 2026-10-27: exactly 16 complete analyst sessions on 16 distinct
-- matches, every labeller set and an admin, every completed_at set, no
-- other session open on any of those matches, and no match in the database
-- verified yet. Anything else — a session reopened since (it is no longer
-- complete, so the count is off), a match verified by a Mark complete since,
-- a 17th session — refuses the whole migration rather than verifying a set
-- nobody reviewed.
--
-- Through `verify_match`, the one door step 0's guard leaves (it re-checks
-- the actor is an admin), then `verified_at` set to the session's
-- completed_at in the same transaction. A migration runs as the owner, with
-- no client JWT, so `zz_matches_guard_verification` lets both writes through.

do $$
declare
  expected constant int := 16;
  n int;
  r record;
begin
  select count(*) into n
    from public.label_sessions s
   where s.status = 'complete' and s.kind = 'analyst';
  if n <> expected then
    raise exception 'refusing: % complete analyst sessions, expected %', n, expected;
  end if;

  select count(distinct s.match_id) into n
    from public.label_sessions s
   where s.status = 'complete' and s.kind = 'analyst';
  if n <> expected then
    raise exception 'refusing: complete sessions cover % matches, expected %', n, expected;
  end if;

  if exists (
    select 1
      from public.label_sessions s
      left join public.users u on u.id = s.labeller
     where s.status = 'complete' and s.kind = 'analyst'
       and (s.labeller is null or s.completed_at is null or not coalesce(u.is_admin, false))
  ) then
    raise exception 'refusing: a complete session has no admin labeller or no completed_at';
  end if;

  if exists (
    select 1
      from public.label_sessions s
      join public.label_sessions o
        on o.match_id = s.match_id and o.id <> s.id and o.status <> 'complete'
     where s.status = 'complete' and s.kind = 'analyst'
  ) then
    raise exception 'refusing: another session is open on one of these matches';
  end if;

  select count(*) into n from public.matches where verified;
  if n <> 0 then
    raise exception 'refusing: % matches are already verified', n;
  end if;

  for r in
    select s.match_id, s.labeller, s.completed_at
      from public.label_sessions s
     where s.status = 'complete' and s.kind = 'analyst'
  loop
    perform public.verify_match(r.match_id, r.labeller);
    update public.matches
       set verified_at = r.completed_at
     where id = r.match_id;
  end loop;

  select count(*) into n
    from public.matches m
    join public.label_sessions s
      on s.match_id = m.id and s.status = 'complete' and s.kind = 'analyst'
   where m.verified
     and m.verified_by = s.labeller
     and m.verified_at = s.completed_at;
  if n <> expected then
    raise exception 'refusing: % matches verified as expected after the backfill, expected %', n, expected;
  end if;
end $$;
