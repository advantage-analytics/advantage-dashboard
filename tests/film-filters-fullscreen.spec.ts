import { expect, test } from "@playwright/test";

import {
  DEFAULT_FILM_FILTERS,
  applyFilmFilters,
  courtSideOf,
  describeFilmCut,
} from "@/components/dashboard/matches/match-detail/film/film-filters";

import { pt } from "./fixtures/film-point";

/**
 * The fullscreen film room's filter axes. They share one `FilmFilters` value
 * with the report tab, so these cover only the fields the fullscreen adds.
 */

const points = [
  pt({
    id: "a",
    setNumber: 1,
    gameNumber: 1,
    serverIsPlayer1: true,
    rallyLength: 3,
    resultType: "Ace",
    lastShotType: "First Serve",
  }),
  pt({
    id: "b",
    setNumber: 1,
    gameNumber: 1,
    serverIsPlayer1: true,
    rallyLength: 9,
    resultType: "Backhand Winner",
    lastShotType: "Backhand",
    saved: true,
  }),
  pt({
    id: "c",
    setNumber: 2,
    gameNumber: 3,
    serverIsPlayer1: false,
    rallyLength: 5,
    resultType: "Forehand Unforced Error",
    lastShotType: "Forehand",
  }),
  pt({
    id: "d",
    setNumber: 2,
    gameNumber: 3,
    serverIsPlayer1: false,
    rallyLength: 2,
    resultType: "Double Fault",
    lastShotType: "Second Serve",
    pointScore: "15-0",
  }),
];
const ids = (list: { id: string }[]) => list.map((p) => p.id);
const cut = (f: Partial<typeof DEFAULT_FILM_FILTERS>, youIsPlayer1 = true) =>
  ids(
    applyFilmFilters(points, { ...DEFAULT_FILM_FILTERS, ...f }, youIsPlayer1),
  );

test("server, saved, set and rally length", () => {
  expect(cut({ server: "you" })).toEqual(["a", "b"]);
  expect(cut({ server: "you" }, false)).toEqual(["c", "d"]);
  expect(cut({ savedOnly: true })).toEqual(["b"]);
  expect(cut({ set: 2 })).toEqual(["c", "d"]);
  expect(cut({ rallyMin: 5 })).toEqual(["b", "c"]);
});

test("ended-with is one OR group across serve and rally endings", () => {
  expect(cut({ ended: ["ace", "unforced"] })).toEqual(["a", "c"]);
  expect(cut({ ended: ["winner", "double-fault"] })).toEqual(["b", "d"]);
});

test("shot reads the last shot; serve +1 is a +1 winner or a forced fourth-ball error", () => {
  expect(cut({ shot: ["forehand"] })).toEqual(["c"]);
  const plusOne = [
    pt({ id: "w3", rallyLength: 3, resultType: "Forehand Winner" }),
    pt({ id: "e3", rallyLength: 3, resultType: "Forehand Unforced Error" }),
    pt({ id: "e4", rallyLength: 4, resultType: "Backhand Forced Error" }),
    pt({ id: "w4", rallyLength: 4, resultType: "Backhand Winner" }),
    pt({ id: "ace", rallyLength: 1, resultType: "Ace" }),
  ];
  expect(
    ids(
      applyFilmFilters(
        plusOne,
        { ...DEFAULT_FILM_FILTERS, shot: ["serve-plus-one"] },
        true,
      ),
    ),
  ).toEqual(["w3", "e4"]);
});

test("court side from the score when there is one, else from position in the game", () => {
  expect(courtSideOf(pt({ id: "x", pointScore: "30-30" }), 5, true)).toBe(
    "deuce",
  );
  expect(courtSideOf(pt({ id: "x", pointScore: "AD-40" }), 0, true)).toBe("ad");
  expect(courtSideOf(pt({ id: "x" }), 0, false)).toBe("deuce");
  expect(courtSideOf(pt({ id: "x" }), 3, false)).toBe("ad");
  // d carries a real score, so the whole match reads court from scores:
  // a, b, c are "0-0" (deuce), d is 15-0 (ad).
  expect(cut({ court: "ad" })).toEqual(["d"]);
});

test("the cut in words", () => {
  const sides = {
    you: { name: "Timofey Stepanov" },
    opp: { name: "Giacomo Revelli" },
  } as Parameters<typeof describeFilmCut>[1];
  expect(describeFilmCut(DEFAULT_FILM_FILTERS, sides)).toBe("All points");
  expect(
    describeFilmCut(
      {
        ...DEFAULT_FILM_FILTERS,
        savedOnly: true,
        set: 2,
        server: "opp",
        ended: ["winner", "ace"],
        shot: ["forehand"],
      },
      sides,
    ),
  ).toBe(
    "Saved points, set 2, Revelli serving, winners or aces, ended on forehands",
  );
});
