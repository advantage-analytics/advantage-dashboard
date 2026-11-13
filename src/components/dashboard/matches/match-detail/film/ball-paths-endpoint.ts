"use client";

import { createContext, use } from "react";

/**
 * Where a read-only mount reads the match's ball-paths file, or `null` when
 * it has nowhere to (`MatchReportProvider ballPathsEndpoint`, which
 * the provider puts here).
 *
 * A context of its own, like `film-read-only.ts`, rather than a read of the
 * report context: `use-ball-paths.ts` is bundled into the film room's small
 * browser harnesses (the point list on its own), and importing
 * `match-report-context.tsx` there drags in the whole report — the harness
 * then never hydrates. `null` with no provider, which is every harness.
 */
export const BallPathsEndpointContext = createContext<string | null>(null);

export function useBallPathsEndpoint(): string | null {
  return use(BallPathsEndpointContext);
}
