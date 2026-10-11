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
  MAX_ASK_FIGURES,
  type AskRow,
  formatAskCell,
  renderAskAnswer,
} from "@/lib/services/ask/answer-render";
import type { AskAnswerEvent, AskEvent } from "@/lib/services/ask/events";

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
      { type: "figure", label: "Second serve points won", value: "54.6%" },
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
        { label: "Second serve points won", value: "54.6%" },
        { label: "Matches", value: "9" },
        { label: "Last played", value: "Sep 14, 2026" },
      ],
      text:
        "Across 9 matches you won 54.6% of second-serve points.\n\n" +
        "Against Sam Ortiz it was 41%.",
      droppedDigits: [],
      droppedFigures: [],
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
      { type: "figure", label: "Three", value: "1,204" },
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

  test("text streams as it arrives instead of waiting for the end", async () => {
    const { events } = await render([
      "Headline.\n",
      "The first part ",
      "and the second part.",
    ]);

    expect(events).toEqual([
      { type: "headline", text: "Headline." },
      { type: "text", delta: "The first part" },
      { type: "text", delta: " and the second part." },
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
