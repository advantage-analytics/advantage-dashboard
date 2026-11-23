import { headers } from "next/headers";
import { REQUEST_PATH_HEADER } from "@/lib/auth/request-path-header";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * The path and query this request asked for, as the proxy recorded it, or
 * null on a route outside the proxy matcher. Unclamped: run it through
 * `safeNext()` (or a helper that does) before redirecting anywhere with it.
 */
export async function requestedPath(): Promise<string | null> {
  return (await headers()).get(REQUEST_PATH_HEADER);
}

/**
 * `/login?next=<the page that was asked for>`, clamped by `safeNext()`.
 *
 * `fallback` is where to land when the header is missing (a route outside the
 * proxy matcher) — the gate's own area, so a lost path still lands somewhere
 * the visitor was headed rather than on the personal dashboard.
 */
export async function loginRedirectPath(fallback: string): Promise<string> {
  const requested = await requestedPath();
  const next = requested ? safeNext(requested) : fallback;
  return `/login?next=${encodeURIComponent(next)}`;
}
