import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getActivityFeed } from "@/lib/data/activity-server";
import { getPendingInvites } from "@/lib/data/pending-invites-server";
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
 *
 * Pending invitations ride along on the same stream because they are scoped to
 * the signed-in ADDRESS rather than to a workspace: an invitation to a program
 * you have not joined belongs to no workspace at all, so it has to show in
 * whichever one happens to be active or it shows nowhere. `getPendingInvites`
 * returns `[]` on a read failure, so this second query cannot take the header
 * down with it — and the two run together rather than in sequence, since the
 * tray needs both before it renders either.
 */
export async function ActivityTrayLoader() {
  const workspace = await getWorkspaceContext();
  if (!workspace) return <ActivityTrayFallback />;

  const supabase = await createClient();
  const [feed, invites] = await Promise.all([
    getActivityFeed(supabase, workspace.active),
    getPendingInvites(supabase),
  ]);

  return <ActivityTray feed={feed} invites={invites} />;
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
