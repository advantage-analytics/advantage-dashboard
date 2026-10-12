import { createRoot } from "react-dom/client";
import { AskAnswer } from "@/components/dashboard/ask/ask-answer";
import type { AskAnswerState } from "@/components/dashboard/ask/use-ask-stream";
import {
  ASK_NO_ADVICE_SENTENCE,
  type AskErrorCode,
  type AskSourceMatch,
  type AskStatusStage,
  type AskVisual,
  type AskVisualKind,
} from "@/lib/services/ask/events";
import type { AskScope } from "@/lib/services/ask/scope";

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
 * - `?case=old`        saved before the notice existed: the no-advice
 *                      sentence is the end of its body
 *
 * On any case:
 * - `&visual=bars|table|trend|split|serve|form`  the answer carries that
 *   block; `&visual=empty-split|empty-serve|flat-trend` are the degenerate
 *   ones (every count zero, every value equal)
 * - `&advice=1`        the question asked for advice (`noAdvice`)
 * - `&scope=team`      the team page: the answer is about a program's
 *                      matches, and each source names the program's player
 */
const params = new URLSearchParams(window.location.search);

const TEAM: AskScope | undefined =
  params.get("scope") === "team"
    ? { kind: "team", programId: "program-1", programName: "Westbrook" }
    : undefined;

// The program's own player on each match — team scope only. The last match
// is one whose seat names nobody on the roster.
const PLAYERS: (string | null)[] = TEAM
  ? ["Ana Sokolov", "Ana Sokolov", "Mia Dvorsky", null]
  : [];

const SOURCES: AskSourceMatch[] = [
  {
    matchId: "match-sep-28",
    opponentName: "Theo Lindqvist",
    playedOn: "2026-09-28",
    iWon: true,
    scoreText: "6-4, 6-3",
    playerName: PLAYERS[0] ?? null,
  },
  {
    matchId: "match-sep-14",
    opponentName: "Marcus Hale",
    playedOn: "2026-09-14",
    iWon: false,
    scoreText: "4-6, 3-6",
    playerName: PLAYERS[1] ?? null,
  },
  {
    // Stopped at a set all: the score decides nobody.
    matchId: "match-aug-30",
    opponentName: "Daniel Okafor",
    playedOn: "2025-08-30",
    iWon: null,
    scoreText: "6-4, 3-6",
    playerName: PLAYERS[2] ?? null,
  },
  {
    matchId: "match-unscored",
    opponentName: null,
    playedOn: null,
    iWon: null,
    scoreText: null,
    playerName: PLAYERS[3] ?? null,
  },
];

const n = (value: number, text: string) => ({ value, text });

/**
 * One block of each kind. Every `text` is deliberately NOT what formatting
 * its `value` would give ("37,5 %" for 37.5), so the spec can tell a block
 * that prints the server's text from one that formats the number itself.
 */
const VISUALS: Record<AskVisualKind, AskVisual> = {
  bars: {
    kind: "bars",
    caption: "Share of points, from 4 matches against 22.",
    subjectLabel: "Against left-handers",
    baselineLabel: "All matches",
    rows: [
      {
        label: "First serves in",
        subject: n(37.5, "37,5 %"),
        baseline: n(58.2, "58,2 %"),
      },
      // The ends of the range: an empty bar and a full one.
      {
        label: "Break points saved",
        subject: n(0, "0 %"),
        baseline: n(100, "100 %"),
      },
    ],
  },
  table: {
    kind: "table",
    caption: "From 1 match against 22.",
    columns: ["Sep 28", "All matches", "Difference"],
    rows: [
      { label: "First serves in", cells: ["37.5%", "58.2%", "−20.7"] },
      { label: "Double faults", cells: ["4", "2.3", "+1.7"] },
    ],
  },
  trend: {
    kind: "trend",
    caption: "First serves in, 3 matches since Jun 4.",
    points: [
      { label: "Jun 4", value: n(61, "61,0 %") },
      { label: "Jul 9", value: n(63, "63,0 %") },
      { label: "Sep 28", value: n(37.5, "37,5 %") },
    ],
  },
  split: {
    kind: "split",
    caption: "The 34 points you won, by how they ended.",
    parts: [
      { label: "Winners", count: n(8, "8 pts") },
      { label: "Forced errors", count: n(11, "11 pts") },
      { label: "Unforced errors", count: n(15, "15 pts") },
    ],
  },
  serve: {
    kind: "serve",
    caption: "39 serves on break points.",
    courts: [
      {
        label: "First serves",
        t: n(9, "9 srv"),
        body: n(3, "3 srv"),
        wide: n(6, "6 srv"),
      },
      {
        label: "Second serves",
        t: n(4, "4 srv"),
        body: n(5, "5 srv"),
        wide: n(12, "12 srv"),
      },
    ],
  },
  form: {
    kind: "form",
    caption: "8 matches against left-handed opponents, oldest first.",
    results: [true, false, false, true, false, true, true, true],
  },
};

const DEGENERATE: Record<string, AskVisual> = {
  "empty-split": {
    kind: "split",
    caption: "No points in that scope.",
    parts: [
      { label: "Winners", count: n(0, "0") },
      { label: "Forced errors", count: n(0, "0") },
    ],
  },
  "empty-serve": {
    kind: "serve",
    caption: "No serves in that scope.",
    courts: [
      { label: "All serves", t: n(0, "0"), body: n(0, "0"), wide: n(0, "0") },
    ],
  },
  "flat-trend": {
    kind: "trend",
    caption: "The same in both matches.",
    points: [
      { label: "Jun 4", value: n(50, "50%") },
      { label: "Jul 9", value: n(50, "50%") },
    ],
  },
};

function visualFor(name: string | null): AskVisual | null {
  if (!name) return null;
  return (
    (VISUALS as Record<string, AskVisual>)[name] ?? DEGENERATE[name] ?? null
  );
}

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
  visual: visualFor(params.get("visual")),
  body: "On Sep 14 you won 55% of second-serve points, 7 above your average.\n\nThe gap is on the ad court.",
  noAdvice: params.get("advice") === "1",
  sources: SOURCES,
  error: null,
};

// What had arrived when a failure landed. An error state must show none of it.
const PARTIAL = {
  headline: FULL.headline,
  figures: FULL.figures,
  visual: FULL.visual,
  body: FULL.body,
  noAdvice: FULL.noAdvice,
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
    case "old":
      // No `visual`, no `noAdvice`: the sentence was written into the body.
      return {
        ...FULL,
        visual: null,
        noAdvice: false,
        body: `${FULL.body}\n\n${ASK_NO_ADVICE_SENTENCE}`,
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
  <AskAnswer answer={answerFor(params.get("case") ?? "full")} scope={TEAM} />,
);
document.documentElement.dataset.hydrated = "true";
