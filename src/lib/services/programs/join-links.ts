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
 * without dragging server code into their bundle. That is also why the
 * ABSOLUTE join-link URL is not built here: it needs `siteUrl()`, which reads
 * `VERCEL_*` variables a browser bundle does not have and would silently
 * resolve to `localhost`. `joinLinkUrl()` in `lib/data/team-settings-server.ts`
 * composes `siteUrl()` with `joinHref()` the way `matchShareUrl()` does, and
 * every URL a client sees is handed down from the server already built.
 */

/**
 * Who a program's join link admits — `program_join_links.mode`.
 *
 *   open     anyone who opens it joins as a player at once
 *   approve  opening it files a join request for staff to approve on the Roster
 *
 * Here rather than in the server modules so the popover and the `/join`
 * screens can type their props without importing them.
 */
export type JoinLinkMode = "open" | "approve";

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

/**
 * Create an account first, then come back to `path`.
 *
 * The sign-up page carries `next` into its confirmation mail's
 * `/confirm?next=`, so the click that activates the account is also the one
 * that lands back on the join link. Same clamp as `/login`.
 */
export function signUpThenHref(path: string): string {
  return `/sign-up?next=${encodeURIComponent(path)}`;
}

/**
 * The token in a `/join/<token>` path, or null for any other path.
 *
 * The auth pages use it to tell that a `next` came from a join link, so they
 * can say which team the sign-in is for. Reads only the path segment: a query
 * string or hash after the token (`?not-now=1`) is not part of it.
 */
export function joinTokenFromPath(path: string): string | null {
  const match = /^\/join\/([^/?#]+)/.exec(path);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return null;
  }
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
