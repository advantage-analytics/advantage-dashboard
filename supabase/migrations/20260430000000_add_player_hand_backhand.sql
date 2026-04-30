ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS player_hand TEXT,
  ADD COLUMN IF NOT EXISTS player_backhand TEXT;
