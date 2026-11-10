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
 * How many rows each Opponents page drew at rest the last time this workspace
 * opened it — `loading/shape-memory.ts` keyed to the page's scope, so the
 * `Suspense` fallback holds open the height the table arrives at.
 *
 * The resting cut, not whatever chip or filter the viewer last left on: a
 * visit always starts at rest (a `?facedBy=` deep link is the one exception,
 * and it is rare enough to take the default).
 */
interface OpponentsShape {
  rows: number;
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
  return !!shape && isCount(shape.rows) && shape.rows > 0;
}

const surface = (scope: OpponentsScope) => `opponents:${scope}`;

export function useRecalledOpponentsRows(scope: OpponentsScope): number {
  const { active } = useWorkspace();
  const shape = useRecalledShape(surface(scope), active.id, isOpponentsShape);
  return Math.min(shape?.rows ?? DEFAULT_OPPONENTS_ROWS, MAX_PENDING_ROWS);
}

export function useRememberOpponentsRows<
  T extends Parameters<typeof applyOpponentCut>[0][number],
>(scope: OpponentsScope, opponents: readonly T[]): void {
  const { active } = useWorkspace();
  const rows = useMemo(
    () => applyOpponentCut(opponents, RESTING_OPPONENT_CUT).visible.length,
    [opponents],
  );
  // Zero rows at rest is a page with nothing in its default view; the
  // skeleton keeps its default rather than drawing an empty card.
  useRememberShape(
    surface(scope),
    active.id,
    rows > 0 ? { rows } : { rows: DEFAULT_OPPONENTS_ROWS },
  );
}
