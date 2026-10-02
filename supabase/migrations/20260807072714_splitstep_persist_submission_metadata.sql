-- Persist the three vendor-request fields that only ever existed in flight.
-- Applied live 2026-08-07 as version 20260807072714.
--
-- buildSplitStepJobRequest() needs them, but processing_jobs had no column for
-- any of them, so /api/splitstep/jobs took them from the HTTP body and threw
-- them away after submitting. Two consequences, and the second is the one that
-- matters:
--
--   1. A resubmission could silently send a different value than the first
--      attempt, with nothing to compare against.
--   2. The derivation engine (Phase 2) has to map "top of frame" strokes back
--      onto player1/player2. Without a stored orientation there is no
--      authoritative answer, and getting it backwards attributes every
--      statistic to the wrong player while looking completely normal in the UI
--      — the exact failure the spec's §5 gate exists to prevent.
--
-- Nullable with no default on purpose. NULL means "submitted before this
-- column existed", which is honest; a default would invent an orientation for
-- rows that never recorded one.

alter table public.processing_jobs
  add column if not exists initial_top_player_is_player1 boolean,
  add column if not exists ad_scoring boolean,
  add column if not exists fixed_camera boolean;

comment on column public.processing_jobs.initial_top_player_is_player1 is
  'True when player1 stood at the TOP of frame in the first frame of the trimmed video. Camera-relative, not a player identity: ends change every odd game and this describes only the start. Phase 2 needs it to attribute strokes to the right player.';

comment on column public.processing_jobs.ad_scoring is
  'True for ad scoring, false for no-ad. Sent to the vendor as `Ad`.';

comment on column public.processing_jobs.fixed_camera is
  'True when the camera did not pan or move during the match. Sent to the vendor as `FixedCamera`.';
