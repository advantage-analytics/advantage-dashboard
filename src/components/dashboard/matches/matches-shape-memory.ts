"use client";

import {
  isCount,
  rememberShape,
  useRecalledShape,
} from "@/components/dashboard/loading/shape-memory";
import type { MatchesListShape } from "./match-list-layout";

/**
 * The last list shape each workspace rendered, for the route's `loading.tsx`
 * — `loading/shape-memory.ts` keyed to the Matches list. The first page's row
 * count, whether the Date track needs the year, and whether a second page
 * exists.
 */
const SURFACE = "matches";

function isMatchesShape(value: unknown): value is MatchesListShape {
  const shape = value as MatchesListShape | null;
  return (
    !!shape &&
    isCount(shape.rows) &&
    shape.rows > 0 &&
    typeof shape.needsYear === "boolean" &&
    typeof shape.paged === "boolean"
  );
}

export function rememberMatchesShape(
  workspaceId: string,
  shape: MatchesListShape,
): void {
  rememberShape(SURFACE, workspaceId, shape);
}

export function useRecalledMatchesShape(
  workspaceId: string,
): MatchesListShape | undefined {
  return useRecalledShape(SURFACE, workspaceId, isMatchesShape);
}
