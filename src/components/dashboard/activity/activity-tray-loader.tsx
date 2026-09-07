import { Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getActivityFeed, getElsewhereWork } from "@/lib/data/activity-server";
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
 * down with it — and the reads run together rather than in sequence, since the
 * tray needs all of them before it renders any.
 *
 * The third read is the other workspaces' in-flight counts. The feed is scoped
 * to the active workspace on purpose; this is what lets the tray say "1 upload
 * running in Personal" from inside a program instead of showing nothing at
 * all. See `getElsewhereWork` for the cost.
 */
export async function ActivityTrayLoader() {
  const workspace = await getWorkspaceContext();
  if (!workspace) return <ActivityTrayFallback />;

  const supabase = await createClient();
  const [feed, invites, elsewhere] = await Promise.all([
    getActivityFeed(supabase, workspace.active),
    getPendingInvites(supabase),
    getElsewhereWork(supabase, workspace.active, workspace.available),
  ]);

  return <ActivityTray feed={feed} invites={invites} elsewhere={elsewhere} />;
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
      {/* Resting ink-700, the same as the real trigger, so the glyph does not
          brighten when the feed arrives. */}
      <Activity
        className="size-[15px] text-[var(--ink-700)]"
        strokeWidth={1.5}
      />
    </span>
  );
}
