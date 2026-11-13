import { surname, surnameLabels } from "@/lib/data/match-utils";

/*
 * No "use client": the team profile page computes its labels on the server
 * (`roster/[playerId]/page.tsx`), and the chips and the match hook import
 * them from here.
 */

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
  const hasYou = youName.trim() !== "";
  const hasOpponent = opponentName.trim() !== "";
  if (!viewerIsYou && hasYou && hasOpponent) {
    const [you, opponent] = surnameLabels(youName, opponentName);
    return { you, opponent };
  }
  return {
    you: viewerIsYou ? "You" : hasYou ? surname(youName) : "Player",
    opponent: hasOpponent ? surname(opponentName) : "Opponent",
  };
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
