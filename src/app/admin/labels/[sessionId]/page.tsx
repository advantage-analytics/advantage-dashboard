import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { LabelConsole } from "@/components/admin/labels/label-console";
import { getLabelSession } from "@/lib/data/labels-server";
import {
  addLabelShotAction,
  combineLabelPointsAction,
  completeLabelSessionAction,
  deleteLabelPointAction,
  deleteLabelShotAction,
  moveLabelPointAction,
  pullLabelGamePointsAction,
  removeLabelShotsAfterAction,
  reopenLabelSessionAction,
  resetLabelPointAction,
  resetLabelShotAction,
  restoreLabelPointAction,
  restoreLabelShotAction,
  restoreLabelShotsAction,
  dismissLabelSuggestionAction,
  insertLabelPointAction,
  restoreLabelSiteRemovalAction,
  setLabelGameServerAction,
  setLabelGameTypeAction,
  setLabelPointCheckedAction,
  shiftLabelGameOverflowAction,
  splitLabelPointAction,
  switchLabelPointPlayersAction,
  updateLabelPoint,
  updateLabelSessionFieldsAction,
  updateLabelShot,
} from "../actions";

/**
 * Admin › Labels › one session — the hand-labelling console (board 08): the
 * header, the video, the court and the points rail, every label field
 * autosaving through `updateLabelShot` / `updateLabelPoint`, and the row
 * operations (delete and Undo, add a shot, move a point, mark it checked,
 * reset an edited row to its seed, set a game's server or type, put back a
 * stroke the site removed, dismiss a suggestion, add a suggested point, move
 * a game's leftover points into the next game, store the score the labeller
 * read or that the video ends early, mark the session complete or reopen it)
 * through the rest
 * of `../actions`. The header lives
 * in the console, beside the save line it owns; the page only supplies the
 * way back.
 *
 * THIS PAGE DOES NOT SCROLL: `main` is bounded to the viewport under the
 * admin header and clips, so the console's points rail is the one thing
 * that scrolls — like the Film tab's points list. The bound is on this page's
 * `AdminPage` only; every other admin page keeps the growing column and its
 * 72px foot, which here is 24px since nothing scrolls up to it.
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

  const { session, video, marks } = result;

  return (
    <AdminPage className="h-[calc(100dvh-var(--header-h))] overflow-hidden pb-6">
      <LabelConsole
        session={session}
        video={video}
        marks={marks}
        onSaveShot={updateLabelShot}
        onSavePoint={updateLabelPoint}
        operations={{
          deleteShot: deleteLabelShotAction,
          restoreShot: restoreLabelShotAction,
          removeShotsAfter: removeLabelShotsAfterAction,
          restoreShots: restoreLabelShotsAction,
          deletePoint: deleteLabelPointAction,
          restorePoint: restoreLabelPointAction,
          addShot: addLabelShotAction,
          movePoint: moveLabelPointAction,
          setChecked: setLabelPointCheckedAction,
          resetShot: resetLabelShotAction,
          resetPoint: resetLabelPointAction,
          setGameServer: setLabelGameServerAction,
          setGameType: setLabelGameTypeAction,
          restoreSiteRemoval: restoreLabelSiteRemovalAction,
          dismissSuggestion: dismissLabelSuggestionAction,
          insertPoint: insertLabelPointAction,
          shiftGameOverflow: shiftLabelGameOverflowAction,
          pullGamePoints: pullLabelGamePointsAction,
          splitPoint: splitLabelPointAction,
          combinePoints: combineLabelPointsAction,
          switchPlayers: switchLabelPointPlayersAction,
          updateSessionFields: updateLabelSessionFieldsAction,
          completeSession: completeLabelSessionAction,
          reopenSession: reopenLabelSessionAction,
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
