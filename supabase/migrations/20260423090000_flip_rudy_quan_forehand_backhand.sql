-- Rudy Quan is right-handed but his SwingVision export labels his strokes as
-- if he were left-handed (verified by comparing FH/BH distribution vs. his
-- right-handed opponents in the same matches). Swap Forehand <-> Backhand on
-- his shots across his matches so the Return graph renders correctly.
UPDATE shots s
SET shot_type = CASE s.shot_type
  WHEN 'Forehand' THEN 'Backhand'
  WHEN 'Backhand' THEN 'Forehand'
  ELSE s.shot_type
END
FROM points p, matches m
WHERE s.point_id = p.id
  AND p.match_id = m.id
  AND m.player1_name = 'Rudy Quan'
  AND s.is_player1 = true
  AND s.shot_type IN ('Forehand', 'Backhand');
