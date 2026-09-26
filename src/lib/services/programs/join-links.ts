/**
 * The join flow's URLs, in one place.
 *
 * Three surfaces build the way into an invitation and the way back out of it
 * — the token page, the signed-in page and the onboarding intercept — and each
 * used to spell the paths and the decline flag by hand. A producer and a
 * consumer disagreeing about the flag fails silently: the decline link just
 * re-renders the offer. So the flag has one name, one writer and one reader.
 *
 * A leaf on purpose: no imports, so client components can build a link
 * without dragging server code into their bundle.
 */

/** The mailed link's page. */
export function joinHref(token: string): string {
  return `/join/${encodeURIComponent(token)}`;
}

/** A signed-in invitation's page. The id is not a secret. */
export function invitationHref(inviteId: string): string {
  return `/invitations/${encodeURIComponent(inviteId)}`;
}

/**
 * Sign in first, then come back to `path`.
 *
 * `/login` is the one form that knows every way into a session — password
 * today, Google beside it, whatever it grows next — and it clamps `next` with
 * `safeNext`, which any same-origin path passes unchanged. The Google leg does
 * not forward the path off-origin: see `handleGoogleOAuth` in
 * `components/auth/login-form.tsx`.
 */
export function signInThenHref(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

const NOT_NOW_PARAM = "not-now";

/**
 * "Not now" — a flag on a GET and nothing else.
 *
 * Declining must leave the server exactly as it found it: no row written, no
 * token spent, nobody told. A GET with a flag cannot do any of those by
 * construction, which is a stronger guarantee than an action reviewed for not
 * doing so.
 */
export function notNowHref(path: string): string {
  return `${path}?${NOT_NOW_PARAM}=1`;
}

/**
 * A repeated key arrives as an array from Next's `searchParams`; nothing the
 * app emits repeats it, but a hand-edited URL should still read as a decline
 * rather than quietly re-rendering the offer.
 */
export function isNotNow(query: {
  [key: string]: string | string[] | undefined;
}): boolean {
  const value = query[NOT_NOW_PARAM];
  return Array.isArray(value) ? value.includes("1") : value === "1";
}
