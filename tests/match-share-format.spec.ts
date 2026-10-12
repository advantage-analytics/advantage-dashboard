import { expect, test } from "@playwright/test";

import {
  readShareToken,
  realTournamentName,
  sharedMatchPair,
  sharedMatchWinner,
  sharedVideoAllowed,
  shareScopeLabel,
} from "@/lib/data/match-share-format";

/**
 * The public share page's two pure decisions (`match-share-format.ts`):
 *
 *  - who it may say won. The dashboard transform defaults `score.winner` to
 *    player2 when the score cannot say, which printed "Baek def. Moore" on
 *    the public header and link preview for an unscored or level match.
 *  - how it reads the token. `decodeURIComponent` throws on a malformed
 *    escape, which sent a truncated link to the error screen instead of
 *    "That link isn't valid".
 */

test("a score that does not settle it names no winner", () => {
  expect(sharedMatchWinner(null, undefined)).toBeNull();
  expect(sharedMatchWinner({ player1: [], player2: [] }, undefined)).toBeNull();
  // Level sets.
  expect(
    sharedMatchWinner({ player1: [6, 3], player2: [3, 6] }, undefined),
  ).toBeNull();
});

test("a decided score names its winner, a stored winner wins", () => {
  expect(sharedMatchWinner({ player1: [6, 6], player2: [3, 4] }, "Final")).toBe(
    "player1",
  );
  expect(
    sharedMatchWinner({ player1: [4, 6, 5], player2: [6, 4, 7] }, undefined),
  ).toBe("player2");
  // A retirement: the side that stopped leads on sets.
  expect(
    sharedMatchWinner(
      { player1: [6, 2], player2: [3, 1], winner: "player2" },
      "Retired",
    ),
  ).toBe("player2");
});

test("an unfinished match names no winner whatever the sets show", () => {
  expect(
    sharedMatchWinner({ player1: [6, 5], player2: [2, 3] }, "Unfinished"),
  ).toBeNull();
});

test("the pair reads winner first, or vs", () => {
  expect(sharedMatchPair("Moore", "Baek", "player1")).toBe("Moore def. Baek");
  expect(sharedMatchPair("Moore", "Baek", "player2")).toBe("Baek def. Moore");
  expect(sharedMatchPair("Moore", "Baek", null)).toBe("Moore vs Baek");
});

test("a malformed token reads as unknown instead of throwing", () => {
  expect(readShareToken("abc%E0%A4")).toBe("");
  expect(readShareToken("%")).toBe("");
  expect(readShareToken("abc_DEF-123")).toBe("abc_DEF-123");
  expect(readShareToken("a%2Db")).toBe("a-b");
});

test("the Unknown Event placeholder reads as no tournament", () => {
  expect(realTournamentName("Unknown Event")).toBeNull();
  expect(realTournamentName("  ")).toBeNull();
  expect(realTournamentName(null)).toBeNull();
  expect(realTournamentName(" Spring Invitational ")).toBe(
    "Spring Invitational",
  );
});

test("a link's scope is named the same way wherever it is printed", () => {
  expect(shareScopeLabel({ visualizations: false, video: false })).toBe(
    "Statistics only",
  );
  expect(shareScopeLabel({ visualizations: true, video: false })).toBe(
    "No video",
  );
  // The video is the fact worth the line, with or without the charts.
  for (const visualizations of [true, false])
    expect(shareScopeLabel({ visualizations, video: true })).toBe("With video");
});

test("the video stays on a link only while its maker may still share it", () => {
  const maker = "11111111-2222-4333-8444-555555555555";
  const program = "99999999-2222-4333-8444-555555555555";
  const team = { makerId: maker, programId: program };

  // A personal match was the maker's to share.
  expect(
    sharedVideoAllowed({
      makerId: maker,
      programId: null,
      makerRole: null,
      playersCanShareVideo: false,
    }),
  ).toBe(true);

  // A team match: staff always, in any of the three staff roles.
  for (const makerRole of ["owner", "coach", "staff"])
    expect(
      sharedVideoAllowed({ ...team, makerRole, playersCanShareVideo: false }),
    ).toBe(true);

  // A player only while the program lets players share video — so turning
  // the setting off takes the video off the links players made.
  expect(
    sharedVideoAllowed({
      ...team,
      makerRole: "player",
      playersCanShareVideo: true,
    }),
  ).toBe(true);
  expect(
    sharedVideoAllowed({
      ...team,
      makerRole: "player",
      playersCanShareVideo: false,
    }),
  ).toBe(false);

  // A coach who left the staff, or the team altogether.
  expect(
    sharedVideoAllowed({
      ...team,
      makerRole: null,
      playersCanShareVideo: false,
    }),
  ).toBe(false);

  // A maker whose account is gone can vouch for nothing, on any match.
  for (const programId of [null, program])
    expect(
      sharedVideoAllowed({
        makerId: null,
        programId,
        makerRole: "owner",
        playersCanShareVideo: true,
      }),
    ).toBe(false);
});
