import { AdminPage } from "@/components/admin/admin-page";
import { AssignedSessionsList } from "@/components/label/assigned-sessions-list";
import { LabelBoard } from "@/components/label/label-board";
import { listAssignedLabelSessions } from "@/lib/data/label-assignments-server";
import { loadLabellerBoard } from "@/lib/data/label-queue-server";
import { requireLabeller } from "@/lib/services/labels/claim-session";
import { requireLabelViewerOrNotFound } from "@/lib/services/programs/admin-guard";

/**
 * `/label` — the labeller's board (`loadLabellerBoard`): To do, In progress
 * and Submitted, with no player, program, owner or match id anywhere on it.
 * Practice sets are not on the queue, so they still list below through
 * `AssignedSessionsList`, filtered to practice copies.
 *
 * `force-dynamic`: every read is service-role and per-viewer.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Labels" };

export default async function LabelHomePage() {
  const viewer = await requireLabelViewerOrNotFound();
  const [board, sessions, canClaim] = await Promise.all([
    loadLabellerBoard(),
    listAssignedLabelSessions(),
    // The gate answers "admin" before it looks at `is_labeller`; the claim
    // asks only whether the caller is a labeller, so ask the same here.
    viewer.kind === "labeller"
      ? Promise.resolve(true)
      : requireLabeller().then((labeller) => labeller !== null),
  ]);
  const practice = sessions.filter((session) => session.practice);
  // Read once, here, so every due text on the server's HTML and the browser's
  // first render is the same string.
  // eslint-disable-next-line react-hooks/purity -- a request-time clock, not a render-time one
  const now = Date.now();

  return (
    // `AdminPage` is only the shared page column (28 / 56 / 72px) — no admin
    // chrome comes with it.
    <AdminPage className="gap-10">
      <LabelBoard board={board} now={now} canClaim={canClaim} />
      {practice.length > 0 ? (
        <section
          aria-labelledby="label-practice"
          className="flex flex-col gap-3"
        >
          <h2
            id="label-practice"
            className="text-[13px] font-semibold text-[var(--ink-900)]"
          >
            Practice sets
          </h2>
          <AssignedSessionsList sessions={practice} />
        </section>
      ) : null}
    </AdminPage>
  );
}
