import { headers } from "next/headers";
import { originFromHeaders } from "./site-url";

/**
 * The origin the person making this request is on.
 *
 * For Server Components, Server Actions and Route Handlers — anywhere a
 * request is in hand. Use it for the links a person reads on screen (a claim
 * URL to paste to a coach), for redirects, and for Supabase `redirectTo`s:
 * a dev server on port 3002 gets port 3002, a preview deployment gets itself,
 * production gets whichever domain the person actually arrived on.
 *
 * NOT for anything that lands in an email. Those come from `siteUrl()` —
 * configuration, never the request — because a `Host` an attacker can set
 * must never become the origin of a link somebody else is asked to click.
 * `docs/email-system.md` §5 states the rule; `site-url.ts` explains the split.
 *
 * `headers()` opts the caller into dynamic rendering. Every current caller is
 * already dynamic (it reads cookies or search params), so nothing changes.
 */
export async function requestOrigin(): Promise<string> {
  return originFromHeaders(await headers());
}
