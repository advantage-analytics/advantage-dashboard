import { AdminPage } from "@/components/admin/admin-page";
import { LabelsBoard } from "@/components/admin/labels/labels-board";
import {
  getLabelJobFlagCounts,
  getLabelJobOwners,
} from "@/lib/data/label-overview-server";
import { listLabelJobs } from "@/lib/data/labels-server";

/**
 * Admin › Labels — the hand-labelling console's entry point, T4.
 *
 * `force-dynamic` for the same reason `admin/requests/page.tsx` is: every
 * read here is service-role and per-request, gated on the *current* session's
 * `is_admin` (`requireAdminOrNotFound` in `admin/layout.tsx` already gates the
 * route; `listLabelJobs` re-checks it anyway, matching every other admin
 * loader).
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Labels" };

export default async function AdminLabelsPage() {
  const result = await listLabelJobs();
  // Whose match each job is: how the list groups. Allowed to fail — the jobs
  // still list, under Personal matches and their own player's name.
  const matchIds = result.ok ? result.rows.map((row) => row.matchId) : [];
  const [owners, flags] = await Promise.all([
    getLabelJobOwners(matchIds).catch(() => new Map()),
    // Allowed to fail too: the list then shows no counts, not no list.
    getLabelJobFlagCounts(matchIds).catch(() => new Map()),
  ]);

  return (
    <AdminPage className="gap-4">
      <div>
        <h1 className="text-display">Labels</h1>
        <p className="text-body-sm mt-[9px]">
          Completed Advantage Intelligence jobs, by program and player.
          Labelling one replaces its match’s points and statistics with what you
          saw on the video.
        </p>
      </div>

      {result.ok ? (
        <LabelsBoard
          rows={result.rows}
          owners={Object.fromEntries(owners)}
          flagCounts={Object.fromEntries(flags)}
        />
      ) : (
        <p className="text-body-sm">{result.message}</p>
      )}
    </AdminPage>
  );
}
