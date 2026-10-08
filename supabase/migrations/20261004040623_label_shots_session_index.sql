-- label_shots.session_id is a foreign key to label_sessions with only a partial
-- index behind it: label_shots_session_event_key covers (session_id, event_id)
-- where event_id is not null, so it skips every shot the labeller added. The
-- console loads a session's shots by session_id, and deleting a session
-- cascades through it; both need a full index.
create index if not exists label_shots_session on public.label_shots (session_id);
