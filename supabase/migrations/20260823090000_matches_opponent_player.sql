-- Who the opponent was, without giving them the match.
--
-- ── Why this is not `player2_id` ────────────────────────────────────────────
-- The obvious move is to put the opposing player's `program_players.id` into
-- `player2_id`, the column that already exists for exactly this shape. It is
-- wrong, and the reason is the SELECT policy on `matches`:
--
--   auth.uid() = created_by
--   OR player1_id IN (my_player_ids())
--   OR player2_id IN (my_player_ids())     <-- here
--   OR (program_id ... staff or roster_visible player)
--
-- `player2_id` GRANTS READ ACCESS. That is correct when player two is one of
-- ours — an intra-squad match, a teammate — and it is the whole mechanism by
-- which a player claiming their profile gains their own history.
--
-- For an opponent it is the exact inverse of what we want. The pooled-identity
-- design says opposing programs eventually claim the rows we contributed on
-- their behalf; that is the growth loop, not an edge case. The moment one does,
-- `my_player_ids()` starts returning that id, `visible_match_ids()` starts
-- returning our match, and the policies on `match_stats`, `points` and `shots`
-- hand them the lot — including OUR player's serve and return numbers, since
-- `match_stats` is keyed on `(match_id, is_player1)` and both rows come back
-- together.
--
-- That is the Tier 3 leak the pooling design exists to prevent, arriving
-- through the one door nobody was watching.
--
-- So: identity WITHOUT access. This column is read by aggregation and by
-- nothing else. It appears in no policy, and it must stay that way — adding it
-- to the `matches` predicate would silently re-open everything above.
--
-- ── Known limitation ────────────────────────────────────────────────────────
-- `merge_program_players` re-points `player1_id` and `player2_id` and does not
-- know about this column, so merging two opponent profiles leaves matches
-- pointing at the absorbed row. `pooled_player` filters `merged_into_id is
-- null`, so such a profile reads as absent rather than as wrong. Worth fixing
-- when the merge tool is next opened; not worth changing a shipped
-- SECURITY DEFINER function for today.

alter table public.matches
  add column if not exists opponent_player_id uuid
  references public.program_players(id) on delete set null;

-- The opponent-profile read: every match this program played against one
-- person. Partial — the column is null on every row that predates it and on
-- every match against somebody with no directory identity.
create index if not exists matches_opponent_player_idx
  on public.matches (opponent_player_id)
  where opponent_player_id is not null;

comment on column public.matches.opponent_player_id is
  'The opposing player''s pooled identity. Deliberately NOT player2_id: that column appears in the matches SELECT policy and would hand the opponent our statistics once they claim the profile. Used for aggregation only — never put this column in a policy.';
