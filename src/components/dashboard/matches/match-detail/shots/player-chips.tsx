"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { surname, surnameLabels } from "@/lib/data/match-utils";
import { LifecycleChip } from "./lifecycle-chip";
import type { PlayerFilter } from "./viz-model";

/**
 * The words on the Visualizations player switch, one per side.
 *
 * "You" is said only to the player the charts are about (`viewerIsYou`). A
 * coach, a teammate, an admin and a share-link reader are reading ABOUT that
 * player, so both chips are names — as `insight-voice.ts` picks the observer
 * summary for them. Which side is which is never decided here: the caller
 * hands over the names already oriented (`useMatchSides`, guardrails §4).
 */
export interface PlayerChipLabels {
  you: string;
  opponent: string;
}

/**
 * A match report's two chips. Surnames, as the report's cards label players
 * (`surnameLabels`: two players sharing one each gain a first initial, so
 * the chips can never read the same). A side with no name keeps "Opponent".
 */
export function matchPlayerChipLabels(
  youName: string,
  opponentName: string,
  viewerIsYou: boolean,
): PlayerChipLabels {
  const hasOpponent = opponentName.trim() !== "";
  if (viewerIsYou) {
    return {
      you: "You",
      opponent: hasOpponent ? surname(opponentName) : "Opponent",
    };
  }
  if (youName.trim() === "" || !hasOpponent) {
    return {
      you: youName.trim() === "" ? "Player" : surname(youName),
      opponent: hasOpponent ? surname(opponentName) : "Opponent",
    };
  }
  const [you, opponent] = surnameLabels(youName, opponentName);
  return { you, opponent };
}

/** The open match report's two chips (under `MatchDataProvider`). */
export function useMatchPlayerChipLabels(): PlayerChipLabels {
  const { match } = useMatchData();
  const { you, opp } = useMatchSides();
  const viewerIsYou = match.viewerIsYou === true;
  return useMemo(
    () => matchPlayerChipLabels(you.name, opp.name, viewerIsYou),
    [you.name, opp.name, viewerIsYou],
  );
}

/**
 * A player profile's two chips: the season is one player against everyone
 * they played, so the second chip is plural and never a name.
 */
export function seasonPlayerChipLabels(
  playerName: string,
  viewerIsYou: boolean,
): PlayerChipLabels {
  return {
    you: viewerIsYou
      ? "You"
      : playerName.trim() === ""
        ? "Player"
        : surname(playerName),
    opponent: "Opponents",
  };
}

/** The player switch: the report's player first, the other side second. */
export function PlayerChips({
  value,
  onChange,
  labels,
  className = "flex gap-2",
}: {
  value: PlayerFilter;
  onChange: (player: PlayerFilter) => void;
  labels: PlayerChipLabels;
  className?: string;
}) {
  return (
    <div className={className} role="group" aria-label="Player">
      {(["you", "opponent"] as const).map((side) => (
        <LifecycleChip
          key={side}
          pressed={value === side}
          onClick={() => onChange(side)}
        >
          {labels[side]}
        </LifecycleChip>
      ))}
    </div>
  );
}
