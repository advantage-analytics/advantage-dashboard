/**
 * Where a sign-in should land, carried across the Google round trip.
 *
 * The password path never leaves this origin, so `?next=` on `/login` is all
 * it needs. The Google path leaves: `signInWithOAuth` puts `redirectTo` in the
 * authorize URL's query string, which Supabase's auth server receives and
 * logs. An invitation's `next` is `/join/<token>`, and the token is a live
 * credential that is meant to exist in exactly one place — the email — so it
 * must not be handed to a third party's request log. A first-party cookie
 * crosses the round trip on the browser's own top-level navigation back to
 * `/callback` (SameSite=Lax permits that) and never appears in any URL.
 *
 * Short-lived, path-only, cleared by `/callback` the moment it is read.
 */
export const AUTH_NEXT_COOKIE = "auth-next";

/** Long enough to finish a Google sign-in, short enough to be harmless. */
export const AUTH_NEXT_MAX_AGE_SECONDS = 10 * 60;
