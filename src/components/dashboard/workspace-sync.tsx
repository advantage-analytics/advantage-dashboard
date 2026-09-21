"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/dashboard/workspace-provider";

/**
 * Re-renders the dashboard chrome when a page was drawn for a different
 * workspace than the one the chrome is showing.
 *
 * The page and the chrome resolve the workspace from the same cookie, but not
 * in the same render. A soft navigation re-renders the page and keeps the
 * layout the client already holds, so a cookie changed anywhere this tab's
 * router did not see — the switcher in a second tab, an invite accepted
 * elsewhere — leaves the old chrome standing. Click Home in that tab and
 * `/dashboard` redirects to the team, and Team Home paints beside the personal
 * sidebar and header.
 *
 * The page's answer is the fresh one: it was resolved on this request. So when
 * the two disagree the chrome is the side that is stale, and one refresh
 * re-runs the layout under the same cookie. Once per disagreement — a refresh
 * that somehow lands on the same mismatch must not loop.
 *
 * It never fires on a page that is just sitting there: another tab writing
 * the cookie does not re-render this one, and a disagreement only exists
 * after a navigation drew a page under a newer cookie than its chrome. That
 * matters most on the team upload page, whose wizard reads the workspace from
 * the chrome's context (`useWorkspace`) — left stale, it would attribute an
 * upload to the workspace the chrome names rather than the one the page was
 * built for. The wizard dropping its file selection when the refresh lands is
 * the intended outcome there, not collateral: that selection was made against
 * the wrong workspace.
 */
export function WorkspaceSync({ activeId }: { activeId: string }) {
  const router = useRouter();
  const { active } = useWorkspace();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (active.id === activeId) {
      refreshedFor.current = null;
      return;
    }
    if (refreshedFor.current === activeId) return;
    refreshedFor.current = activeId;
    router.refresh();
  }, [active.id, activeId, router]);

  return null;
}
