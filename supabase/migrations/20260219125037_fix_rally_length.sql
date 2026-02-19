-- Fix rally_length to use MAX(shot_number) instead of COUNT(shots)
-- Serve faults and feeds (shot_number=0) were inflating rally_length.
-- This affected 322 out of 557 points.

-- Step 1: Fix rally_length for all existing points
UPDATE public.points p
SET rally_length = sub.max_shot
FROM (
  SELECT point_id, MAX(shot_number) AS max_shot
  FROM public.shots
  GROUP BY point_id
) sub
WHERE p.id = sub.point_id;

-- Step 2: Recalculate match stats for all matches to refresh avg_rally_length
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT match_id FROM public.points LOOP
    PERFORM public.calculate_match_stats(r.match_id);
  END LOOP;
END $$;
