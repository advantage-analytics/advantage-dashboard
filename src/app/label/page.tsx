import { AdminPage } from "@/components/admin/admin-page";
import { AssignedSessionsList } from "@/components/label/assigned-sessions-list";
import { listAssignedLabelSessions } from "@/lib/data/label-assignments-server";

/**
 * `/label` — the matches assigned to the signed-in labeller (or admin),
 * newest assignment first. `listAssignedLabelSessions` takes the viewer from
 * the server-side session through the same gate as `label/layout.tsx`.
 *
 * `force-dynamic`: every read is service-role and per-viewer.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Labels" };

export default async function LabelHomePage() {
  const sessions = await listAssignedLabelSessions();

  return (
    // `AdminPage` is only the shared page column (28 / 56 / 72px) — no admin
    // chrome comes with it.
    <AdminPage className="gap-6">
      <div>
        <h1 className="text-display">Your matches</h1>
        <p className="text-body-sm mt-[9px]">
          Check every point against the video, then submit the match for review.
        </p>
      </div>
      <AssignedSessionsList sessions={sessions} />
    </AdminPage>
  );
}
