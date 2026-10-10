-- "Mark complete" publishes a session's labels to its match, which takes a
-- while. This is the lease that holds it: set when a publish claims the
-- session, cleared when it finishes (success or not). While it is fresh, the
-- session takes no edits, no second Complete and no Reopen; a lease older
-- than the publish could have run (the console's 5-minute window) is stale —
-- a publish killed mid-way — and the next Complete takes it over.
alter table public.label_sessions
  add column publishing_since timestamptz;
