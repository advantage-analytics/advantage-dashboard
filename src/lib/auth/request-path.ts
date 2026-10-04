import { headers } from "next/headers";
import { REQUEST_PATH_HEADER } from "@/lib/auth/request-path-header";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * `/login?next=<the page that was asked for>`, clamped by `safeNext()`.
 *
 * `fallback` is where to land when the header is missing (a route outside the
 * proxy matcher) — the gate's own area, so a lost path still lands somewhere
 * the visitor was headed rather than on the personal dashboard.
 */
export async function loginRedirectPath(fallback: string): Promise<string> {
  const requested = (await headers()).get(REQUEST_PATH_HEADER);
  const next = requested ? safeNext(requested) : fallback;
  return `/login?next=${encodeURIComponent(next)}`;
}
