-- Add match_stats to the realtime publication so clients can subscribe to INSERT
-- events (emitted when calculate_match_stats writes a match's stats at the end of
-- processing). Replaces client-side polling of match_stats_with_percentages in
-- recent-activity.tsx. RLS already restricts SELECT to the match owner, which
-- authorizes the subscription. Replica identity stays default (INSERT payloads
-- carry the full new row, which is all the client needs).
alter publication supabase_realtime add table public.match_stats;
