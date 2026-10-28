"use client";

import { createContext, use } from "react";
import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  NO_SELF_REVIEW,
  readingOf,
  type PointEdit,
  type PointReading,
  type SelfReviewState,
} from "@/lib/data/self-review";

/**
 * Fix points' shared state, as its readers see it — the title row, the
 * details line, the Video tab's banner, the point list and its fix form.
 * `SelfReviewProvider` (`self-review-provider.tsx`) fills it.
 *
 * Its own module, with nothing server-side in its imports: the point list
 * reads this hook, and the offline harnesses bundle the point list for a bare
 * browser, where the provider's server action and router cannot load.
 */

export interface SavedSummary {
  count: number;
  /** "Winners 12 → 13" for each of the viewer's stats a fix moved. */
  moved: string[];
  /** A fix changed who won a game's last point: the score may not add up. */
  scoreMayNotAddUp: boolean;
}

export interface SelfReviewContextValue {
  state: SelfReviewState;
  viewerId: string | null;
  /** Verified by Advantage: nothing here may change (D1). */
  locked: boolean;
  fixing: boolean;
  start: () => void;
  cancel: () => void;
  /** Unsaved fixes by point id: the reading the point will have. */
  drafts: ReadonlyMap<string, PointReading>;
  /** A reading for a point, or null to drop its draft. */
  setDraft: (point: MatchPoint, reading: PointReading | null) => void;
  /** The point whose fix form is open. */
  openPointId: string | null;
  setOpenPointId: (pointId: string | null) => void;
  /** Saved edits by point id. */
  editOf: (pointId: string) => PointEdit | undefined;
  /** The point's reading as it stands: its draft, else what is stored. */
  readingFor: (point: MatchPoint) => PointReading;
  /** The reading Advantage Intelligence published, before any fix. */
  originalFor: (point: MatchPoint) => PointReading;
  /** Drafts that would change something on save. */
  pendingCount: number;
  save: () => void;
  saving: boolean;
  error: string | null;
  saved: SavedSummary | null;
  dismissSaved: () => void;
}

const NOOP = () => {};

const DEFAULT: SelfReviewContextValue = {
  state: NO_SELF_REVIEW,
  viewerId: null,
  locked: false,
  fixing: false,
  start: NOOP,
  cancel: NOOP,
  drafts: new Map(),
  setDraft: NOOP,
  openPointId: null,
  setOpenPointId: NOOP,
  editOf: () => undefined,
  readingFor: (point) => readingOf(point.resultType, point.wonByPlayer1),
  originalFor: (point) => readingOf(point.resultType, point.wonByPlayer1),
  pendingCount: 0,
  save: NOOP,
  saving: false,
  error: null,
  saved: null,
  dismissSaved: NOOP,
};

export const SelfReviewContext = createContext<SelfReviewContextValue>(DEFAULT);

/**
 * Outside a provider (the public share page, the sample match, harnesses)
 * this answers "nothing to fix, nothing edited", so every consumer can read
 * it unconditionally.
 */
export function useSelfReview(): SelfReviewContextValue {
  return use(SelfReviewContext);
}
