import { expect, test } from "@playwright/test";

import { type AskRow, renderAskAnswer } from "@/lib/services/ask/answer-render";
import {
  asksAboutMomentum,
  buildMomentumAnswer,
} from "@/lib/services/ask/momentum";

/**
 * Offline spec for the momentum answer: one match's points, written by the
 * server so the turn of the match is computed, never narrated.
 */

const point = (
  n: number,
  won: boolean | null,
  extra: Partial<AskRow> = {},
): AskRow => ({
  match_id: "m",
  point_number: n,
  i_won: won,
  set_number: n <= 4 ? 1 : 2,
  is_break_point: false,
  is_set_point: false,
  is_match_point: false,
  ...extra,
});

/** Won the first two, lost the next three (a break point among them), won the last two. */
const POINTS: AskRow[] = [
  point(1, true),
  point(2, true),
  point(3, false),
  point(4, false, { is_break_point: true }),
  point(5, false),
  point(6, true),
  point(7, true, { is_match_point: true }),
];

async function rendered(
  rows: AskRow[],
  team = false,
  playerName: string | null = null,
) {
  const answer = buildMomentumAnswer(rows, { team, playerName, matchCount: 1 });
  if (!answer) throw new Error("not a momentum answer");
  const { events, result } = renderAskAnswer(
    (async function* chunks() {
      yield answer.text;
    })(),
    answer.rows,
  );
  for await (const event of events) void event;
  return { answer, result };
}

test.describe("buildMomentumAnswer", () => {
  test("the headline says which way the match turned, with no digit; the figures are cells", async () => {
    const { answer, result } = await rendered(POINTS);
    expect(answer.text.replace(/\{\{[^}]*\}\}/g, "")).not.toMatch(/\d/);
    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedSentences).toBe(0);
    // The largest lead was two points (after point 2); the largest deficit
    // one (after point 5).
    expect(result.headline).toBe("You led by more than you ever trailed.");
    expect(result.text).toBe(
      "You won 4 of the 7 points with a known winner and lost 3. Your largest lead was 2 points, after point 2. Your largest deficit was 1 point, after point 5. 1 break point was played. This is one match.",
    );
    expect(result.visual).toEqual({
      kind: "momentum",
      caption:
        "Points won minus points lost, point by point, with break, set and match points marked.",
      matchId: "m",
      points: [
        { won: true, set: 1 },
        { won: true, set: 1 },
        { won: false, set: 1 },
        { won: false, set: 1, mark: "break" },
        { won: false, set: 2 },
        { won: true, set: 2 },
        { won: true, set: 2, mark: "match" },
      ],
    });
  });

  test("a match that was only ever trailed, and one never led by either side", async () => {
    const behind = await rendered([
      point(1, false),
      point(2, false),
      point(3, true),
      point(4, false),
    ]);
    expect(behind.result.headline).toBe(
      "You trailed by more than you ever led.",
    );
    expect(behind.result.text).toContain("You never led.");
    expect(behind.result.text).toContain(
      "Your largest deficit was 2 points, after point 2.",
    );
    expect(behind.result.text).toContain("No break point was played.");

    // Up one, level, down one, level: a lead and a deficit of the same size.
    const level = await rendered([
      point(1, true),
      point(2, false),
      point(3, false),
      point(4, true),
    ]);
    expect(level.result.headline).toBe(
      "Neither side led by more than the other did.",
    );
    expect(level.result.text).toContain(
      "Your largest lead was 1 point, after point 1.",
    );
    expect(level.result.text).toContain(
      "Your largest deficit was 1 point, after point 3.",
    );
    // A lead with no deficit behind it is still a lead.
    const ahead = await rendered([point(1, true), point(2, false)]);
    expect(ahead.result.headline).toBe(
      "You led by more than you ever trailed.",
    );
    expect(ahead.result.text).toContain("You never trailed.");
  });

  test("a team scope names the player from the data, never 'you'; columns the query lacks read as unknown", async () => {
    const rows = POINTS.map(
      ({
        set_number: _s,
        is_break_point: _b,
        is_set_point: _sp,
        is_match_point: _mp,
        ...row
      }) => row,
    );
    const { answer, result } = await rendered(rows, true, "Rudy Quan");
    expect(result.headline).toBe(
      "Rudy Quan led by more than the opponent ever trailed.",
    );
    expect(result.text).toContain("Rudy Quan won 4 of the 7 points");
    expect(result.text).toContain("Rudy Quan's largest lead was 2 points");
    expect(result.text).not.toMatch(/\byou(r)?\b/i);
    // No flags were selected: nothing is said about break points, and the
    // plotted columns are still present, as unknown.
    expect(result.text).not.toContain("break point");
    expect(answer.rows[0]).toMatchObject({
      is_break_point: null,
      set_number: null,
    });
    expect(result.visual).toMatchObject({
      points: [
        { won: true },
        { won: true },
        { won: false },
        { won: false },
        { won: false },
        { won: true },
        { won: true },
      ],
    });
  });

  test("undecided points are skipped; order follows point_number", async () => {
    const { result } = await rendered([
      point(3, true),
      point(1, null),
      point(2, false),
      point(4, true),
    ]);
    expect(result.text).toContain(
      "You won 2 of the 3 points with a known winner and lost 1.",
    );
    expect(result.visual).toMatchObject({
      points: [{ won: false }, { won: true }, { won: true }],
    });
  });

  test("not for several matches, rows that are not points, points of two matches, or too few", () => {
    const one = { team: false, playerName: null, matchCount: 1 };
    expect(buildMomentumAnswer(POINTS, { ...one, matchCount: 2 })).toBeNull();
    expect(
      buildMomentumAnswer(
        [
          { played_on: "2026-09-28", first_serve_pct: 61 },
          { played_on: "2026-09-29", first_serve_pct: 62 },
        ],
        one,
      ),
    ).toBeNull();
    expect(
      buildMomentumAnswer(
        [point(1, true), point(2, false, { match_id: "other" })],
        one,
      ),
    ).toBeNull();
    expect(
      buildMomentumAnswer([point(1, true), point(2, null)], one),
    ).toBeNull();
    expect(buildMomentumAnswer([point(1, true)], one)).toBeNull();
  });
});

test.describe("asksAboutMomentum", () => {
  test("the wording that asks how a match went", () => {
    for (const question of [
      "How did the match go against Marek?",
      "Where was the turning point?",
      "Did the momentum swing after the first set?",
      "How did it unfold point by point?",
    ]) {
      expect(asksAboutMomentum(question), question).toBe(true);
    }
    for (const question of [
      "How was my first serve against Marek?",
      "Who converted more break points?",
    ]) {
      expect(asksAboutMomentum(question), question).toBe(false);
    }
  });
});
