-- Shot speed is never shown (UGA coaches call, 2026-11-16): a single camera
-- cannot measure it accurately. The Ask SQL guard refuses speed_mph; these
-- comments stop pointing the model at it. Comments only — no data, no grants.
comment on column ask.shots.speed_mph is 'Not available to Ask: single-camera speed is not accurate, so it is never read or shown. Queries naming it are refused.';
comment on column ask.point_plays.last_shot_number is 'The last shot''s number within the point, as ask.shots.shot_number: join ask.shots on match_id, point_number and shot_number for anything else about that shot, such as its spin or zone; null when the point has no shots.';
