-- SwingVision shots.zone: place every non-serve from its OWN hitter's contact.
--
-- process-match used to compare a shot's landing_x with the PREVIOUS shot's
-- contact_x — the opponent's position — which inverted most SwingVision
-- directions (return zones matched SwingVision's own Direction label on 29%
-- of in-play returns; the own-contact rule matches 83%, rally shots 98%). It
-- also gave serve zones to the non-serves SwingVision numbers shot 1.
--
-- Same rule as directionZone() in src/lib/services/splitstep/derivation/court.ts
-- and process-match's twin of it. Serves keep their zones (unchanged rule).
-- Idempotent: re-running sets the same values.
update public.shots s
set zone = case
    when s.landing_x is null then null
    when abs(s.landing_x) <= 1.0 then 'Middle'
    when s.contact_x is null or s.contact_x = 0 then null
    when sign(s.contact_x) <> sign(s.landing_x) then 'Crosscourt'
    else 'Down the Line'
  end
from public.points p
join public.matches m on m.id = p.match_id
where p.id = s.point_id
  and m.source_provider = 'swing-vision'
  and lower(coalesce(s.shot_type, '')) not in ('first serve', 'second serve', 'serve');
