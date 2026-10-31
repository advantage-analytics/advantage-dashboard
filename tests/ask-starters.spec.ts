import { expect, test } from "@playwright/test";

import type { AskTagOptions } from "@/lib/data/ask-tags";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import {
  askFollowUps,
  askStarters,
  MAX_ASK_FOLLOW_UPS,
  MAX_ASK_STARTERS,
} from "@/lib/services/ask/starters";

/** Starter questions and follow-ups, from the composer's own tag options. Offline. */

const TEAM: AskScope = {
  kind: "team",
  programId: "pppppppp-0000-4000-8000-000000000001",
  programName: "Westbrook College",
};

function match(
  id: string,
  opponentName: string | null,
  iWon: boolean | null,
  playedOn = "2026-09-14",
): AskTagOptions["matches"][number] {
  return {
    matchId: id,
    opponentName,
    playedOn,
    iWon,
    scoreText: iWon === null ? null : "6-4, 6-3",
    playerName: null,
    tournamentName: null,
  };
}

const OPTIONS: AskTagOptions = {
  matches: [
    match("m1", "Marek Dvorsky", false, "2026-10-02"),
    match("m2", "Marek Dvorsky", false, "2026-09-20"),
    match("m3", "Anna Lee", true, "2026-09-14"),
    match("m4", "Luca Brandt", true, "2026-08-02"),
    match("m5", "Luca Brandt", false, "2026-07-02"),
  ],
  opponents: [
    {
      id: "marek dvorsky",
      name: "Marek Dvorsky",
      matchCount: 2,
      hand: "right",
    },
    { id: "anna lee", name: "Anna Lee", matchCount: 1, hand: null },
    { id: "luca brandt", name: "Luca Brandt", matchCount: 2, hand: "left" },
  ],
  players: [],
};

/** Every match in the options has statistics. */
function allAnalysed(options: AskTagOptions): Set<string> {
  return new Set(options.matches.map((m) => m.matchId));
}

test.describe("askStarters — personal", () => {
  test("names the last match, the most-played opponent by the record against them, left-handers, serve and the review", () => {
    const starters = askStarters(
      OPTIONS,
      PERSONAL_ASK_SCOPE,
      allAnalysed(OPTIONS),
    );
    expect(starters.length).toBeLessThanOrEqual(MAX_ASK_STARTERS);
    expect(starters[0]).toEqual({
      text: "How did my match against Marek Dvorsky go?",
      tags: [{ kind: "match", id: "m1", label: "vs Marek Dvorsky" }],
    });
    expect(starters[1]).toEqual({
      text: "Why do I lose to Marek Dvorsky?",
      tags: [{ kind: "opponent", id: "marek dvorsky", label: "Marek Dvorsky" }],
    });
    expect(starters.map((starter) => starter.text)).toContain(
      "What is my record against left-handers?",
    );
    expect(starters.map((starter) => starter.text)).toContain(
      "How is my serve holding up this season?",
    );
  });

  test("a rival with a winning record gets the neutral question; one match is no rival", () => {
    const winning: AskTagOptions = {
      ...OPTIONS,
      matches: [
        match("m1", "Anna Lee", true),
        match("m2", "Anna Lee", true),
        match("m3", "Anna Lee", false),
      ],
      opponents: [
        { id: "anna lee", name: "Anna Lee", matchCount: 3, hand: null },
      ],
    };
    expect(
      askStarters(winning, PERSONAL_ASK_SCOPE, allAnalysed(winning))[1].text,
    ).toBe("How do my matches against Anna Lee go?");
    const single: AskTagOptions = {
      matches: [match("m1", "Anna Lee", true)],
      opponents: [
        { id: "anna lee", name: "Anna Lee", matchCount: 1, hand: null },
      ],
      players: [],
    };
    const starters = askStarters(
      single,
      PERSONAL_ASK_SCOPE,
      allAnalysed(single),
    );
    expect(starters).toHaveLength(1);
    expect(starters[0].tags[0]).toEqual({
      kind: "match",
      id: "m1",
      label: "vs Anna Lee",
    });
  });

  test("no matches, no starters", () => {
    expect(
      askStarters(
        { matches: [], opponents: [], players: [] },
        PERSONAL_ASK_SCOPE,
        new Set(),
      ),
    ).toEqual([]);
  });

  test("a match with no statistics yet is not suggested, and two attempts at it are no rival", () => {
    const pending: AskTagOptions = {
      matches: [
        match("uploading", "Suhail Hooker", null, "2026-10-30"),
        match("failed", "Suhail Hooker", null, "2026-10-30"),
        match("m1", "Anna Lee", true, "2026-09-14"),
      ],
      opponents: [
        {
          id: "suhail hooker",
          name: "Suhail Hooker",
          matchCount: 2,
          hand: "left",
        },
        { id: "anna lee", name: "Anna Lee", matchCount: 1, hand: null },
      ],
      players: [],
    };
    expect(askStarters(pending, PERSONAL_ASK_SCOPE, new Set(["m1"]))).toEqual([
      {
        text: "How did my match against Anna Lee go?",
        tags: [{ kind: "match", id: "m1", label: "vs Anna Lee" }],
      },
    ]);
    expect(askStarters(pending, PERSONAL_ASK_SCOPE, new Set())).toEqual([]);
  });
});

test.describe("askStarters — team", () => {
  test("the record, the last match, the busiest player and the serve question", () => {
    const starters = askStarters(
      {
        ...OPTIONS,
        matches: OPTIONS.matches.map((m, index) => ({
          ...m,
          playerId: index < 3 ? "p1" : "p2",
        })),
        players: [
          { id: "p1", name: "Mara Sokolov", matchCount: 3 },
          { id: "p2", name: "Dana Brooks", matchCount: 1 },
        ],
      },
      TEAM,
      allAnalysed(OPTIONS),
    );
    expect(starters.map((starter) => starter.text)).toEqual([
      "What is each player's record?",
      "How did we do against Marek Dvorsky?",
      "How is Mara Sokolov playing this season?",
      "Who has the best first serve?",
    ]);
    expect(starters[2].tags).toEqual([
      { kind: "player", id: "p1", label: "Mara Sokolov" },
    ]);
  });
});

test.describe("askFollowUps", () => {
  test("follow the subject of the question, never more than the cap, never a repeat", () => {
    for (const [question, expected] of [
      ["How is my first serve this season?", "And on second serves?"],
      ["How do I return?", "And against first serves?"],
      ["Why do I lose to Dvorsky?", "What are my losing plays against them?"],
      ["What is my record?", "Am I better on hard courts or clay?"],
    ] as const) {
      const follow = askFollowUps(question, PERSONAL_ASK_SCOPE);
      expect(follow.length).toBeLessThanOrEqual(MAX_ASK_FOLLOW_UPS);
      expect(follow.map((f) => f.text)).toContain(expected);
      expect(new Set(follow.map((f) => f.text)).size).toBe(follow.length);
      for (const f of follow) expect(f.tags).toEqual([]);
    }
  });

  test("the review is not offered again after a review, and the team wording says we", () => {
    const after = askFollowUps(
      "How can I improve for my next match?",
      PERSONAL_ASK_SCOPE,
    );
    expect(after.map((f) => f.text)).not.toContain(
      "How can I improve for my next match?",
    );
    const team = askFollowUps("How is the team serving?", TEAM);
    expect(team.map((f) => f.text)).toContain("And on second serves?");
    expect(JSON.stringify(team)).not.toMatch(/\bmy\b/);
  });
});
