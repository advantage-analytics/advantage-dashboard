import { expect, test } from "@playwright/test";

import {
  filmDraftCount,
  filmListName,
  filmListPoints,
  filmListSentence,
  landFilmCut,
  NO_FILM_LOCAL_FILTERS,
  type FilmLocalFilters,
} from "@/components/dashboard/matches/match-detail/film/film-list-filters";
import type { FilmCutExtras } from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  applyMatchFilters,
  EMPTY_MATCH_FILTERS,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

import { pt } from "./fixtures/film-point";

/**
 * The fullscreen film room's filter axes, in the T7 vocabulary. The room's
 * drawer and the report column draw one `PointList` over ONE
 * `FilmListFilters` value, so these cover the axes the room's old model
 * carried — server, saved, set, rally length, how the point ended, the shot
 * that ended it and the service court — as the shared `MatchFilters`, the
 * Film-only saved toggle and a landed statistic's Film-only remainder (its
 * rally-length extras).
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

/** The Film list for `shared` + Film-only layers, as `film-tab.tsx` builds it. */
function list(
  shared: Partial<MatchFilters>,
  local: Partial<FilmLocalFilters> = {},
  youIsPlayer1 = true,
): string[] {
  const ctx = { youIsPlayer1, hands: { player1: null, player2: null } };
  const sharedPoints = applyMatchFilters(
    points,
    { ...EMPTY_MATCH_FILTERS, ...shared },
    ctx,
  );
  return ids(
    filmListPoints(sharedPoints, { ...NO_FILM_LOCAL_FILTERS, ...local }),
  );
}
const extras = (e: FilmCutExtras) => ({
  remainder: { label: "Cut", extras: e },
});

test("server, saved, set and rally length", () => {
  expect(list({ server: "you" })).toEqual(["a", "b"]);
  expect(list({ server: "you" }, {}, false)).toEqual(["c", "d"]);
  expect(list({}, { savedOnly: true })).toEqual(["b"]);
  expect(list({ sets: [2] })).toEqual(["c", "d"]);
  // Rally length is a landed statistic's Film-only extra, not a shared filter.
  expect(list({}, extras({ rallyMin: 5 }))).toEqual(["b", "c"]);
  // Every layer ANDs: the shared set, the rally extra and the saved toggle.
  expect(
    list({ sets: [1] }, { ...extras({ rallyMin: 5 }), savedOnly: true }),
  ).toEqual(["b"]);
});

test("how the point ended is Result › Outcome, one OR group", () => {
  expect(list({ resultOutcome: ["winner"] })).toEqual(["a", "b"]);
  expect(list({ resultOutcome: ["error"] })).toEqual(["c", "d"]);
  expect(list({ resultOutcome: ["winner", "error"] })).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
});

test("the shot that ended it is Result › Shot", () => {
  expect(list({ resultShot: ["Forehand"] })).toEqual(["c"]);
  expect(list({ resultShot: ["Serve"] })).toEqual(["a", "d"]);
});

test("the service court comes from the score when the match has one", () => {
  // d carries a real score, so the whole match reads court from scores:
  // a, b, c are "0-0" (deuce), d is 15-0 (ad).
  expect(list({ court: "ad" })).toEqual(["d"]);
  expect(list({ court: "deuce" })).toEqual(["a", "b", "c"]);
});

test("the cut in words — the trigger and the zero state", () => {
  const names = { you: "Stepanov", opponent: "Revelli" };
  const none = { remainder: null, savedOnly: false };
  expect(filmListName({ shared: EMPTY_MATCH_FILTERS, ...none }, names)).toBe(
    "All points",
  );
  expect(
    filmListName(
      {
        shared: { ...EMPTY_MATCH_FILTERS, server: "opponent" },
        remainder: null,
        savedOnly: true,
      },
      names,
    ),
  ).toBe("Saved only · Revelli serving");
  expect(
    filmListSentence(
      {
        shared: {
          ...EMPTY_MATCH_FILTERS,
          sets: [2],
          server: "opponent",
          resultOutcome: ["winner"],
        },
        remainder: {
          extras: { rallyMin: 9 },
          label: "Long rallies · 9+ shots",
        },
        savedOnly: true,
      },
      names,
    ),
  ).toBe(
    "Revelli serving · set 2 · winners · long rallies · 9+ shots, from Statistics · saved",
  );
  // A pure cut (every key a shared filter) lands no remainder, so the strip
  // reads its shared phrases alone and names nothing twice.
  const pure = landFilmCut(EMPTY_MATCH_FILTERS, {
    cut: { sets: [2], server: "opponent" },
    label: "Set 2 · Revelli serving",
  });
  expect(pure.remainder).toBeNull();
  expect(filmListSentence({ ...pure, savedOnly: false }, names)).toBe(
    "Revelli serving · set 2",
  );
});

test("the filters drawer's count is the list's own rule over the DRAFT", () => {
  const ctx = { youIsPlayer1: true, hands: { player1: null, player2: null } };
  const draft = (f: Partial<MatchFilters>) => ({
    ...EMPTY_MATCH_FILTERS,
    ...f,
  });
  // The draft alone, as the list would show it once applied.
  expect(filmDraftCount(points, draft({}), NO_FILM_LOCAL_FILTERS, ctx)).toBe(4);
  expect(
    filmDraftCount(
      points,
      draft({ server: "you" }),
      NO_FILM_LOCAL_FILTERS,
      ctx,
    ),
  ).toBe(list({ server: "you" }).length);
  // The Film-only layers still hold: the remainder's extras and the saved
  // toggle.
  const local: FilmLocalFilters = {
    remainder: { extras: { rallyMin: 5 }, label: "Long rallies" },
    savedOnly: false,
  };
  expect(filmDraftCount(points, draft({ sets: [1] }), local, ctx)).toBe(1);
  expect(
    filmDraftCount(points, draft({}), { ...local, savedOnly: true }, ctx),
  ).toBe(1);
});
