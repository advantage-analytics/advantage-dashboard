import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { LabelConsole } from "@/components/admin/labels/label-console";
import { getLabelSession } from "@/lib/data/labels-server";
import {
  addLabelShotAction,
  deleteLabelPointAction,
  deleteLabelShotAction,
  moveLabelPointAction,
  resetLabelPointAction,
  resetLabelShotAction,
  restoreLabelPointAction,
  restoreLabelShotAction,
  setLabelPointCheckedAction,
  updateLabelPoint,
  updateLabelShot,
} from "../actions";

/**
 * Admin › Labels › one session — the hand-labelling console (board 08): the
 * header, the video + court band and the points table, every label field
 * autosaving through `updateLabelShot` / `updateLabelPoint`, and the row
 * operations (delete and Undo, add a shot, move a point, mark it checked,
 * reset an edited row to its seed)
 * through the rest of `../actions`. The header lives
 * in the console, beside the save line it owns; the page only supplies the
 * way back.
 *
 * `force-dynamic` for the same reason as `admin/labels/page.tsx`: every read
 * is service-role and per request, and the video URL is signed per render.
 * `getLabelSession` re-checks `requireAdmin` even though `admin/layout.tsx`
 * already gates the route.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Label match" };

export default async function AdminLabelSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await getLabelSession(sessionId);

  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    return (
      <AdminPage className="gap-4">
        <h1 className="text-display">Label match</h1>
        <p className="text-body-sm">{result.message}</p>
      </AdminPage>
    );
  }

  const { session, video } = result;

  return (
    <AdminPage className="gap-6">
      <LabelConsole
        session={session}
        video={video}
        onSaveShot={updateLabelShot}
        onSavePoint={updateLabelPoint}
        operations={{
          deleteShot: deleteLabelShotAction,
          restoreShot: restoreLabelShotAction,
          deletePoint: deleteLabelPointAction,
          restorePoint: restoreLabelPointAction,
          addShot: addLabelShotAction,
          movePoint: moveLabelPointAction,
          setChecked: setLabelPointCheckedAction,
          resetShot: resetLabelShotAction,
          resetPoint: resetLabelPointAction,
        }}
        headerAction={
          <Link
            href="/admin/labels"
            className="shrink-0 text-[13px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Back to Labels
          </Link>
        }
      />
    </AdminPage>
  );
}
