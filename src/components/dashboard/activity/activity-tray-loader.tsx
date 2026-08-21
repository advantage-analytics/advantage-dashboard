import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getActivityFeed } from "@/lib/data/activity-server";
import { ActivityTray } from "./activity-tray";

/**
 * The tray's data, fetched off the shell's critical path.
 *
 * The dashboard layout used to `await` this feed before returning any JSX at
 * all, so the sidebar, the header and the page content each waited on a query
 * that exists to fill a popover which is closed by default. Rendered inside a
 * `<Suspense>` instead, the shell paints immediately and this streams in.
 *
 * `getWorkspaceContext()` is React-`cache()`d, so resolving the workspace here
 * rather than threading it down costs nothing beyond the layout's own call —
 * and it keeps the feed's workspace scope next to the fetch that needs it.
 */
export async function ActivityTrayLoader() {
  const workspace = await getWorkspaceContext();
  if (!workspace) return <ActivityTrayFallback />;

  const supabase = await createClient();
  const feed = await getActivityFeed(supabase, workspace.active);

  return <ActivityTray feed={feed} />;
}

/**
 * The trigger, inert, at exactly the size the real one occupies.
 *
 * Same box so the header does not reflow when the feed arrives. No badge: a
 * count that appears and then changes reads worse than one that simply
 * appears.
 */
export function ActivityTrayFallback() {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 items-center justify-center rounded-[8px]"
    >
      <Activity
        className="size-[15px] text-[var(--ink-400)]"
        strokeWidth={1.5}
      />
    </span>
  );
}
