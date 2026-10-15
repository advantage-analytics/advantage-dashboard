import { originFromHeaders, siteUrl } from "@/lib/site-url";

/**
 * The origin `/api/mcp` names itself by — in the 401's `WWW-Authenticate`
 * and as the `resource` of the protected-resource metadata. A client sends
 * its token wherever that document says the resource is, so it is read from
 * configuration, never from a `Host` or `X-Forwarded-Host` a caller can set:
 * `siteUrl()` (`NEXT_PUBLIC_SITE_URL`, then Vercel's own variables) on every
 * production build. Only outside one — `next dev`, the specs — with
 * `NEXT_PUBLIC_SITE_URL` unset does the request's own origin stand in, so a
 * worktree's server on port 3002 still names itself.
 */
export function mcpOrigin(headers: {
  get(name: string): string | null;
}): string {
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) return siteUrl();
  if (process.env.NODE_ENV === "production") return siteUrl();
  return originFromHeaders(headers);
}
