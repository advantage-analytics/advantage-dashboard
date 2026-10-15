-- ask_feedback.program_id references programs on delete cascade
-- (20261014225402) with no covering index; missed by 20261015204822, found
-- by the /pr-check review of PR #460. Partial for the same reason as there.
--
-- Applied to the live database on 2026-10-15 as version 20261015205851
-- (`ask_feedback_program_idx`).

create index if not exists ask_feedback_program_idx
  on public.ask_feedback (program_id) where program_id is not null;
