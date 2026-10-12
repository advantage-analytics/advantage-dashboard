import { expect, test } from "@playwright/test";

import {
  ndjsonStreamResponse,
  textStreamResponse,
} from "@/lib/llm/stream-response";
import {
  ASK_ANSWER_FAILED_MESSAGE,
  ASK_CELL_REFERENCE_SYNTAX,
  ASK_FIGURE_LINE_PREFIX,
  ASK_FIGURE_LINE_SYNTAX,
  ASK_NULL_CELL,
  ASK_VISUAL_COLUMNS_PREFIX,
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  ASK_VISUAL_LINE_SYNTAX,
  ASK_VISUAL_PLOT_PREFIX,
  ASK_VISUAL_ROW_PREFIX,
  ASK_VISUAL_SERIES_PREFIX,
  ASK_VISUAL_SYNTAX,
  type AskVisualDropReason,
  MAX_ASK_FIGURES,
  type AskRow,
  formatAskCell,
  citesSameCellAsRange,
  citesScopeTotalPerRow,
  canonicalLabel,
  labelNamesAnotherRow,
  misranksSiblings,
  recitesOneCell,
  renderAskAnswer,
  siblingHeadline,
  statedFigures,
} from "@/lib/services/ask/answer-render";
import { uniqueRowLabelTokens } from "@/lib/services/ask/facts";
import {
  ASK_VISUAL_KINDS,
  type AskAnswerEvent,
  type AskEvent,
  type AskVisual,
  MAX_ASK_BARS_ROWS,
  MAX_ASK_FORM_RESULTS,
  MAX_ASK_SERVE_COURTS,
  MAX_ASK_SPLIT_PARTS,
  MAX_ASK_TABLE_COLUMNS,
  MAX_ASK_TABLE_ROWS,
  MAX_ASK_TREND_POINTS,
  MAX_ASK_VISUALS,
  MIN_ASK_SPLIT_PARTS,
  MIN_ASK_TABLE_COLUMNS,
  MIN_ASK_TREND_POINTS,
  readAskVisual,
} from "@/lib/services/ask/events";

/**
 * Pure-logic spec for T7: the transform between the model's answer text and
 * the events `/api/ask` streams, and the NDJSON response helper that carries
 * them (design "Route → Answer step", plan step 5). No database, no network,
 * no model — every case is chunks of text and result rows in, events out.
 */

/** The result rows every case below renders against. */
const ROWS: AskRow[] = [
  {
    matches: 9,
    second_serve_won_pct: 54.6,
    first_serve_pct: 61,
    total_points: 1204,
    last_played_on: "2026-09-14",
    opponent_name: "Alex Rivera",
    i_won: true,
    avg_rally_length: 4.25,
  },
  {
    matches: 4,
    second_serve_won_pct: 41,
    first_serve_pct: null,
    total_points: 512,
    last_played_on: "2026-03-02",
    opponent_name: "Sam Ortiz",
    i_won: false,
    avg_rally_length: 3,
  },
];

async function* chunksOf(...chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
}

async function render(chunks: string[], rows: AskRow[] = ROWS) {
  const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
  const seen: AskAnswerEvent[] = [];
  for await (const event of events) seen.push(event);
  return { events: seen, result };
}

/** The `text` deltas, joined — what the player reads as the body. */
function body(events: AskAnswerEvent[]): string {
  return events
    .filter((event) => event.type === "text")
    .map((event) => event.delta)
    .join("");
}

test.describe("the syntax the answer prompt quotes", () => {
  test("is exported as constants", () => {
    expect(ASK_CELL_REFERENCE_SYNTAX).toBe("{{rN.column}}");
    expect(ASK_FIGURE_LINE_PREFIX).toBe("FIGURE:");
    expect(ASK_FIGURE_LINE_SYNTAX).toBe("FIGURE: <label> = {{rN.column}}");
    expect(MAX_ASK_FIGURES).toBe(3);
  });

  test("the visual block's keywords, separator and per-kind syntax are constants", () => {
    expect(ASK_VISUAL_LINE_PREFIX).toBe("CHART:");
    expect(ASK_VISUAL_SERIES_PREFIX).toBe("SERIES:");
    expect(ASK_VISUAL_COLUMNS_PREFIX).toBe("COLUMNS:");
    expect(ASK_VISUAL_ROW_PREFIX).toBe("ROW:");
    expect(ASK_VISUAL_PLOT_PREFIX).toBe("PLOT:");
    expect(ASK_VISUAL_FIELD_SEPARATOR).toBe("|");
    expect(ASK_VISUAL_LINE_SYNTAX).toBe("CHART: <kind> | <caption>");
    expect(MAX_ASK_VISUALS).toBe(1);
    expect(Object.keys(ASK_VISUAL_SYNTAX).sort()).toEqual(
      [...ASK_VISUAL_KINDS].sort(),
    );
    expect(ASK_VISUAL_SYNTAX.bars).toBe(
      "CHART: bars | <caption>\n" +
        "SERIES: <subject label> | <baseline label>\n" +
        "ROW: <label> | {{rN.column}} | {{rN.column}}",
    );
    expect(ASK_VISUAL_SYNTAX.trend).toBe(
      "CHART: trend | <caption>\nPLOT: <date column> | <value column>",
    );
    expect(ASK_VISUAL_SYNTAX.form).toBe(
      "CHART: form | <caption>\nPLOT: <true-or-false column>",
    );
  });
});

/**
 * THE FORMATTING TABLE. This is the specification `formatAskCell()` is held
 * to: one row per rule, `[column, cell value, what the player reads]`.
 *
 * Every output is fixed by the input alone — no `Intl`, no `Date`, so neither
 * the server's locale nor its timezone can change a character.
 */
const FORMAT_TABLE: [
  rule: string,
  column: string,
  value: unknown,
  expected: string,
][] = [
  // Percentages: a number in a `*_pct` / `*_percent` / `*_percentage` column.
  // The value is already 0–100 (the app's `*_pct` convention) — never
  // multiplied. At most one decimal, a trailing `.0` dropped, then `%`.
  ["percent, one decimal", "second_serve_won_pct", 54.6, "54.6%"],
  ["percent, whole", "first_serve_pct", 61, "61%"],
  ["percent, rounds to one decimal", "win_pct", 48.26, "48.3%"],
  ["percent, `.0` dropped", "win_pct", 55.04, "55%"],
  ["percent, zero", "break_points_won_pct", 0, "0%"],
  ["percent, hundred", "win_percentage", 100, "100%"],
  ["percent, `_percent` suffix", "ace_percent", 7.5, "7.5%"],
  ["percent, negative difference", "diff_pct", -6.4, "-6.4%"],
  ["percent, column named `pct`", "pct", 12, "12%"],

  // Counts: any other whole number. Thousands grouped with commas.
  ["count, small", "matches", 9, "9"],
  ["count, zero", "aces", 0, "0"],
  ["count, thousands", "total_points", 1204, "1,204"],
  ["count, millions", "total_shots", 1234567, "1,234,567"],
  ["count, negative", "point_diff", -12, "-12"],

  // Other numbers (averages, speeds): at most one decimal, half away from
  // zero, a trailing `.0` dropped, grouped like a count.
  ["decimal, one place", "avg_rally_length", 4.25, "4.3"],
  ["decimal, whole", "avg_rally_length", 3.0, "3"],
  ["decimal, rounds down", "speed_mph", 87.44, "87.4"],
  ["decimal, negative", "diff", -0.25, "-0.3"],
  ["decimal, rounds to zero without a sign", "diff", -0.04, "0"],

  // Years: a `year` / `*_year` column is a label, not a count — no grouping.
  ["year", "year", 2026, "2026"],
  ["year, suffixed", "season_year", 2025, "2025"],

  // Dates: a string that starts `YYYY-MM-DD` reads `Mon D, YYYY`, taken from
  // the characters as written. A timestamp keeps the date it was written
  // with; its time and offset are not shown and never shift the day.
  ["date", "played_on", "2026-09-14", "Sep 14, 2026"],
  ["date, single-digit day", "played_on", "2026-03-02", "Mar 2, 2026"],
  ["date, January 1st", "first_played_on", "2025-01-01", "Jan 1, 2025"],
  ["date, December 31st", "last_played_on", "2025-12-31", "Dec 31, 2025"],
  ["timestamp, T", "created_at", "2026-09-14T23:30:00+00:00", "Sep 14, 2026"],
  ["timestamp, space", "created_at", "2026-09-14 23:30:00-07", "Sep 14, 2026"],
  ["not a date: month 13", "label", "2026-13-01", "2026-13-01"],

  // Text: itself, trimmed, with any line break turned into a space so a cell
  // can never start a new line of the answer.
  ["text", "opponent_name", "Alex Rivera", "Alex Rivera"],
  ["text, digits kept", "score_text", "6-4 3-6 7-5", "6-4 3-6 7-5"],
  ["text, trimmed", "tournament", "  Fall Open ", "Fall Open"],
  ["text, line break", "tournament", "Fall\nOpen", "Fall Open"],

  // Booleans.
  ["boolean, true", "i_won", true, "yes"],
  ["boolean, false", "i_won", false, "no"],

  // Null: an em dash — the cell exists and holds nothing. The same for
  // an empty string, an empty array and a number that is not finite. (A cell
  // that does not exist at all is a different thing: it fails the answer.)
  ["null", "first_serve_pct", null, ASK_NULL_CELL],
  ["null renders an em dash", "i_won", null, "—"],
  ["empty string", "tournament", "   ", ASK_NULL_CELL],
  ["empty array", "opponents", [], ASK_NULL_CELL],
  ["NaN", "win_pct", Number.NaN, ASK_NULL_CELL],

  // Arrays (`array_agg`): each item by the rules above, joined with `, `.
  ["array of text", "opponents", ["Alex", "Sam"], "Alex, Sam"],
  ["array of percents", "set_pct", [50, 62.5], "50%, 62.5%"],
];

test.describe("formatAskCell — the formatting table", () => {
  for (const [rule, column, value, expected] of FORMAT_TABLE) {
    test(`${rule}: ${column} = ${JSON.stringify(value)} → ${expected}`, () => {
      expect(formatAskCell(column, value)).toBe(expected);
    });
  }

  test("an object has no reading", () => {
    expect(formatAskCell("score", { sets: [] })).toBeNull();
  });
});

test.describe("renderAskAnswer — shape", () => {
  test("first line is the headline, figure lines are figures, the rest is text", async () => {
    const { events, result } = await render([
      "Your second serve holds up better this season.\n",
      "FIGURE: Second serve points won = {{r1.second_serve_won_pct}}\n",
      "FIGURE: Matches = {{r1.matches}}\n",
      "FIGURE: Last played = {{r1.last_played_on}}\n",
      "\n",
      "Across {{r1.matches}} matches you won {{r1.second_serve_won_pct}} of second-serve points.\n\n",
      "Against {{r2.opponent_name}} it was {{r2.second_serve_won_pct}}.\n",
    ]);

    expect(events.slice(0, 4)).toEqual([
      {
        type: "headline",
        text: "Your second serve holds up better this season.",
      },
      { type: "figure", label: "Second-serve points won", value: "54.6%" },
      { type: "figure", label: "Matches", value: "9" },
      { type: "figure", label: "Last played", value: "Sep 14, 2026" },
    ]);
    expect(events.slice(4).every((event) => event.type === "text")).toBe(true);
    expect(body(events)).toBe(
      "Across 9 matches you won 54.6% of second-serve points.\n\n" +
        "Against Sam Ortiz it was 41%.",
    );

    expect(result).toEqual({
      headline: "Your second serve holds up better this season.",
      figures: [
        { label: "Second-serve points won", value: "54.6%" },
        { label: "Matches", value: "9" },
        { label: "Last played", value: "Sep 14, 2026" },
      ],
      text:
        "Across 9 matches you won 54.6% of second-serve points.\n\n" +
        "Against Sam Ortiz it was 41%.",
      visual: null,
      droppedDigits: [],
      droppedFigures: [],
      droppedVisuals: [],
      droppedVisualRows: 0,
      droppedSentences: 0,
      renamedLabels: 1,
      failure: null,
    });
  });

  test("a fourth figure line is dropped and reported, not shown", async () => {
    const { events, result } = await render([
      "Headline.\n" +
        "FIGURE: One = {{r1.matches}}\n" +
        "FIGURE: Two = {{r2.matches}}\n" +
        "FIGURE: Three = {{r1.total_points}}\n" +
        "FIGURE: Four = {{r2.total_points}}\n" +
        "Body.",
    ]);

    expect(events.filter((event) => event.type === "figure")).toEqual([
      { type: "figure", label: "One", value: "9" },
      { type: "figure", label: "Two", value: "4" },
      { type: "figure", label: "Total points", value: "1,204" },
    ]);
    expect(body(events)).toBe("Body.");
    expect(result.droppedFigures).toEqual(["FIGURE: Four = 512"]);
  });

  test("an answer with no figure lines goes straight from headline to text", async () => {
    const { events } = await render([
      "Headline.\n\nYou won {{r1.matches}} matches.",
    ]);

    expect(events).toEqual([
      { type: "headline", text: "Headline." },
      { type: "text", delta: "You won 9 matches." },
    ]);
  });

  test("a headline alone, with no line break, is still a headline", async () => {
    const { events, result } = await render(["Just the claim."]);

    expect(events).toEqual([{ type: "headline", text: "Just the claim." }]);
    expect(result.failure).toBeNull();
  });

  test("text streams a sentence at a time instead of waiting for the end", async () => {
    // A sentence is held until it ends, so one that cites the same cell as
    // both ends of a range can be left out whole (`citesSameCellAsRange`).
    const { events } = await render([
      "Headline.\n",
      "The first sentence. The ",
      "second one.",
    ]);

    expect(events).toEqual([
      { type: "headline", text: "Headline." },
      { type: "text", delta: "The first sentence." },
      { type: "text", delta: " The second one." },
    ]);
  });

  test("a null cell reads as an em dash, in a figure and in text", async () => {
    const { events, result } = await render([
      "Headline.\n" +
        "FIGURE: First serves in = {{r2.first_serve_pct}}\n" +
        "First serves in: {{r2.first_serve_pct}}.",
    ]);

    expect(events).toContainEqual({
      type: "figure",
      label: "First serves in",
      value: "—",
    });
    expect(body(events)).toBe("First serves in: —.");
    expect(result.failure).toBeNull();
  });

  test("an answer with nothing in it ends with an error event", async () => {
    const { events, result } = await render(["  \n", "\n"]);

    expect(events).toEqual([
      {
        type: "error",
        code: "answer_failed",
        error: ASK_ANSWER_FAILED_MESSAGE,
      },
    ]);
    expect(result.failure).toEqual({ kind: "empty_answer" });
  });
});

test.describe("renderAskAnswer — references across chunk boundaries", () => {
  test("a reference split across two chunks still substitutes", async () => {
    const { events, result } = await render([
      "Headline.\nYou won {{r1.second_ser",
      "ve_won_pct}} of second-serve points.",
    ]);

    expect(body(events)).toBe("You won 54.6% of second-serve points.");
    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);
  });

  test("a reference split between its two opening braces still substitutes", async () => {
    const { events } = await render([
      "Headline.\nYou played {",
      "{r1.matches}",
      "} matches.",
    ]);

    expect(body(events)).toBe("You played 9 matches.");
  });

  test("the answer is the same however the text is chunked", async () => {
    const answer =
      "Your serve is steadier.\n" +
      "FIGURE: Second serve points won = {{r1.second_serve_won_pct}}\n" +
      "FIGURE: Points = {{r1.total_points}}\n" +
      "You won {{r1.second_serve_won_pct}} across {{r1.matches}} matches, " +
      "last on {{r1.last_played_on}}.\n\n" +
      "Against {{r2.opponent_name}}: {{r2.second_serve_won_pct}}.";
    const whole = await render([answer]);

    for (const size of [1, 2, 3, 7, 16]) {
      const chunks: string[] = [];
      for (let at = 0; at < answer.length; at += size) {
        chunks.push(answer.slice(at, at + size));
      }
      const split = await render(chunks);
      expect(split.result, `chunk size ${size}`).toEqual(whole.result);
      expect(body(split.events), `chunk size ${size}`).toBe(whole.result.text);
    }

    expect(whole.result.text).toBe(
      "You won 54.6% across 9 matches, last on Sep 14, 2026.\n\n" +
        "Against Sam Ortiz: 41%.",
    );
  });
});

test.describe("renderAskAnswer — typed numbers", () => {
  test("a raw digit outside a reference is dropped and reported through the result", async () => {
    const { events, result } = await render([
      "Headline.\nYou won 55% of points across {{r1.matches}} matches.",
    ]);

    expect(body(events)).toBe("You won of points across 9 matches.");
    expect(result.droppedDigits).toEqual(["55%"]);
    expect(result.failure).toBeNull();
  });

  test("a typed number split across chunks is dropped as one number", async () => {
    const { events, result } = await render([
      "Headline.\nYou won 5",
      "4.",
      "6% of points.",
    ]);

    expect(body(events)).toBe("You won of points.");
    expect(result.droppedDigits).toEqual(["54.6%"]);
  });

  test("digits are dropped from the headline and from a figure label too", async () => {
    const { events, result } = await render([
      "You won 9 of them.\nFIGURE: Last 5 matches = {{r1.matches}}\n",
    ]);

    expect(events).toEqual([
      { type: "headline", text: "You won of them." },
      { type: "figure", label: "Last matches", value: "9" },
    ]);
    expect(result.droppedDigits).toEqual(["9", "5"]);
  });

  test("a figure whose value was typed, not referenced, is dropped whole", async () => {
    const { events, result } = await render([
      "Headline.\nFIGURE: Win rate = 55%\nBody.",
    ]);

    expect(events.some((event) => event.type === "figure")).toBe(false);
    expect(result.droppedDigits).toEqual(["55%"]);
    expect(result.droppedFigures).toEqual(["FIGURE: Win rate ="]);
  });

  test("digits inside a substituted cell are the verified ones and are kept", async () => {
    const { events, result } = await render(
      ["Headline.\nThe score was {{r1.score_text}} over {{r1.points}} points."],
      [{ score_text: "6-4 3-6 7-5", points: 1204 }],
    );

    expect(body(events)).toBe("The score was 6-4 3-6 7-5 over 1,204 points.");
    expect(result.droppedDigits).toEqual([]);
  });
});

test.describe("renderAskAnswer — references the result does not have", () => {
  const cases: [name: string, text: string, kind: string, reference: string][] =
    [
      [
        "a row that does not exist",
        "Headline.\nYou won {{r3.matches}} matches.",
        "missing_row",
        "{{r3.matches}}",
      ],
      [
        "a column that does not exist",
        "Headline.\nYou hit {{r1.aces}} aces.",
        "missing_column",
        "{{r1.aces}}",
      ],
      [
        "row zero — rows count from one",
        "Headline.\nYou won {{r0.matches}} matches.",
        "malformed_reference",
        "{{r0.matches}}",
      ],
      [
        "something that is not a reference",
        "Headline.\nYou won {{matches}} matches.",
        "malformed_reference",
        "{{matches}}",
      ],
      [
        "an inherited property, which is not a column",
        "Headline.\nYou won {{r1.constructor}} matches.",
        "missing_column",
        "{{r1.constructor}}",
      ],
      [
        "a reference that never closes",
        "Headline.\nYou won {{r1.matches",
        "malformed_reference",
        "{{r1.matches",
      ],
    ];

  for (const [name, text, kind, reference] of cases) {
    test(`${name} ends the stream with an error event, not a blank`, async () => {
      const { events, result } = await render([text]);

      expect(events.at(-1)).toEqual({
        type: "error",
        code: "answer_failed",
        error: ASK_ANSWER_FAILED_MESSAGE,
      });
      expect(events.filter((event) => event.type === "error")).toHaveLength(1);
      expect(result.failure).toEqual({ kind, reference });
      // Nothing is printed where the number should have been, or after it:
      // at most the words that had already streamed before the reference.
      expect(body(events)).toMatch(/^(You (won|hit))?$/);
    });
  }

  test("a missing cell in the headline fails before any headline is sent", async () => {
    const { events } = await render(["You won {{r9.matches}} matches.\nBody."]);

    expect(events).toEqual([
      {
        type: "error",
        code: "answer_failed",
        error: ASK_ANSWER_FAILED_MESSAGE,
      },
    ]);
  });

  test("the error is the last event: nothing after the bad reference is read", async () => {
    let pulled = 0;
    async function* source(): AsyncGenerator<string> {
      for (const chunk of [
        "Headline.\nFine so far. ",
        "Then {{r1.nope}} breaks. ",
        "This chunk is never asked for.",
      ]) {
        pulled += 1;
        yield chunk;
      }
    }

    const seen: AskAnswerEvent[] = [];
    for await (const event of renderAskAnswer(source(), ROWS).events) {
      seen.push(event);
    }

    expect(seen.map((event) => event.type)).toEqual([
      "headline",
      "text",
      "error",
    ]);
    expect(pulled).toBe(2);
  });

  test("an empty result has no row one", async () => {
    const { result } = await render(["Headline.\n{{r1.matches}}"], []);

    expect(result.failure).toEqual({
      kind: "missing_row",
      reference: "{{r1.matches}}",
    });
  });
});

test.describe("ndjsonStreamResponse", () => {
  async function* eventsOf(...events: AskEvent[]): AsyncGenerator<AskEvent> {
    for (const event of events) yield event;
  }

  test("answers application/x-ndjson, one JSON object per line", async () => {
    const sent: AskEvent[] = [
      { type: "status", stage: "writing" },
      { type: "headline", text: "Your serve is steadier." },
      { type: "figure", label: "Second serve points won", value: "54.6%" },
      { type: "text", delta: "First paragraph.\n\nSecond paragraph." },
      {
        type: "sources",
        matches: [
          {
            matchId: "m1",
            opponentName: "Alex Rivera",
            playedOn: "2026-09-14",
            iWon: true,
            scoreText: "6-4 6-3",
            playerName: null,
          },
        ],
      },
      { type: "done", conversationId: "c1", used: 3, cap: 20 },
    ];

    const response = ndjsonStreamResponse(eventsOf(...sent));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");

    const text = await response.text();
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.slice(0, -1).split("\n");
    // A line break inside an event's text is escaped, never a second line.
    expect(lines).toHaveLength(sent.length);
    expect(lines.map((line) => JSON.parse(line))).toEqual(sent);
  });

  test("carries the renderer's events end to end", async () => {
    const { events } = renderAskAnswer(
      chunksOf("Headline.\nFIGURE: Matches = {{r1.matches}}\nBody."),
      ROWS,
    );

    const text = await ndjsonStreamResponse(events).text();

    expect(text).toBe(
      '{"type":"headline","text":"Headline."}\n' +
        '{"type":"figure","label":"Matches","value":"9"}\n' +
        '{"type":"text","delta":"Body."}\n',
    );
  });

  test("textStreamResponse still answers plain text, untouched", async () => {
    const response = textStreamResponse(chunksOf("One ", "sentence."));

    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe("One sentence.");
  });
});

// ── The visual block ────────────────────────────────────────────────────────

/** One row holding the same measures for a subject and a baseline. */
const COMPARISON: AskRow[] = [
  {
    matches: 4,
    first_serve_pct: 58.2,
    all_first_serve_pct: 61.4,
    second_serve_won_pct: 41.2,
    all_second_serve_won_pct: 52.8,
    double_faults: 4,
    all_double_faults: 2.3,
    double_faults_diff: 1.7,
    serve_t: 13,
    serve_body: 8,
    serve_wide: 18,
    winners: 8,
    forced: 11,
    unforced: 15,
    big: 1204,
    label_text: "Beau",
    score: { sets: [] },
  },
];

/** One row per match, in date order. */
const PER_MATCH: AskRow[] = [
  { played_on: "2026-06-04", first_serve_pct: 61, i_won: true },
  { played_on: "2026-07-09", first_serve_pct: null, i_won: null },
  { played_on: "2026-09-28", first_serve_pct: 37.5, i_won: false },
];

const HEAD = "Headline.\nFIGURE: Matches = {{r1.matches}}\n";

function visualOf(events: AskAnswerEvent[]): AskVisual | null {
  const event = events.find((event) => event.type === "visual");
  return event?.type === "visual" ? event.visual : null;
}

test.describe("renderAskAnswer — the visual block, each kind", () => {
  test("bars: labels, two percentages per row, raw and formatted", async () => {
    const { events, result } = await render(
      [
        HEAD +
          "CHART: bars | Share of points, from {{r1.matches}} matches.\n" +
          "SERIES: Against left-handers | All matches\n" +
          "ROW: First serves in | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}\n" +
          "ROW: Second-serve points won | {{r1.second_serve_won_pct}} | {{r1.all_second_serve_won_pct}}\n" +
          "\nThe body.",
      ],
      COMPARISON,
    );

    const visual: AskVisual = {
      kind: "bars",
      caption: "Share of points, from 4 matches.",
      subjectLabel: "Against left-handers",
      baselineLabel: "All matches",
      rows: [
        {
          label: "First serves in",
          subject: { value: 58.2, text: "58.2%" },
          baseline: { value: 61.4, text: "61.4%" },
        },
        {
          label: "Second-serve points won",
          subject: { value: 41.2, text: "41.2%" },
          baseline: { value: 52.8, text: "52.8%" },
        },
      ],
    };
    expect(events.map((event) => event.type)).toEqual([
      "headline",
      "figure",
      "visual",
      "text",
    ]);
    expect(visualOf(events)).toEqual(visual);
    expect(result.visual).toEqual(visual);
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedDigits).toEqual([]);
    expect(body(events)).toBe("The body.");
    expect(readAskVisual(JSON.parse(JSON.stringify(visual)))).toEqual(visual);
  });

  test("table: headings and display strings, any cell type", async () => {
    const { events } = await render(
      [
        HEAD +
          "CHART: table | From {{r1.matches}} matches.\n" +
          "COLUMNS: Against Beau | All matches | Difference\n" +
          "ROW: First serves in | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}} | {{r1.double_faults_diff}}\n" +
          "ROW: Opponent | {{r1.label_text}} | {{r1.matches}} | {{r1.double_faults}}\n" +
          "Body.",
      ],
      COMPARISON,
    );

    expect(visualOf(events)).toEqual({
      kind: "table",
      caption: "From 4 matches.",
      columns: ["Against Beau", "All matches", "Difference"],
      rows: [
        { label: "First serves in", cells: ["58.2%", "61.4%", "1.7"] },
        { label: "Opponent", cells: ["Beau", "4", "4"] },
      ],
    });
    expect(body(events)).toBe("Body.");
  });

  test("trend: one point per row with a value, dates shortened, nulls skipped", async () => {
    const { events } = await render(
      [
        "Headline.\nCHART: trend | First serves in, one point per match.\nPLOT: played_on | first_serve_pct\n\nBody.",
      ],
      PER_MATCH,
    );

    expect(visualOf(events)).toEqual({
      kind: "trend",
      caption: "First serves in, one point per match.",
      points: [
        { label: "Jun 4", value: { value: 61, text: "61%" } },
        { label: "Sep 28", value: { value: 37.5, text: "37.5%" } },
      ],
    });
  });

  test("trend: the year is added when the points span more than one", async () => {
    const { events } = await render(
      ["Headline.\nCHART: trend | Across two seasons.\nPLOT: played_on | aces"],
      [
        { played_on: "2025-11-02", aces: 3 },
        { played_on: "2026-02-14", aces: 7 },
      ],
    );

    expect(visualOf(events)).toMatchObject({
      points: [
        { label: "Nov 2, 2025", value: { value: 3, text: "3" } },
        { label: "Feb 14, 2026", value: { value: 7, text: "7" } },
      ],
    });
  });

  test("split: parts with counts", async () => {
    const { events } = await render(
      [
        HEAD +
          "CHART: split | The points you won, by how they ended.\n" +
          "ROW: Winners | {{r1.winners}}\n" +
          "ROW: Opponent forced errors | {{r1.forced}}\n" +
          "ROW: Opponent unforced errors | {{r1.unforced}}\n",
      ],
      COMPARISON,
    );

    expect(visualOf(events)).toEqual({
      kind: "split",
      caption: "The points you won, by how they ended.",
      parts: [
        { label: "Winners", count: { value: 8, text: "8" } },
        { label: "Opponent forced errors", count: { value: 11, text: "11" } },
        { label: "Opponent unforced errors", count: { value: 15, text: "15" } },
      ],
    });
  });

  test("serve: one court with T, body and wide counts", async () => {
    const { events } = await render(
      [
        HEAD +
          "CHART: serve | Where your serves went across {{r1.matches}} matches.\n" +
          "ROW: All serves | {{r1.serve_t}} | {{r1.serve_body}} | {{r1.serve_wide}}\n",
      ],
      COMPARISON,
    );

    expect(visualOf(events)).toEqual({
      kind: "serve",
      caption: "Where your serves went across 4 matches.",
      courts: [
        {
          label: "All serves",
          t: { value: 13, text: "13" },
          body: { value: 8, text: "8" },
          wide: { value: 18, text: "18" },
        },
      ],
    });
  });

  test("form: one result per row, an unknown result skipped, oldest first", async () => {
    const { events } = await render(
      [
        "Headline.\nCHART: form | Your matches, oldest first.\nPLOT: i_won\n\nBody.",
      ],
      PER_MATCH,
    );

    expect(visualOf(events)).toEqual({
      kind: "form",
      caption: "Your matches, oldest first.",
      results: [true, false],
    });
  });

  test("the kind is read case-insensitively and figure lines may follow the block", async () => {
    const { events, result } = await render(
      [
        "Headline.\nCHART: Form | Caption.\nPLOT: i_won\nFIGURE: Matches = {{r1.first_serve_pct}}\nBody.",
      ],
      PER_MATCH,
    );

    // The figure is sent when its line ends; the block when it closes.
    expect(events.map((event) => event.type)).toEqual([
      "headline",
      "figure",
      "visual",
      "text",
    ]);
    expect(result.visual?.kind).toBe("form");
  });
});

test.describe("renderAskAnswer — the visual block across chunks", () => {
  const ANSWER =
    "Claim.\n" +
    "FIGURE: Matches = {{r1.matches}}\n" +
    "CHART: bars | From {{r1.matches}} matches.\n" +
    "SERIES: You | Baseline\n" +
    "ROW: First serves in | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}\n" +
    "\n" +
    "You served well across {{r1.matches}} matches.\n\nSecond paragraph.";

  test("the block is the same however the text is chunked, and never leaks into text", async () => {
    const whole = await render([ANSWER], COMPARISON);
    expect(whole.result.visual?.kind).toBe("bars");

    for (const size of [1, 2, 3, 5, 11, 40]) {
      const chunks: string[] = [];
      for (let at = 0; at < ANSWER.length; at += size) {
        chunks.push(ANSWER.slice(at, at + size));
      }
      const split = await render(chunks, COMPARISON);
      expect(split.result, `chunk size ${size}`).toEqual(whole.result);
      expect(
        split.events.map((event) => event.type).filter((t) => t !== "text"),
        `chunk size ${size}`,
      ).toEqual(["headline", "figure", "visual"]);
      const text = body(split.events);
      expect(text, `chunk size ${size}`).toBe(whole.result.text);
      expect(text).not.toContain("CHART");
      expect(text).not.toContain("ROW");
      expect(text).not.toContain("SERIES");
    }
    expect(whole.result.text).toBe(
      "You served well across 4 matches.\n\nSecond paragraph.",
    );
  });

  test("a block line split mid-reference still resolves", async () => {
    const { result } = await render(
      [
        "Claim.\nCHART: split | Caption.\nROW: Winners | {{r1.win",
        "ners}}\nROW: Errors | {",
        "{r1.unforced}}\n",
      ],
      COMPARISON,
    );
    expect(result.visual).toMatchObject({
      kind: "split",
      parts: [
        { label: "Winners", count: { value: 8 } },
        { label: "Errors", count: { value: 15 } },
      ],
    });
  });

  test("the visual event is emitted before the first text delta", async () => {
    const seen: string[] = [];
    const { events } = renderAskAnswer(
      chunksOf(
        "Claim.\nCHART: split | Caption.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}\n",
        "The body. ",
        "It continues.",
      ),
      COMPARISON,
    );
    for await (const event of events) seen.push(event.type);
    expect(seen).toEqual(["headline", "visual", "text", "text"]);
  });
});

test.describe("renderAskAnswer — a block that cannot be drawn is dropped alone", () => {
  const cases: [name: string, block: string, reason: AskVisualDropReason][] = [
    [
      "an unknown kind",
      "CHART: pie | Caption.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}",
      "unknown_kind",
    ],
    [
      "no caption",
      "CHART: split |\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}",
      "malformed",
    ],
    [
      "a keyword the kind does not take",
      "CHART: split | Caption.\nSERIES: A | B\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}",
      "malformed",
    ],
    [
      "bars with no SERIES line",
      "CHART: bars | Caption.\nROW: A | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}",
      "malformed",
    ],
    [
      "a row with the wrong number of fields",
      "CHART: bars | Caption.\nSERIES: A | B\nROW: A | {{r1.first_serve_pct}}",
      "malformed",
    ],
    [
      "a cell that is not exactly one reference",
      "CHART: split | Caption.\nROW: A | {{r1.winners}} points\nROW: B | {{r1.forced}}",
      "malformed",
    ],
    [
      "a cell the model typed instead of referencing",
      "CHART: split | Caption.\nROW: A | 12\nROW: B | {{r1.forced}}",
      "malformed",
    ],
    [
      "an empty label",
      "CHART: split | Caption.\nROW: | {{r1.winners}}\nROW: B | {{r1.forced}}",
      "malformed",
    ],
    [
      "a table whose only row has more cells than columns",
      "CHART: table | Caption.\nCOLUMNS: A | B\nROW: X | {{r1.matches}} | {{r1.matches}} | {{r1.matches}}",
      "malformed",
    ],
    [
      "a table whose rows are all invalid",
      "CHART: table | Caption.\nCOLUMNS: A | B\nROW: X | {{r1.matches}} | null\nROW: Y | {{r1.nope}} | {{r1.matches}}\nROW: Z | {{r1.matches}}",
      "malformed",
    ],
    [
      "a table whose only row has a bad reference",
      "CHART: table | Caption.\nCOLUMNS: A | B\nROW: X | {{r1.matches}} | {{r1.nope}}",
      "bad_reference",
    ],
    [
      "bars whose rows are all invalid",
      "CHART: bars | Caption.\nSERIES: A | B\nROW: A | {{r1.nope}} | {{r1.all_first_serve_pct}}\nROW: B | {{r1.first_serve_pct}}",
      "bad_reference",
    ],
    [
      "bars with a count in one row, beside a good row",
      "CHART: bars | Caption.\nSERIES: A | B\nROW: A | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}\nROW: B | {{r1.big}} | {{r1.all_first_serve_pct}}",
      "bad_value",
    ],
    [
      "a split with a bad reference in one of three parts",
      "CHART: split | Caption.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}\nROW: C | {{r1.double_faults_lost}}",
      "bad_reference",
    ],
    [
      "a serve block with a bad reference in one of two courts",
      "CHART: serve | Caption.\nROW: First | {{r1.serve_t}} | {{r1.serve_body}} | {{r1.serve_wide}}\nROW: Second | {{r1.serve_t}} | {{r1.nope}} | {{r1.serve_wide}}",
      "bad_reference",
    ],
    [
      "a table with no value column",
      "CHART: table | Caption.\nCOLUMNS:\nROW: X | {{r1.matches}}",
      "malformed",
    ],
    [
      "a trend PLOT with one column",
      "CHART: trend | Caption.\nPLOT: first_serve_pct",
      "malformed",
    ],
    [
      "a reference to a column the result does not have",
      "CHART: split | Caption.\nROW: A | {{r1.aces}}\nROW: B | {{r1.forced}}",
      "bad_reference",
    ],
    [
      "a reference to a row the result does not have",
      "CHART: split | Caption.\nROW: A | {{r2.winners}}\nROW: B | {{r1.forced}}",
      "bad_reference",
    ],
    [
      "a bad reference in the caption",
      "CHART: split | From {{r1.nope}} matches.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}",
      "bad_reference",
    ],
    [
      "a bad reference in a label",
      "CHART: split | Caption.\nROW: {{r1.nope}} | {{r1.winners}}\nROW: B | {{r1.forced}}",
      "bad_reference",
    ],
    [
      "a PLOT column the result does not have",
      "CHART: form | Caption.\nPLOT: won",
      "bad_reference",
    ],
    [
      "a bar outside 0–100",
      "CHART: bars | Caption.\nSERIES: A | B\nROW: A | {{r1.big}} | {{r1.all_first_serve_pct}}",
      "bad_value",
    ],
    [
      "a count that is a string",
      "CHART: split | Caption.\nROW: A | {{r1.label_text}}\nROW: B | {{r1.forced}}",
      "bad_value",
    ],
    [
      "a count that is null",
      "CHART: serve | Caption.\nROW: All | {{r1.serve_t}} | {{r1.missing}} | {{r1.serve_wide}}",
      "bad_value",
    ],
    [
      "a form column that is not boolean",
      "CHART: form | Caption.\nPLOT: matches",
      "bad_value",
    ],
    [
      "too few split parts",
      "CHART: split | Caption.\nROW: A | {{r1.winners}}",
      "limit",
    ],
    [
      "too many table columns",
      "CHART: table | Caption.\nCOLUMNS: A | B | C | D\nROW: X | {{r1.matches}} | {{r1.matches}} | {{r1.matches}} | {{r1.matches}}",
      "limit",
    ],
    [
      "too few trend points",
      "CHART: trend | Caption.\nPLOT: played_on | first_serve_pct",
      "limit",
    ],
  ];

  for (const [name, block, reason] of cases) {
    test(`${name} → ${reason}; headline, figures and text still render`, async () => {
      const rows: AskRow[] = [
        { ...COMPARISON[0], missing: null, played_on: "2026-01-01" },
      ];
      const { events, result } = await render(
        [`${HEAD}${block}\n\nThe body still shows.`],
        rows,
      );

      expect(events.map((event) => event.type)).toEqual([
        "headline",
        "figure",
        "text",
      ]);
      expect(body(events)).toBe("The body still shows.");
      expect(result.visual).toBeNull();
      expect(result.failure).toBeNull();
      expect(result.droppedVisuals).toHaveLength(1);
      expect(result.droppedVisuals[0].reason).toBe(reason);
      expect(typeof result.droppedVisuals[0].detail).toBe("string");
      // The drop names nothing the model wrote.
      expect(JSON.stringify(result.droppedVisuals)).not.toContain("Caption");
    });
  }

  test("three slips are read as meant: '=' after a ROW label, a trailing separator, a '%' after a cell", async () => {
    const { result } = await render(
      [
        `${HEAD}CHART: bars | Caption.\nSERIES: A | B |\nROW: Saved = {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}%\nROW: Won | {{r1.second_serve_won_pct}} | {{r1.all_second_serve_won_pct}} |\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(result.droppedVisuals).toEqual([]);
    expect(result.visual).toEqual({
      kind: "bars",
      caption: "Caption.",
      subjectLabel: "A",
      baselineLabel: "B",
      rows: [
        {
          label: "First serves in",
          subject: { value: 58.2, text: "58.2%" },
          baseline: { value: 61.4, text: "61.4%" },
        },
        {
          label: "Second-serve points won",
          subject: { value: 41.2, text: "41.2%" },
          baseline: { value: 52.8, text: "52.8%" },
        },
      ],
    });
    expect(result.droppedDigits).toEqual([]);
  });

  test("a heading written for the label column is dropped when every row is one cell short, down to one value column", async () => {
    const measure = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: Measure | You | Opponent\nROW: Winners | {{r1.winners}} | {{r1.forced}}\nROW: Errors | {{r1.unforced}} | {{r1.double_faults}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(measure.result.droppedVisuals).toEqual([]);
    expect(measure.result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["You", "Opponent"],
      rows: [
        { label: "Winners", cells: ["8", "11"] },
        { label: "Errors", cells: ["15", "4"] },
      ],
    });

    // Any first heading, not a fixed list of words: "Set" heads the labels
    // here because every row is one cell short.
    const set = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: Set | Points played | Points won\nROW: First set | {{r1.winners}} | {{r1.first_serve_pct}}\nROW: Second set | {{r1.forced}} | {{r1.second_serve_won_pct}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(set.result.droppedVisuals).toEqual([]);
    expect(set.result.droppedVisualRows).toBe(0);
    expect(set.result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["Points played", "Points won"],
      rows: [
        { label: "First set", cells: ["8", "58.2%"] },
        { label: "Second set", cells: ["11", "41.2%"] },
      ],
    });

    // One value column is what is left, and is a table.
    const single = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: Pressure metric | Value\nROW: Winners | {{r1.winners}}\nROW: Forced errors | {{r1.forced}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(single.result.droppedVisuals).toEqual([]);
    expect(single.result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["Value"],
      rows: [
        { label: "Winners", cells: ["8"] },
        { label: "Forced errors", cells: ["11"] },
      ],
    });
    expect(
      readAskVisual(JSON.parse(JSON.stringify(single.result.visual))),
    ).toEqual(single.result.visual);

    // A one-column table written as one is accepted too.
    const one = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: Value\nROW: Winners | {{r1.winners}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(one.result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["Value"],
      rows: [{ label: "Winners", cells: ["8"] }],
    });

    // Rows that disagree on the cell count: the headings stand, and the
    // short row is left out.
    const mixed = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: You | Opponent\nROW: Winners | {{r1.winners}} | {{r1.forced}}\nROW: Errors | {{r1.unforced}}\nROW: Serves | {{r1.serve_t}} | {{r1.serve_body}} | {{r1.serve_wide}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(mixed.result.droppedVisuals).toEqual([]);
    expect(mixed.result.droppedVisualRows).toBe(2);
    expect(mixed.result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["You", "Opponent"],
      rows: [{ label: "Winners", cells: ["8", "11"] }],
    });

    // Rows that already have one cell per heading keep "Measure" as a column.
    const full = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: Measure | You\nROW: Winners | {{r1.winners}} | {{r1.forced}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(
      full.result.visual?.kind === "table" && full.result.visual.columns,
    ).toEqual(["Measure", "You"]);
  });

  test("a table row that is invalid on its own is left out and counted; the block survives on the rows that are left", async () => {
    const { events, result } = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: You | Opponent\nROW: Winners | {{r1.winners}} | {{r1.forced}}\nROW: Volley winners | {{r1.unforced}} | null\nROW: Aces | {{r1.aces}} | {{r1.forced}}\nROW: Worded | about a dozen | {{r1.forced}}\nROW: {{r1.nope}} | {{r1.winners}} | {{r1.forced}}\nROW: Errors | {{r1.unforced}} | {{r1.double_faults}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(result.failure).toBeNull();
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedVisualRows).toBe(4);
    expect(result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["You", "Opponent"],
      rows: [
        { label: "Winners", cells: ["8", "11"] },
        { label: "Errors", cells: ["15", "4"] },
      ],
    });
    expect(events.map((event) => event.type)).toEqual([
      "headline",
      "figure",
      "visual",
      "text",
    ]);
    // Nothing the model wrote in a left-out row reached the page.
    expect(JSON.stringify(result.visual)).not.toContain("dozen");
    expect(JSON.stringify(result.visual)).not.toContain("null");
  });

  test("a bars row with a bad reference or the wrong cell count is left out; split and serve still drop whole", async () => {
    const bars = await render(
      [
        `${HEAD}CHART: bars | Caption.\nSERIES: A | B\nROW: First serves in | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}\nROW: Returns | {{r1.return_won_pct}} | {{r1.all_first_serve_pct}}\nROW: Short | {{r1.first_serve_pct}}\nROW: Second | {{r1.second_serve_won_pct}} | {{r1.all_second_serve_won_pct}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(bars.result.droppedVisuals).toEqual([]);
    expect(bars.result.droppedVisualRows).toBe(2);
    expect(
      bars.result.visual?.kind === "bars" &&
        bars.result.visual.rows.map((row) => row.label),
    ).toEqual(["First serves in", "Second-serve points won"]);

    const split = await render(
      [
        `${HEAD}CHART: split | Caption.\nROW: Winners | {{r1.winners}}\nROW: Forced | {{r1.forced}}\nROW: Double faults | {{r1.double_faults_lost}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(split.result.visual).toBeNull();
    expect(split.result.droppedVisualRows).toBe(0);
    expect(split.result.droppedVisuals).toEqual([
      { reason: "bad_reference", kind: "split", detail: expect.any(String) },
    ]);
  });

  test("a bad reference in the headline or the body still fails the answer; in a FIGURE line it drops that figure alone", async () => {
    const block =
      "CHART: table | Caption.\nCOLUMNS: You | Opponent\nROW: Winners | {{r1.winners}} | {{r1.forced}}\nROW: Aces | {{r1.aces}} | {{r1.forced}}\n\nBody.";
    const headline = await render([`Claim {{r1.nope}}.\n${block}`], COMPARISON);
    expect(headline.result.failure?.kind).toBe("missing_column");
    const figure = await render(
      [`Claim.\nFIGURE: Aces = {{r1.nope}}\n${block}`],
      COMPARISON,
    );
    // One mistyped column in a figure line is not worth the whole answer.
    expect(figure.result.failure).toBeNull();
    expect(figure.result.figures).toEqual([]);
    expect(figure.result.droppedFigures).toEqual([
      "FIGURE: (a reference the result does not have)",
    ]);
    expect(figure.result.visual?.kind).toBe("table");
    const text = await render(
      [`Claim.\n\nYou hit {{r1.nope}} aces.`],
      COMPARISON,
    );
    expect(text.result.failure?.kind).toBe("missing_column");
    // A malformed reference in a figure is still a failure: that is not a slip of one name.
    const malformed = await render(
      [`Claim.\nFIGURE: Aces = {{aces}}\n\nBody.`],
      COMPARISON,
    );
    expect(malformed.result.failure?.kind).toBe("malformed_reference");
  });

  test("an empty table cell reads as an em dash, and a trailing separator after a full row is ignored", async () => {
    const { result } = await render(
      [
        `${HEAD}CHART: table | Caption.\nCOLUMNS: Count | Share\nROW: Faced | {{r1.winners}} | \nROW: Saved | {{r1.forced}} | {{r1.first_serve_pct}} |\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(result.droppedVisuals).toEqual([]);
    expect(result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["Count", "Share"],
      rows: [
        { label: "Winners", cells: ["8", "—"] },
        { label: "Saved", cells: ["11", "58.2%"] },
      ],
    });
  });

  test("a figure that repeats a block cell under the same label is dropped; the others keep their place before the block", async () => {
    const { events, result } = await render(
      [
        "Claim.\nFIGURE: Winners = {{r1.winners}}\nFIGURE: Points won = {{r1.first_serve_pct}}\nFIGURE: Forced errors = {{r1.forced}}\nCHART: table | Caption.\nCOLUMNS: You | Them\nROW: Winners | {{r1.winners}} | {{r1.unforced}}\nROW: Forced errors | {{r1.serve_t}} | {{r1.forced}}\n\nBody.",
      ],
      COMPARISON,
    );
    expect(result.failure).toBeNull();
    expect(result.figures).toEqual([
      { label: "First serves in", value: "58.2%" },
    ]);
    expect(result.droppedFigures).toEqual([
      "FIGURE: Winners = 8",
      "FIGURE: Forced errors = 11",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "headline",
      "figure",
      "visual",
      "text",
    ]);
    // The same value under a different label is a different measure and stays.
    const kept = await render(
      [
        "Claim.\nFIGURE: Aces = {{r1.forced}}\nCHART: split | Caption.\nROW: Winners | {{r1.winners}}\nROW: Forced | {{r1.forced}}\n\nBody.",
      ],
      COMPARISON,
    );
    expect(kept.result.figures).toEqual([{ label: "Aces", value: "11" }]);
  });

  test("a '=' in a ROW label that is not followed by a cell is left alone, and a cell with words beside it is still malformed", async () => {
    const kept = await render(
      [
        `${HEAD}CHART: split | Caption.\nROW: Won = lost | {{r1.winners}}\nROW: B | {{r1.forced}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(kept.result.visual?.kind).toBe("split");
    expect(
      kept.result.visual?.kind === "split" && kept.result.visual.parts[0].label,
    ).toBe("Won = lost");

    const malformed = await render(
      [
        `${HEAD}CHART: split | Caption.\nROW: A | {{r1.winners}} points\nROW: B | {{r1.forced}}\n\nBody.`,
      ],
      COMPARISON,
    );
    expect(malformed.result.droppedVisuals[0]?.reason).toBe("malformed");
  });

  test("the drop records the kind the block claimed", async () => {
    const { result } = await render(
      [`${HEAD}CHART: split | Caption.\nROW: A | {{r1.winners}}\n`],
      COMPARISON,
    );
    expect(result.droppedVisuals).toEqual([
      { reason: "limit", kind: "split", detail: expect.any(String) },
    ]);
  });

  test("a second block is dropped as second_block; the first stands", async () => {
    const { events, result } = await render(
      [
        HEAD +
          "CHART: split | First.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}\n" +
          "CHART: serve | Second.\nROW: All | {{r1.serve_t}} | {{r1.serve_body}} | {{r1.serve_wide}}\n" +
          "\nBody.",
      ],
      COMPARISON,
    );

    expect(events.map((event) => event.type)).toEqual([
      "headline",
      "figure",
      "visual",
      "text",
    ]);
    expect(result.visual?.kind).toBe("split");
    expect(result.droppedVisuals).toEqual([
      { reason: "second_block", kind: "serve", detail: expect.any(String) },
    ]);
    expect(body(events)).toBe("Body.");
  });

  test("a bad reference inside a block drops the block, while one in prose still fails the answer", async () => {
    const inBlock = await render(
      [
        "Claim.\nCHART: split | Caption.\nROW: A | {{r1.nope}}\nROW: B | {{r1.forced}}\nFine.",
      ],
      COMPARISON,
    );
    expect(inBlock.result.failure).toBeNull();
    expect(inBlock.result.droppedVisuals[0].reason).toBe("bad_reference");
    expect(body(inBlock.events)).toBe("Fine.");

    const inProse = await render(
      [
        "Claim.\nCHART: split | Caption.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}\nThen {{r1.nope}}.",
      ],
      COMPARISON,
    );
    expect(inProse.result.failure).toEqual({
      kind: "missing_column",
      reference: "{{r1.nope}}",
    });
    expect(inProse.events.at(-1)?.type).toBe("error");
  });

  test("a CHART line after body text has started is body text, not a block", async () => {
    const { events, result } = await render(
      [
        "Claim.\n\nThe body first.\nCHART: split | Caption.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}\n",
      ],
      COMPARISON,
    );

    expect(events.some((event) => event.type === "visual")).toBe(false);
    expect(result.visual).toBeNull();
    expect(result.droppedVisuals).toEqual([]);
    expect(body(events)).toBe(
      "The body first.\nCHART: split | Caption.\nROW: A | 8\nROW: B | 11",
    );
  });

  test("digits typed in a label or caption are dropped, as in any other line", async () => {
    const { result } = await render(
      [
        `${HEAD}CHART: split | Last 5 matches.\nROW: Top 3 | {{r1.winners}}\nROW: B | {{r1.forced}}\n`,
      ],
      COMPARISON,
    );
    expect(result.visual).toMatchObject({
      caption: "Last matches.",
      parts: [{ label: "Top" }, { label: "B" }],
    });
    expect(result.droppedDigits).toEqual(["5", "3"]);
  });

  test("a block with no lines after its header is dropped, and so is one at the very end", async () => {
    const { result } = await render(
      [`${HEAD}CHART: split | Caption.`],
      COMPARISON,
    );
    expect(result.droppedVisuals[0].reason).toBe("limit");
    expect(result.headline).toBe("Headline.");
  });
});

test.describe("renderAskAnswer — the visual block's limits", () => {
  function rowsOf(n: number, line: (i: number) => string): string {
    return Array.from({ length: n }, (_, i) => line(i + 1)).join("\n");
  }

  test(`bars takes ${MAX_ASK_BARS_ROWS} rows and not one more`, async () => {
    const block = (n: number) =>
      `CHART: bars | Caption.\nSERIES: A | B\n${rowsOf(n, (i) => `ROW: Row ${"x".repeat(i)} | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}`)}\n`;
    const ok = await render([`${HEAD}${block(MAX_ASK_BARS_ROWS)}`], COMPARISON);
    expect(ok.result.visual?.kind).toBe("bars");
    const over = await render(
      [`${HEAD}${block(MAX_ASK_BARS_ROWS + 1)}`],
      COMPARISON,
    );
    expect(over.result.droppedVisuals[0].reason).toBe("limit");
  });

  test(`table takes ${MAX_ASK_TABLE_ROWS} rows and ${MAX_ASK_TABLE_COLUMNS} columns`, async () => {
    const block = (n: number) =>
      `CHART: table | Caption.\nCOLUMNS: A | B | C\n${rowsOf(n, (i) => `ROW: Row ${"x".repeat(i)} | {{r1.matches}} | {{r1.matches}} | {{r1.matches}}`)}\n`;
    const ok = await render(
      [`${HEAD}${block(MAX_ASK_TABLE_ROWS)}`],
      COMPARISON,
    );
    expect(ok.result.visual?.kind).toBe("table");
    const over = await render(
      [`${HEAD}${block(MAX_ASK_TABLE_ROWS + 1)}`],
      COMPARISON,
    );
    expect(over.result.droppedVisuals[0].reason).toBe("limit");
  });

  test(`trend takes ${MIN_ASK_TREND_POINTS}–${MAX_ASK_TREND_POINTS} points`, async () => {
    const rows = (n: number): AskRow[] =>
      Array.from({ length: n }, (_, i) => ({
        played_on: `2026-01-${String(i + 1).padStart(2, "0")}`,
        aces: i,
      }));
    const block = "Claim.\nCHART: trend | Caption.\nPLOT: played_on | aces\n";
    expect(
      (await render([block], rows(MAX_ASK_TREND_POINTS))).result.visual?.kind,
    ).toBe("trend");
    expect(
      (await render([block], rows(MAX_ASK_TREND_POINTS + 1))).result
        .droppedVisuals[0].reason,
    ).toBe("limit");
    expect(
      (await render([block], rows(MIN_ASK_TREND_POINTS - 1))).result
        .droppedVisuals[0].reason,
    ).toBe("limit");
  });

  test(`split takes ${MIN_ASK_SPLIT_PARTS}–${MAX_ASK_SPLIT_PARTS} parts`, async () => {
    const block = (n: number) =>
      `CHART: split | Caption.\n${rowsOf(n, (i) => `ROW: Part ${"x".repeat(i)} | {{r1.winners}}`)}\n`;
    expect(
      (await render([`${HEAD}${block(MAX_ASK_SPLIT_PARTS)}`], COMPARISON))
        .result.visual?.kind,
    ).toBe("split");
    expect(
      (await render([`${HEAD}${block(MAX_ASK_SPLIT_PARTS + 1)}`], COMPARISON))
        .result.droppedVisuals[0].reason,
    ).toBe("limit");
  });

  test(`serve takes up to ${MAX_ASK_SERVE_COURTS} courts`, async () => {
    const block = (n: number) =>
      `CHART: serve | Caption.\n${rowsOf(n, (i) => `ROW: Court ${"x".repeat(i)} | {{r1.serve_t}} | {{r1.serve_body}} | {{r1.serve_wide}}`)}\n`;
    expect(
      (await render([`${HEAD}${block(MAX_ASK_SERVE_COURTS)}`], COMPARISON))
        .result.visual?.kind,
    ).toBe("serve");
    expect(
      (await render([`${HEAD}${block(MAX_ASK_SERVE_COURTS + 1)}`], COMPARISON))
        .result.droppedVisuals[0].reason,
    ).toBe("limit");
  });

  test(`form takes up to ${MAX_ASK_FORM_RESULTS} results`, async () => {
    const rows = (n: number): AskRow[] =>
      Array.from({ length: n }, (_, i) => ({ i_won: i % 2 === 0 }));
    const block = "Claim.\nCHART: form | Caption.\nPLOT: i_won\n";
    expect(
      (await render([block], rows(MAX_ASK_FORM_RESULTS))).result.visual?.kind,
    ).toBe("form");
    expect(
      (await render([block], rows(MAX_ASK_FORM_RESULTS + 1))).result
        .droppedVisuals[0].reason,
    ).toBe("limit");
    expect(
      (await render([block], [{ i_won: null }])).result.droppedVisuals[0]
        .reason,
    ).toBe("limit");
  });
});

test.describe("readAskVisual — a saved or streamed visual, defensively", () => {
  const BARS: AskVisual = {
    kind: "bars",
    caption: "Caption.",
    subjectLabel: "You",
    baselineLabel: "All",
    rows: [
      {
        label: "A",
        subject: { value: 50, text: "50%" },
        baseline: { value: 40.5, text: "40.5%" },
      },
    ],
  };
  const TABLE: AskVisual = {
    kind: "table",
    caption: "",
    columns: ["A", "B"],
    rows: [{ label: "X", cells: ["1", "—"] }],
  };
  const TREND: AskVisual = {
    kind: "trend",
    caption: "C",
    points: [
      { label: "Jun 4", value: { value: -2.5, text: "-2.5" } },
      { label: "Jul 9", value: { value: 3, text: "3" } },
    ],
  };
  const SPLIT: AskVisual = {
    kind: "split",
    caption: "C",
    parts: [
      { label: "A", count: { value: 0, text: "0" } },
      { label: "B", count: { value: 3, text: "3" } },
    ],
  };
  const SERVE: AskVisual = {
    kind: "serve",
    caption: "C",
    courts: [
      {
        label: "All",
        t: { value: 1, text: "1" },
        body: { value: 2, text: "2" },
        wide: { value: 3, text: "3" },
      },
    ],
  };
  const FORM: AskVisual = {
    kind: "form",
    caption: "C",
    results: [true, false],
  };

  test("accepts each kind, round-tripped through JSON, and strips nothing it needs", () => {
    for (const visual of [BARS, TABLE, TREND, SPLIT, SERVE, FORM]) {
      expect(readAskVisual(JSON.parse(JSON.stringify(visual)))).toEqual(visual);
    }
  });

  test("accepts a table with one column", () => {
    const one = {
      ...TABLE,
      columns: ["A"],
      rows: [{ label: "X", cells: ["1"] }],
    };
    expect(MIN_ASK_TABLE_COLUMNS).toBe(1);
    expect(readAskVisual(JSON.parse(JSON.stringify(one)))).toEqual(one);
  });

  test("ignores keys it does not know", () => {
    expect(readAskVisual({ ...FORM, extra: 1 })).toEqual(FORM);
  });

  const rejected: [name: string, value: unknown][] = [
    ["null", null],
    ["a string", "bars"],
    ["an array", [BARS]],
    ["an unknown kind", { ...BARS, kind: "pie" }],
    ["no caption", { kind: "form", results: [true] }],
    ["a caption that is not a string", { ...FORM, caption: 1 }],
    ["bars with no rows", { ...BARS, rows: [] }],
    [
      "bars with too many rows",
      { ...BARS, rows: Array(MAX_ASK_BARS_ROWS + 1).fill(BARS.rows[0]) },
    ],
    ["bars with an empty label", { ...BARS, subjectLabel: " " }],
    [
      "bars with a row label missing",
      { ...BARS, rows: [{ ...BARS.rows[0], label: 3 }] },
    ],
    [
      "a bar above 100",
      {
        ...BARS,
        rows: [{ ...BARS.rows[0], subject: { value: 101, text: "101%" } }],
      },
    ],
    [
      "a bar below 0",
      {
        ...BARS,
        rows: [{ ...BARS.rows[0], baseline: { value: -1, text: "-1%" } }],
      },
    ],
    [
      "a number with no text",
      { ...BARS, rows: [{ ...BARS.rows[0], subject: { value: 5 } }] },
    ],
    [
      "a number that is a string",
      {
        ...BARS,
        rows: [{ ...BARS.rows[0], subject: { value: "5", text: "5" } }],
      },
    ],
    [
      "a table with no columns",
      { ...TABLE, columns: [], rows: [{ label: "X", cells: [] }] },
    ],
    [
      "a one-column table whose row has two cells",
      { ...TABLE, columns: ["A"], rows: [{ label: "X", cells: ["1", "2"] }] },
    ],
    [
      "a table row with the wrong cell count",
      { ...TABLE, rows: [{ label: "X", cells: ["1"] }] },
    ],
    [
      "a table cell that is not a string",
      { ...TABLE, rows: [{ label: "X", cells: [1, "2"] }] },
    ],
    [
      "a table with too many rows",
      { ...TABLE, rows: Array(MAX_ASK_TABLE_ROWS + 1).fill(TABLE.rows[0]) },
    ],
    ["a trend with one point", { ...TREND, points: TREND.points.slice(0, 1) }],
    [
      "a trend with too many points",
      {
        ...TREND,
        points: Array(MAX_ASK_TREND_POINTS + 1).fill(TREND.points[0]),
      },
    ],
    [
      "a trend point with no label",
      {
        ...TREND,
        points: [{ value: { value: 1, text: "1" } }, TREND.points[1]],
      },
    ],
    ["a split with one part", { ...SPLIT, parts: SPLIT.parts.slice(0, 1) }],
    [
      "a split with too many parts",
      { ...SPLIT, parts: Array(MAX_ASK_SPLIT_PARTS + 1).fill(SPLIT.parts[0]) },
    ],
    [
      "a negative count",
      {
        ...SPLIT,
        parts: [
          SPLIT.parts[0],
          { label: "B", count: { value: -1, text: "-1" } },
        ],
      },
    ],
    ["a serve with no courts", { ...SERVE, courts: [] }],
    [
      "a serve with too many courts",
      {
        ...SERVE,
        courts: Array(MAX_ASK_SERVE_COURTS + 1).fill(SERVE.courts[0]),
      },
    ],
    [
      "a court missing a zone",
      {
        ...SERVE,
        courts: [
          {
            label: "All",
            t: { value: 1, text: "1" },
            body: { value: 2, text: "2" },
          },
        ],
      },
    ],
    ["a form with no results", { ...FORM, results: [] }],
    [
      "a form with too many results",
      { ...FORM, results: Array(MAX_ASK_FORM_RESULTS + 1).fill(true) },
    ],
    ["a form result that is null", { ...FORM, results: [true, null] }],
    ["a form result that is a string", { ...FORM, results: ["win"] }],
  ];

  for (const [name, value] of rejected) {
    test(`rejects ${name}`, () => {
      expect(readAskVisual(value)).toBeNull();
    });
  }
});

// ── One cell as both ends of a range ────────────────────────────────────────

test.describe("a sentence that cites one cell as both ends of a range", () => {
  const TREND: AskRow[] = [
    { played_on: "2026-02-03", first_serve_pct: 54.2 },
    { played_on: "2026-09-28", first_serve_pct: 68 },
  ];

  async function run(chunks: string[]) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), TREND);
    const seen: AskAnswerEvent[] = [];
    for await (const event of events) seen.push(event);
    return {
      result,
      text: seen
        .flatMap((event) => (event.type === "text" ? [event.delta] : []))
        .join(""),
    };
  }

  test("citesSameCellAsRange: the identical reference after 'from' and after 'to', and nothing looser", () => {
    expect(
      citesSameCellAsRange(
        "It climbed from {{r1.first_serve_pct}} in February to {{r1.first_serve_pct}} by September.",
      ),
    ).toBe(true);
    expect(
      citesSameCellAsRange(
        "It went From {{ r1.first_serve_pct }} to {{r1.first_serve_pct}}.",
      ),
    ).toBe(true);
    // Two different cells — even two that hold the same value — are a range.
    expect(
      citesSameCellAsRange(
        "It climbed from {{r1.first_serve_pct}} to {{r2.first_serve_pct}}.",
      ),
    ).toBe(false);
    // The same cell twice without a from … to is repetition, not a claim.
    expect(
      citesSameCellAsRange(
        "You landed {{r1.first_serve_pct}}, and {{r1.first_serve_pct}} is the figure to read.",
      ),
    ).toBe(false);
    // "to" before "from" is not the pair.
    expect(
      citesSameCellAsRange(
        "Up to {{r1.first_serve_pct}}, from {{r2.first_serve_pct}}.",
      ),
    ).toBe(false);
  });

  test("drops that sentence and keeps the ones around it", async () => {
    const { result, text } = await run([
      "Your first serve rose over the season.\n\n",
      "It climbed from {{r1.first_serve_pct}} at the start of February to {{r1.first_serve_pct}} by late September. ",
      "The latest match was {{r2.first_serve_pct}}.",
    ]);
    expect(text).toBe("The latest match was 68%.");
    expect(result.droppedSentences).toBe(1);
    expect(result.failure).toBeNull();
    expect(result.headline).toBe("Your first serve rose over the season.");
  });

  test("keeps the paragraph break when the dropped sentence ended a paragraph", async () => {
    const { text } = await run([
      "Headline.\n\nFirst paragraph. It went from {{r1.first_serve_pct}} to {{r1.first_serve_pct}}.\n\nSecond paragraph.",
    ]);
    expect(text).toBe("First paragraph.\n\nSecond paragraph.");
  });

  test("finds the sentence across chunk boundaries, and a full stop inside a reference ends nothing", async () => {
    const { result, text } = await run([
      "Headline.\n\nBefore. It went from {{r1.first_",
      "serve_pct}} to {{r1.first_serve",
      "_pct}}. After {{r2.first_serve_pct}}.",
    ]);
    expect(text).toBe("Before. After 68%.");
    expect(result.droppedSentences).toBe(1);
  });

  test("never touches a figure line or a block line", async () => {
    const { result, text } = await run([
      "The first serve changed.\n",
      "FIGURE: From first to last = {{r2.first_serve_pct}}\n",
      "CHART: table | From {{r1.first_serve_pct}} to {{r1.first_serve_pct}}.\n",
      "COLUMNS: Value\n",
      "ROW: From start to end | {{r1.first_serve_pct}}\n",
      "\nThe body.",
    ]);
    expect(result.figures).toEqual([
      { label: "First serves in", value: "68%" },
    ]);
    expect(result.visual?.kind).toBe("table");
    expect(text).toBe("The body.");
    expect(result.droppedSentences).toBe(0);
  });

  test("the headline is never dropped: only the range itself is cut out of it", async () => {
    const { result } = await run([
      "Your first serve percentage rose over the season from {{r1.played_on}} to {{r1.played_on}}.\n\nThe body.",
    ]);
    expect(result.headline).toBe(
      "Your first serve percentage rose over the season.",
    );
    expect(result.droppedSentences).toBe(1);

    const kept = await run([
      "It rose from {{r1.first_serve_pct}} to {{r2.first_serve_pct}}.\n\nThe body.",
    ]);
    expect(kept.result.headline).toBe("It rose from 54.2% to 68%.");
    expect(kept.result.droppedSentences).toBe(0);
  });

  test("recitesOneCell: one cell three times or more in a sentence, never twice", () => {
    expect(
      recitesOneCell(
        "It climbed to {{r1.first_serve_pct}} on {{r1.played_on}}, {{r1.first_serve_pct}} on {{r1.played_on}}, and {{r1.first_serve_pct}} on {{r1.played_on}}.",
      ),
    ).toBe(true);
    expect(
      recitesOneCell(
        "You landed {{r1.first_serve_pct}}, and {{r1.first_serve_pct}} is the figure to read.",
      ),
    ).toBe(false);
    expect(
      recitesOneCell(
        "{{r1.first_serve_pct}}, {{r2.first_serve_pct}} and {{r3.first_serve_pct}}.",
      ),
    ).toBe(false);
  });

  test("drops a sentence that recites one cell for every row, and keeps the rest", async () => {
    const { result, text } = await run([
      "Your first serve rose.\n\n",
      "It climbed to {{r1.first_serve_pct}} on {{r1.played_on}}, {{r1.first_serve_pct}} on {{r1.played_on}}, and {{r1.first_serve_pct}} on {{r1.played_on}}. ",
      "These figures cover two matches.",
    ]);
    expect(text).toBe("These figures cover two matches.");
    expect(result.droppedSentences).toBe(1);
  });

  test("an answer whose whole body was that sentence keeps its headline and does not fail", async () => {
    const { result, text } = await run([
      "Your first serve changed.\n\nIt went from {{r1.first_serve_pct}} to {{r1.first_serve_pct}}.",
    ]);
    expect(text).toBe("");
    expect(result.headline).toBe("Your first serve changed.");
    expect(result.failure).toBeNull();
  });
});

// ── The scope total given to each row ───────────────────────────────────────

test.describe("the scope's match total cited once per row", () => {
  const SURFACES: AskRow[] = [
    { surface: "Clay", win_pct: 16.7, group_matches: 6, matches_in_scope: 18 },
    { surface: "Hard", win_pct: 75, group_matches: 12, matches_in_scope: 18 },
  ];

  async function run(chunks: string[], rows: AskRow[] = SURFACES) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
    const seen: AskAnswerEvent[] = [];
    for await (const event of events) seen.push(event);
    return {
      result,
      text: seen
        .flatMap((event) => (event.type === "text" ? [event.delta] : []))
        .join(""),
    };
  }

  test("citesScopeTotalPerRow: the scope cell twice, whichever rows it is read from", () => {
    expect(
      citesScopeTotalPerRow(
        "{{r1.matches_in_scope}} matches on clay and {{r2.matches_in_scope}} matches on hard courts.",
      ),
    ).toBe(true);
    expect(
      citesScopeTotalPerRow(
        "{{r1.matches_in_scope}} on clay and {{ r1.matches_in_scope }} on hard.",
      ),
    ).toBe(true);
    expect(
      citesScopeTotalPerRow(
        "You played {{r1.group_matches}} on clay and {{r2.group_matches}} on hard, out of {{r1.matches_in_scope}}.",
      ),
    ).toBe(false);
  });

  test("drops the body sentence: '18 matches on clay and 18 matches on hard courts'", async () => {
    const { result, text } = await run([
      "You win more often on hard courts.\n\n",
      "You played {{r1.matches_in_scope}} matches on clay and {{r2.matches_in_scope}} matches on hard courts. ",
      "You played {{r1.group_matches}} on clay and {{r2.group_matches}} on hard, out of {{r1.matches_in_scope}} matches.",
    ]);
    expect(text).toBe(
      "You played 6 on clay and 12 on hard, out of 18 matches.",
    );
    expect(result.droppedSentences).toBe(1);
    expect(result.failure).toBeNull();
  });

  test("a caption that does it falls back to the plain count; the chart stays", async () => {
    const { result } = await run([
      "You win more often on hard courts.\n",
      "CHART: table | From {{r1.matches_in_scope}} matches on clay and {{r2.matches_in_scope}} matches on hard courts.\n",
      "COLUMNS: Win percentage\n",
      "ROW: Clay | {{r1.win_pct}}\n",
      "ROW: Hard | {{r2.win_pct}}\n",
    ]);
    expect(result.visual).toEqual({
      kind: "table",
      caption: "From 18 matches.",
      columns: ["Win percentage"],
      rows: [
        { label: "Clay", cells: ["16.7%"] },
        { label: "Hard", cells: ["75%"] },
      ],
    });
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedSentences).toBe(1);
  });

  test("with a per-row count in the result, a caption that names one row beside the scope total falls back too", async () => {
    const pinned = await run([
      "Headline.\nCHART: table | Clay, from {{r1.matches_in_scope}} matches.\nCOLUMNS: Win percentage\nROW: Clay | {{r1.win_pct}}\n",
    ]);
    expect(pinned.result.visual).toMatchObject({ caption: "From 18 matches." });

    // No per-row count column: the caption stands.
    const bare = await run(
      [
        "Headline.\nCHART: table | Clay, from {{r1.matches_in_scope}} matches.\nCOLUMNS: Win percentage\nROW: Clay | {{r1.win_pct}}\n",
      ],
      SURFACES.map(({ group_matches: _own, ...row }) => row),
    );
    expect(bare.result.visual).toMatchObject({
      caption: "Clay, from 18 matches.",
    });

    // A caption that names no row stands.
    const plain = await run([
      "Headline.\nCHART: table | By surface, from {{r1.matches_in_scope}} matches.\nCOLUMNS: Win percentage\nROW: Clay | {{r1.win_pct}}\n",
    ]);
    expect(plain.result.visual).toMatchObject({
      caption: "By surface, from 18 matches.",
    });
  });

  test("the headline is never dropped: the spans are cut out of it", async () => {
    const { result } = await run([
      "You played {{r1.matches_in_scope}} matches on clay and {{r2.matches_in_scope}} matches on hard courts.\n\nThe body.",
    ]);
    expect(result.headline).toBe("You played on clay and on hard courts.");
    expect(result.droppedSentences).toBe(1);
  });

  test("a one-row result with no count of its own is left alone: there the total is that row's", async () => {
    const { group_matches: _own, ...alone } = SURFACES[0];
    const { text, result } = await run(
      [
        "Headline.\n\nFrom {{r1.matches_in_scope}} matches, all {{r1.matches_in_scope}} of them on clay, {{r1.win_pct}} won.",
      ],
      [alone],
    );
    expect(text).toBe("From 18 matches, all 18 of them on clay, 16.7% won.");
    expect(result.droppedSentences).toBe(0);
  });

  test("a one-row result with its own count: a sentence or caption citing only the scope total is turned to the row's count", async () => {
    // "…a total points won percentage of 51.9% across those 10 matches": 3 were tournaments.
    const tournament: AskRow[] = [
      {
        match_type: "Tournament",
        win_pct: 66.7,
        total_points_won_pct: 51.9,
        match_count: 3,
        matches_in_scope: 10,
      },
    ];
    const { text, result } = await run(
      [
        "The team won most of its tournament matches, from {{r1.matches_in_scope}} matches.\n",
        "CHART: table | Tournament play, from {{r1.matches_in_scope}} matches.\nCOLUMNS: Value\nROW: Matches won | {{r1.win_pct}}\n\n",
        "Tournament matches account for {{r1.match_count}} of the {{r1.matches_in_scope}} looked at. ",
        "The team won {{r1.total_points_won_pct}} of points across those {{r1.matches_in_scope}} matches.",
      ],
      tournament,
    );
    expect(result.headline).toBe(
      "The team won most of its tournament matches, from 3 matches.",
    );
    expect(result.visual).toMatchObject({
      caption: "Tournament play, from 3 matches.",
    });
    // The sentence that sets the two counts side by side is right as written.
    expect(text).toBe(
      "Tournament matches account for 3 of the 10 looked at. The team won 51.9% of points across those 3 matches.",
    );
  });
});

// ── A label that names one row beside another row's cells ───────────────────

test.describe("a label that names one row and cites another", () => {
  const HANDS: AskRow[] = [
    { opponent_hand: "right", second_serve_won_pct: 54.6, win_pct: 60 },
    { opponent_hand: "left", second_serve_won_pct: 40, win_pct: 40 },
  ];
  const tokens = uniqueRowLabelTokens(HANDS);

  async function run(chunks: string[], rows: AskRow[] = HANDS) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
    for await (const _event of events) {
      // drained
    }
    return result;
  }

  test("labelNamesAnotherRow: a unique row word in the label, every cell from other rows", () => {
    expect(
      labelNamesAnotherRow(
        " Second-serve win percentage against left-handers ",
        " {{r1.second_serve_won_pct}}",
        HANDS,
        tokens,
      ),
    ).toBe(true);
    // The right row.
    expect(
      labelNamesAnotherRow(
        "Against left-handers",
        "{{r2.second_serve_won_pct}}",
        HANDS,
        tokens,
      ),
    ).toBe(false);
    // Names both rows, cites one of them.
    expect(
      labelNamesAnotherRow(
        "Left against right",
        "{{r1.win_pct}}",
        HANDS,
        tokens,
      ),
    ).toBe(false);
    // Names no row.
    expect(
      labelNamesAnotherRow("Win percentage", "{{r1.win_pct}}", HANDS, tokens),
    ).toBe(false);
    // Whole words only: "leftover" is not "left".
    expect(
      labelNamesAnotherRow("Leftover points", "{{r1.win_pct}}", HANDS, tokens),
    ).toBe(false);
    // The scope total belongs to no row.
    expect(
      labelNamesAnotherRow(
        "Matches against left-handers",
        "{{r1.matches_in_scope}}",
        [
          { ...HANDS[0], matches_in_scope: 15 },
          { ...HANDS[1], matches_in_scope: 15 },
        ],
        tokens,
      ),
    ).toBe(false);
  });

  test("a cell only the first row holds — the server's summary cells — is never judged", () => {
    const rows: AskRow[] = [
      {
        played_on: "2026-02-07",
        opponent_name: "Sam Ortiz",
        aces: 1,
        high_aces: 9,
      },
      { played_on: "2026-03-07", opponent_name: "Marek Dvorsky", aces: 9 },
    ];
    expect(
      labelNamesAnotherRow(
        "Most aces, against Dvorsky",
        "{{r1.high_aces}}",
        rows,
        uniqueRowLabelTokens(rows),
      ),
    ).toBe(false);
  });

  test("drops the figure: 'against left-handers = 54.6%' over the right-handers row", async () => {
    const result = await run([
      "Your second serve differs by opponent hand.\n",
      "FIGURE: Second-serve win percentage against left-handers = {{r1.second_serve_won_pct}}\n",
      "FIGURE: Second-serve win percentage against right-handers = {{r1.second_serve_won_pct}}\n",
      "\nThe body.",
    ]);
    expect(result.figures).toEqual([
      {
        label: "Second-serve points won, right",
        value: "54.6%",
      },
    ]);
    expect(result.droppedFigures).toEqual([
      "FIGURE: Second-serve win percentage against left-handers = {{r1.second_serve_won_pct}}",
    ]);
    expect(result.failure).toBeNull();
    expect(result.text).toBe("The body.");
  });

  test("drops the table row whose label names another row, and keeps the others", async () => {
    const result = await run([
      "Your second serve differs by opponent hand.\n",
      "CHART: table | Second-serve points won by opponent hand.\n",
      "COLUMNS: Points won\n",
      "ROW: Left-handers | {{r1.second_serve_won_pct}}\n",
      "ROW: Right-handers | {{r1.second_serve_won_pct}}\n",
      "\nThe body.",
    ]);
    expect(result.visual).toMatchObject({
      kind: "table",
      rows: [{ label: "Right-handers", cells: ["54.6%"] }],
    });
    expect(result.droppedVisualRows).toBe(1);
  });

  test("a table with one column per row — the label names a measure — is untouched", async () => {
    const result = await run([
      "Your second serve differs by opponent hand.\n",
      "CHART: table | By opponent hand.\n",
      "COLUMNS: Left-handers | Right-handers\n",
      "ROW: Second-serve points won | {{r2.second_serve_won_pct}} | {{r1.second_serve_won_pct}}\n",
      "ROW: Win percentage | {{r2.win_pct}} | {{r1.win_pct}}\n",
    ]);
    expect(result.visual).toMatchObject({
      rows: [
        { label: "Second-serve points won", cells: ["40%", "54.6%"] },
        { label: "Matches won", cells: ["40%", "60%"] },
      ],
    });
    expect(result.droppedVisualRows).toBe(0);
  });

  test("an equals sign before the separator of a table row is the slip, not part of the label", async () => {
    const result = await run([
      "Headline.\nCHART: table | By hand.\nCOLUMNS: Points won | Win percentage\nROW: Right-handers = | {{r1.second_serve_won_pct}} | {{r1.win_pct}}\n",
    ]);
    expect(result.visual).toMatchObject({
      rows: [{ label: "Right-handers", cells: ["54.6%", "60%"] }],
    });
  });

  test("a split's rows are parts of one whole and are not judged row by row", async () => {
    const rows: AskRow[] = [
      { opponent_hand: "right", wins: 6 },
      { opponent_hand: "left", wins: 2 },
    ];
    const result = await run(
      [
        "Wins by hand.\nCHART: split | Wins by opponent hand.\nROW: Left | {{r1.wins}}\nROW: Right | {{r2.wins}}\n",
      ],
      rows,
    );
    expect(result.visual?.kind).toBe("split");
    expect(result.droppedVisualRows).toBe(0);
  });
});

// ── The measure's own name ──────────────────────────────────────────────────

test.describe("a label for a known measure is the server's, not the model's", () => {
  const SURFACES: AskRow[] = [
    {
      court_surface: "Hard Court",
      total_points_won_pct: 53.8,
      win_pct: 75,
      group_matches: 12,
    },
    {
      court_surface: "Clay Court",
      total_points_won_pct: 49.5,
      win_pct: 16.7,
      group_matches: 6,
    },
  ];
  const tokens = uniqueRowLabelTokens(SURFACES);

  async function run(chunks: string[], rows: AskRow[] = SURFACES) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
    for await (const _event of events) {
      // drained
    }
    return result;
  }

  test("'Hard court win percentage' over total points won becomes 'Total points won, Hard Court'", async () => {
    const result = await run([
      "You do better on hard courts.\n",
      "FIGURE: Hard court win percentage = {{r1.total_points_won_pct}}\n",
      "FIGURE: Clay court win percentage = {{r2.total_points_won_pct}}\n",
      "FIGURE: Hard court match wins = {{r1.win_pct}}\n",
      "\nThe body.",
    ]);
    expect(result.figures).toEqual([
      { label: "Total points won, Hard Court", value: "53.8%" },
      { label: "Total points won, Clay Court", value: "49.5%" },
      { label: "Matches won, Hard Court", value: "75%" },
    ]);
    expect(result.renamedLabels).toBe(3);
    expect(result.droppedDigits).toEqual([]);
  });

  test("canonicalLabel, figure: the measure's name, what its prefix says, and the row only when the label named it", () => {
    const one: AskRow[] = [
      { me_first_serve_pct: 60, opp_first_serve_pct: 65, all_aces: 3 },
    ];
    const none = new Map<string, number>();
    expect(
      canonicalLabel(
        "figure",
        " Serve accuracy ",
        " {{r1.me_first_serve_pct}}",
        one,
        none,
      ),
    ).toBe("First serves in");
    expect(
      canonicalLabel(
        "figure",
        "His serve",
        "{{r1.opp_first_serve_pct}}",
        one,
        none,
      ),
    ).toBe("First serves in, opponent");
    expect(canonicalLabel("figure", "Aces", "{{r1.all_aces}}", one, none)).toBe(
      "Aces, all matches",
    );
    expect(
      canonicalLabel(
        "figure",
        "Points won on clay",
        "{{r2.total_points_won_pct}}",
        SURFACES,
        tokens,
      ),
    ).toBe("Total points won, {{r2.court_surface}}");
    // The label named no row: the row is not guessed.
    expect(
      canonicalLabel(
        "figure",
        "Points won",
        "{{r2.total_points_won_pct}}",
        SURFACES,
        tokens,
      ),
    ).toBe("Total points won");
    // No digit and no middot in anything the dictionary can print.
    expect(
      canonicalLabel(
        "figure",
        "x",
        "{{r1.start_prev5_first_serve_pct}}",
        one,
        none,
      ),
    ).toBe("First serves in, first match, previous five");
  });

  test("an alias the dictionary cannot place, the scope total, and two unlike measures keep the model's label", () => {
    const rows: AskRow[] = [
      { big_point_serve_t_pct: 37.1, aces: 2, winners: 9, matches_in_scope: 4 },
    ];
    const none = new Map<string, number>();
    expect(
      canonicalLabel(
        "figure",
        "T on big points",
        "{{r1.big_point_serve_t_pct}}",
        rows,
        none,
      ),
    ).toBeNull();
    expect(
      canonicalLabel(
        "figure",
        "Matches",
        "{{r1.matches_in_scope}}",
        rows,
        none,
      ),
    ).toBeNull();
    expect(
      canonicalLabel(
        "row",
        "Attack",
        "{{r1.aces}} | {{r1.winners}}",
        rows,
        none,
      ),
    ).toBeNull();
    expect(canonicalLabel("figure", "Nothing", "none", rows, none)).toBeNull();
  });

  test("a table or bars row whose cells are all one measure takes the measure's bare name", async () => {
    const rows: AskRow[] = [
      {
        me_total_points_won_pct: 48.7,
        opp_total_points_won_pct: 51.3,
        first_serve_pct: 65.8,
        all_first_serve_pct: 62.2,
      },
    ];
    const table = await run(
      [
        "Headline.\nCHART: table | You against the opponent.\nCOLUMNS: You | Opponent\nROW: Win rate | {{r1.me_total_points_won_pct}} | {{r1.opp_total_points_won_pct}}\n",
      ],
      rows,
    );
    expect(table.visual).toMatchObject({
      rows: [{ label: "Total points won", cells: ["48.7%", "51.3%"] }],
    });
    const bars = await run(
      [
        "Headline.\nCHART: bars | August against all matches.\nSERIES: August | All matches\nROW: First serve percentage | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}\n",
      ],
      rows,
    );
    expect(bars.visual).toMatchObject({
      rows: [{ label: "First serves in" }],
    });
  });

  test("a row labelled with a row of the result is a row label and is left alone", async () => {
    const result = await run([
      "Headline.\nCHART: table | By surface.\nCOLUMNS: Total points won\nROW: Hard | {{r1.total_points_won_pct}}\nROW: Clay | {{r2.total_points_won_pct}}\n",
    ]);
    expect(result.visual).toMatchObject({
      rows: [
        { label: "Hard", cells: ["53.8%"] },
        { label: "Clay", cells: ["49.5%"] },
      ],
    });
    expect(result.renamedLabels).toBe(0);
  });

  test("a figure renamed to the label of a row already in the block is the same number twice, and is dropped", async () => {
    const rows: AskRow[] = [{ me_winners: 15, opp_winners: 24 }];
    const result = await run(
      [
        "Headline.\nFIGURE: Your winners = {{r1.me_winners}}\nCHART: table | Winners.\nCOLUMNS: You | Opponent\nROW: Winners hit | {{r1.me_winners}} | {{r1.opp_winners}}\n",
      ],
      rows,
    );
    expect(result.figures).toEqual([]);
    expect(result.visual).toMatchObject({ rows: [{ label: "Winners" }] });
  });
});

test.describe("labels and plots the server can only read one way", () => {
  async function run(chunks: string[], rows: AskRow[]) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
    for await (const _event of events) {
      // drained
    }
    return result;
  }

  test("a count and its percentage share a name: the second keeps the model's label, so no two rows print alike", async () => {
    const rows: AskRow[] = [
      { break_points_saved: 67, break_points_saved_pct: 58.8 },
    ];
    const result = await run(
      [
        "Headline.\nFIGURE: Saved = {{r1.break_points_saved}}\nFIGURE: Save rate = {{r1.break_points_saved_pct}}\nCHART: table | Break points.\nCOLUMNS: Value\nROW: Saved count | {{r1.break_points_saved}}\nROW: Saved share | {{r1.break_points_saved_pct}}\n",
      ],
      rows,
    );
    expect(result.visual).toMatchObject({
      rows: [
        { label: "Break points saved", cells: ["67"] },
        { label: "Saved share", cells: ["58.8%"] },
      ],
    });
    // The first figure repeats the block's first row and is dropped; the
    // second keeps the model's label.
    expect(result.figures).toEqual([{ label: "Save rate", value: "58.8%" }]);
  });

  test("a form block's mistyped PLOT column is read as the result's one true-or-false column", async () => {
    const rows: AskRow[] = [
      {
        played_on: "2026-09-25",
        player_name: "Emon van Loben Sels",
        i_won: false,
      },
      { played_on: "2026-09-26", player_name: "Rudy Quan", i_won: true },
    ];
    const fixed = await run(
      [
        "Headline.\nCHART: form | The matches, oldest first.\nPLOT: i_van\n\nBody.",
      ],
      rows,
    );
    expect(fixed.visual).toMatchObject({
      kind: "form",
      results: [false, true],
    });
    expect(fixed.droppedVisuals).toEqual([]);

    // Two true-or-false columns: nothing is guessed, and the block drops as before.
    const unsure = await run(
      [
        "Headline.\nCHART: form | The matches, oldest first.\nPLOT: i_van\n\nBody.",
      ],
      rows.map((row) => ({ ...row, served_first: true })),
    );
    expect(unsure.visual).toBeNull();
    expect(unsure.droppedVisuals).toHaveLength(1);
  });
});

test.describe("a serve block over one row per direction", () => {
  const ZONES: AskRow[] = [
    { serve_zone: "T", serve_zone_pct: 37.1, big_points: 65 },
    { serve_zone: "Wide", serve_zone_pct: 36.6, big_points: 64 },
    { serve_zone: "Body", serve_zone_pct: 26.3, big_points: 46 },
  ];

  async function run(chunks: string[], rows: AskRow[]) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
    for await (const _event of events) {
      // drained
    }
    return result;
  }

  test("cells written in the result's order are put in the T, body and wide slots their rows name", async () => {
    const result = await run(
      [
        "Headline.\nCHART: serve | Where your serves went on big points.\nROW: Big points | {{r1.big_points}} | {{r2.big_points}} | {{r3.big_points}}\n",
      ],
      ZONES,
    );
    expect(result.visual).toMatchObject({
      kind: "serve",
      courts: [
        {
          label: "Big points",
          t: { value: 65 },
          body: { value: 46 },
          wide: { value: 64 },
        },
      ],
    });
  });

  test("cells that are not one per direction are left as written", async () => {
    const one: AskRow[] = [{ serve_t: 13, serve_body: 8, serve_wide: 18 }];
    const result = await run(
      [
        "Headline.\nCHART: serve | Where your serves went.\nROW: All serves | {{r1.serve_t}} | {{r1.serve_body}} | {{r1.serve_wide}}\n",
      ],
      one,
    );
    expect(result.visual).toMatchObject({
      courts: [{ t: { value: 13 }, body: { value: 8 }, wide: { value: 18 } }],
    });
    // Two cells from the same direction: nothing is guessed.
    const twice = await run(
      [
        "Headline.\nCHART: serve | Where your serves went.\nROW: Big points | {{r1.big_points}} | {{r1.big_points}} | {{r3.big_points}}\n",
      ],
      ZONES,
    );
    expect(twice.visual).toMatchObject({
      courts: [{ t: { value: 65 }, body: { value: 65 }, wide: { value: 46 } }],
    });
  });
});

test.describe("a superlative given to the wrong serve direction or rally length", () => {
  const BREAK_POINTS: AskRow[] = [
    {
      break_point_serve_t_pct: 38.7,
      break_point_serve_body_pct: 26.5,
      break_point_serve_wide_pct: 34.8,
      break_point_serves_total: 155,
    },
  ];
  const ranking = {
    words: ["t", "body", "wide"],
    highest: "t",
    lowest: "body",
  };

  async function run(chunks: string[], rows: AskRow[] = BREAK_POINTS) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
    const seen: AskAnswerEvent[] = [];
    for await (const event of events) seen.push(event);
    return {
      result,
      text: seen
        .flatMap((event) => (event.type === "text" ? [event.delta] : []))
        .join(""),
    };
  }

  test("misranksSiblings: 'most' without the highest word in reach, or 'least' without the lowest", () => {
    expect(
      misranksSiblings(
        "You serve wide most often and body serves least on break points.",
        [ranking],
      ),
    ).toEqual(ranking);
    expect(
      misranksSiblings("Wide serves are the fewest, with the T next.", [
        ranking,
      ]),
    ).toEqual(ranking);
    // The right word in reach: left alone, however it is phrased.
    for (const fine of [
      "You serve to the T most often, with wide close behind and the body least.",
      "The T and wide take the most serves; the body takes the fewest.",
      "You went to the T on {{r1.break_point_serve_t_pct}} and wide on {{r1.break_point_serve_wide_pct}}.",
      "Most of your serves on break points were recorded.",
      "Your body language was at its lowest.",
    ]) {
      expect(misranksSiblings(fine, [ranking]), fine).toBeNull();
    }
    // A lower-case t is not the T.
    expect(
      misranksSiblings("You hit wide most, then body.", [ranking]),
    ).toEqual(ranking);
    expect(misranksSiblings("You serve wide most often.", [])).toBeNull();
  });

  test("a headline that does it is replaced by the server's own statement of the ranking", async () => {
    const { result } = await run([
      "You serve wide most often and body serves least on break points.\n\nThese figures cover the matches.",
    ]);
    expect(siblingHeadline(ranking)).toBe(
      "Of the T, the body and wide, the highest figure is the T and the lowest is the body.",
    );
    expect(result.headline).toBe(siblingHeadline(ranking));
    expect(result.droppedSentences).toBe(1);
    expect(result.text).toBe("These figures cover the matches.");
  });

  test("a body sentence that does it is dropped; a right one stays", async () => {
    const { text, result } = await run([
      "Your serve direction on break points.\n\n",
      "You went wide most often and to the body least. ",
      "You went to the T most often, {{r1.break_point_serve_t_pct}} of the time.",
    ]);
    expect(text).toBe("You went to the T most often, 38.7% of the time.");
    expect(result.droppedSentences).toBe(1);
  });

  test("a result of several rows, or one whose directions tie, is not checked", async () => {
    const tie = await run(
      ["You serve wide most often and body least.\n\nBody."],
      [{ serve_t: 9, serve_body: 4, serve_wide: 9 }],
    );
    expect(tie.result.headline).toBe(
      "You serve wide most often and body least.",
    );
    const several = await run(
      ["You serve wide most often and body least.\n\nBody."],
      [
        { serve_zone: "T", serve_t: 9, serve_body: 4, serve_wide: 2 },
        { serve_zone: "Wide", serve_t: 1, serve_body: 4, serve_wide: 2 },
      ],
    );
    expect(several.result.droppedSentences).toBe(0);
  });
});

test.describe("an answer that cites no cell but the match count", () => {
  const BREAKS: AskRow[] = [
    {
      break_points_saved_pct: 58.8,
      break_points_converted_pct: 42.1,
      matches_in_scope: 18,
    },
  ];

  async function run(chunks: string[], rows: AskRow[] = BREAKS) {
    const { events, result } = renderAskAnswer(chunksOf(...chunks), rows);
    for await (const _event of events) {
      // drained
    }
    return result;
  }

  test("statedFigures: a one-row result's known measures as sentences of references", () => {
    expect(statedFigures(BREAKS[0])).toBe(
      "Break points saved: {{r1.break_points_saved_pct}}. Break points converted: {{r1.break_points_converted_pct}}.",
    );
    expect(
      statedFigures({
        me_winners: 15,
        opp_winners: 24,
        break_points_saved: 67,
        break_points_saved_pct: 58.8,
        odd_rate: 3,
        aces: null,
      }),
    ).toBe(
      "Winners: {{r1.me_winners}}. Winners, opponent: {{r1.opp_winners}}. Break points saved: {{r1.break_points_saved}}. Break points saved: {{r1.break_points_saved_pct}}.",
    );
    expect(statedFigures({ odd_rate: 3, matches_in_scope: 4 })).toBe("");
  });

  test("gets the result's figures stated by the server, under the measures' own names", async () => {
    // "Your break points saved and break points converted figures are
    // recorded across eighteen matches." — and not one of them given.
    const result = await run([
      "Your break point figures are recorded.\n\nThese figures come from {{r1.matches_in_scope}} matches.",
    ]);
    expect(result.text).toBe(
      "These figures come from 18 matches.\n\nBreak points saved: 58.8%. Break points converted: 42.1%.",
    );
    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);

    const bare = await run(["Your break point figures are recorded."]);
    expect(bare.text).toBe(
      "Break points saved: 58.8%. Break points converted: 42.1%.",
    );
  });

  test("an answer that cites a measure anywhere — a figure, a block, the body — is left as written", async () => {
    for (const reply of [
      "Headline.\nFIGURE: Saved = {{r1.break_points_saved_pct}}\n\nFrom {{r1.matches_in_scope}} matches.",
      "Headline.\n\nYou saved {{r1.break_points_saved_pct}}.",
      "You saved {{r1.break_points_saved_pct}}.",
    ]) {
      const result = await run([reply]);
      expect(result.text, reply).not.toContain("Break points converted:");
    }
  });

  test("several rows, or a result with no known measure, get nothing added", async () => {
    const several = await run(
      ["Headline.\n\nFrom {{r1.matches_in_scope}} matches."],
      [BREAKS[0], BREAKS[0]],
    );
    expect(several.text).toBe("From 18 matches.");
    const unknown = await run(
      ["Headline.\n\nFrom {{r1.matches_in_scope}} matches."],
      [{ odd_rate: 3, matches_in_scope: 18 }],
    );
    expect(unknown.text).toBe("From 18 matches.");
  });
});
