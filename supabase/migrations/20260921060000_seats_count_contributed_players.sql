-- Seats count EVERY live roster row, contributed ones included.
--
-- `20260921050000` excluded rows with `contributed_by_program_id` ("nobody
-- here chose those rows"). That left a hole the branch's own review found:
-- `program_roster_full` lists those rows on the roster, and
-- `create_program_invite` lets staff invite one to claim with no seat check
-- (a claim's row "already holds its seat") — so on a program claimed after
-- opponents had recorded its players, those players showed on the table and
-- could gain logins while never counting against the cap.
--
-- The rule is now the sentence the UI says: a seat is a player on the roster.
-- `contribute_opponent_player` refuses any program that has members ("that
-- program manages its own roster"), so contributed rows only ever accumulate
-- on UNCLAIMED programs — no claimed program's count can be pushed up from
-- outside, and none holds a contributed row today (three unclaimed programs
-- hold 5 between them). A program claimed with more inherited rows than seats
-- starts over its cap and frees seats by archiving or merging, which is the
-- same remedy as any full roster; nothing here refuses the claim itself.
create or replace function public.program_seat_counts(
  p_program_id uuid,
  p_exclude_email text default null
)
returns table (used integer, pending integer)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (select count(*)::int
       from public.program_players pp
      where pp.program_id = p_program_id
        and pp.archived_at is null
        and pp.merged_into_id is null),
    (select count(*)::int
       from public.program_invites i
      where i.program_id = p_program_id
        and i.accepted_at is null
        and i.expires_at > now()
        and i.role = 'player'
        and i.player_id is null
        -- A RESEND of an open invitation must not cost a second seat.
        and (p_exclude_email is null or lower(i.email) <> lower(p_exclude_email)));
$function$;

-- CREATE OR REPLACE keeps the ACL, but restate it: this helper has no
-- membership check of its own and must never be reachable through the API.
revoke execute on function public.program_seat_counts(uuid, text) from public, anon, authenticated;
