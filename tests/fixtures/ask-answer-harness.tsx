import { createRoot } from "react-dom/client";
import { AskAnswer } from "@/components/dashboard/ask/ask-answer";
import type { AskAnswerState } from "@/components/dashboard/ask/use-ask-stream";
import type {
  AskErrorCode,
  AskSourceMatch,
  AskStatusStage,
} from "@/lib/services/ask/events";

/**
 * One Ask answer in a real browser, in whichever state the query string
 * names. `tests/ask-answer-view.spec.ts` bundles this and reads the markup.
 *
 * Query string:
 * - `?case=full`       a finished answer over four matches (the default)
 * - `?case=one`        a finished answer over one match
 * - `?case=streaming`  in flight; `&stage=planning|querying|writing`, or no
 *                      stage for the moment before the route's first event
 * - `?case=error`      failed; `&code=<AskErrorCode>`, or no code for an
 *                      interrupted stream
 */
const params = new URLSearchParams(window.location.search);

const SOURCES: AskSourceMatch[] = [
  {
    matchId: "match-sep-28",
    opponentName: "Theo Lindqvist",
    playedOn: "2026-09-28",
    iWon: true,
    scoreText: "6-4, 6-3",
  },
  {
    matchId: "match-sep-14",
    opponentName: "Marcus Hale",
    playedOn: "2026-09-14",
    iWon: false,
    scoreText: "4-6, 3-6",
  },
  {
    // Stopped at a set all: the score decides nobody.
    matchId: "match-aug-30",
    opponentName: "Daniel Okafor",
    playedOn: "2025-08-30",
    iWon: null,
    scoreText: "6-4, 3-6",
  },
  {
    matchId: "match-unscored",
    opponentName: null,
    playedOn: null,
    iWon: null,
    scoreText: null,
  },
];

const FULL: AskAnswerState = {
  status: "done",
  stage: null,
  headline:
    "Your second serve held against Marcus. It breaks down against left-handers.",
  // One more than an answer may carry, so the spec can see the cap.
  figures: [
    { label: "Sep 14 vs. Marcus", value: "55%" },
    { label: "All 22 matches", value: "48%" },
    { label: "8 matches vs. left-handers", value: "41%" },
    { label: "A fourth figure", value: "19%" },
  ],
  body: "On Sep 14 you won 55% of second-serve points, 7 above your average.\n\nThe gap is on the ad court.",
  sources: SOURCES,
  error: null,
};

// What had arrived when a failure landed. An error state must show none of it.
const PARTIAL = {
  headline: FULL.headline,
  figures: FULL.figures,
  body: FULL.body,
  sources: SOURCES,
};

function answerFor(name: string): AskAnswerState {
  switch (name) {
    case "one":
      return { ...FULL, sources: SOURCES.slice(0, 1) };
    case "streaming":
      return {
        ...FULL,
        status: "streaming",
        stage: params.get("stage") as AskStatusStage | null,
        figures: [],
        body: "",
        sources: null,
      };
    case "error":
      return {
        ...PARTIAL,
        status: "error",
        stage: null,
        error: {
          message: "The connection dropped before the answer finished.",
          code: params.get("code") as AskErrorCode | null,
        },
      };
    default:
      return FULL;
  }
}

createRoot(document.getElementById("root")!).render(
  <AskAnswer answer={answerFor(params.get("case") ?? "full")} />,
);
document.documentElement.dataset.hydrated = "true";
