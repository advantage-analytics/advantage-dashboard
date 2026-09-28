"use client";

import { useMemo, useRef, useState } from "react";
import type {
  LabelPoint,
  LabelSession,
  LabelVideo,
} from "@/lib/services/labels/session";
import { LabelCourt } from "./label-court";
import { sideNames } from "./label-format";
import { LabelPointsTable } from "./label-points-table";
import { LabelVideoPlayer, type LabelVideoHandle } from "./label-video";

/**
 * `/admin/labels/[sessionId]` below the header — board 08's band (video
 * top-left, the vertical court card beside it) over the points table.
 *
 * Owns one piece of state: which point is open. Opening a point folds its
 * strokes out under it, marks them on the court, and puts the video on its
 * first timed stroke. Nothing here writes; T6 adds the editors.
 */
export function LabelConsole({
  session,
  video,
  initialExpandedPointId,
}: {
  session: LabelSession;
  video: LabelVideo | null;
  /**
   * The point open on first render. Defaults to the first point still to
   * check — where a labeller returning to a session picks up — or the first
   * live point once every one is checked.
   */
  initialExpandedPointId?: string | null;
}) {
  const names = useMemo(
    () => sideNames(session.player1Name, session.player2Name),
    [session.player1Name, session.player2Name],
  );
  const [expandedPointId, setExpandedPointId] = useState<string | null>(() =>
    initialExpandedPointId !== undefined
      ? initialExpandedPointId
      : (defaultPoint(session.points)?.id ?? null),
  );
  const player = useRef<LabelVideoHandle>(null);

  const expanded =
    session.points.find((point) => point.id === expandedPointId) ?? null;

  function togglePoint(pointId: string) {
    const opening = pointId !== expandedPointId;
    setExpandedPointId(opening ? pointId : null);
    if (!opening) return;
    const point = session.points.find((p) => p.id === pointId);
    const first = point?.shots.find(
      (shot) => shot.status !== "deleted" && shot.videoTime !== null,
    );
    if (first?.videoTime != null) player.current?.seekTo(first.videoTime);
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_500px]">
        <LabelVideoPlayer ref={player} video={video} />
        <LabelCourt
          title={
            expanded ? `Court · point ${expanded.pointIndex + 1}` : "Court"
          }
          shots={expanded?.shots ?? []}
          names={names}
        />
      </div>

      <LabelPointsTable
        points={session.points}
        names={names}
        expandedPointId={expandedPointId}
        onTogglePoint={togglePoint}
      />
    </>
  );
}

function defaultPoint(points: readonly LabelPoint[]): LabelPoint | null {
  const live = points.filter((point) => point.status !== "deleted");
  return live.find((point) => point.checkedAt === null) ?? live[0] ?? null;
}
