-- One small still per match video, so a list row shows an image instead of
-- opening the video.
--
-- The column holds an OBJECT KEY in the video container
-- (`thumbnails/{match_id}/{uuid}.jpg`), never a URL and never image bytes.
-- NULL means no thumbnail: the row draws its fallback.
--
-- No index: it is read by primary key alongside the row and never filtered on.
--
-- No new policy: the image inherits the match's visibility because the key is
-- only ever read through `matches`' own select policy and signed server-side.
-- The match's creator can write this column like any other on their row, so
-- the server signs a key only when it has the exact shape above for that
-- row's own id (`isThumbnailKeyFor` in src/lib/match-thumbnail.ts). The check
-- constraint below states the same rule in the database, so a planted key
-- cannot be stored in the first place.

alter table public.matches
  add column if not exists video_thumbnail_key text;

alter table public.matches
  drop constraint if exists matches_video_thumbnail_key_shape;

alter table public.matches
  add constraint matches_video_thumbnail_key_shape check (
    video_thumbnail_key is null
    or video_thumbnail_key ~ (
      '^thumbnails/' || id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    )
  );

comment on column public.matches.video_thumbnail_key is
  'Object key of the match video''s list-row still in the video container (thumbnails/{match_id}/{uuid}.jpg). Never a URL. NULL = none.';
