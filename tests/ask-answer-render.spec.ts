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
  citesMissingCell,
  citesSameCellAsRange,
  citesScopeTotalPerRow,
  canonicalLabel,
  labelNamesAnotherRow,
  misranksSiblings,
  recitesOneCell,
  renderAskAnswer,
  statedRows,
  columnLabel,
  distinctHeadings,
  distinctRowLabels,
  siblingHeadline,
  statedFigures,
  visualFromRows,
} from "@/lib/services/ask/answer-render";
import { asksForChart } from "@/lib/services/ask/chart-request";
import { uniqueRowLabelTokens } from "@/lib/services/ask/facts";
import {
  ASK_MODEL_VISUAL_KINDS,
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
  MAX_ASK_TREE_BRANCHES,
  MAX_ASK_TREE_LEVELS,
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
/** A result with nothing to state: the renderer adds no figures of its own to an answer over it. */
const NO_FIGURES: AskRow[] = [{ opponent_name: "Alex Rivera", i_won: true }];

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
      // Each figure names the column it was cited from, for the Video link.
      {
        type: "figure",
        label: "Second-serve points won",
        value: "54.6%",
        column: "second_serve_won_pct",
      },
      { type: "figure", label: "Matches", value: "9", column: "matches" },
      {
        type: "figure",
        label: "Last played",
        value: "Sep 14, 2026",
        column: "last_played_on",
      },
    ]);
    expect(events.slice(4).every((event) => event.type === "text")).toBe(true);
    expect(body(events)).toBe(
      "Across 9 matches you won 54.6% of second-serve points.\n\n" +
        "Against Sam Ortiz it was 41%.",
    );

    expect(result).toEqual({
      headline: "Your second serve holds up better this season.",
      figures: [
        {
          label: "Second-serve points won",
          value: "54.6%",
          column: "second_serve_won_pct",
        },
        { label: "Matches", value: "9", column: "matches" },
        {
          label: "Last played",
          value: "Sep 14, 2026",
          column: "last_played_on",
        },
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
      convertedVisuals: [],
      visualLead: false,
      failure: null,
    });
  });

  test("a figure names its column only when its value is exactly one cell", async () => {
    const { events } = await render([
      "Headline.\n" +
        "FIGURE: Share = {{r1.second_serve_won_pct}}\n" +
        "FIGURE: Played = {{r1.matches}} of {{r2.matches}}\n" +
        "FIGURE: Set = {{r1.matches}} matches\n",
    ]);
    expect(events.filter((event) => event.type === "figure")).toEqual([
      {
        type: "figure",
        label: "Second-serve points won",
        value: "54.6%",
        column: "second_serve_won_pct",
      },
      // Two cells, or words around one, name no column: the figure is not
      // the count of any one measure's points.
      { type: "figure", label: "Played", value: "9 of 4" },
      { type: "figure", label: "Set", value: "9 matches" },
    ]);
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
      { type: "figure", label: "One", value: "9", column: "matches" },
      { type: "figure", label: "Two", value: "4", column: "matches" },
      {
        type: "figure",
        label: "Total points",
        value: "1,204",
        column: "total_points",
      },
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
    // Rows with no figure: a bare claim over rows that hold one gets the
    // figures stated beneath it (see "an answer that ends with no figure").
    const { events, result } = await render(["Just the claim."], NO_FIGURES);

    expect(events).toEqual([{ type: "headline", text: "Just the claim." }]);
    expect(result.failure).toBeNull();
  });

  test("text streams a sentence at a time instead of waiting for the end", async () => {
    // A sentence is held until it ends, so one that cites the same cell as
    // both ends of a range can be left out whole (`citesSameCellAsRange`).
    const { events } = await render(
      ["Headline.\n", "The first sentence. The ", "second one."],
      NO_FIGURES,
    );

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
      column: "first_serve_pct",
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
    const { events, result } = await render(
      ["Headline.\nYou won 5", "4.", "6% of points."],
      NO_FIGURES,
    );

    expect(body(events)).toBe("You won of points.");
    expect(result.droppedDigits).toEqual(["54.6%"]);
  });

  test("digits are dropped from the headline and from a figure label too", async () => {
    const { events, result } = await render([
      "You won 9 of them.\nFIGURE: Last 5 matches = {{r1.matches}}\n",
    ]);

    expect(events).toEqual([
      { type: "headline", text: "You won of them." },
      { type: "figure", label: "Last matches", value: "9", column: "matches" },
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
        "something that is not a reference",
        "Headline.\nYou won {{matches}} matches.",
        "malformed_reference",
        "{{matches}}",
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

  // A well-formed reference to a cell the result lacks is a slip of one name
  // or one row number: in the body, that sentence is left out and the rest of
  // the answer stands (`citesMissingCell()`). Nothing is printed in its place.
  for (const [name, sentence] of [
    ["a row that does not exist", "You won {{r3.matches}} matches."],
    ["a column that does not exist", "You hit {{r1.aces}} aces."],
    ["an inherited property", "You won {{r1.constructor}} matches."],
    ["row zero — rows count from one", "You won {{r0.matches}} matches."],
  ] as const) {
    test(`${name}, cited in the body, leaves that sentence out`, async () => {
      const { events, result } = await render([
        `Headline.\n\nYou won {{r1.matches}}. ${sentence} That is all.`,
      ]);

      expect(result.failure).toBeNull();
      expect(result.droppedSentences).toBe(1);
      expect(events.some((event) => event.type === "error")).toBe(false);
      expect(body(events)).toMatch(/^You won \S+\. That is all\.$/);
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
        "Then {{nope}} breaks. ",
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
    const { result } = await render(["You won {{r1.matches}}.\nBody."], []);

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
        '{"type":"figure","label":"Matches","value":"9","column":"matches"}\n' +
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

  test("table: a count and its share never print under one name", async () => {
    // The Ad/Deuce answer that read as a duplicated table: the model named
    // both serve_t (a count) and serve_t_pct (a share) "Serves to the T".
    const COURTS: AskRow[] = [
      {
        court: "Ad",
        serve_t: 256,
        serve_t_pct: 34.6,
        serve_body: 209,
        serve_body_pct: 28.3,
      },
      {
        court: "Deuce",
        serve_t: 305,
        serve_t_pct: 37,
        serve_body: 217,
        serve_body_pct: 26.3,
      },
    ];
    const { events } = await render(
      [
        HEAD +
          "CHART: table | Caption.\n" +
          "COLUMNS: Ad | Deuce\n" +
          "ROW: Serves to the T | {{r1.serve_t}} | {{r2.serve_t}}\n" +
          "ROW: Serves to the body | {{r1.serve_body_pct}} | {{r2.serve_body_pct}}\n" +
          "ROW: Serves to the T | {{r1.serve_t_pct}} | {{r2.serve_t_pct}}\n" +
          "ROW: Serves to the body | {{r1.serve_body}} | {{r2.serve_body}}\n" +
          "Body.",
      ],
      COURTS,
    );
    const labels = (visualOf(events) as { rows: { label: string }[] }).rows.map(
      (row) => row.label,
    );
    // The first row of a measure keeps the name; the second, a different
    // unit of it, says which unit it is.
    expect(labels).toEqual([
      "Serves to the T",
      "Serves to the body",
      "Serves to the T, share",
      "Serves to the body, count",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("table: a model label that already tells the rows apart is kept", async () => {
    const COURTS: AskRow[] = [
      { court: "Ad", serve_t: 256, serve_t_pct: 34.6 },
      { court: "Deuce", serve_t: 305, serve_t_pct: 37 },
    ];
    const { events } = await render(
      [
        HEAD +
          "CHART: table | Caption.\n" +
          "COLUMNS: Ad | Deuce\n" +
          "ROW: Serves to the T | {{r1.serve_t}} | {{r2.serve_t}}\n" +
          "ROW: Share of serves to the T | {{r1.serve_t_pct}} | {{r2.serve_t_pct}}\n" +
          "Body.",
      ],
      COURTS,
    );
    expect(
      (visualOf(events) as { rows: { label: string }[] }).rows.map(
        (row) => row.label,
      ),
    ).toEqual(["Serves to the T", "Share of serves to the T"]);
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

  test("trend: a third PLOT column is the dashed second series, and match ids link the points", async () => {
    const rows: AskRow[] = [
      {
        match_id: "m-jun",
        played_on: "2026-06-04",
        first_serve_pct: 61,
        all_first_serve_pct: 58.2,
      },
      {
        match_id: "m-jul",
        played_on: "2026-07-09",
        first_serve_pct: 63,
        all_first_serve_pct: 58.2,
      },
      {
        // A null value is skipped, as before, baseline and all.
        match_id: "m-aug",
        played_on: "2026-08-01",
        first_serve_pct: null,
        all_first_serve_pct: 58.2,
      },
      {
        match_id: "m-sep",
        played_on: "2026-09-28",
        first_serve_pct: 37.5,
        all_first_serve_pct: 58.2,
      },
    ];
    const { events, result } = await render(
      [
        "Headline.\nCHART: trend | First serves in against your average.\nPLOT: played_on | first_serve_pct | all_first_serve_pct\n\nBody.",
      ],
      rows,
    );
    expect(result.droppedVisuals).toEqual([]);
    expect(visualOf(events)).toEqual({
      kind: "trend",
      caption: "First serves in against your average.",
      points: [
        { label: "Jun 4", value: { value: 61, text: "61%" }, matchId: "m-jun" },
        { label: "Jul 9", value: { value: 63, text: "63%" }, matchId: "m-jul" },
        {
          label: "Sep 28",
          value: { value: 37.5, text: "37.5%" },
          matchId: "m-sep",
        },
      ],
      // Named by what the column says; a fourth field names it instead.
      baseline: {
        label: "All matches",
        values: [
          { value: 58.2, text: "58.2%" },
          { value: 58.2, text: "58.2%" },
          { value: 58.2, text: "58.2%" },
        ],
      },
    });
    // The saved block reads back whole, and still reads without the new fields.
    expect(readAskVisual(visualOf(events))).toEqual(visualOf(events));

    const named = await render(
      [
        "Headline.\nCHART: trend | Caption.\nPLOT: played_on | first_serve_pct | all_first_serve_pct | Season so far\n",
      ],
      rows,
    );
    expect(visualOf(named.events)).toMatchObject({
      baseline: { label: "Season so far" },
    });

    // No match_id column: no links. A baseline missing from one drawn row:
    // the line is left out, the trend stands.
    const plain = await render(
      [
        "Headline.\nCHART: trend | Caption.\nPLOT: played_on | first_serve_pct | all_first_serve_pct\n",
      ],
      rows.map(({ match_id: _id, ...row }, index) => ({
        ...row,
        all_first_serve_pct: index === 0 ? null : row.all_first_serve_pct,
      })),
    );
    const plainVisual = visualOf(plain.events);
    expect(plainVisual?.kind).toBe("trend");
    expect(plainVisual).not.toHaveProperty("baseline");
    expect(
      plainVisual?.kind === "trend" &&
        plainVisual.points.every((point) => !("matchId" in point)),
    ).toBe(true);

    // A baseline column the result does not have drops the block; one that
    // is not a number too.
    const missing = await render(
      [
        "Headline.\nCHART: trend | Caption.\nPLOT: played_on | first_serve_pct | nope\n",
      ],
      rows,
    );
    // The model's block drops; the rows — one measure and its all-matches
    // baseline over dates — are the trend the server draws instead.
    expect(missing.result.droppedVisuals[0]?.reason).toBe("bad_reference");
    expect(missing.result.visual).toMatchObject({
      kind: "trend",
      caption: "First serves in over time, oldest first.",
      baseline: { label: "All matches" },
    });
    expect(missing.result.convertedVisuals).toEqual([
      { from: "trend", to: "trend", reason: "shape" },
    ]);
    const words = await render(
      [
        "Headline.\nCHART: trend | Caption.\nPLOT: played_on | first_serve_pct | played_on\n",
      ],
      rows,
    );
    expect(words.result.droppedVisuals[0]?.reason).toBe("bad_value");
  });

  test("trend: two measures asked for over time draw two named lines", async () => {
    // "Team first serve and first serve won, charted": the query returns
    // both shares per match, and a block that named only the first used to
    // drop the second.
    const rows: AskRow[] = [
      {
        played_on: "2026-09-19",
        first_serve_pct: 80.9,
        first_serve_won_pct: 70,
      },
      {
        played_on: "2026-09-22",
        first_serve_pct: 68.5,
        first_serve_won_pct: 61.2,
      },
      {
        played_on: "2026-09-23",
        first_serve_pct: 57.4,
        first_serve_won_pct: 55,
      },
    ];
    const expected = {
      kind: "trend",
      label: "First serves in",
      points: [
        { label: "Sep 19", value: { value: 80.9, text: "80.9%" } },
        { label: "Sep 22", value: { value: 68.5, text: "68.5%" } },
        { label: "Sep 23", value: { value: 57.4, text: "57.4%" } },
      ],
      baseline: {
        label: "First-serve points won",
        values: [
          { value: 70, text: "70%" },
          { value: 61.2, text: "61.2%" },
          { value: 55, text: "55%" },
        ],
      },
    };

    const one = await render(
      [
        "Headline.\nCHART: trend | First serves in and first-serve points won.\nPLOT: played_on | first_serve_pct\n",
      ],
      rows,
    );
    expect(one.result.droppedVisuals).toEqual([]);
    expect(visualOf(one.events)).toEqual({
      ...expected,
      caption: "First serves in and first-serve points won.",
    });
    // The saved block reads back whole, label and all.
    expect(readAskVisual(visualOf(one.events))).toEqual(visualOf(one.events));

    // Named third, the same lines.
    const both = await render(
      [
        "Headline.\nCHART: trend | Caption.\nPLOT: played_on | first_serve_pct | first_serve_won_pct\n",
      ],
      rows,
    );
    expect(visualOf(both.events)).toEqual({ ...expected, caption: "Caption." });

    // The server's own drawing of the same rows.
    expect(visualFromRows(rows)).toEqual({
      ...expected,
      caption:
        "First serves in and first-serve points won over time, oldest first.",
    });

    // The same measure over all matches is still the unnamed baseline, and
    // a block over a count draws no second line it was not asked for.
    expect(
      visualOf(
        (
          await render(
            [
              "Headline.\nCHART: trend | Caption.\nPLOT: played_on | first_serve_pct\n",
            ],
            rows.map((row) => ({
              played_on: row.played_on,
              first_serve_pct: row.first_serve_pct,
              all_first_serve_pct: 60,
            })),
          )
        ).events,
      ),
    ).not.toHaveProperty("baseline");
    expect(
      visualOf(
        (
          await render(
            ["Headline.\nCHART: trend | Caption.\nPLOT: played_on | aces\n"],
            rows.map((row, index) => ({ ...row, aces: index })),
          )
        ).events,
      ),
    ).not.toHaveProperty("baseline");
  });

  test("readAskVisual: a trend's match ids and baseline must be whole, and may be absent", () => {
    const point = (label: string, value: number) => ({
      label,
      value: { value, text: String(value) },
    });
    const saved = {
      kind: "trend",
      caption: "Caption.",
      points: [point("A", 1), point("B", 2)],
    };
    // Saved before the fields existed: unchanged.
    expect(readAskVisual(saved)).toEqual(saved);
    expect(
      readAskVisual({
        ...saved,
        points: [{ ...point("A", 1), matchId: "m1" }, point("B", 2)],
      }),
    ).toMatchObject({ points: [{ matchId: "m1" }, { label: "B" }] });
    // A match id that is not a non-empty string is not one.
    for (const matchId of ["", 7, null, {}]) {
      expect(
        readAskVisual({
          ...saved,
          points: [{ ...point("A", 1), matchId }, point("B", 2)],
        }),
      ).toBeNull();
    }
    const baseline = {
      label: "All matches",
      values: [
        { value: 1.5, text: "1.5" },
        { value: 1.5, text: "1.5" },
      ],
    };
    expect(readAskVisual({ ...saved, baseline })).toEqual({
      ...saved,
      baseline,
    });
    // Wrong length, no label, a value that is not a number: refused whole.
    expect(
      readAskVisual({
        ...saved,
        baseline: { ...baseline, values: baseline.values.slice(0, 1) },
      }),
    ).toBeNull();
    expect(
      readAskVisual({ ...saved, baseline: { ...baseline, label: " " } }),
    ).toBeNull();
    expect(
      readAskVisual({
        ...saved,
        baseline: {
          ...baseline,
          values: [{ value: "1", text: "1" }, baseline.values[1]],
        },
      }),
    ).toBeNull();
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
      // Every cell a serve measure of the viewer's: the court knows whose.
      server: "you",
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

  test("momentum: one point per row with a known winner, in point order, marked by the heaviest pressure", async () => {
    const rows: AskRow[] = [
      // Out of order, one undecided, one row with no flags set.
      {
        match_id: "m",
        point_number: 3,
        i_won: false,
        set_number: 1,
        is_break_point: true,
        is_set_point: true,
        is_match_point: false,
      },
      {
        match_id: "m",
        point_number: 1,
        i_won: true,
        set_number: 1,
        is_break_point: false,
        is_set_point: false,
        is_match_point: false,
      },
      {
        match_id: "m",
        point_number: 2,
        i_won: null,
        set_number: 1,
        is_break_point: true,
        is_set_point: false,
        is_match_point: false,
      },
      {
        match_id: "m",
        point_number: 4,
        i_won: true,
        set_number: 2,
        is_break_point: null,
        is_set_point: null,
        is_match_point: true,
      },
      {
        match_id: "m",
        point_number: 5,
        i_won: true,
        set_number: null,
        is_break_point: true,
        is_set_point: null,
        is_match_point: null,
      },
    ];
    const { events, result } = await render(
      [
        "Headline.\nCHART: momentum | Point by point.\nPLOT: point_number | i_won | set_number | is_break_point | is_set_point | is_match_point\n\nBody.",
      ],
      rows,
    );
    expect(result.droppedVisuals).toEqual([]);
    expect(visualOf(events)).toEqual({
      kind: "momentum",
      caption: "Point by point.",
      matchId: "m",
      points: [
        { won: true, set: 1 },
        { won: false, set: 1, mark: "set" },
        { won: true, set: 2, mark: "match" },
        { won: true, mark: "break" },
      ],
    });
    expect(readAskVisual(visualOf(events))).toEqual(visualOf(events));

    // Two columns are enough; rows of two matches carry no match id.
    const bare = await render(
      ["Headline.\nCHART: momentum | Caption.\nPLOT: point_number | i_won\n"],
      rows.map((row, index) => ({
        ...row,
        match_id: index === 0 ? "other" : "m",
      })),
    );
    expect(visualOf(bare.events)).toEqual({
      kind: "momentum",
      caption: "Caption.",
      points: [{ won: true }, { won: false }, { won: true }, { won: true }],
    });

    // A column the result lacks, a winner that is not a boolean, a flag
    // that is not one, a set that is not a whole number: the block drops.
    for (const [plot, reason, data] of [
      ["PLOT: point_number | i_won | nope", "bad_reference", rows],
      ["PLOT: point_number | set_number", "bad_value", rows],
      ["PLOT: point_number | i_won | i_won", "bad_value", rows],
      [
        "PLOT: point_number | i_won | set_number | point_number",
        "bad_value",
        rows,
      ],
      ["PLOT: point_number", "malformed", rows],
      ["PLOT: point_number | i_won", "limit", rows.slice(1, 2)],
    ] as const) {
      const dropped = await render(
        [`Headline.\nCHART: momentum | Caption.\n${plot}\n`],
        [...data],
      );
      expect(dropped.result.visual, plot).toBeNull();
      expect(dropped.result.droppedVisuals[0]?.reason, plot).toBe(reason);
    }
  });

  test("readAskVisual: a momentum block's points must be whole", () => {
    const saved = {
      kind: "momentum",
      caption: "Caption.",
      points: [{ won: true }, { won: false, set: 2, mark: "break" }],
    };
    expect(readAskVisual(saved)).toEqual(saved);
    expect(readAskVisual({ ...saved, matchId: "m" })).toEqual({
      ...saved,
      matchId: "m",
    });
    expect(readAskVisual({ ...saved, matchId: "" })).toBeNull();
    expect(
      readAskVisual({ ...saved, points: [{ won: "yes" }, { won: true }] }),
    ).toBeNull();
    expect(
      readAskVisual({
        ...saved,
        points: [{ won: true, set: 0 }, { won: true }],
      }),
    ).toBeNull();
    expect(
      readAskVisual({
        ...saved,
        points: [{ won: true, mark: "ace" }, { won: true }],
      }),
    ).toBeNull();
    expect(readAskVisual({ ...saved, points: [{ won: true }] })).toBeNull();
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
      // Each tick carries what its row said of the match: here the date.
      ticks: [{ date: "Jun 4, 2026" }, { date: "Sep 28, 2026" }],
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

      // The model's block is dropped — and the rows, one row of convention
      // pairs, are drawn as the table they fit (`visualFromRows`).
      expect(events.map((event) => event.type)).toEqual([
        "headline",
        "figure",
        "visual",
        "text",
      ]);
      expect(body(events)).toBe("The body still shows.");
      expect(result.visual).toMatchObject({
        kind: "table",
        columns: ["Selected matches", "All matches"],
      });
      expect(result.convertedVisuals).toEqual([
        {
          from: reason === "unknown_kind" ? null : expect.any(String),
          to: "table",
          reason: "shape",
        },
      ]);
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
    // Dropped whole; what is drawn is the rows' own table.
    expect(split.result.visual?.kind).toBe("table");
    expect(split.result.convertedVisuals[0]?.reason).toBe("shape");
    expect(split.result.droppedVisualRows).toBe(0);
    expect(split.result.droppedVisuals).toEqual([
      { reason: "bad_reference", kind: "split", detail: expect.any(String) },
    ]);
  });

  test("a bad reference in the headline still fails the answer; in a FIGURE line it drops that figure alone, in the body that sentence", async () => {
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
    // In the body it costs that sentence, not the answer.
    const text = await render(
      [`Claim.\n\nYou hit {{r1.nope}} aces.`],
      COMPARISON,
    );
    expect(text.result.failure).toBeNull();
    expect(text.result.droppedSentences).toBe(1);
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
      { label: "First serves in", value: "58.2%", column: "first_serve_pct" },
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
    expect(kept.result.figures).toEqual([
      { label: "Aces", value: "11", column: "forced" },
    ]);
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

  test("a bad reference inside a block drops the block; a malformed one in prose still fails the answer", async () => {
    const inBlock = await render(
      [
        "Claim.\nCHART: split | Caption.\nROW: A | {{r1.nope}}\nROW: B | {{r1.forced}}\nFine.",
      ],
      COMPARISON,
    );
    expect(inBlock.result.failure).toBeNull();
    expect(inBlock.result.droppedVisuals[0].reason).toBe("bad_reference");
    // The block was the answer's only figures: the rows' own table stands
    // in for it, so nothing is stated in prose.
    expect(inBlock.result.visual?.kind).toBe("table");
    expect(body(inBlock.events)).toBe("Fine.");
    expect(statedRows(COMPARISON)).toMatch(/^Matches: 4\. First serves in: /);

    const inProse = await render(
      [
        "Claim.\nCHART: split | Caption.\nROW: A | {{r1.winners}}\nROW: B | {{r1.forced}}\nThen {{nope}}.",
      ],
      COMPARISON,
    );
    expect(inProse.result.failure).toEqual({
      kind: "malformed_reference",
      reference: "{{nope}}",
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

  test("a body sentence citing a cell the result lacks is left out; the rest stands", async () => {
    expect(citesMissingCell("It was {{r1.nope}}.", [{ aces: 3 }])).toBe(true);
    expect(citesMissingCell("It was {{r2.aces}}.", [{ aces: 3 }])).toBe(true);
    expect(citesMissingCell("It was {{r1.aces}}.", [{ aces: 3 }])).toBe(false);

    const { events, result } = await render(
      [
        "Headline.\n\nAces were {{r1.aces}}. Converted {{r1.break_points_converted}} of them. Done.",
      ],
      [{ aces: 3 }],
    );
    expect(result.failure).toBeNull();
    expect(body(events)).toBe("Aces were 3. Done.");
  });

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
      { label: "First serves in", value: "68%", column: "first_serve_pct" },
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
        column: "second_serve_won_pct",
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
      {
        label: "Total points won, Hard Court",
        value: "53.8%",
        column: "total_points_won_pct",
      },
      {
        label: "Total points won, Clay Court",
        value: "49.5%",
        column: "total_points_won_pct",
      },
      { label: "Matches won, Hard Court", value: "75%", column: "win_pct" },
    ]);
    expect(result.renamedLabels).toBe(3);
    expect(result.droppedDigits).toEqual([]);
  });

  test("canonicalLabel leaves the model's honest name on an unforced_errors cell the result does not vouch for", () => {
    const none = new Map<string, number>();
    const cell = "{{r1.me_unforced_errors}}";
    for (const row of [
      { me_unforced_errors: 38 },
      { me_unforced_errors: 38, me_forced_errors: null },
    ]) {
      for (const kind of ["figure", "row"] as const) {
        for (const label of ["Errors", "Errors counted as unforced"]) {
          expect(canonicalLabel(kind, label, cell, [row], none)).toBeNull();
        }
      }
      // Any other wrong name is still the dictionary's.
      expect(canonicalLabel("row", "Mistakes", cell, [row], none)).toBe(
        "Unforced errors",
      );
    }
    // Judged: "Errors" would understate the player's errors.
    expect(
      canonicalLabel(
        "row",
        "Errors",
        cell,
        [{ me_unforced_errors: 38, me_forced_errors: 11 }],
        none,
      ),
    ).toBe("Unforced errors");
    // One side unjudged is enough, across every cell the label covers.
    expect(
      canonicalLabel(
        "row",
        "Errors",
        `${cell} | {{r1.opp_unforced_errors}}`,
        [
          {
            me_unforced_errors: 38,
            me_forced_errors: 11,
            opp_unforced_errors: 36,
            opp_forced_errors: null,
          },
        ],
        none,
      ),
    ).toBeNull();
    // A column named errors was always errors.
    expect(
      canonicalLabel("row", "Errors", "{{r1.errors}}", [{ errors: 49 }], none),
    ).toBe("Errors");
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
    expect(result.figures).toEqual([
      { label: "Save rate", value: "58.8%", column: "break_points_saved_pct" },
    ]);
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
    expect(unsure.droppedVisuals).toHaveLength(1);
    // What is drawn instead is the strip the rows' own `i_won` makes —
    // the views' column, not a guess between the two.
    expect(unsure.visual).toMatchObject({
      kind: "form",
      results: [false, true],
      ticks: [
        { date: "Sep 25, 2026", player: "Emon van Loben Sels" },
        { date: "Sep 26, 2026", player: "Rudy Quan" },
      ],
    });
    expect(unsure.convertedVisuals).toEqual([
      { from: "form", to: "form", reason: "shape" },
    ]);
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
    // Nothing in the answer cited a figure, so the server states them.
    expect(result.text).toMatch(
      /^These figures cover the matches\.\n\nBreak point serve t: 38\.7%\./,
    );
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

// ── The server's own kinds and choices (roadmap 3.6, 3.9, 3.10) ────────────

/** The serve +1 breakdown's rows: a total, then one row per pattern. */
const PATTERNS: AskRow[] = [
  {
    section: "total",
    court: null,
    zone: null,
    stroke: null,
    direction: null,
    points: 49,
    won: 28,
    won_pct: 57.1,
  },
  {
    section: "pattern",
    court: null,
    zone: "T",
    stroke: "Forehand",
    direction: "Crosscourt",
    points: 29,
    won: 14,
    won_pct: 48.3,
  },
  {
    section: "pattern",
    court: null,
    zone: "T",
    stroke: "Backhand",
    direction: "Middle",
    points: 12,
    won: 8,
    won_pct: 66.7,
  },
  {
    section: "pattern",
    court: "Ad",
    zone: "Wide",
    stroke: "Forehand",
    direction: "Inside Out",
    points: 8,
    won: 6,
    won_pct: 75,
  },
];

const TREE_LINES = [
  "Headline.",
  "CHART: tree | Caption.",
  "COLUMNS: Serve | Plus one",
  "SERIES: Points | Won | Won %",
  "WATCH: plus-one | serve | mine | any",
  "ROW: T serve | Forehand crosscourt | {{r2.points}} | {{r2.won}} | {{r2.won_pct}}",
  "ROW: T serve | Backhand through the middle | {{r3.points}} | {{r3.won}} | {{r3.won_pct}}",
  "ROW: Wide serve | Forehand inside out | {{r4.points}} | {{r4.won}} | {{r4.won_pct}}",
  "",
  "Body.",
];

test.describe("renderAskAnswer — the play tree", () => {
  test("is the server's kind: known to the renderer, never offered to the model, with its own WATCH line", () => {
    expect(ASK_VISUAL_KINDS).toContain("tree");
    expect(ASK_MODEL_VISUAL_KINDS).not.toContain("tree");
    expect(ASK_VISUAL_SYNTAX.tree).toContain("CHART: tree | <caption>");
    expect(ASK_VISUAL_SYNTAX.tree).toContain("WATCH: <request>");
  });

  test("levels, series, a branch per row with its cells, and a Video filter where the filter can say it", async () => {
    const { events, result } = await render([TREE_LINES.join("\n")], PATTERNS);
    expect(events.map((event) => event.type)).toEqual([
      "headline",
      "visual",
      "text",
    ]);
    const visual = visualOf(events);
    expect(visual).toMatchObject({
      kind: "tree",
      caption: "Caption.",
      levels: ["Serve", "Plus one"],
      countLabel: "Points",
      partLabel: "Won",
      shareLabel: "Won %",
    });
    if (visual?.kind !== "tree") throw new Error("no tree");
    expect(visual.branches).toHaveLength(3);
    expect(visual.branches[0]).toMatchObject({
      steps: ["T serve", "Forehand crosscourt"],
      count: { value: 29, text: "29" },
      part: { value: 14, text: "14" },
      share: { value: 48.3, text: "48.3%" },
    });
    // The filter for exactly this branch's points, from the row its count
    // was cited from; the middle is a direction the filter cannot say.
    expect(visual.branches[0].watch).toMatch(/^[a-z0-9._]+$/);
    expect(visual.branches[0].watch).toContain("vz.t");
    expect(visual.branches[1].watch).toBeUndefined();
    expect(visual.branches[2].watch).toContain("ct.a");
    expect(readAskVisual(JSON.parse(JSON.stringify(visual)))).toEqual(visual);
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedVisualRows).toBe(0);
    expect(result.convertedVisuals).toEqual([]);
    expect(result.droppedDigits).toEqual([]);
    expect(body(events)).toBe("Body.");
  });

  test("without a WATCH line nothing links; without a part label a row is a count and a share", async () => {
    const lines = [
      "Headline.",
      "CHART: tree | Caption.",
      "COLUMNS: Serve | Plus one",
      "SERIES: Points | Won %",
      "ROW: T serve | Forehand crosscourt | {{r2.points}} | {{r2.won_pct}}",
      "ROW: Wide serve | Forehand inside out | {{r4.points}} | {{r4.won_pct}}",
    ];
    const visual = visualOf(
      (await render([lines.join("\n")], PATTERNS)).events,
    );
    expect(visual).toEqual({
      kind: "tree",
      caption: "Caption.",
      levels: ["Serve", "Plus one"],
      countLabel: "Points",
      shareLabel: "Won %",
      branches: [
        {
          steps: ["T serve", "Forehand crosscourt"],
          count: { value: 29, text: "29" },
          share: { value: 48.3, text: "48.3%" },
        },
        {
          steps: ["Wide serve", "Forehand inside out"],
          count: { value: 8, text: "8" },
          share: { value: 75, text: "75%" },
        },
      ],
    });
  });

  test("a row of the wrong shape, or with a reference the result lacks, is left out on its own", async () => {
    const lines = [
      ...TREE_LINES.slice(0, 5),
      "ROW: T serve | {{r2.points}} | {{r2.won}} | {{r2.won_pct}}",
      "ROW: T serve | Backhand crosscourt | {{r9.points}} | {{r3.won}} | {{r3.won_pct}}",
      "ROW: Wide serve | Forehand inside out | {{r4.points}} | {{r4.won}} | {{r4.won_pct}}",
    ];
    const { result } = await render([lines.join("\n")], PATTERNS);
    expect(result.visual?.kind).toBe("tree");
    expect(
      result.visual?.kind === "tree" &&
        result.visual.branches.map((branch) => branch.steps[1]),
    ).toEqual(["Forehand inside out"]);
    expect(result.droppedVisualRows).toBe(2);
    expect(result.droppedVisuals).toEqual([]);
  });

  test("a share that is not a share, no rows, or every row bad drops the block", async () => {
    for (const [lines, reason] of [
      [
        [
          ...TREE_LINES.slice(0, 5),
          "ROW: T serve | Forehand crosscourt | {{r2.points}} | {{r2.won}} | {{r2.zone}}",
        ],
        "bad_value",
      ],
      [TREE_LINES.slice(0, 5), "limit"],
      [
        [
          ...TREE_LINES.slice(0, 5),
          "ROW: T serve | {{r2.points}} | {{r2.won_pct}}",
        ],
        "malformed",
      ],
    ] as const) {
      const { result } = await render(
        [[...lines, "", "Body."].join("\n")],
        PATTERNS,
      );
      expect(result.droppedVisuals[0]?.reason, lines.join("\n")).toBe(reason);
      expect(result.droppedVisuals[0]?.kind).toBe("tree");
    }
  });

  test("a WATCH line the server does not know, a second one, or one on another kind is a malformed block", async () => {
    const unknown = [...TREE_LINES];
    unknown[4] = "WATCH: plus-one | volley | mine | any";
    const twice = [
      ...TREE_LINES.slice(0, 5),
      TREE_LINES[4],
      ...TREE_LINES.slice(5),
    ];
    const onSplit =
      "Headline.\nCHART: split | Caption.\nWATCH: plays | mine\nROW: A | {{r1.points}}\nROW: B | {{r1.won}}";
    for (const text of [unknown.join("\n"), twice.join("\n"), onSplit]) {
      const { result } = await render([text], PATTERNS);
      expect(result.droppedVisuals[0]?.reason, text).toBe("malformed");
    }
  });

  test("the limits: levels and branches", async () => {
    const levels = [...TREE_LINES];
    levels[2] = `COLUMNS: ${Array.from({ length: MAX_ASK_TREE_LEVELS + 1 }, (_, i) => `L${i}`).join(" | ")}`;
    const many = [
      ...TREE_LINES.slice(0, 5),
      ...Array.from(
        { length: MAX_ASK_TREE_BRANCHES + 1 },
        (_, i) =>
          `ROW: Serve ${i} | Shot | {{r2.points}} | {{r2.won}} | {{r2.won_pct}}`,
      ),
    ];
    for (const text of [levels.join("\n"), many.join("\n")]) {
      const { result } = await render([text], PATTERNS);
      expect(result.droppedVisuals[0]?.reason, text).toBe("limit");
    }
  });
});

test.describe("renderAskAnswer — a split that is not one whole", () => {
  /** One row with shares and counts and no convention pair: nothing to fall back to. */
  const ROW: AskRow[] = [
    {
      first_serve_pct: 58.2,
      second_serve_won_pct: 48.7,
      serve_t_pct: 30,
      serve_body_pct: 20,
      serve_wide_pct: 50,
      winners: 8,
      forced: 11,
      unforced: 15,
      total: 34,
      first_serves: 40,
      first_serves_in: 25,
      break_points_faced: 6,
      break_points_saved: 4,
      none_a: 0,
      none_b: 0,
    },
  ];
  const split = (rows: string) =>
    render([`Headline.\nCHART: split | Caption.\n${rows}\n\nBody.`], ROW);

  test("shares that sum to a hundred are a split; shares that do not are a table of them", async () => {
    const whole = await split(
      "ROW: T | {{r1.serve_t_pct}}\nROW: Body | {{r1.serve_body_pct}}\nROW: Wide | {{r1.serve_wide_pct}}",
    );
    expect(whole.result.visual?.kind).toBe("split");
    expect(whole.result.convertedVisuals).toEqual([]);

    const apart = await split(
      "ROW: First serves in | {{r1.first_serve_pct}}\nROW: Second-serve points won | {{r1.second_serve_won_pct}}",
    );
    expect(apart.result.visual).toEqual({
      kind: "table",
      caption: "Caption.",
      columns: ["Share"],
      rows: [
        { label: "First serves in", cells: ["58.2%"] },
        { label: "Second-serve points won", cells: ["48.7%"] },
      ],
    });
    expect(apart.result.convertedVisuals).toEqual([
      {
        from: "split",
        to: "table",
        reason: "shares that do not sum to one whole",
      },
    ]);
    expect(apart.result.droppedVisuals).toEqual([]);
    expect(apart.events.map((event) => event.type)).toEqual([
      "headline",
      "visual",
      "text",
    ]);
  });

  test("counts that are a whole stay a split; counts that nest, or miss the row's total, are a table", async () => {
    const whole = await split(
      "ROW: Winners | {{r1.winners}}\nROW: Forced | {{r1.forced}}\nROW: Unforced | {{r1.unforced}}",
    );
    expect(whole.result.visual?.kind).toBe("split");

    const nested = await split(
      "ROW: First serves | {{r1.first_serves}}\nROW: First serves in | {{r1.first_serves_in}}",
    );
    expect(nested.result.visual).toMatchObject({
      kind: "table",
      columns: ["Count"],
      // The model's own labels: a converted split is not a bars or table
      // block the structural pass renames.
      rows: [
        { label: "First serves", cells: ["40"] },
        { label: "First serves in", cells: ["25"] },
      ],
    });
    expect(nested.result.convertedVisuals[0]?.reason).toBe("counts that nest");

    const faced = await split(
      "ROW: Faced | {{r1.break_points_faced}}\nROW: Saved | {{r1.break_points_saved}}",
    );
    expect(faced.result.convertedVisuals[0]?.reason).toBe("counts that nest");

    const short = await split(
      "ROW: Winners | {{r1.winners}}\nROW: Forced | {{r1.forced}}",
    );
    expect(short.result.visual?.kind).toBe("table");
    expect(short.result.convertedVisuals[0]?.reason).toBe(
      "counts that do not sum to the total",
    );
  });

  test("a share beside a count is no whole and no block; all-zero parts stay a split", async () => {
    const unlike = await split(
      "ROW: In | {{r1.first_serve_pct}}\nROW: Winners | {{r1.winners}}",
    );
    expect(unlike.result.visual).toBeNull();
    expect(unlike.result.droppedVisuals).toEqual([
      { reason: "bad_value", kind: "split", detail: expect.any(String) },
    ]);
    expect(unlike.result.convertedVisuals).toEqual([]);

    const empty = await split("ROW: A | {{r1.none_a}}\nROW: B | {{r1.none_b}}");
    expect(empty.result.visual?.kind).toBe("split");
  });
});

test.describe("renderAskAnswer — a block the rows themselves fit", () => {
  const PIE =
    "Headline.\nCHART: pie | Caption.\nROW: A | {{r1.matches}}\n\nBody.";

  test("one row of pairs: bars when at least four are shares, else a two-column table, named by whose", async () => {
    const shares: AskRow[] = [
      {
        matches_in_scope: 5,
        first_serve_pct: 58.2,
        all_first_serve_pct: 61.4,
        second_serve_won_pct: 41.2,
        all_second_serve_won_pct: 52.8,
        return_won_pct: 38,
        all_return_won_pct: 36,
        break_points_saved_pct: 50,
        all_break_points_saved_pct: 55,
      },
    ];
    expect(visualFromRows(shares)).toEqual({
      kind: "bars",
      caption: "From 5 matches.",
      subjectLabel: "Selected matches",
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
        {
          label: "Return points won",
          subject: { value: 38, text: "38%" },
          baseline: { value: 36, text: "36%" },
        },
        {
          label: "Break points saved",
          subject: { value: 50, text: "50%" },
          baseline: { value: 55, text: "55%" },
        },
      ],
    });
    const { result } = await render([PIE], [{ ...shares[0], matches: 5 }]);
    expect(result.visual?.kind).toBe("bars");
    expect(result.convertedVisuals).toEqual([
      { from: null, to: "bars", reason: "shape" },
    ]);

    expect(
      visualFromRows([
        { me_aces: 8, opp_aces: 3, me_double_faults: 4, opp_double_faults: 6 },
      ]),
    ).toEqual({
      kind: "table",
      caption: "",
      columns: ["You", "Opponent"],
      rows: [
        { label: "Aces", cells: ["8", "3"] },
        { label: "Double faults", cells: ["4", "6"] },
      ],
    });
  });

  test("dated rows with one measure, or with its qualified twin, are a trend with its links", () => {
    const rows: AskRow[] = [
      {
        match_id: "m-sep",
        played_on: "2026-09-28",
        first_serve_pct: 37.5,
        all_first_serve_pct: 58.2,
      },
      {
        match_id: "m-jun",
        played_on: "2026-06-04",
        first_serve_pct: 61,
        all_first_serve_pct: 58.2,
      },
      {
        match_id: "m-jul",
        played_on: "2026-07-09",
        first_serve_pct: null,
        all_first_serve_pct: 58.2,
      },
      {
        match_id: "m-aug",
        played_on: "2026-08-01",
        first_serve_pct: 50,
        all_first_serve_pct: 58.2,
      },
    ];
    expect(visualFromRows(rows)).toEqual({
      kind: "trend",
      caption: "First serves in over time, oldest first.",
      points: [
        { label: "Jun 4", value: { value: 61, text: "61%" }, matchId: "m-jun" },
        { label: "Aug 1", value: { value: 50, text: "50%" }, matchId: "m-aug" },
        {
          label: "Sep 28",
          value: { value: 37.5, text: "37.5%" },
          matchId: "m-sep",
        },
      ],
      baseline: {
        label: "All matches",
        values: [
          { value: 58.2, text: "58.2%" },
          { value: 58.2, text: "58.2%" },
          { value: 58.2, text: "58.2%" },
        ],
      },
    });
    // Two unrelated measures are no trend — and, with a date for a label,
    // no table either.
    expect(visualFromRows(rows.map((row) => ({ ...row, aces: 2 })))).toBeNull();
  });

  test("match rows with results and no measure are the strip, with its ticks", () => {
    const rows: AskRow[] = [
      {
        match_id: "m-2",
        played_on: "2026-09-05",
        opponent_name: "Sam Okafor",
        score_text: "3-6, 6-7",
        i_won: false,
      },
      {
        match_id: "m-1",
        played_on: "2026-08-22",
        opponent_name: "Ilya Brandt",
        score_text: "6-3, 6-4",
        i_won: true,
      },
      {
        match_id: "m-3",
        played_on: "2026-09-28",
        opponent_name: "Riley",
        i_won: null,
      },
    ];
    expect(visualFromRows(rows)).toEqual({
      kind: "form",
      caption: "These matches, oldest first.",
      results: [true, false],
      ticks: [
        {
          opponent: "Ilya Brandt",
          score: "6-3, 6-4",
          date: "Aug 22, 2026",
          matchId: "m-1",
        },
        {
          opponent: "Sam Okafor",
          score: "3-6, 6-7",
          date: "Sep 5, 2026",
          matchId: "m-2",
        },
      ],
    });
    // Points are not matches, whatever their winner column says.
    expect(
      visualFromRows([
        { match_id: "m", point_number: 1, i_won: true },
        { match_id: "m", point_number: 2, i_won: false },
      ]),
    ).toBeNull();
  });

  test("labelled rows with a few measures are a table, a match id never its label; rows that fit nothing are nothing", async () => {
    expect(
      visualFromRows([
        { surface: "Hard", wins: 6, losses: 2, matches_in_scope: 12 },
        { surface: "Clay", wins: 1, losses: 3, matches_in_scope: 12 },
      ]),
    ).toEqual({
      kind: "table",
      caption: "From 12 matches.",
      columns: ["Wins", "Losses"],
      rows: [
        { label: "Hard", cells: ["6", "2"] },
        { label: "Clay", cells: ["1", "3"] },
      ],
    });
    expect(
      visualFromRows([
        { match_id: "a", aces: 3 },
        { match_id: "b", aces: 5 },
      ]),
    ).toBeNull();
    expect(visualFromRows([{ note: "nothing here" }])).toBeNull();
    expect(visualFromRows([])).toBeNull();
    const { result } = await render([PIE], [{ matches: 1, note: "x" }]);
    expect(result.visual).toBeNull();
    expect(result.droppedVisuals[0]?.reason).toBe("unknown_kind");
    expect(result.convertedVisuals).toEqual([]);
  });
});

test.describe("renderAskAnswer — rows that are a match, whose serves, and what a tick carries", () => {
  test("a table row whose cells all come from one result row that is a match carries its id", async () => {
    const rows: AskRow[] = [
      { match_id: "m-1", opponent_name: "A", points: 4, won: 3 },
      { match_id: "m-2", opponent_name: "B", points: 2, won: 0 },
      { match_id: null, opponent_name: "C", points: 1, won: 1 },
    ];
    const { events } = await render(
      [
        "Headline.\nCHART: table | Caption.\nCOLUMNS: Points | Won\nROW: Alpha | {{r1.points}} | {{r1.won}}\nROW: Beta | {{r2.points}} | {{r2.won}}\nROW: Both | {{r1.points}} | {{r2.won}}\nROW: Gamma | {{r3.points}} | {{r3.won}}\n",
      ],
      rows,
    );
    expect(visualOf(events)).toMatchObject({
      kind: "table",
      rows: [
        { label: "Alpha", matchId: "m-1" },
        { label: "Beta", matchId: "m-2" },
        { label: "Both" },
        { label: "Gamma" },
      ],
    });
    const visual = visualOf(events);
    expect(visual?.kind === "table" && "matchId" in visual.rows[2]).toBe(false);
    expect(readAskVisual(JSON.parse(JSON.stringify(visual)))).toEqual(visual);
  });

  test("a serve block says whose serves when every cell is a serve measure of one side", async () => {
    const rows: AskRow[] = [
      {
        court: "Deuce",
        serve_t: 9,
        serve_body: 3,
        serve_wide: 6,
        opp_serve_t: 4,
        opp_serve_body: 5,
        opp_serve_wide: 12,
        t: 1,
        b: 1,
        w: 1,
      },
    ];
    const serve = async (cells: string) =>
      visualOf(
        (await render([`Headline.\nCHART: serve | Caption.\n${cells}\n`], rows))
          .events,
      );
    expect(
      await serve(
        "ROW: All | {{r1.serve_t}} | {{r1.serve_body}} | {{r1.serve_wide}}",
      ),
    ).toMatchObject({ kind: "serve", server: "you" });
    expect(
      await serve(
        "ROW: Theirs | {{r1.opp_serve_t}} | {{r1.opp_serve_body}} | {{r1.opp_serve_wide}}",
      ),
    ).toMatchObject({ kind: "serve", server: "opponent" });
    for (const cells of [
      "ROW: Mixed | {{r1.serve_t}} | {{r1.opp_serve_body}} | {{r1.serve_wide}}",
      "ROW: Named | {{r1.t}} | {{r1.b}} | {{r1.w}}",
    ]) {
      const visual = await serve(cells);
      expect(visual?.kind).toBe("serve");
      expect(visual).not.toHaveProperty("server");
    }
  });

  test("a form strip's ticks carry the rows' opponent, score, date, player and match", async () => {
    const rows: AskRow[] = [
      {
        match_id: "m-1",
        played_on: "2026-08-22",
        opponent_name: "Ilya Brandt",
        score_text: "6-3, 6-4",
        player_name: "Rudy Quan",
        i_won: true,
      },
      {
        match_id: "",
        played_on: "2026-09-05",
        opponent_name: " ",
        score_text: null,
        player_name: null,
        i_won: false,
      },
      {
        match_id: "m-3",
        played_on: "2026-09-28",
        opponent_name: "R",
        i_won: null,
      },
    ];
    const { events } = await render(
      ["Headline.\nCHART: form | Caption.\nPLOT: i_won\n"],
      rows,
    );
    expect(visualOf(events)).toEqual({
      kind: "form",
      caption: "Caption.",
      results: [true, false],
      ticks: [
        {
          opponent: "Ilya Brandt",
          score: "6-3, 6-4",
          date: "Aug 22, 2026",
          player: "Rudy Quan",
          matchId: "m-1",
        },
        { date: "Sep 5, 2026" },
      ],
    });
  });
});

test.describe("renderAskAnswer — when the question asked for a chart", () => {
  const TEXT =
    "Headline.\nCHART: bars | Caption.\nSERIES: A | B\nROW: First serves in | {{r1.first_serve_pct}} | {{r1.all_first_serve_pct}}\n\nBody.";

  async function rendered(text: string, chartAsked: boolean) {
    const { events, result } = renderAskAnswer(chunksOf(text), COMPARISON, {
      chartAsked,
    });
    const seen: AskAnswerEvent[] = [];
    for await (const event of events) seen.push(event);
    return { events: seen, result };
  }

  test("the visual event carries lead, and the result says so; otherwise neither", async () => {
    const asked = await rendered(TEXT, true);
    expect(asked.events.find((event) => event.type === "visual")).toMatchObject(
      { type: "visual", lead: true },
    );
    expect(asked.result.visualLead).toBe(true);

    const plain = await rendered(TEXT, false);
    const visual = plain.events.find((event) => event.type === "visual");
    expect(visual).toBeDefined();
    expect(visual).not.toHaveProperty("lead");
    expect(plain.result.visualLead).toBe(false);
    expect((await render([TEXT], COMPARISON)).result.visualLead).toBe(false);

    // Asked for, but nothing to lead with.
    const none = await rendered("Headline.\n\nBody.", true);
    expect(none.result.visual).toBeNull();
    expect(none.result.visualLead).toBe(false);
  });

  test("asksForChart: the words that ask for one, and the draw that is a bracket", () => {
    for (const question of [
      "Chart my first serve over the season",
      "Can you graph it?",
      "plot my return points won by match",
      "Visualize how my serve has changed",
      "Show me a visualisation of my break points",
      "Draw me my serve placement",
      "draw a picture of where I serve",
      "I'd like a diagram of my serve +1",
      "Show it as a picture",
    ]) {
      expect(asksForChart(question), question).toBe(true);
    }
    for (const question of [
      "How did I serve against Beau?",
      "What's my record on clay?",
      "Who is in the main draw at nationals?",
      "Did I make the draw?",
      "How did the match against the draw's top seed go?",
      "Where do I serve on break points?",
    ]) {
      expect(asksForChart(question), question).toBe(false);
    }
  });
});

test.describe("readAskVisual — the tree, and the new fields on the rest", () => {
  const TREE: AskVisual = {
    kind: "tree",
    caption: "C",
    levels: ["Serve", "Plus one"],
    countLabel: "Points",
    partLabel: "Won",
    shareLabel: "Won %",
    branches: [
      {
        steps: ["T serve", "Forehand crosscourt"],
        count: { value: 29, text: "29" },
        part: { value: 14, text: "14" },
        share: { value: 48.3, text: "48.3%" },
        watch: "sv.y_vz.t",
      },
      {
        steps: ["Wide serve", "Backhand crosscourt"],
        count: { value: 8, text: "8" },
        share: { value: 0, text: "0%" },
      },
    ],
  };

  test("a tree round-trips, with or without a part label and watches", () => {
    expect(readAskVisual(JSON.parse(JSON.stringify(TREE)))).toEqual(TREE);
    const bare = { ...TREE, partLabel: undefined };
    expect(readAskVisual(JSON.parse(JSON.stringify(bare)))).toEqual({
      ...TREE,
      partLabel: undefined,
    });
  });

  test("a tree with a branch of the wrong depth, a share past a hundred, a bad part, or no levels is refused", () => {
    const branch = TREE.kind === "tree" ? TREE.branches[0] : null;
    if (!branch) throw new Error("no branch");
    for (const broken of [
      { ...TREE, branches: [{ ...branch, steps: ["T serve"] }] },
      {
        ...TREE,
        branches: [{ ...branch, share: { value: 101, text: "101%" } }],
      },
      { ...TREE, branches: [{ ...branch, part: { value: -1, text: "-1" } }] },
      { ...TREE, branches: [{ ...branch, count: "29" }] },
      { ...TREE, levels: [] },
      { ...TREE, countLabel: "" },
      { ...TREE, branches: [] },
    ]) {
      expect(readAskVisual(JSON.parse(JSON.stringify(broken)))).toBeNull();
    }
    // A watch that is not a filter string is left off, not refused: the
    // branch still draws, with nothing to open.
    const unwatched = readAskVisual(
      JSON.parse(
        JSON.stringify({ ...TREE, branches: [{ ...branch, watch: 4 }] }),
      ),
    );
    expect(unwatched?.kind === "tree" && "watch" in unwatched.branches[0]).toBe(
      false,
    );
  });

  test("a serve block keeps whose serves it says, and loses anything else; a table row keeps its match; a strip keeps matching ticks", () => {
    const serve = {
      kind: "serve",
      caption: "C",
      server: "opponent",
      courts: [
        {
          label: "All",
          t: { value: 1, text: "1" },
          body: { value: 2, text: "2" },
          wide: { value: 3, text: "3" },
        },
      ],
    };
    expect(readAskVisual(serve)).toEqual(serve);
    expect(readAskVisual({ ...serve, server: "them" })).toEqual({
      ...serve,
      server: undefined,
    });
    const table = {
      kind: "table",
      caption: "",
      columns: ["A"],
      rows: [
        { label: "X", cells: ["1"], matchId: "m-1" },
        { label: "Y", cells: ["2"] },
      ],
    };
    expect(readAskVisual(table)).toEqual(table);
    expect(
      readAskVisual({
        ...table,
        rows: [{ label: "X", cells: ["1"], matchId: 3 }],
      }),
    ).toEqual({
      ...table,
      rows: [{ label: "X", cells: ["1"] }],
    });
    const form = {
      kind: "form",
      caption: "C",
      results: [true, false],
      ticks: [{ opponent: "A", matchId: "m-1" }, {}],
    };
    expect(readAskVisual(form)).toEqual(form);
    expect(readAskVisual({ ...form, ticks: [{ opponent: "A" }] })).toEqual({
      kind: "form",
      caption: "C",
      results: [true, false],
    });
    expect(
      readAskVisual({ ...form, ticks: [{ opponent: 4 }, { score: "" }] }),
    ).toEqual({
      kind: "form",
      caption: "C",
      results: [true, false],
      ticks: [{}, {}],
    });
  });
});

test.describe("a table keyed by two names", () => {
  // Feedback: "the win percentage of each serve placement on each side" drew
  // six rows labelled Ad, Ad, Ad, Deuce, Deuce, Deuce — the placement
  // nowhere — under two columns both headed "Points won".
  const SERVES: AskRow[] = [
    {
      court: "Ad",
      serve_placement: "T",
      total_serves: 24,
      points_won: 13,
      points_won_pct: 54.2,
    },
    {
      court: "Ad",
      serve_placement: "Body",
      total_serves: 50,
      points_won: 25,
      points_won_pct: 50,
    },
    {
      court: "Deuce",
      serve_placement: "Wide",
      total_serves: 30,
      points_won: 16,
      points_won_pct: 53.3,
    },
    {
      court: "Deuce",
      serve_placement: "T",
      total_serves: 21,
      points_won: 8,
      points_won_pct: 38.1,
    },
  ];
  const block = (label: (row: AskRow, n: number) => string) =>
    "CHART: table | By court and placement.\nCOLUMNS: Points won | Total serves | Points won\n" +
    SERVES.map(
      (row, i) =>
        `ROW: ${label(row, i + 1)} | {{r${i + 1}.points_won}} | {{r${i + 1}.total_serves}} | {{r${i + 1}.points_won_pct}}`,
    ).join("\n");

  for (const [name, label] of [
    ["written", (row: AskRow) => String(row.court)],
    ["cited", (_row: AskRow, n: number) => `{{r${n}.court}}`],
  ] as const) {
    test(`rows sharing a ${name} label get their other name`, async () => {
      const { result } = await render(
        [
          `Points won on serve {{r1.points_won_pct}}.\n${block(label)}\n\nBody.`,
        ],
        SERVES,
      );
      expect(result.droppedVisuals).toEqual([]);
      expect(result.visual).toMatchObject({
        kind: "table",
        columns: ["Points won", "Total serves", "Points won %"],
        rows: [
          { label: "Ad · T", cells: ["13", "24", "54.2%"] },
          { label: "Ad · Body" },
          { label: "Deuce · Wide" },
          { label: "Deuce · T" },
        ],
      });
    });
  }

  test("labels that already name their rows are left alone", async () => {
    const { result } = await render(
      [
        `Points won on serve {{r1.points_won_pct}}.\n${block((row) => `${row.court} ${row.serve_placement}`)}\n\nBody.`,
      ],
      SERVES,
    );
    expect(result.visual).toMatchObject({
      rows: [
        { label: "Ad T" },
        { label: "Ad Body" },
        { label: "Deuce Wide" },
        { label: "Deuce T" },
      ],
    });
  });

  test("the server's own table names both", () => {
    expect(visualFromRows(SERVES)).toMatchObject({
      kind: "table",
      rows: [
        { label: "Ad · T" },
        { label: "Ad · Body" },
        { label: "Deuce · Wide" },
        { label: "Deuce · T" },
      ],
    });
  });

  test("distinctRowLabels leaves a group it cannot tell apart", () => {
    const rows: AskRow[] = [
      { court: "Ad", n: 1 },
      { court: "Ad", n: 2 },
    ];
    expect(distinctRowLabels(["Ad", "Ad"], [0, 1], rows)).toEqual(["Ad", "Ad"]);
    // A row drawn from several result rows names no one row.
    expect(distinctRowLabels(["Ad", "Ad"], [0, null], SERVES)).toEqual([
      "Ad",
      "Ad",
    ]);
  });

  test("distinctRowLabels matches a name already in the label as a word", () => {
    // "T" is a letter of "First Serve", not a word of it.
    const rows: AskRow[] = [
      { serve_type: "First Serve", serve_zone: "T", n: 1 },
      { serve_type: "First Serve", serve_zone: "Wide", n: 2 },
    ];
    expect(
      distinctRowLabels(["First Serve", "First Serve"], [0, 1], rows),
    ).toEqual(["First Serve · T", "First Serve · Wide"]);
  });

  test("distinctRowLabels adds one telling name, never a score or link", () => {
    const rows: AskRow[] = [
      {
        court: "Ad",
        serve_zone: "T",
        opponent: "Smith",
        score: "6-4 6-3",
        clip: "https://example.com/a",
      },
      {
        court: "Ad",
        serve_zone: "Wide",
        opponent: "Jones",
        score: "7-5 6-2",
        clip: "https://example.com/b",
      },
    ];
    expect(distinctRowLabels(["Ad", "Ad"], [0, 1], rows)).toEqual([
      "Ad · T",
      "Ad · Wide",
    ]);
  });

  test("distinctRowLabels takes a name with a digit, never a bare mark", () => {
    const courts: AskRow[] = [
      { court: "Ad", side: "Court 1", n: 1 },
      { court: "Ad", side: "Court 2", n: 2 },
    ];
    expect(distinctRowLabels(["Ad", "Ad"], [0, 1], courts)).toEqual([
      "Ad · Court 1",
      "Ad · Court 2",
    ]);
    const marks: AskRow[] = [
      { court: "Ad", zone: "-", n: 1 },
      { court: "Ad", zone: "Wide", n: 2 },
    ];
    expect(distinctRowLabels(["Ad", "Ad"], [0, 1], marks)).toEqual([
      "Ad",
      "Ad",
    ]);
  });

  test("distinctRowLabels takes a range bucket, never a long text", () => {
    const buckets: AskRow[] = [
      { court: "Ad", bucket: "1-4 shots", n: 1 },
      { court: "Ad", bucket: "5-9 shots", n: 2 },
    ];
    expect(distinctRowLabels(["Ad", "Ad"], [0, 1], buckets)).toEqual([
      "Ad · 1-4 shots",
      "Ad · 5-9 shots",
    ]);
    const long: AskRow[] = [
      { name: "Rudy", tournament: "Fall Classic Invitational at the Campus" },
      { name: "Rudy", tournament: "Spring Open Invitational at the Campus" },
    ];
    // A date column is not a name either: the opponent tells the rows apart.
    const names: AskRow[] = [
      {
        label: "Match",
        played_on: "Sep 14, 2026",
        opponent: "A. Montgomery-Smith",
      },
      {
        label: "Match",
        played_on: "Sep 21, 2026",
        opponent: "A. Montgomery-Jones",
      },
    ];
    expect(distinctRowLabels(["Match", "Match"], [0, 1], names)).toEqual([
      "Match · A. Montgomery-Smith",
      "Match · A. Montgomery-Jones",
    ]);
    expect(distinctRowLabels(["Rudy", "Rudy"], [0, 1], long)).toEqual([
      "Rudy",
      "Rudy",
    ]);
  });

  test("distinctRowLabels reads accented names as whole words", () => {
    const rows: AskRow[] = [
      { opponent: "Núñez", court: "Ad", n: 1 },
      { opponent: "Núñez", court: "Deuce", n: 2 },
    ];
    expect(distinctRowLabels(["Núñez", "Núñez"], [0, 1], rows)).toEqual([
      "Núñez · Ad",
      "Núñez · Deuce",
    ]);
  });

  test("distinctHeadings marks only a repeated heading over a share", () => {
    expect(
      distinctHeadings(
        ["Points won", "Points won"],
        [["points_won", "points_won_pct"]],
      ),
    ).toEqual(["Points won", "Points won %"]);
    expect(
      distinctHeadings(
        ["Points won", "Share"],
        [["points_won", "points_won_pct"]],
      ),
    ).toEqual(["Points won", "Share"]);
  });
});
