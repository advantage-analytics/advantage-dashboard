import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { CreatePracticeCopies } from "@/components/admin/labels-practice/create-practice-copies";
import { PracticeGrades } from "@/components/admin/labels-practice/practice-grades";
import { getPracticeOverview } from "@/lib/data/practice-server";
import { listLabellers } from "@/lib/services/labels/assign-session";
import {
  createPracticeCopiesAction,
  deletePracticeCopyAction,
} from "../../actions";

/**
 * Admin › Labels › one session › Practice copies: make paid test copies of a
 * completed analyst session for reviewer applicants, and grade each submitted
 * copy against it (practice-grading.ts). Reached from the console header of a
 * completed session. `force-dynamic`: every read is service-role and per
 * request; `getPracticeOverview` re-checks `requireAdmin`.
 */
export const dynamic = "force-dynamic";

/** Making copies derives the job's results file once; give it room. */
export const maxDuration = 120;

export const metadata = { title: "Practice copies" };

export default async function PracticeCopiesPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const [overview, labellers] = await Promise.all([
    getPracticeOverview(sessionId),
    listLabellers(),
  ]);
  if (!overview.ok) {
    if (overview.reason === "not-found") notFound();
    return (
      <AdminPage className="gap-4">
        <h1 className="text-display">Practice copies</h1>
        <p className="text-body-sm">Only an admin can see this page.</p>
      </AdminPage>
    );
  }
  const { key, copies, canCopy } = overview;

  return (
    <AdminPage className="gap-8">
      <div>
        <h1 className="text-display">Practice copies</h1>
        <p className="text-body-sm mt-[9px]">
          {key.player1Name} v {key.player2Name}. This session is the answer key.{" "}
          <Link
            href={`/admin/labels/${key.id}`}
            className="font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            Open the key
          </Link>
        </p>
      </div>

      {canCopy ? (
        <CreatePracticeCopies
          sourceSessionId={key.id}
          pointsBySet={key.pointsBySet}
          judgedBySet={key.judgedBySet}
          labellers={"ok" in labellers ? labellers.labellers : []}
          alreadyHave={copies.flatMap((c) =>
            c.labeller ? [c.labeller.id] : [],
          )}
          create={createPracticeCopiesAction}
        />
      ) : (
        <p className="text-body-sm">
          Mark this session complete before making practice copies from it: a
          copy is graded against the finished labels.
        </p>
      )}

      <PracticeGrades
        sourceSessionId={key.id}
        copies={copies}
        remove={deletePracticeCopyAction}
      />
    </AdminPage>
  );
}
