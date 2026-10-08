-- Every write to the label tables goes through the service role, behind the
-- admin check and the session-open check in the server code. The signed-in
-- role keeps SELECT (still admin-only by policy) and loses the direct writes,
-- so "a complete session is read-only" and the per-session marks setting hold
-- at the database, not only in the app. The write policies stay; with no
-- grant behind them they admit nothing.
revoke insert, update, delete on public.label_sessions from authenticated;
revoke insert, update, delete on public.label_points from authenticated;
revoke insert, update, delete on public.label_shots from authenticated;
