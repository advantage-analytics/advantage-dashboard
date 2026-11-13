"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchFilters } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import type { MatchFilterContext } from "@/components/dashboard/matches/match-detail/match-filters/model";

import { useFilmReadOnly } from "./film-read-only";
import { useBallPathsRoute, useLobShotKeys } from "./use-ball-paths";

/**
 * The shared filter context (`useMatchFilters().context`) with the match's lob
 * shots laid in (`MatchFilterContext.lobKeys`) — what the Video tab's list,
 * its drawer count and the Advanced panel evaluate a landed cut with, so a Net
 * game "Lobbed" or a Lob points cut admits the points the Statistics card
 * counted.
 *
 * The lobs come off the ball-paths file, fetched as silently as the room's own
 * paths (`useLobShotKeys`, the same one-entry cache). Only an Advantage
 * Intelligence match has one, and never on a read-only mount: the route asks
 * for a session (the admin report names its own, `useBallPathsRoute`). Until
 * it lands — or with none — the context carries no lob keys, so a lobbed cut
 * admits nothing and "passed" keeps its lob-blind meaning.
 */
export function useFilmFilterContext(): MatchFilterContext {
  const { match } = useMatchData();
  const { context } = useMatchFilters();
  const readOnly = useFilmReadOnly();
  const route = useBallPathsRoute(readOnly);
  const lobKeys = useLobShotKeys({
    matchId: match.id,
    enabled: match.sourceProvider === "splitstep" && route.allowed,
    endpoint: route.endpoint,
  });
  return useMemo(
    () => (lobKeys ? { ...context, lobKeys } : context),
    [context, lobKeys],
  );
}
