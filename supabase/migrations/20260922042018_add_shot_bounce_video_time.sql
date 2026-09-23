-- Where the ball bounced, in seconds, for Advantage Intelligence shots.
-- Additive and nullable: SwingVision imports never write it, and no existing
-- row is backfilled — a match gets the value only when it is re-derived.
alter table public.shots
  add column bounce_video_time real null;

comment on column public.shots.bounce_video_time is
  'Seconds on the same clock as video_time at which the ball bounced. Source: the vendor''s bounce_frame fitted through the strokes'' frame/time pairs (src/lib/services/splitstep/derivation/frame-clock.ts). Null for SwingVision imports and for strokes with no observed bounce.';
