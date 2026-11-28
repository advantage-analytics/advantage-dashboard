import { createRoot } from "react-dom/client";

import {
  AskShowMe,
  type AskShowPost,
} from "@/components/dashboard/ask/ask-show";
import type { AskSourceMatch } from "@/lib/services/ask/events";
import type { AskShowPoint } from "@/lib/services/ask/show-response";

/**
 * "Watch the points" (`ask-show.tsx`) in a real browser; `tests/ask-show-me.spec.ts`
 * bundles this and reads the markup. The request is the harness's own.
 *
 * Query string, `?case=`:
 * - `match`    one match, three points, no film: the point list
 * - `matches`  seventeen matches: the capped list
 * - `three`    three matches: short enough to open whole
 * - `slow`     the request never answers: the busy region
 * - `fail`     the request is refused: the alert and the way into the film
 * - `far`      one match, three screens down: nothing is asked for until it
 *              scrolls near (`window.__askShowPosts` counts the requests)
 */
const params = new URLSearchParams(window.location.search);
const kind = params.get("case") ?? "match";

const match = (n: number): AskSourceMatch => ({
  matchId: `match-${n}`,
  opponentName: `Opponent ${n}`,
  playedOn: "2026-09-28",
  iWon: n % 2 === 0,
  scoreText: "6-4, 6-3",
  playerName: null,
});

const point = (pointNumber: number): AskShowPoint => ({
  pointNumber,
  setNumber: 1,
  gameNumber: 1,
  pointScore: "15-0",
  gameScore: "0-0",
  resultType: "Ace",
  iWon: true,
  iServed: true,
  videoTime: 100 + pointNumber,
  duration: 4,
});

const counted = window as unknown as { __askShowPosts: number };
counted.__askShowPosts = 0;

const post = (): Promise<AskShowPost> => {
  counted.__askShowPosts += 1;
  if (kind === "slow") return new Promise<AskShowPost>(() => {});
  if (kind === "fail") {
    return Promise.resolve({
      ok: false,
      message: "The points could not be read. Try again.",
      code: null,
    });
  }
  if (kind === "matches" || kind === "three") {
    return Promise.resolve({
      ok: true,
      value: {
        kind: "matches",
        matches: Array.from({ length: kind === "three" ? 3 : 17 }, (_, i) => ({
          match: match(i + 1),
          points: i + 2,
          href: `/dashboard/matches/match-${i + 1}?tab=film`,
        })),
      },
    });
  }
  return Promise.resolve({
    ok: true,
    value: {
      kind: "match",
      match: match(1),
      href: "/dashboard/matches/match-1?tab=film&pn=3%2C7%2C12",
      filters: null,
      points: [point(3), point(7), point(12)],
      truncated: false,
      counted: false,
      film: { state: "none" },
    },
  });
};

createRoot(document.getElementById("root")!).render(
  <>
    {kind === "far" && <div style={{ height: "3000px" }} />}
    <AskShowMe answerId="answer-1" sources={[match(1)]} post={post} />
  </>,
);
document.documentElement.dataset.hydrated = "true";
