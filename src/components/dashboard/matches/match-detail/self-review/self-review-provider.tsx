"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  readingOf,
  sameReading,
  type PointReading,
  type SelfReviewState,
} from "@/lib/data/self-review";
import {
  SelfReviewContext,
  type SavedSummary,
  type SelfReviewContextValue,
} from "./self-review-context";
import { saveSelfReview } from "./self-review-actions";
import { statsMoved } from "./self-review-stats";

/**
 * Fix points (Advantage Review canvas, "Self review"): the mode, the
 * unsaved fixes and the save, shared by the title row (Fix points, then
 * Cancel and "Save N fixes"), the details line ("Edited by you · 3 points"),
 * and the Video tab's banner and point list.
 *
 * `state` is the server's (`self_review_state`) and is never copied: after a
 * save the page refreshes and the new state arrives as the prop. What lives
 * here is only what the server does not have yet — the drafts.
 */

export function SelfReviewProvider({
  matchId,
  state,
  viewerId,
  locked,
  points,
  youIsPlayer1,
  children,
}: {
  matchId: string;
  state: SelfReviewState;
  viewerId: string | null;
  locked: boolean;
  points: MatchPoint[];
  youIsPlayer1: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [fixing, setFixing] = useState(false);
  const [drafts, setDrafts] = useState<Map<string, PointReading>>(new Map());
  const [openPointId, setOpenPointId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const [saving, startSaving] = useTransition();

  const edits = useMemo(
    () => new Map(state.edits.map((edit) => [edit.pointId, edit])),
    [state.edits],
  );
  const editOf = useCallback((pointId: string) => edits.get(pointId), [edits]);

  const storedFor = useCallback(
    (point: MatchPoint) =>
      edits.get(point.id)?.current ??
      readingOf(point.resultType, point.wonByPlayer1),
    [edits],
  );
  const originalFor = useCallback(
    (point: MatchPoint) =>
      edits.get(point.id)?.original ??
      readingOf(point.resultType, point.wonByPlayer1),
    [edits],
  );
  const readingFor = useCallback(
    (point: MatchPoint) => drafts.get(point.id) ?? storedFor(point),
    [drafts, storedFor],
  );

  const setDraft = useCallback(
    (point: MatchPoint, reading: PointReading | null) => {
      setDrafts((current) => {
        const next = new Map(current);
        // A draft that only restates what is stored is no draft at all.
        if (!reading || sameReading(reading, storedFor(point))) {
          next.delete(point.id);
        } else {
          next.set(point.id, reading);
        }
        return next;
      });
    },
    [storedFor],
  );

  const pendingCount = drafts.size;

  const start = useCallback(() => {
    if (locked || !state.canFix) return;
    setSaved(null);
    setError(null);
    setFixing(true);
  }, [locked, state.canFix]);

  const cancel = useCallback(() => {
    setFixing(false);
    setDrafts(new Map());
    setOpenPointId(null);
    setError(null);
  }, []);

  // Esc leaves the mode (the reorder mode's rule), once nothing nearer — a
  // fix form, a menu — has taken it. Unsaved fixes go with it, as on Cancel.
  useEffect(() => {
    if (!fixing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (openPointId) {
        setOpenPointId(null);
        return;
      }
      cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fixing, openPointId, cancel]);

  const save = useCallback(() => {
    if (drafts.size === 0) return;
    setError(null);
    const pointsById = new Map(points.map((point) => [point.id, point]));
    const fixes = [...drafts].map(([pointId, reading]) => {
      const point = pointsById.get(pointId);
      // Back to the published reading is a Reset: the seed is the authority.
      return point && sameReading(reading, originalFor(point))
        ? { pointId, reset: true as const }
        : { pointId, ...reading };
    });
    const summary = statsMoved(points, drafts, youIsPlayer1, storedFor);
    startSaving(async () => {
      const result = await saveSelfReview(matchId, fixes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved({ count: drafts.size, ...summary });
      setFixing(false);
      setDrafts(new Map());
      setOpenPointId(null);
      router.refresh();
    });
  }, [drafts, points, matchId, originalFor, router, storedFor, youIsPlayer1]);

  const value = useMemo<SelfReviewContextValue>(
    () => ({
      state,
      viewerId,
      locked,
      fixing,
      start,
      cancel,
      drafts,
      setDraft,
      openPointId,
      setOpenPointId,
      editOf,
      readingFor,
      originalFor,
      pendingCount,
      save,
      saving,
      error,
      saved,
      dismissSaved: () => setSaved(null),
    }),
    [
      state,
      viewerId,
      locked,
      fixing,
      start,
      cancel,
      drafts,
      setDraft,
      openPointId,
      editOf,
      readingFor,
      originalFor,
      pendingCount,
      save,
      saving,
      error,
      saved,
    ],
  );

  return <SelfReviewContext value={value}>{children}</SelfReviewContext>;
}
