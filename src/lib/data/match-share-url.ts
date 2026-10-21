import { siteUrl } from "@/lib/site-url";

/**
 * `${siteUrl()}/m/${token}` — one spelling, shared by the share loader, its
 * actions and the MCP connector's `get_match`. Its own file so a module that
 * must not import `match-share-server.ts` (which pulls in the cookie client)
 * can still print the link.
 */
export function matchShareUrl(token: string): string {
  return `${siteUrl()}/m/${encodeURIComponent(token)}`;
}

/** The match page inside the app, for the same callers. */
export function matchPageUrl(matchId: string): string {
  return `${siteUrl()}/dashboard/matches/${encodeURIComponent(matchId)}`;
}
