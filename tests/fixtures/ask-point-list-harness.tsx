import { createRoot } from "react-dom/client";

import { AskPointList } from "@/components/dashboard/ask/ask-point-list";
import type { AskSourceMatch } from "@/lib/services/ask/events";
import type { AskShowPoint } from "@/lib/services/ask/show";

/**
 * The Ask answer's points line in a real browser; `tests/ask-point-list.spec.ts`
 * bundles this and reads the markup.
 *
 * Query string:
 * - `?case=page`   on the Ask page (the default): one link opens the film
 *                  on every point
 * - `&scope=team`  the match names the program's player
 * - `&f=<filters>` the measure's cut, carried on every link
 * - `&truncated=1` the match held more points than the list carries
 * - `&counted=1`   the rows are the points the headline figure counts
 */
const params = new URLSearchParams(window.location.search);

const MATCH: AskSourceMatch = {
  matchId: "match-sep-28",
  opponentName: "Theo Lindqvist",
  playedOn: "2026-09-28",
  iWon: true,
  scoreText: "6-4, 6-3",
  playerName: params.get("scope") === "team" ? "Ana Sokolov" : null,
};

const POINTS: AskShowPoint[] = [
  {
    pointNumber: 3,
    setNumber: 1,
    gameNumber: 1,
    pointScore: "30-15",
    gameScore: "0-0",
    resultType: "Ace",
    iWon: true,
    iServed: true,
    videoTime: 12.5,
    duration: 3,
  },
  {
    pointNumber: 7,
    setNumber: 1,
    gameNumber: 2,
    pointScore: "0-15",
    gameScore: "1-0",
    resultType: "Backhand Unforced Error",
    iWon: false,
    iServed: false,
    videoTime: 80,
    duration: 9,
  },
  // Never timed by the source: nowhere to seek to.
  {
    pointNumber: 40,
    setNumber: 2,
    gameNumber: 3,
    pointScore: "40-30",
    gameScore: "1-1",
    resultType: "Forehand Winner",
    iWon: true,
    iServed: false,
    videoTime: null,
    duration: null,
  },
];

const list = (
  <AskPointList
    match={MATCH}
    points={POINTS}
    filters={params.get("f")}
    truncated={params.get("truncated") === "1"}
    counted={params.get("counted") === "1"}
    href="/dashboard/matches/match-sep-28?tab=film&pn=3%2C7%2C40"
  />
);

createRoot(document.getElementById("root")!).render(list);
document.documentElement.dataset.hydrated = "true";
