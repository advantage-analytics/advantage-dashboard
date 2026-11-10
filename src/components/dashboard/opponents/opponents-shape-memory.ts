"use client";

import { useMemo } from "react";
import {
  isCount,
  useRecalledShape,
  useRememberShape,
} from "@/components/dashboard/loading/shape-memory";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import type { OpponentsScope } from "./opponents-table-layout";
import { applyOpponentCut, RESTING_OPPONENT_CUT } from "./opponents-views";

/**
 * What each Opponents page drew at rest the last time this workspace opened
 * it — `loading/shape-memory.ts` keyed to the page's scope, so the `Suspense`
 * fallback holds open the height the table arrives at, or draws the day-zero
 * page when that is what the read resolved to last time (the Matches and
 * Roster skeletons' `PresenceGate` rule).
 *
 * The resting cut, not whatever chip or filter the viewer last left on: a
 * visit always starts at rest (a `?facedBy=` deep link is the one exception,
 * and it is rare enough to take the default).
 */
interface OpponentsShape {
  /** Rows at rest; 0 means the page was at day zero. */
  rows: number;
  /** Day zero's "N matches name no opponent" count, which picks its headline. */
  unnamed?: number;
}

/** Before anything has been counted. */
export const DEFAULT_OPPONENTS_ROWS = 5;

/**
 * The table has no paging, so a long list draws every row — but rows below
 * the fold move nothing anybody sees. Hold open no more than fill a screen.
 */
const MAX_PENDING_ROWS = 12;

function isOpponentsShape(value: unknown): value is OpponentsShape {
  const shape = value as OpponentsShape | null;
  return (
    !!shape &&
    isCount(shape.rows) &&
    (shape.unnamed === undefined || isCount(shape.unnamed))
  );
}

const surface = (scope: OpponentsScope) => `opponents:${scope}`;

/** What the skeleton should draw: day zero, or this many rows. */
export function useRecalledOpponentsShape(scope: OpponentsScope): {
  dayZero: boolean;
  rows: number;
  unnamed: number;
} {
  const { active } = useWorkspace();
  const shape = useRecalledShape(surface(scope), active.id, isOpponentsShape);
  if (shape?.rows === 0) {
    return { dayZero: true, rows: 0, unnamed: shape.unnamed ?? 0 };
  }
  return {
    dayZero: false,
    rows: Math.min(shape?.rows ?? DEFAULT_OPPONENTS_ROWS, MAX_PENDING_ROWS),
    unnamed: 0,
  };
}

export function useRememberOpponentsRows<
  T extends Parameters<typeof applyOpponentCut>[0][number],
>(scope: OpponentsScope, opponents: readonly T[]): void {
  const { active } = useWorkspace();
  const rows = useMemo(
    () => applyOpponentCut(opponents, RESTING_OPPONENT_CUT).visible.length,
    [opponents],
  );
  // Zero rows at rest with opponents to list is a default view that hides
  // them all — not day zero, so the skeleton keeps its default row count.
  useRememberShape(surface(scope), active.id, {
    rows: rows || DEFAULT_OPPONENTS_ROWS,
  });
}

/**
 * Rendered beside the day-zero page (a server component's branch): the next
 * visit's skeleton draws day zero instead of rows that will not arrive.
 * Renders nothing.
 */
export function RememberOpponentsDayZero({
  scope,
  unnamed = 0,
}: {
  scope: OpponentsScope;
  unnamed?: number;
}) {
  const { active } = useWorkspace();
  useRememberShape(surface(scope), active.id, { rows: 0, unnamed });
  return null;
}
