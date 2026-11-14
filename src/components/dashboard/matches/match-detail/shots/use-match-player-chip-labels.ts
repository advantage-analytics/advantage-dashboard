"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import {
  matchPlayerChipLabels,
  type PlayerChipLabels,
} from "./player-chip-labels";

/**
 * The open match report's two chips (under `MatchDataProvider`). Kept apart
 * from `player-chips.tsx` so the team profile, which has no match report,
 * does not pull the match-data provider along with the chips.
 */
export function useMatchPlayerChipLabels(): PlayerChipLabels {
  const { match } = useMatchData();
  const { you, opp } = useMatchSides();
  const viewerIsYou = match.viewerIsYou === true;
  return useMemo(
    () => matchPlayerChipLabels(you.name, opp.name, viewerIsYou),
    [you.name, opp.name, viewerIsYou],
  );
}
