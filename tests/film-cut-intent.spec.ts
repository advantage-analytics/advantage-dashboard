import { expect, test } from "@playwright/test";

import {
  applyFilmCut,
  consumeFilmCut,
  filmCutFilters,
  hasFilmCut,
  type FilmCutIntent,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  filmListName,
  filmListSentence,
  filmStripAction,
  filmListPoints,
  landFilmCut,
  NO_FILM_LOCAL_FILTERS,
  parseLegacyFilmQuery,
  quickShow,
  stripLegacyFilmQuery,
  withLegacyFilters,
  withQuickShow,
} from "@/components/dashboard/matches/match-detail/film/film-list-filters";
import {
  applyMatchFilters,
  EMPTY_MATCH_FILTERS,
  matchFiltersQuery,
  serializeMatchFilters,
  type MatchFilterContext,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

import { pt } from "./fixtures/film-point";

/**
 * The "watch this cut" intent (Advantage Intelligence UI T2, rewritten onto
 * the shared match filters in T7): the pure consume/land helpers behind
 * `MatchReportActions.watchCut` and the film tab's once-only application of
 * it, the Film list's three layers (shared filters ∧ cut ∧ saved), and the
 * legacy `?cut=`/`?serve=` links. Offline; the contexts themselves are React
 * and are exercised by the page.
 */

const ctx = (youIsPlayer1 = true): MatchFilterContext => ({
  youIsPlayer1,
  hands: { player1: null, player2: null },
});
const ids = (list: { id: string }[]) => list.map((p) => p.id);
const intent = (cut: FilmCutIntent["cut"], label = "Cut"): FilmCutIntent => ({
  cut,
  label,
});

const points = [
  pt({
    id: "a",
    isBreakPoint: true,
    wonByPlayer1: true,
    serverIsPlayer1: true,
  }),
  pt({ id: "b", isBreakPoint: false, wonByPlayer1: true, rallyLength: 11 }),
  pt({
    id: "c",
    isBreakPoint: true,
    wonByPlayer1: false,
    serverIsPlayer1: false,
    saved: true,
  }),
  pt({ id: "d", setNumber: 2, rallyLength: 2, serverIsPlayer1: false }),
];

test("consumeFilmCut applies once: it hands back the intent and nothing pending", () => {
  const pending = intent({ rallyMin: 5 }, "Medium rallies");
  const taken = consumeFilmCut(pending);
  expect(taken).not.toBeNull();
  expect(taken?.intent).toBe(pending);
  expect(taken?.pending).toBeNull();
  // Consuming what is left is a no-op — the intent was honoured exactly once.
  expect(consumeFilmCut(taken?.pending ?? null)).toBeNull();
  expect(consumeFilmCut(null)).toBeNull();
});

test("a cut's MatchFilters half is laid over the empty filters", () => {
  const cut = {
    scoreType: ["breakpoint"] as const,
    server: "opponent" as const,
    rallyMin: 1,
    ending: "ace" as const,
  };
  expect(filmCutFilters(cut)).toEqual({
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
    server: "opponent",
  });
  // The extras never leak into the MatchFilters half.
  expect(Object.keys(filmCutFilters(cut))).not.toContain("rallyMin");
  expect(Object.keys(filmCutFilters(cut))).not.toContain("ending");
  expect(hasFilmCut(cut)).toBe(true);
  expect(hasFilmCut({})).toBe(false);
  expect(hasFilmCut({ rallyMax: null, ending: null })).toBe(false);
  expect(hasFilmCut(null)).toBe(false);
});

test("the Film list is applyMatchFilters(shared) AND the cut", () => {
  const shared: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
  };
  const sharedPoints = applyMatchFilters(points, shared, ctx());
  expect(ids(sharedPoints)).toEqual(["a", "c"]);

  // The cut is the viewer's won points; ANDed, not ORed and not replacing.
  const cut = { resultOutcome: ["won"] as const, resultPlayer: "you" as const };
  const local = { ...NO_FILM_LOCAL_FILTERS, cut: intent(cut) };
  const listed = filmListPoints(points, sharedPoints, local, ctx());
  const cutAlone = new Set(
    ids(applyMatchFilters(points, filmCutFilters(cut), ctx())),
  );
  expect(ids(listed)).toEqual(
    ids(sharedPoints).filter((id) => cutAlone.has(id)),
  );
  expect(ids(listed)).toEqual(["a"]);

  // Sides resolve through the filter context, never in the cut.
  const theirs = applyMatchFilters(points, shared, ctx(false));
  expect(ids(filmListPoints(points, theirs, local, ctx(false)))).toEqual(["c"]);

  // Saved is ANDed on top of both.
  expect(
    ids(
      filmListPoints(
        points,
        sharedPoints,
        { cut: null, savedOnly: true },
        ctx(),
      ),
    ),
  ).toEqual(["c"]);

  // Nothing Film-only applied: the shared points themselves, same array.
  expect(
    filmListPoints(points, sharedPoints, NO_FILM_LOCAL_FILTERS, ctx()),
  ).toBe(sharedPoints);
});

test("a rally band admits only recorded rallies inside it", () => {
  const listed = applyFilmCut(
    points,
    points,
    { rallyMin: 1, rallyMax: 4 },
    ctx(),
  );
  // b is 11 shots; a, c keep the fixture's 4; d is 2.
  expect(ids(listed)).toEqual(["a", "c", "d"]);
  const long = applyFilmCut(
    points,
    points,
    { rallyMin: 9, rallyMax: null },
    ctx(),
  );
  expect(ids(long)).toEqual(["b"]);
  const unrecorded = [pt({ id: "z", rallyLength: 0 })];
  expect(
    applyFilmCut(unrecorded, unrecorded, { rallyMin: 1, rallyMax: 4 }, ctx()),
  ).toEqual([]);
});

test("landing a cut never writes to the shared filters", () => {
  const shared: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    sets: [1],
    server: "you",
  };
  const before = serializeMatchFilters(shared);
  const cut = intent(
    { scoreType: ["breakpoint"], rallyMin: 5 },
    "Break points saved · Reid",
  );
  const landed = landFilmCut(
    { shared, local: { cut: null, savedOnly: true } },
    cut,
  );
  // The shared filters come back as the SAME object, unchanged.
  expect(landed.shared).toBe(shared);
  expect(serializeMatchFilters(landed.shared)).toBe(before);
  // The cut lands in Film's own layer, and the saved toggle goes off.
  expect(landed.local).toEqual({ cut, savedOnly: false });
  // So the `?f=` the provider mirrors carries none of it.
  const query = new URLSearchParams(
    matchFiltersQuery("tab=film", landed.shared),
  );
  expect(query.get("f")).toBe(before);
  // An empty cut (a whole-match row) lands as no cut at all.
  expect(
    landFilmCut({ shared, local: NO_FILM_LOCAL_FILTERS }, intent({})).local,
  ).toEqual(NO_FILM_LOCAL_FILTERS);
});

test("the strip states the cut in words — the shared filters, then the statistic, then saved", () => {
  const names = { you: "Reid", opponent: "Alvarez" };
  const f = {
    shared: {
      ...EMPTY_MATCH_FILTERS,
      scoreType: ["breakpoint"] as const,
      server: "you" as const,
    },
    cut: intent({ resultOutcome: ["winner"], ending: "ace" }, "Aces · Reid"),
    savedOnly: true,
  };
  expect(filmListSentence(f, names)).toBe(
    "Reid serving · break point · aces · Reid, from Statistics · saved",
  );
  expect(filmStripAction(f)).toBe("Clear filter");

  // A statistic's cut on its own: its label leads, and the way out is
  // "Back to all points".
  const onlyCut = { shared: EMPTY_MATCH_FILTERS, cut: f.cut, savedOnly: false };
  expect(filmListSentence(onlyCut, names)).toBe("Aces · Reid, from Statistics");
  expect(filmStripAction(onlyCut)).toBe("Back to all points");

  // Saved alone is a filter too.
  expect(
    filmListSentence(
      { shared: EMPTY_MATCH_FILTERS, cut: null, savedOnly: true },
      names,
    ),
  ).toBe("Saved");
});

test("the quick menu writes the shared filters; Saved only stays Film-only", () => {
  const shared: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["pressure"],
  };
  expect(withQuickShow(shared, "break").scoreType).toEqual(["breakpoint"]);
  const broken = withQuickShow(shared, "break");
  expect(withQuickShow(broken, "all").scoreType).toEqual([]);
  expect(withQuickShow(broken, "saved").scoreType).toEqual([]);
  // "All points" with no Breakpoint applied leaves the filters as they are.
  expect(withQuickShow(shared, "all")).toBe(shared);

  expect(quickShow({ shared: broken, savedOnly: false })).toBe("break");
  expect(quickShow({ shared: broken, savedOnly: true })).toBe("saved");

  const names = { you: "Reid", opponent: "Alvarez" };
  const none = { cut: null, savedOnly: false };
  expect(filmListName({ shared: EMPTY_MATCH_FILTERS, ...none }, names)).toBe(
    "All points",
  );
  expect(
    filmListName(
      {
        shared: {
          ...EMPTY_MATCH_FILTERS,
          scoreType: ["breakpoint"],
          server: "opponent",
        },
        ...none,
      },
      names,
    ),
  ).toBe("Break points · Alvarez serving");
  expect(
    filmListName(
      { shared: EMPTY_MATCH_FILTERS, cut: null, savedOnly: true },
      names,
    ),
  ).toBe("Saved only");
  // A cut, or any group the menu cannot make, is "Filtered".
  expect(
    filmListName(
      {
        shared: EMPTY_MATCH_FILTERS,
        cut: intent({ rallyMin: 9 }),
        savedOnly: false,
      },
      names,
    ),
  ).toBe("Filtered");
  expect(
    filmListName(
      { shared: { ...EMPTY_MATCH_FILTERS, sets: [2] }, ...none },
      names,
    ),
  ).toBe("Filtered");
});

test("legacy ?cut=break&serve=you parse into the new model", () => {
  const legacy = parseLegacyFilmQuery(
    new URLSearchParams("tab=film&cut=break&serve=you"),
  );
  expect(legacy).toEqual({
    shared: { scoreType: ["breakpoint"], server: "you" },
    savedOnly: false,
  });
  expect(withLegacyFilters(EMPTY_MATCH_FILTERS, legacy!)).toEqual({
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
    server: "you",
  });

  // serve=opp is the opponent serving; cut=saved is the Film-only toggle.
  expect(
    parseLegacyFilmQuery(new URLSearchParams("cut=saved&serve=opp")),
  ).toEqual({
    shared: { server: "opponent" },
    savedOnly: true,
  });
  // Nothing legacy (or nothing valid) is null: new links never take this path.
  expect(
    parseLegacyFilmQuery(new URLSearchParams("tab=film&f=st.b")),
  ).toBeNull();
  expect(parseLegacyFilmQuery(new URLSearchParams("cut=nope"))).toBeNull();
  expect(parseLegacyFilmQuery(null)).toBeNull();

  // Folding is additive: Breakpoint joins an existing Score type once.
  const folded = withLegacyFilters(
    { ...EMPTY_MATCH_FILTERS, scoreType: ["pressure"] },
    { shared: { scoreType: ["breakpoint"] }, savedOnly: false },
  );
  expect(folded.scoreType).toEqual(["pressure", "breakpoint"]);

  // The params are stripped once folded — `?f=` owns them now.
  expect(stripLegacyFilmQuery("tab=film&cut=break&serve=you&f=sv.y")).toBe(
    "tab=film&f=sv.y",
  );
  // The Visualizations view's own `?cut=` is not a legacy Film value.
  expect(stripLegacyFilmQuery("tab=film&cut=returnPlacement&serve=you")).toBe(
    "tab=film&cut=returnPlacement",
  );
});
