import { expect, test } from "@playwright/test";

import { seatCrestUrls } from "@/lib/data/match-crests";

const url = (path: string) => `https://crests/${path}`;

test("the team's crest is seat one and the opponent's is seat two", () => {
  expect(
    seatCrestUrls(
      {
        program: { crest_path: "team.png" },
        opponent_program: { crest_path: "opp.png" },
      },
      url,
    ),
  ).toEqual({
    player1: "https://crests/team.png",
    player2: "https://crests/opp.png",
  });
});

test("a team or opponent with no crest leaves only that seat empty", () => {
  expect(
    seatCrestUrls(
      {
        program: { crest_path: null },
        opponent_program: { crest_path: "opp.png" },
      },
      url,
    ),
  ).toEqual({ player1: null, player2: "https://crests/opp.png" });
  expect(
    seatCrestUrls(
      { program: { crest_path: "team.png" }, opponent_program: null },
      url,
    ),
  ).toEqual({ player1: "https://crests/team.png", player2: null });
});

test("a personal match has no crests", () => {
  expect(seatCrestUrls({ program: null, opponent_program: null }, url)).toEqual(
    { player1: null, player2: null },
  );
  expect(seatCrestUrls({}, url)).toEqual({ player1: null, player2: null });
});

test("an embed handed back as an array still reads", () => {
  expect(
    seatCrestUrls({ opponent_program: [{ crest_path: "opp.png" }] }, url),
  ).toEqual({ player1: null, player2: "https://crests/opp.png" });
});
