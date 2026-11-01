import { expect, test } from "@playwright/test";

import {
  buildAskTagOptions,
  buildTeamAskTagOptions,
  type AskRosterRow,
  type AskTagOptions,
  type DbAskTeamMatch,
} from "@/lib/data/ask-tags";
import type { DbPersonalMatch } from "@/lib/data/personal-matches-server";
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
    { id: "o1", name: "Marek Dvorsky", matchCount: 2, hand: "right" },
    { id: "o2", name: "Anna Lee", matchCount: 1, hand: null },
    { id: "o3", name: "Luca Brandt", matchCount: 2, hand: "left" },
  ],
  players: [],
};

test.describe("askStarters — personal", () => {
  test("names the last match, the most-played opponent by the record against them, left-handers, serve and the review", () => {
    const starters = askStarters(OPTIONS, PERSONAL_ASK_SCOPE);
    expect(starters.length).toBeLessThanOrEqual(MAX_ASK_STARTERS);
    expect(starters[0]).toEqual({
      text: "How did my match against Marek Dvorsky go?",
      tags: [{ kind: "match", id: "m1", label: "vs Marek Dvorsky" }],
    });
    expect(starters[1]).toEqual({
      text: "Why do I lose to Marek Dvorsky?",
      tags: [{ kind: "opponent", id: "o1", label: "Marek Dvorsky" }],
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
      opponents: [{ id: "o2", name: "Anna Lee", matchCount: 3, hand: null }],
    };
    expect(askStarters(winning, PERSONAL_ASK_SCOPE)[1].text).toBe(
      "How do my matches against Anna Lee go?",
    );
    const single: AskTagOptions = {
      matches: [match("m1", "Anna Lee", true)],
      opponents: [{ id: "o2", name: "Anna Lee", matchCount: 1, hand: null }],
      players: [],
    };
    const starters = askStarters(single, PERSONAL_ASK_SCOPE);
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
      ),
    ).toEqual([]);
  });
});

test.describe("askStarters — team", () => {
  test("the record, the last match, the busiest player and the serve question", () => {
    const starters = askStarters(
      {
        ...OPTIONS,
        players: [
          { id: "p1", name: "Mara Sokolov", matchCount: 3 },
          { id: "p2", name: "Dana Brooks", matchCount: 1 },
        ],
      },
      TEAM,
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

/**
 * `getAskStarterOptions()` keeps only the rows with statistics and hands them
 * to the same builders as the `@` menu. These pin what that buys, over the
 * real builders and with the rows the loader would keep.
 */
test.describe("askStarters — over the analysed rows only", () => {
  const ME = "11111111-1111-4111-8111-111111111111";

  function row(
    id: string,
    over: Partial<DbPersonalMatch> = {},
  ): DbPersonalMatch {
    return {
      id,
      date: "2026-09-01T15:00:00+00:00",
      player1_id: ME,
      player2_id: null,
      player1_name: "Me Myself",
      player2_name: "Marek Dvorsky",
      created_by: ME,
      score: { player1: [4, 3], player2: [6, 6] },
      tournament_name: null,
      round: null,
      result: null,
      match_type: null,
      court_type: null,
      verified: null,
      duration: null,
      opponent_hand: null,
      opponent_backhand: null,
      ...over,
    };
  }

  function personal(
    rows: DbPersonalMatch[],
    analysed: string[],
  ): AskTagOptions {
    return buildAskTagOptions(
      rows.filter((match) => analysed.includes(match.id)),
      () => "player1",
    );
  }

  test("two attempts at a match with no statistics name nobody and make no rival", () => {
    const rows = [
      row("uploading", {
        date: "2026-10-30T15:00:00+00:00",
        player2_name: "Suhail Hooker",
      }),
      row("failed", {
        date: "2026-10-30T15:00:00+00:00",
        player2_name: "Suhail Hooker",
      }),
      row("m1", { player2_name: "Anna Lee" }),
    ];
    expect(
      askStarters(personal(rows, ["m1"]), PERSONAL_ASK_SCOPE).map(
        (starter) => starter.text,
      ),
    ).toEqual(["How did my match against Anna Lee go?"]);
    expect(askStarters(personal(rows, []), PERSONAL_ASK_SCOPE)).toEqual([]);
  });

  test("a newer unanalysed spelling does not lose the record against a rival", () => {
    const rows = [
      row("failed", {
        date: "2026-10-30T15:00:00+00:00",
        player2_name: "marek dvorsky",
      }),
      row("m1", { date: "2026-09-02T15:00:00+00:00" }),
      row("m2", { date: "2026-09-01T15:00:00+00:00" }),
    ];
    expect(
      askStarters(personal(rows, ["m1", "m2"]), PERSONAL_ASK_SCOPE)[1].text,
    ).toBe("Why do I lose to Marek Dvorsky?");
  });

  test("a hand only an unanalysed match recorded asks nothing about left-handers", () => {
    const rows = [
      row("failed", {
        date: "2026-10-30T15:00:00+00:00",
        opponent_hand: "left",
      }),
      row("m1", { date: "2026-09-02T15:00:00+00:00" }),
      row("m2", { date: "2026-09-01T15:00:00+00:00" }),
    ];
    expect(
      askStarters(personal(rows, ["m1", "m2"]), PERSONAL_ASK_SCOPE).map(
        (starter) => starter.text,
      ),
    ).not.toContain("What is my record against left-handers?");
  });

  test("team: a player or opponent with only unanalysed matches is not suggested", () => {
    const SOKOLOV = "33333333-3333-4333-8333-333333333333";
    const BROOKS = "44444444-4444-4444-8444-444444444444";
    const roster: AskRosterRow[] = [
      {
        player_id: SOKOLOV,
        user_id: null,
        display_name: "Mara Sokolov",
        role: "player",
      },
      {
        player_id: BROOKS,
        user_id: null,
        display_name: "Dana Brooks",
        role: "player",
      },
    ];
    const teamRow = (
      id: string,
      over: Partial<DbPersonalMatch>,
    ): DbAskTeamMatch => ({
      ...row(id, over),
      event_entry_id: null,
    });
    const rows = [
      teamRow("uploading", {
        date: "2026-10-30T15:00:00+00:00",
        player1_id: SOKOLOV,
        player2_name: "Suhail Hooker",
      }),
      teamRow("failed", {
        date: "2026-10-30T15:00:00+00:00",
        player1_id: SOKOLOV,
        player2_name: "Suhail Hooker",
      }),
      teamRow("m1", {
        date: "2026-09-02T15:00:00+00:00",
        player1_id: BROOKS,
        player2_name: "Anna Lee",
      }),
      teamRow("m2", {
        date: "2026-09-01T15:00:00+00:00",
        player1_id: BROOKS,
        player2_name: "Bea Ortiz",
      }),
    ];
    const starters = askStarters(
      buildTeamAskTagOptions(
        rows.filter((match) => ["m1", "m2"].includes(match.id)),
        roster,
      ),
      TEAM,
    );
    expect(starters.map((starter) => starter.text)).toEqual([
      "What is each player's record?",
      "How did we do against Anna Lee?",
      "How is Dana Brooks playing this season?",
      "Who has the best first serve?",
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
