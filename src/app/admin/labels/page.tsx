import { AdminPage } from "@/components/admin/admin-page";
import { LabelsBoard } from "@/components/admin/labels/labels-board";
import {
  getLabelJobFlagCounts,
  getLabelJobOwners,
  getLabelReviewRequests,
  labelJobSeenKey,
} from "@/lib/data/label-overview-server";
import { listLabelJobs } from "@/lib/data/labels-server";
import { isFresh, lookAtSurface } from "@/lib/admin/seen-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";

/**
 * Admin › Labels — the hand-labelling console's entry point ("Labels B",
 * LabelsFlat): every completed Advantage Intelligence job, newest first,
 * with the matches a player has asked us to look at again on top.
 *
 * `force-dynamic` for the same reason `admin/requests/page.tsx` is: every
 * read here is service-role and per-request, gated on the *current* session's
 * `is_admin` (`requireAdminOrNotFound` in `admin/layout.tsx` already gates the
 * route; `listLabelJobs` re-checks it anyway, matching every other admin
 * loader).
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Labels" };

const LEDE =
  "Labelling a match replaces its points and statistics with what you saw on the video.";

export default async function AdminLabelsPage() {
  const admin = await requireAdminOrNotFound();
  const [result, seen, reviews] = await Promise.all([
    listLabelJobs(),
    lookAtSurface(admin.id, "labels"),
    // Allowed to fail: the list then has no Requested reviews section, and
    // every report is still on the Requests page.
    getLabelReviewRequests().catch(() => new Map()),
  ]);
  const matchIds = result.ok ? result.rows.map((row) => row.matchId) : [];
  const [owners, flags] = await Promise.all([
    // Allowed to fail — the jobs still list, as personal matches under their
    // own player's name.
    getLabelJobOwners(matchIds).catch(() => new Map()),
    // Allowed to fail too: the list then shows no counts, not no list.
    getLabelJobFlagCounts(matchIds).catch(() => new Map()),
  ]);
  const freshJobIds = result.ok
    ? result.rows
        .filter((row) =>
          isFresh(seen, labelJobSeenKey(row.jobId), row.completedAt),
        )
        .map((row) => row.jobId)
    : [];

  return (
    <AdminPage className="gap-6">
      <div>
        <h1 className="text-display">Labels</h1>
        <p className="text-body-sm mt-[9px]">
          {freshJobIds.length > 0
            ? `${freshJobIds.length} new since you last looked. ${LEDE}`
            : LEDE}
        </p>
      </div>

      {result.ok ? (
        <LabelsBoard
          rows={result.rows}
          owners={Object.fromEntries(owners)}
          flagCounts={Object.fromEntries(flags)}
          reviews={Object.fromEntries(reviews)}
          freshJobIds={freshJobIds}
        />
      ) : (
        <p className="text-body-sm">{result.message}</p>
      )}
    </AdminPage>
  );
}
