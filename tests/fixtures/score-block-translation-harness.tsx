import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { ScoreBlock } from "@/components/dashboard/matches/new-match-wizard/ScoreBlock";

/**
 * The Match step's score card, with its format and games driven from the spec
 * through `window.setBestOf` / `window.setGames`, so a test can rewrite the
 * card's DOM the way a browser page translator does and then make React
 * commit the change that drops the "Type in the dashed column" hint — a
 * Format pick of Best of 1, or a score that decides the match.
 *
 * React errors are parked on `window.reactErrors` (the root's
 * `onUncaughtError` / `onCaughtError`), which is where a commit-phase
 * `removeChild` NotFoundError lands.
 */

interface TranslationHarnessWindow {
  setBestOf: (bestOf: string) => void;
  setGames: (player: (number | null)[], opponent: (number | null)[]) => void;
  reactErrors: string[];
}

const harness = window as unknown as TranslationHarnessWindow;
const noop = () => {};

function Harness() {
  const [bestOf, setBestOf] = useState("3");
  const [games, setGames] = useState<{
    player: (number | null)[];
    opponent: (number | null)[];
  }>({ player: [null, null, null], opponent: [null, null, null] });

  useEffect(() => {
    harness.setBestOf = setBestOf;
    harness.setGames = (player, opponent) => setGames({ player, opponent });
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <ScoreBlock
      formData={{
        bestOf,
        adScoring: undefined,
        playerScores: games.player,
        opponentScores: games.opponent,
        playerTiebreaks: [null, null, null],
        opponentTiebreaks: [null, null, null],
        numberOfSets: Number(bestOf),
      }}
      playerName="Alex"
      opponentName="Sam"
      fromLine={false}
      onScoreChange={noop}
      onTiebreakChange={noop}
      onSetsChange={noop}
    />
  );
}

harness.reactErrors = [];
const record = (error: unknown) =>
  harness.reactErrors.push(String((error as Error)?.message ?? error));
createRoot(document.getElementById("root")!, {
  onUncaughtError: record,
  onCaughtError: record,
}).render(<Harness />);
