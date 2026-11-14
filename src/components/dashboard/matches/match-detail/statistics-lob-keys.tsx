"use client";

import { createContext, use, type ReactNode } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  useBallPathsRoute,
  useLobShotKeys,
} from "@/components/dashboard/matches/match-detail/film/use-ball-paths";

/**
 * The match's lob shots for the Statistics view's cards — the head-to-head
 * Lob points row and the Net game card's Lobbed segment
 * (`MatchFilterContext.lobKeys`, `lobShotKeys` in `match-filters/net-game.ts`).
 *
 * `StatisticsView` fetches the ball-paths file ONCE (`useLobShotKeys`, silent
 * on every failure, and shared with the Video tab through its one-entry
 * cache) and hands the keys down here, so the two cards cannot read different
 * answers. Only an Advantage Intelligence match has a file, and never on a
 * read-only mount (a share link, the sample): the route asks for a session.
 * The admin report is the one read-only mount that reads it, from its own
 * route (`useBallPathsRoute`).
 *
 * `null` — no provider, no file, not loaded yet — is "unknown", never "no
 * lobs": the Lob row draws a dash with no cut, and the Net game card leaves
 * Lobbed out (those points read as Passed).
 */
const LobKeysContext = createContext<ReadonlySet<number> | null>(null);

export function StatisticsLobKeysProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { match } = useMatchData();
  const { meta } = useMatchReport();
  const route = useBallPathsRoute(meta.readOnly);
  const lobKeys = useLobShotKeys({
    matchId: match.id,
    enabled: meta.isDerived && route.allowed,
    endpoint: route.endpoint,
  });
  return <LobKeysContext value={lobKeys}>{children}</LobKeysContext>;
}

/** The Statistics view's lob keys, or `null` (see the header). */
export function useStatisticsLobKeys(): ReadonlySet<number> | null {
  return use(LobKeysContext);
}
