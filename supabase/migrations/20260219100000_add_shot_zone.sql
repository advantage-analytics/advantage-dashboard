-- Add zone column to shots table
-- Serves: 'T', 'Body', 'Wide'
-- Non-serves: 'Crosscourt', 'Middle', 'Down the Line'

ALTER TABLE public.shots ADD COLUMN zone text;

ALTER TABLE public.shots
  ADD CONSTRAINT shots_zone_check
  CHECK (zone IN ('T', 'Body', 'Wide', 'Crosscourt', 'Middle', 'Down the Line'));

-- Backfill existing rows
WITH shot_context AS (
  SELECT
    s.id,
    s.shot_number,
    s.landing_x,
    LAG(s.contact_x) OVER (PARTITION BY s.point_id ORDER BY s.shot_number) AS prev_contact_x
  FROM public.shots s
)
UPDATE public.shots t
SET zone = CASE
  -- Serves
  WHEN sc.shot_number = 1 AND sc.landing_x IS NOT NULL THEN
    CASE
      WHEN abs(sc.landing_x) >= 2.74 THEN 'Wide'
      WHEN abs(sc.landing_x) >= 1.37 THEN 'Body'
      ELSE 'T'
    END
  -- Non-serves
  WHEN sc.shot_number >= 2 AND sc.landing_x IS NOT NULL THEN
    CASE
      WHEN abs(sc.landing_x) <= 1.0 THEN 'Middle'
      WHEN sc.prev_contact_x IS NOT NULL AND sign(sc.landing_x) != sign(sc.prev_contact_x) THEN 'Crosscourt'
      WHEN sc.prev_contact_x IS NOT NULL AND sign(sc.landing_x) = sign(sc.prev_contact_x) THEN 'Down the Line'
      ELSE NULL
    END
  ELSE NULL
END
FROM shot_context sc
WHERE t.id = sc.id;
