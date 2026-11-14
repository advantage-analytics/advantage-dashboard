import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { LabelConsole } from "@/components/admin/labels/label-console";
import { getLabelSession, sessionDefaults } from "@/lib/data/labels-server";
import {
  firstAmberStop,
  labellerSession,
} from "@/lib/services/labels/labeller-view";
import { requireLabelReader } from "@/lib/services/programs/admin-guard";
import {
  addLabelShotAction,
  addMissingShotsAction,
  combineLabelPointsAction,
  deleteLabelPointAction,
  deleteLabelShotAction,
  dismissLabelSuggestionAction,
  combineLabelGamesAction,
  cutLabelSetAction,
  foldLabelTiebreakAction,
  insertLabelPointAction,
  moveLabelPointAction,
  moveLabelPointsAction,
  pullLabelGamePointsAction,
  recordLabelOpenCountsAction,
  recordLabelWorkBeatAction,
  redoLabelOpAction,
  removeLabelShotsAfterAction,
  resetLabelPointAction,
  resetLabelShotAction,
  restoreLabelPointAction,
  restoreLabelShotAction,
  restoreLabelShotsAction,
  restoreLabelSiteRemovalAction,
  setLabelGameServerAction,
  setLabelGameTypeAction,
  setLabelPointCheckedAction,
  shiftLabelGameOverflowAction,
  splitLabelGameAction,
  splitLabelPointAction,
  submitLabelSessionAction,
  switchLabelPointPlayersAction,
  switchLabelPointsPlayersAction,
  undoLabelOpAction,
  updateLabelPoint,
  updateLabelSessionFieldsAction,
  updateLabelShot,
  updateLabelShots,
} from "../actions";

/**
 * `/label/[sessionId]` — the labeller's console: the admin console
 * (`admin/labels/[sessionId]/page.tsx`) with `viewerKind="labeller"`, wired to
 * `../actions` and never to anything under `src/app/admin/`.
 *
 * READ gate: `requireLabelReader`, not `requireLabelActor`. The actor gate
 * refuses a submitted session — right for writes — but a labeller must still
 * be able to open their own submitted session read-only. So this admits an
 * admin, or the assigned labeller while the session is `labelling` or
 * `submitted`; anyone else gets `notFound()`, never a 403. Every write the
 * console makes still goes through the T3-gated services, which take none
 * from a labeller on a submitted session.
 *
 * The loader runs with `requireAdmin` answered by that reader's actor, and
 * what reaches the client is `labellerSession(...)`: no player names, match
 * id, job id or derivation version in the RSC payload — hiding them in the
 * markup alone would still ship them. `upload` is null for the same reason
 * (it names the program and the uploader). The signed video URL is expected.
 *
 * Opens on the work itself — the rail and the film (`"black"`), not the
 * overview an admin starts from — at the first amber stop
 * (`firstAmberStop`), else the console's own default. The page does not scroll: as on the admin page, the rail is the one
 * thing that does.
 */
export const dynamic = "force-dynamic";

/** No publish here (Mark complete is an admin's), so an ordinary write's budget. */
export const maxDuration = 30;

export const metadata = { title: "Label match" };

export default async function LabelSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const actor = await requireLabelReader(sessionId);
  if (!actor) notFound();

  const result = await getLabelSession(sessionId, {
    ...sessionDefaults,
    requireAdmin: async () => actor,
  });
  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    return (
      <AdminPage className="gap-4">
        <h1 className="text-display">Label match</h1>
        <p className="text-body-sm">{result.message}</p>
      </AdminPage>
    );
  }

  const { video, marks } = result;
  const session = labellerSession(result.session);
  const firstStop = firstAmberStop(session, marks);

  return (
    <AdminPage className="h-[calc(100dvh-var(--header-h))] overflow-hidden pb-6">
      <LabelConsole
        session={session}
        viewerKind="labeller"
        initialLayoutMode="black"
        upload={null}
        video={video}
        marks={marks}
        {...(firstStop ? { initialExpandedPointId: firstStop } : {})}
        onSaveShot={updateLabelShot}
        onSaveShots={updateLabelShots}
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
          movePoints: moveLabelPointsAction,
          setChecked: setLabelPointCheckedAction,
          resetShot: resetLabelShotAction,
          resetPoint: resetLabelPointAction,
          setGameServer: setLabelGameServerAction,
          setGameType: setLabelGameTypeAction,
          restoreSiteRemoval: restoreLabelSiteRemovalAction,
          dismissSuggestion: dismissLabelSuggestionAction,
          insertPoint: insertLabelPointAction,
          shiftGameOverflow: shiftLabelGameOverflowAction,
          splitGame: splitLabelGameAction,
          pullGamePoints: pullLabelGamePointsAction,
          combineGames: combineLabelGamesAction,
          foldTiebreak: foldLabelTiebreakAction,
          cutSet: cutLabelSetAction,
          splitPoint: splitLabelPointAction,
          combinePoints: combineLabelPointsAction,
          switchPlayers: switchLabelPointPlayersAction,
          switchPlayersByEnd: switchLabelPointsPlayersAction,
          updateSessionFields: updateLabelSessionFieldsAction,
          submitSession: submitLabelSessionAction,
          undo: undoLabelOpAction,
          redo: redoLabelOpAction,
          addMissingShots: addMissingShotsAction,
          recordOpenCounts: recordLabelOpenCountsAction,
          recordWorkBeat: recordLabelWorkBeatAction,
        }}
        headerAction={
          <Link
            href="/label"
            className="shrink-0 text-[13px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Back to my matches
          </Link>
        }
      />
    </AdminPage>
  );
}
