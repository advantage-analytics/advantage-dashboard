import { expect, test } from "@playwright/test";

import {
  filmListActive,
  filmListName,
  filmListPoints,
  filmListSentence,
  filmStripAction,
  hasPointSet,
  pointSetPhrase,
} from "@/components/dashboard/matches/match-detail/film/film-list-filters";
import {
  sequenceStep,
  stopForPointNumber,
} from "@/components/dashboard/matches/match-detail/film/film-sequence";
import type { FilmStop } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import {
  EMPTY_MATCH_FILTERS,
  serializeMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  filmSharePresetOf,
  withFilmSharePreset,
} from "@/lib/data/match-share-format";
import {
  matchFilmPointsHref,
  MAX_POINT_SET,
  parsePointSet,
  pointSetQuery,
  serializePointSet,
} from "@/lib/match-video/point-set";
import { pt } from "./fixtures/film-point";

/**
 * The Video tab's point set (`?pn=`), the sequence it plays, and the two
 * links that carry it — an answer's "Show me" and a shared link's preset.
 * Pure: the URL contract, the list's fourth layer, the playback walk, the
 * drawer's href reader and the share popover's helpers, none of them
 * needing a browser.
 */

const MATCH = "3f1c2a9e-6b7d-4c1a-9e55-0a1b2c3d4e5f";

test.describe("the URL contract", () => {
  test("parses positive integers, folds duplicates, sorts, caps, and reads nothing as null", () => {
    expect(parsePointSet("12, 7,12,x,0,-3,7")).toEqual([7, 12]);
    expect(parsePointSet("")).toBeNull();
    expect(parsePointSet(null)).toBeNull();
    expect(parsePointSet("a,b")).toBeNull();
    const many = Array.from(
      { length: MAX_POINT_SET + 50 },
      (_, i) => i + 1,
    ).join(",");
    expect(parsePointSet(many)).toHaveLength(MAX_POINT_SET);
  });

  test("serializes the same way back", () => {
    expect(serializePointSet([12, 7, 7, 0, 2.5])).toBe("7,12");
    expect(serializePointSet([])).toBe("");
    expect(parsePointSet(serializePointSet([40, 3, 15]))).toEqual([3, 15, 40]);
  });

  test("sets and removes `pn` and carries every other parameter through", () => {
    expect(pointSetQuery("tab=film&f=sp.y", [3, 7])).toBe(
      "tab=film&f=sp.y&pn=3%2C7",
    );
    expect(pointSetQuery("tab=film&pn=3%2C7&f=sp.y", null)).toBe(
      "tab=film&f=sp.y",
    );
    expect(pointSetQuery("tab=film&pn=3", [])).toBe("tab=film");
  });

  test("the film link: tab, then the filters, then the points", () => {
    expect(matchFilmPointsHref(MATCH, [7, 3])).toBe(
      `/dashboard/matches/${MATCH}?tab=film&pn=3%2C7`,
    );
    expect(matchFilmPointsHref(MATCH, [7], "sp.y")).toBe(
      `/dashboard/matches/${MATCH}?tab=film&f=sp.y&pn=7`,
    );
    expect(matchFilmPointsHref(MATCH, [], null)).toBe(
      `/dashboard/matches/${MATCH}?tab=film`,
    );
  });
});

test.describe("the list's fourth layer", () => {
  const points = [
    pt({ id: "a", pointNumber: 3, saved: true }),
    pt({ id: "b", pointNumber: 7 }),
    pt({ id: "c", pointNumber: 12, saved: true }),
  ];

  test("narrows to the numbers named, ANDed with the saved toggle; an empty set is no layer", () => {
    expect(
      filmListPoints(points, {
        remainder: null,
        savedOnly: false,
        pointSet: [7, 12, 99],
      }).map((p) => p.id),
    ).toEqual(["b", "c"]);
    expect(
      filmListPoints(points, {
        remainder: null,
        savedOnly: true,
        pointSet: [7, 12],
      }).map((p) => p.id),
    ).toEqual(["c"]);
    expect(
      filmListPoints(points, {
        remainder: null,
        savedOnly: false,
        pointSet: [],
      }),
    ).toBe(points);
    expect(filmListPoints(points, { remainder: null, savedOnly: false })).toBe(
      points,
    );
    expect(hasPointSet({ pointSet: null })).toBe(false);
    expect(hasPointSet({ pointSet: [1] })).toBe(true);
  });

  test("is active, named, and worded as 'N chosen points' after the cut it narrows", () => {
    const names = { you: "G. Revelli", opponent: "M. Reid" };
    const base = {
      shared: EMPTY_MATCH_FILTERS,
      remainder: null,
      savedOnly: false,
    };
    expect(filmListActive(base)).toBe(false);
    expect(filmListActive({ ...base, pointSet: [3] })).toBe(true);
    expect(filmListName({ ...base, pointSet: [3] }, names)).toBe("Filtered");
    expect(pointSetPhrase(1)).toBe("1 chosen point");
    expect(filmListSentence({ ...base, pointSet: [3, 7] }, names)).toBe(
      "2 chosen points",
    );
    expect(
      filmListSentence(
        {
          ...base,
          shared: { ...EMPTY_MATCH_FILTERS, serveType: ["second"] },
          pointSet: [3, 7],
          savedOnly: true,
        },
        names,
      ),
    ).toBe("Second serve · 2 chosen points · Saved");
  });

  test("the strip's action is 'Clear filter' while a set is in force, even over a landed cut", () => {
    const landed = {
      ...EMPTY_MATCH_FILTERS,
      scoreType: ["breakpoint" as const],
    };
    const remainder = {
      label: "Break points",
      extras: { serveIn: true as const },
      landed,
    };
    expect(
      filmStripAction({ shared: landed, remainder, savedOnly: false }),
    ).toBe("Back to all points");
    expect(
      filmStripAction({
        shared: landed,
        remainder,
        savedOnly: false,
        pointSet: [3],
      }),
    ).toBe("Clear filter");
  });
});

test.describe("the sequence", () => {
  const stop = (
    id: string,
    pointNumber: number,
    start: number,
    end: number,
  ): FilmStop<{
    id: string;
    setNumber: number | null;
    pointNumber: number;
  }> => ({
    point: { id, setNumber: 1, pointNumber },
    start,
    serve: start + 1.5,
    end,
  });
  const stops = [
    stop("a", 3, 10, 20),
    stop("b", 7, 30, 40),
    stop("c", 12, 40, 50),
  ];

  test("jumps to the next window from the lead-in or the dead time, plays inside one, ends after the last", () => {
    expect(sequenceStep(stops, 2)).toEqual({ kind: "jump", stop: stops[0] });
    expect(sequenceStep(stops, 15)).toEqual({ kind: "playing" });
    expect(sequenceStep(stops, 25)).toEqual({ kind: "jump", stop: stops[1] });
    // Two windows that touch: never 'between' at the boundary.
    expect(sequenceStep(stops, 40)).toEqual({ kind: "playing" });
    expect(sequenceStep(stops, 55)).toEqual({ kind: "end" });
    expect(sequenceStep([], 0)).toEqual({ kind: "end" });
    // A seek that landed a hair before its window counts as inside it.
    expect(sequenceStep(stops, 29.95)).toEqual({ kind: "playing" });
  });

  test("finds a stop by its point's number", () => {
    expect(stopForPointNumber(stops, 7)).toBe(stops[1]);
    expect(stopForPointNumber(stops, 8)).toBeNull();
  });
});

test.describe("the share popover's preset", () => {
  test("is read off the Video tab's query only, and only while a cut is applied", () => {
    expect(filmSharePresetOf("?tab=film&f=sp.y&pn=3%2C7")).toEqual({
      filters: "sp.y",
      points: "3,7",
    });
    expect(filmSharePresetOf("tab=film&pn=3")).toEqual({
      filters: null,
      points: "3",
    });
    expect(filmSharePresetOf("?tab=film")).toBeNull();
    expect(filmSharePresetOf("?f=sp.y")).toBeNull();
    expect(filmSharePresetOf("?tab=shots&f=sp.y")).toBeNull();
  });

  test("goes onto the public link as the share page reads it", () => {
    expect(
      withFilmSharePreset("https://app.example/m/abc123", {
        filters: "sp.y",
        points: "3,7",
      }),
    ).toBe("https://app.example/m/abc123?tab=film&f=sp.y&pn=3%2C7");
    expect(
      withFilmSharePreset("https://app.example/m/abc123?x=1#top", {
        filters: null,
        points: "3",
      }),
    ).toBe("https://app.example/m/abc123?x=1&tab=film&pn=3#top");
  });
});
