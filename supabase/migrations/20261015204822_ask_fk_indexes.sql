-- Foreign keys on the Ask tables that had no covering index. A delete on the
-- parent (a program, a conversation, an answer message) scans the child
-- table without one. The tables are small, so a plain (non-concurrent)
-- build inside the migration's transaction is fine. Partial on `is not null`:
-- the cascade's `fk = $1` lookup implies it, and null rows never need one.
--
-- Not done here: `ask_answer_cache_key`, the unique constraint that
-- `ask_answer_cache_key_nnd` (20261015164943) now covers, is redundant but
-- harmless (one extra index write per cache put). Dropping it is left for a
-- deliberate destructive migration.
--
-- Applied to the live database on 2026-10-15 as version 20261015204822
-- (`ask_fk_indexes`). VERIFIED: all six indexes present in pg_indexes.

create index if not exists ask_answer_cache_program_idx
  on public.ask_answer_cache (program_id) where program_id is not null;
create index if not exists ask_pins_conversation_idx
  on public.ask_pins (conversation_id) where conversation_id is not null;
create index if not exists ask_pins_answer_idx
  on public.ask_pins (answer_id) where answer_id is not null;
create index if not exists ask_pins_program_idx
  on public.ask_pins (program_id) where program_id is not null;
create index if not exists ask_runs_conversation_idx
  on public.ask_runs (conversation_id) where conversation_id is not null;
create index if not exists ask_runs_program_idx
  on public.ask_runs (program_id) where program_id is not null;
