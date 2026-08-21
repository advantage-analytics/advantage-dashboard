import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

/**
 * Where the claim flow's ✕ leads.
 *
 * It used to lead to `/`. That is right for the person who arrived from the
 * marketing site and changed their mind, and wrong for everyone else: a
 * signed-in coach who opened the flow from the sidebar's "Create team
 * workspace" pressed ✕ and was dropped on the marketing home, logged in, with
 * no way back to their dashboard except the browser's back button.
 *
 * A route rather than a prop on nine pages. `ClaimShell` is a plain component
 * and cannot await a session, so making the destination depend on one meant
 * either resolving it in every page that renders the shell — nine files, each
 * able to forget — or resolving it once, here, behind a link the shell can
 * point at unconditionally. The two screens that deliberately exit somewhere
 * else (`ready`, `review`, which end inside the product) still pass their own
 * `exitHref` and never reach this.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Absolute, because NextResponse.redirect requires it. `siteUrl()` is the
  // same origin the rest of the app builds links from, so a preview deployment
  // exits to itself rather than to production.
  return NextResponse.redirect(
    new URL(user ? "/dashboard" : "/", siteUrl())
  );
}
