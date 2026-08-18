import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Session refresh, and nothing else. See `lib/supabase/middleware.ts` for why
 * route protection is not done here.
 *
 * This is Next 16's `proxy` convention, which replaced the `middleware` file
 * convention — same request interception, new name.
 */
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  /**
   * Every page request, so the session cookie keeps sliding as the user moves
   * around — minus three groups that must not pay for it:
   *
   * - `api/webhooks/*` and `api/cron/*` are called by Stripe, the Advantage
   *   Intelligence vendor and Vercel Cron. They carry no session cookie, so a
   *   refresh is guaranteed to be a no-op, and running one would put a live
   *   Supabase auth round-trip in front of a payment webhook that authenticates
   *   itself by signature. Those handlers already gate on signature or bearer
   *   secret; this is latency and a failure mode with nothing bought for it.
   * - `_next/*` and `favicon.ico`, which Next serves without app code.
   * - static image files, for the same reason.
   *
   * The rest of `/api` stays matched: those routes are called by the browser
   * with cookies attached, and they read the session like any page does.
   */
  matcher: [
    "/((?!api/webhooks|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
