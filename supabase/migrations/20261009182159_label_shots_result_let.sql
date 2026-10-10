-- A let on a serve: the ball clipped the net and the serve is replayed — a
-- stored result of its own, beside in / out / net. Set by the labeller only;
-- the vendor never reports one and the coordinates can never derive one.
alter table public.label_shots
  drop constraint label_shots_result_check,
  add constraint label_shots_result_check
    check (result in ('in', 'out', 'net', 'let'));
