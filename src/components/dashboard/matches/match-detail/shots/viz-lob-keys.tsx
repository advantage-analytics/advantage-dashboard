"use client";

import type { ReactNode } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  useBallPathsRoute,
  useLobShotKeys,
} from "@/components/dashboard/matches/match-detail/film/use-ball-paths";

import { VizLobKeysContext } from "./viz-lob-keys-context";

/**
 * The match's lob shots for the Visualizations tab — what the Approaches
 * cut's endings read (`MatchFilterContext.lobKeys`, laid in by
 * `useVizFilterContext`).
 *
 * `ShotsTab` mounts this ONCE around the wall and the lightbox, so the cards
 * and the opened view read the same answer and only one read of the
 * ball-paths file is made (`useLobShotKeys`, silent on every failure, and
 * shared with the Statistics view and the Video tab through its one-entry
 * cache). The gate is the Statistics view's (`statistics-lob-keys.tsx`): only
 * an Advantage Intelligence match has a file, and never on a read-only mount
 * (a share link, the sample) — the route asks for a session. The admin report
 * is the one read-only mount that reads it, from its own route
 * (`useBallPathsRoute`).
 *
 * `null` — no provider, no file, not loaded yet — is "unknown", never "no
 * lobs": an approach that was passed or lobbed reads "Passed or lobbed".
 * The context and its reader (`useVizLobKeys`) live in
 * `viz-lob-keys-context.ts`.
 */
export function VizLobKeysProvider({ children }: { children: ReactNode }) {
  const { match } = useMatchData();
  const { meta } = useMatchReport();
  const route = useBallPathsRoute(meta.readOnly);
  const lobKeys = useLobShotKeys({
    matchId: match.id,
    enabled: meta.isDerived && route.allowed,
    endpoint: route.endpoint,
  });
  return <VizLobKeysContext value={lobKeys}>{children}</VizLobKeysContext>;
}
