import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AskAnswer } from "@/components/dashboard/ask/ask-answer";
import type {
  AskAnswerState,
  AskFigure,
} from "@/components/dashboard/ask/use-ask-stream";
import {
  ASK_NO_ADVICE_SENTENCE,
  type AskErrorCode,
  type AskSourceMatch,
  type AskStatusStage,
  type AskVisual,
  type AskVisualKind,
} from "@/lib/services/ask/events";
import type { AskFeedback } from "@/lib/services/ask/feedback";
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
 * - `?case=clarify`    Ask asking which was meant, with two choices; a pick
 *                      is written to `window.__askChosen`
 * - `?case=watch`      a pattern answer: the first source carries a
 *                      "Watch N points" link into its Video view
 *
 * On any case:
 * - `&visual=bars|table|trend|split|serve|form`  the answer carries that
 *   block; `&visual=empty-split|empty-serve|flat-trend` are the degenerate
 *   ones (every count zero, every value equal); `&visual=court-serve` is a
 *   serve block whose two courts are Deuce and Ad, and `&visual=linked-trend`
 *   a trend whose points are matches, with a second series
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
  momentum: {
    kind: "momentum",
    caption: "Points won minus points lost, point by point.",
    matchId: "match-sep-28",
    // Two sets of six points: a lead built, lost, and a break point held.
    points: [
      { won: true, set: 1 },
      { won: true, set: 1 },
      { won: false, set: 1, mark: "break" },
      { won: true, set: 1 },
      { won: false, set: 1 },
      { won: true, set: 1, mark: "set" },
      { won: false, set: 2 },
      { won: false, set: 2, mark: "break" },
      { won: false, set: 2 },
      { won: true, set: 2 },
      { won: true, set: 2 },
      { won: true, set: 2, mark: "match" },
    ],
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

const VARIANTS: Record<string, AskVisual> = {
  "court-serve": {
    kind: "serve",
    caption: "39 serves on break points, by court.",
    courts: [
      {
        label: "Deuce",
        t: n(9, "9 srv"),
        body: n(3, "3 srv"),
        wide: n(6, "6 srv"),
      },
      {
        label: "Ad",
        t: n(4, "4 srv"),
        body: n(5, "5 srv"),
        wide: n(12, "12 srv"),
      },
    ],
  },
  "linked-trend": {
    kind: "trend",
    caption: "First serves in against all your matches.",
    points: [
      { label: "Jun 4", value: n(61, "61,0 %"), matchId: "match-jun-4" },
      { label: "Jul 9", value: n(63, "63,0 %"), matchId: "match-jul-9" },
      { label: "Sep 28", value: n(37.5, "37,5 %"), matchId: "match-sep-28" },
    ],
    baseline: {
      label: "All matches",
      values: [n(58.2, "58,2 %"), n(58.2, "58,2 %"), n(58.2, "58,2 %")],
    },
  },
};

function visualFor(name: string | null): AskVisual | null {
  if (!name) return null;
  return (
    (VISUALS as Record<string, AskVisual>)[name] ??
    DEGENERATE[name] ??
    VARIANTS[name] ??
    null
  );
}

/**
 * A figure with the column it was cited from. `AskFigure` is the stream
 * reader's shape and does not carry it yet; the answer reads it through a
 * widened type, so the harness hands it over the same way.
 */
function figure(label: string, value: string, column?: string): AskFigure {
  return { label, value, ...(column ? { column } : {}) } as AskFigure;
}

const FULL: AskAnswerState = {
  status: "done",
  stage: null,
  headline:
    "Your second serve held against Marcus. It breaks down against left-handers.",
  // One more than an answer may carry, so the spec can see the cap.
  figures: [
    // Over one match (`?case=one`) the first is watchable: its measure is a
    // Video-tab filter. The second is a baseline over every match, and the
    // third names no column — neither ever links.
    figure("Sep 14 vs. Marcus", "55%", "second_serve_won_pct"),
    figure("All 22 matches", "48%", "all_second_serve_won_pct"),
    figure("8 matches vs. left-handers", "41%"),
    figure("A fourth figure", "19%", "aces"),
  ],
  visual: visualFor(params.get("visual")),
  body: "On Sep 14 you won 55% of second-serve points, 7 above your average.\n\nThe gap is on the ad court.",
  noAdvice: params.get("advice") === "1",
  sources: SOURCES,
  error: null,
  answerId: null,
  feedback: null,
};

// What had arrived when a failure landed. An error state must show none of it.
const PARTIAL = {
  headline: FULL.headline,
  figures: FULL.figures,
  visual: FULL.visual,
  body: FULL.body,
  noAdvice: FULL.noAdvice,
  sources: SOURCES,
  answerId: null,
  feedback: null,
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
    case "clarify":
      return {
        ...PARTIAL,
        status: "error",
        stage: null,
        error: {
          message: "Whose forehand should this count?",
          code: "needs_clarification",
          options: ["Ana Sokolov", "Theo Lindqvist"],
        },
      };
    case "watch":
      return {
        ...FULL,
        sources: [
          {
            ...SOURCES[0],
            watch: {
              href: "/dashboard/matches/match-sep-28?tab=film&f=cp.y_cd.dl",
              points: 4,
            },
          },
          ...SOURCES.slice(1),
        ],
      };
    case "rated":
      // A saved answer the asker can rate; `feedback=down` starts it rated.
      return {
        ...FULL,
        answerId: "00000000-0000-4000-8000-000000000001",
        feedback:
          params.get("feedback") === "down"
            ? { rating: "down", reasons: [], note: null }
            : null,
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

/** The harness's thumbs: each save is recorded, and `rate=fail` refuses them. */
function Rated() {
  const [answer, setAnswer] = useState(() =>
    answerFor(params.get("case") ?? "full"),
  );
  const onRate = async (feedback: AskFeedback | null) => {
    const w = window as unknown as { __askRated?: (AskFeedback | null)[] };
    (w.__askRated ??= []).push(feedback);
    if (params.get("rate") === "fail") return false;
    setAnswer((current) => ({ ...current, feedback }));
    return true;
  };
  return (
    <AskAnswer
      answer={answer}
      scope={TEAM}
      onRate={answer.answerId ? onRate : undefined}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  params.get("case") === "rated" ? (
    <Rated />
  ) : (
    <AskAnswer
      answer={answerFor(params.get("case") ?? "full")}
      scope={TEAM}
      onChoose={(option) => {
        (window as unknown as { __askChosen?: string }).__askChosen = option;
      }}
    />
  ),
);
document.documentElement.dataset.hydrated = "true";
