import { safeNext } from "@/lib/auth/safe-next";

/** Where the terms screen returns to when nothing better is known. */
const DASHBOARD = "/dashboard";

/**
 * The dashboard page the terms screen hands an account back to.
 *
 * `dashboard/layout.tsx` sends an account that owes an agreement to
 * `/terms-update` from whatever dashboard URL it asked for, and that URL is
 * where it should land once it agrees: a link to a match opened from an email
 * or a share should open the match, not Home. The value arrives on a query
 * string, so it is clamped by `safeNext()` first and then held to the
 * dashboard: the screen only ever stands in front of `/dashboard`, so it never
 * sends anyone anywhere else.
 */
export function termsReturnPath(value: string | null | undefined): string {
  const next = safeNext(value ?? null);
  const pathname = next.split(/[?#]/, 1)[0];
  return pathname === DASHBOARD || pathname.startsWith(`${DASHBOARD}/`)
    ? next
    : DASHBOARD;
}

/**
 * `/terms-update`, carrying `?next=` when the account was headed somewhere
 * other than the dashboard's front page. The plain path is kept for the
 * default so the ordinary case reads as it always did.
 */
export function termsUpdateHref(requested: string | null | undefined): string {
  const next = termsReturnPath(requested);
  return next === DASHBOARD
    ? "/terms-update"
    : `/terms-update?next=${encodeURIComponent(next)}`;
}
