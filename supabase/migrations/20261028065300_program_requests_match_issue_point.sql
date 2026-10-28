-- "Tell us" can name the point it is about (opened from the Video tab with a
-- point in view). point_id is the points row as the player saw it, with no
-- FK: a label publish deletes and re-inserts a match's points, so the id may
-- name nothing later. point_label is the chip as it read ("61 · Set 2 · 4-4
-- · 30-40 · Forehand winner by Lee"), so the admin queue still says which
-- point after the ids move.
alter table public.program_requests
  add column point_id uuid,
  add column point_label text;

alter table public.program_requests
  add constraint program_requests_point_only_on_match_issue
    check ((point_id is null and point_label is null) or kind = 'match_issue'),
  add constraint program_requests_point_label_length
    check (point_label is null or char_length(point_label) <= 200);

comment on column public.program_requests.point_id is
  'A match_issue report''s point, as the reporter saw it. No FK: a label '
  'publish replaces the match''s points rows.';
comment on column public.program_requests.point_label is
  'The reported point as the reporter saw it ("61 · Set 2 · 4-4 · 30-40 · '
  'Forehand winner by Lee"). Null when the report is about the whole match.';
