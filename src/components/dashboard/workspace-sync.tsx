"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  readWorkspaceCookie,
  staleChromeTarget,
} from "@/lib/workspace/workspace-cookie";

/**
 * Re-renders the dashboard chrome when the workspace cookie has moved on
 * without it.
 *
 * The sidebar and header come from the dashboard layout, and a soft
 * navigation re-renders only the segments that changed — never that layout.
 * So a cookie changed anywhere this tab's router did not see (the switcher in
 * a second tab, an invite accepted elsewhere) leaves the old chrome standing,
 * and the next page drawn under the new cookie lands beside it: Team Home
 * beside a personal sidebar, or one team's schedule under another team's
 * name.
 *
 * Mounted once in the shell and re-checked on every pathname change, because
 * the disagreement can only surface on a navigation — which is also why it
 * could not live in a nested layout or template: those are reused across the
 * navigations inside them. The cookie is compared rather than a page prop so
 * every route is covered without each page opting in.
 *
 * It never fires on a page that is just sitting there: another tab writing
 * the cookie does not re-render this one. That matters most on the upload
 * wizard, which reads the workspace from this chrome's context
 * (`useWorkspace`) — left stale after a navigation, it would attribute an
 * upload to the workspace the chrome names rather than the one the cookie
 * (and so the server) now does. The wizard dropping its file selection when
 * the refresh lands is the intended outcome there, not collateral.
 *
 * Once per cookie value: a cookie the server refuses (a program the viewer has
 * left) falls back on the server, the chrome stays where it was, and the
 * guard keeps that one disagreement from refreshing on every navigation.
 */
export function WorkspaceSync() {
  const pathname = usePathname();
  const router = useRouter();
  const { active } = useWorkspace();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    const target = staleChromeTarget(
      readWorkspaceCookie(document.cookie),
      active.id,
    );
    if (!target) {
      refreshedFor.current = null;
      return;
    }
    if (refreshedFor.current === target) return;
    refreshedFor.current = target;
    router.refresh();
  }, [pathname, active.id, router]);

  return null;
}
