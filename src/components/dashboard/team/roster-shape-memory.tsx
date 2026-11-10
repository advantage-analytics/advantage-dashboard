"use client";

import {
  isCount,
  useRecalledShape,
  useRememberShape,
} from "@/components/dashboard/loading/shape-memory";

/**
 * What the Roster table looked like the last time this workspace rendered it,
 * for the route's loading skeleton — `loading/shape-memory.ts` keyed to the
 * roster. The skeleton can then draw the right number of rows, the bench
 * divider, the Invited section and the staff line before anything is read.
 */
export interface RosterShape {
  /** Players in the lineup (a `lineupSpot`). */
  ranked: number;
  /** Players out of it — drawn under the "Not in the lineup" divider. */
  benched: number;
  /** Open invitations — drawn under the "Invited" divider. */
  invites: number;
  /** Whether the footer carries the "Coached by …" line above the quota line. */
  staffLine: boolean;
}

/** Before anything has been read: a mid-sized squad, nobody benched or invited. */
export const DEFAULT_ROSTER_SHAPE: RosterShape = {
  ranked: 6,
  benched: 0,
  invites: 0,
  staffLine: true,
};

const SURFACE = "roster";

function isRosterShape(value: unknown): value is RosterShape {
  const shape = value as RosterShape | null;
  return (
    !!shape &&
    isCount(shape.ranked) &&
    isCount(shape.benched) &&
    isCount(shape.invites) &&
    shape.ranked + shape.benched + shape.invites > 0 &&
    typeof shape.staffLine === "boolean"
  );
}

export function useRecalledRosterShape(
  workspaceId: string,
): RosterShape | undefined {
  return useRecalledShape(SURFACE, workspaceId, isRosterShape);
}

/**
 * Rendered by the populated Roster page (a server component, so this is its
 * client hook): teaches the loading boundary this workspace's shape for the
 * next visit. Renders nothing.
 */
export function RememberRosterShape({
  workspaceId,
  ...shape
}: { workspaceId: string } & RosterShape) {
  useRememberShape(SURFACE, workspaceId, shape);
  return null;
}
