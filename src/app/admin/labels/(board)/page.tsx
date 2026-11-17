import { AdminPage } from "@/components/admin/admin-page";
import {
  LabelsBoard,
  LabelsHeading,
  RequestedReviews,
} from "@/components/admin/labels/labels-board";
import {
  getLabelJobFlagCounts,
  getLabelJobOwners,
  getLabelReviewRequests,
  labelJobSeenKey,
  type LabelJobOwner,
  type LabelReviewRequest,
} from "@/lib/data/label-overview-server";
import {
  loadAdminLabelBoard,
  loadTodoCandidates,
} from "@/lib/data/label-queue-server";
import { NotInTodoList } from "@/components/admin/labels/not-in-todo";
import { listLabelJobs, type LabelJobRow } from "@/lib/data/labels-server";
import { listLabellers } from "@/lib/services/labels/assign-session";
import type { FlagCounts } from "@/lib/services/labels/job-groups";
import { isOverdue } from "@/lib/services/labels/queue";
import { isFresh, lookAtSurface } from "@/lib/admin/seen-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";

/**
 * Admin › Labels — the labeller queue as the admin sees it, and under it
 * "Not in To do" (`loadTodoCandidates`), where the admin chooses what goes in
 * the labellers' To do. The queue
 * (`loadAdminLabelBoard`): To do, In progress, Published, to check and (while
 * it has rows) Submitted, every row named
 * and every row openable by the admin. Above the lanes, the matches a player
 * has asked us to look at again ("Requested reviews"), which are usually
 * published and so off the queue.
 *
 * `force-dynamic` for the same reason `admin/requests/page.tsx` is: every
 * read here is service-role and per-request, gated on the *current* session's
 * `is_admin` (`requireAdminOrNotFound` in `admin/layout.tsx` already gates the
 * route; each loader re-checks it anyway, matching every other admin loader).
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Labels" };

/**
 * The lede, as the AdminAudit artboard writes it: what is waiting on the
 * admin first, then what is late, then what is back with its labeller.
 */
function ledeText(toCheck: number, overdue: number, sentBack: number): string {
  const parts = [
    toCheck === 0
      ? "No published matches to check."
      : toCheck === 1
        ? "1 published match to check."
        : `${toCheck} published matches to check.`,
  ];
  if (overdue > 0) {
    parts.push(
      overdue === 1
        ? "1 match is overdue for labelling."
        : `${overdue} matches are overdue for labelling.`,
    );
  }
  if (sentBack > 0) {
    parts.push(
      sentBack === 1
        ? "1 is back with its labeller for fixes."
        : `${sentBack} are back with their labellers for fixes.`,
    );
  }
  return parts.join(" ");
}

/**
 * The reported matches' jobs, with what their rows show. Only read when a
 * report is open, since it reads every completed job. Allowed to fail: the
 * page then has no Requested reviews section, and every report is still on
 * the Requests page.
 */
async function readReviewJobs(
  reviews: ReadonlyMap<string, LabelReviewRequest>,
): Promise<{
  rows: LabelJobRow[];
  owners: Map<string, LabelJobOwner>;
  flags: Map<string, FlagCounts>;
}> {
  const none = { rows: [], owners: new Map(), flags: new Map() };
  if (reviews.size === 0) return none;
  const result = await listLabelJobs().catch(() => null);
  if (!result?.ok) return none;
  const rows = result.rows.filter((row) => reviews.has(row.matchId));
  const matchIds = rows.map((row) => row.matchId);
  const [owners, flags] = await Promise.all([
    // Allowed to fail — the jobs still list, as personal matches under their
    // own player's name.
    getLabelJobOwners(matchIds).catch(() => new Map<string, LabelJobOwner>()),
    // Allowed to fail too: the list then shows no counts, not no list.
    getLabelJobFlagCounts(matchIds).catch(() => new Map<string, FlagCounts>()),
  ]);
  return { rows, owners, flags };
}

export default async function AdminLabelsPage() {
  const admin = await requireAdminOrNotFound();
  const [board, candidates, seen, reviews, labellers] = await Promise.all([
    loadAdminLabelBoard(),
    // Every analysed match the admin may add to the labellers' To do.
    loadTodoCandidates(),
    // Records this look, which clears the nav's "Labels · N".
    lookAtSurface(admin.id, "labels"),
    getLabelReviewRequests().catch(() => new Map<string, LabelReviewRequest>()),
    // Never throws; a failed read leaves the Assign menu with "Unassigned"
    // only, and each row still shows who it is assigned to.
    listLabellers(),
  ]);
  const review = await readReviewJobs(reviews);
  const freshJobIds = review.rows
    .filter((row) => isFresh(seen, labelJobSeenKey(row.jobId), row.completedAt))
    .map((row) => row.jobId);

  // Read once, here, so every due text on the server's HTML and the
  // browser's first render is the same string.
  // eslint-disable-next-line react-hooks/purity -- a request-time clock, not a render-time one
  const now = Date.now();
  const overdue = board.todo.filter((row) => isOverdue(row.dueAt, now)).length;
  const sentBack = board.inProgress.filter((row) => row.sentBack).length;
  const assignable = "ok" in labellers ? labellers.labellers : [];

  return (
    <AdminPage className="gap-8">
      <LabelsHeading
        lede={
          <p className="text-body-sm mt-[9px]">
            {ledeText(board.toCheck.length, overdue, sentBack)}
          </p>
        }
      />

      <RequestedReviews
        rows={review.rows}
        owners={Object.fromEntries(review.owners)}
        flagCounts={Object.fromEntries(review.flags)}
        freshJobIds={freshJobIds}
        labellers={assignable}
      />

      <LabelsBoard board={board} now={now} labellers={assignable} />

      {/* Its own section, one step further from the lanes than they are
          from each other: the lanes are the labellers' work, this is the
          admin's choice of what feeds them. */}
      <div className="mt-6">
        <NotInTodoList rows={candidates} />
      </div>
    </AdminPage>
  );
}
