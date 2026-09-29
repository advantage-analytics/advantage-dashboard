import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  applyFilmCut,
  FILM_CUT_EXTRA_KEYS,
  filmCutExtras,
  filmCutFilters,
  hasFilmCut,
  matchesFilmCutExtras,
  sideCut,
  type FilmCutIntent,
  type LandedFilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import { appliedPhrases } from "@/components/dashboard/matches/match-detail/match-filters/applied-words";
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
  filtersEqual,
  MATCH_FILTER_KEYS,
  MATCH_FILTER_OPTIONS,
  matchFiltersQuery,
  parseMatchFilters,
  serializeMatchFilters,
  type MatchFilterAvailability,
  type MatchFilterContext,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";

import { pt } from "./fixtures/film-point";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The "watch this cut" intent (Advantage Intelligence UI T2, rewritten onto
 * the shared match filters in T7): the pure `landFilmCut` helper behind
 * `MatchReportActions.watchCut` and the film tab's once-only application of
 * it — the cut's `MatchFilters` half lands IN the shared filters, so the
 * filters drawer shows its pills pressed, and only its extras stay Film-only
 * — the Film list's three layers (shared filters ∧ the remainder's extras ∧
 * saved), and the legacy `?cut=`/`?serve=` links. Offline; the contexts
 * themselves are React and are exercised by the page, and `FiltersPanel`
 * renders for real through `createLoader()`.
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
/** Land `cut` over `shared` as the film tab holds it: remainder + `landed`. */
function held(
  shared: MatchFilters,
  cut: FilmCutIntent,
): { shared: MatchFilters; remainder: LandedFilmCut | null } {
  const next = landFilmCut(shared, cut);
  return {
    shared: next.shared,
    remainder: next.remainder
      ? { ...next.remainder, landed: next.shared }
      : null,
  };
}

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
  // The extras alone, null bounds dropped; none at all is null.
  expect(filmCutExtras(cut)).toEqual({ rallyMin: 1, ending: "ace" });
  expect(filmCutExtras({ rallyMin: 9, rallyMax: null })).toEqual({
    rallyMin: 9,
  });
  expect(filmCutExtras({ scoreType: ["breakpoint"], ending: null })).toBeNull();
});

test("the Film list is applyMatchFilters(shared) AND the remainder's extras AND saved", () => {
  const shared: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
  };
  const sharedPoints = applyMatchFilters(points, shared, ctx());
  expect(ids(sharedPoints)).toEqual(["a", "c"]);

  // A landed rally band: the extras AND the shared points, nothing else.
  const band = landFilmCut(shared, intent({ rallyMin: 5 }, "Long-ish"));
  expect(band.shared).toBe(shared);
  const local = { ...NO_FILM_LOCAL_FILTERS, remainder: band.remainder };
  expect(
    ids(
      filmListPoints(
        applyMatchFilters(points, EMPTY_MATCH_FILTERS, ctx()),
        local,
      ),
    ),
  ).toEqual(["b"]);
  expect(ids(filmListPoints(sharedPoints, local))).toEqual([]);

  // A landed pure cut is the shared filters alone — sides resolve through
  // the filter context, never in the cut.
  const won = landFilmCut(
    shared,
    intent({ resultOutcome: ["won"], resultPlayer: "you" }),
  );
  expect(won.remainder).toBeNull();
  expect(
    ids(
      filmListPoints(
        applyMatchFilters(points, won.shared, ctx()),
        NO_FILM_LOCAL_FILTERS,
      ),
    ),
  ).toEqual(["a"]);
  expect(
    ids(
      filmListPoints(
        applyMatchFilters(points, won.shared, ctx(false)),
        NO_FILM_LOCAL_FILTERS,
      ),
    ),
  ).toEqual(["c"]);

  // Saved is ANDed on top of both.
  expect(
    ids(filmListPoints(sharedPoints, { remainder: null, savedOnly: true })),
  ).toEqual(["c"]);

  // Nothing Film-only applied: the shared points themselves, same array.
  expect(filmListPoints(sharedPoints, NO_FILM_LOCAL_FILTERS)).toBe(
    sharedPoints,
  );
});

test("un-setting a landed cut's serveType widens the list to every point the extras admit", () => {
  const served = [
    pt({ id: "f5", firstShotType: "First Serve", rallyLength: 5 }),
    pt({ id: "s6", firstShotType: "Second Serve", rallyLength: 6 }),
    pt({ id: "f2", firstShotType: "First Serve", rallyLength: 2 }),
    pt({ id: "s8", firstShotType: "Second Serve", rallyLength: 8 }),
    pt({ id: "f11", firstShotType: "First Serve", rallyLength: 11 }),
  ];
  const landed = landFilmCut(
    EMPTY_MATCH_FILTERS,
    intent(
      { serveType: ["first"], rallyMin: 5, rallyMax: 8 },
      "Medium rallies",
    ),
  );
  // The serve type is a shared filter now; the band is the remainder.
  expect(landed.shared.serveType).toEqual(["first"]);
  expect(landed.remainder).toEqual({
    label: "Medium rallies",
    extras: { rallyMin: 5, rallyMax: 8 },
  });
  const local = { remainder: landed.remainder, savedOnly: false };
  const listOf = (shared: MatchFilters) =>
    ids(filmListPoints(applyMatchFilters(served, shared, ctx()), local));
  expect(listOf(landed.shared)).toEqual(["f5"]);

  // The viewer un-picks Serve › Type "First" in the drawer: nothing else
  // holds serveType, so the list is every point the extras admit.
  const widened = listOf({ ...landed.shared, serveType: [] });
  expect(widened).toEqual(
    ids(
      served.filter((p) => matchesFilmCutExtras(p, landed.remainder!.extras)),
    ),
  );
  expect(widened).toEqual(["f5", "s6", "s8"]);
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

test("landing a cut writes its MatchFilters half to the shared filters, key by key", () => {
  const shared: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    sets: [1],
    server: "you",
    scoreType: ["pressure"],
  };
  const before = serializeMatchFilters(shared);
  const cut = intent(
    { scoreType: ["breakpoint"], server: "opponent", rallyMin: 5 },
    "Break points saved · Reid",
  );
  const landed = landFilmCut(shared, cut);

  // Every key the cut sets is REPLACED by the cut's value (not intersected:
  // "pressure" is gone); every other key is untouched.
  expect(landed.shared).toEqual({
    ...shared,
    scoreType: ["breakpoint"],
    server: "opponent",
  });
  for (const key of MATCH_FILTER_KEYS) {
    if (cut.cut[key] !== undefined) {
      expect(landed.shared[key]).toEqual(cut.cut[key]);
    } else {
      expect(landed.shared[key]).toBe(shared[key]);
    }
  }
  // The caller's object is never mutated.
  expect(serializeMatchFilters(shared)).toBe(before);

  // The remainder holds ONLY the extras and the label — no MatchFilters key.
  expect(landed.remainder).toEqual({
    label: "Break points saved · Reid",
    extras: { rallyMin: 5 },
  });
  expect(Object.keys(landed.remainder!).sort()).toEqual(["extras", "label"]);
  for (const key of Object.keys(landed.remainder!.extras)) {
    expect(FILM_CUT_EXTRA_KEYS).toContain(key);
    expect(MATCH_FILTER_KEYS).not.toContain(key);
  }

  // So the `?f=` the provider mirrors now carries the cut's shared half.
  const query = new URLSearchParams(
    matchFiltersQuery("tab=film", landed.shared),
  );
  const f = query.get("f");
  expect(f).toBe(serializeMatchFilters(landed.shared));
  expect(f).not.toBe(before);
  const parsed = parseMatchFilters(f);
  expect(filtersEqual(parsed, landed.shared)).toBe(true);
  expect(parsed.scoreType).toEqual(["breakpoint"]);
  expect(parsed.server).toBe("opponent");
  expect(parsed.sets).toEqual([1]);
  expect(query.get("tab")).toBe("film");

  // A cut with no extras (every key a pill) lands no remainder.
  expect(
    landFilmCut(shared, intent({ resultOutcome: ["won"], resultPlayer: "you" }))
      .remainder,
  ).toBeNull();
  // An empty cut (a whole-match row) changes nothing: the same object back.
  const empty = landFilmCut(shared, intent({}));
  expect(empty.shared).toBe(shared);
  expect(empty.remainder).toBeNull();
});

/* ── The drawer shows a landed cut's pills pressed ──────────────────────── */

const panelLoader = createLoader();
const { FiltersPanel } = panelLoader.load(
  "src/components/dashboard/matches/match-detail/match-filters/filters-panel.tsx",
) as { FiltersPanel: React.ComponentType<Record<string, unknown>> };

/** Every catalog option available, and two sets. */
function fullAvailability(): MatchFilterAvailability {
  const out: Record<string, Set<unknown>> = {};
  for (const key of MATCH_FILTER_KEYS) {
    out[key] = new Set(
      key === "sets" ? [1, 2] : MATCH_FILTER_OPTIONS[key].map((o) => o.value),
    );
  }
  return out as unknown as MatchFilterAvailability;
}

/** Every pill as "Section › Group › Label", with whether it is pressed. */
function pills(html: string): { name: string; pressed: boolean }[] {
  const out: { name: string; pressed: boolean }[] = [];
  for (const section of html.split(/(?=data-section=")/).slice(1)) {
    const id = /^data-section="([a-z]+)"/.exec(section)![1];
    for (const group of section.split(/(?=role="group")/).slice(1)) {
      const label = /<span[^>]*>([^<]*)<\/span>/.exec(group)![1];
      for (const m of group.matchAll(
        /<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)</g,
      )) {
        out.push({
          name: `${id} › ${label} › ${m[2]}`,
          pressed: m[1] === "true",
        });
      }
    }
  }
  return out;
}

test("a landed '1st serve points won' cell presses exactly its pills in the drawer", () => {
  const filters = landFilmCut(EMPTY_MATCH_FILTERS, {
    cut: sideCut({ serveType: ["first"] }, "you", "server", true),
    label: "1st serve points won · Quan",
  }).shared;
  const html = renderToStaticMarkup(
    React.createElement(FiltersPanel, {
      filters,
      availability: fullAvailability(),
      youName: "Rudy Quan",
      oppName: "Federico Gomez",
      onApply: () => {},
      onClose: () => {},
      countFor: () => 9,
      total: 114,
    }),
  );
  const all = pills(html);
  // Sanity: the parse sees the whole catalog, not a fragment of it.
  expect(all.length).toBeGreaterThan(30);
  // Return › Player is the inverted `server` pill, so "you served" also
  // presses the opponent as the returner.
  expect(all.filter((p) => p.pressed).map((p) => p.name)).toEqual([
    "serve › Player › Rudy Quan",
    "serve › Type › First serve",
    "return › Player › Federico Gomez",
    "result › Player › Rudy Quan",
    "result › Outcome › Won",
  ]);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(5);
});

test("the strip states the cut in words — the shared filters, then the statistic's extras, then saved", () => {
  const names = { you: "Reid", opponent: "Alvarez" };
  const before: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
  };
  const aces = held(
    before,
    intent({ server: "you", ending: "ace" }, "Aces · Reid"),
  );
  // The cut's shared half reads as shared phrases; the label names only the
  // extras still in force.
  expect(filmListSentence({ ...aces, savedOnly: false }, names)).toBe(
    "Reid serving · break point · aces · Reid, from Statistics",
  );
  expect(filmListSentence({ ...aces, savedOnly: true }, names)).toBe(
    "Reid serving · break point · aces · Reid, from Statistics · saved",
  );
  // Exactly where the landing put the viewer: the way back out.
  expect(filmStripAction({ ...aces, savedOnly: false })).toBe(
    "Back to all points",
  );
  // Anything changed since — a shared group, or Saved only — is a filter.
  expect(
    filmStripAction({
      ...aces,
      shared: { ...aces.shared, sets: [2] },
      savedOnly: false,
    }),
  ).toBe("Clear filter");
  expect(filmStripAction({ ...aces, savedOnly: true })).toBe("Clear filter");
  // An equal set by value still counts as untouched.
  expect(
    filmStripAction({
      ...aces,
      shared: parseMatchFilters(serializeMatchFilters(aces.shared)),
      savedOnly: false,
    }),
  ).toBe("Back to all points");

  // A pure cut lands no remainder: the strip reads the shared phrases alone
  // (nothing named twice), and it is an ordinary filter to clear.
  const pure = held(
    EMPTY_MATCH_FILTERS,
    intent(
      sideCut({ serveType: ["first"] }, "you", "server", true),
      "1st serve points won · Reid",
    ),
  );
  expect(pure.remainder).toBeNull();
  const pureSentence = filmListSentence({ ...pure, savedOnly: false }, names);
  expect(pureSentence).not.toContain("from Statistics");
  expect(pureSentence.toLowerCase()).toBe(
    appliedPhrases(pure.shared, names).join(" · ").toLowerCase(),
  );
  expect(filmStripAction({ ...pure, savedOnly: false })).toBe("Clear filter");

  // Extras alone: the label leads.
  const band = held(
    EMPTY_MATCH_FILTERS,
    intent({ rallyMin: 1, rallyMax: 4 }, "Short rallies · 1–4 shots"),
  );
  expect(filmListSentence({ ...band, savedOnly: false }, names)).toBe(
    "Short rallies · 1–4 shots, from Statistics",
  );
  expect(filmStripAction({ ...band, savedOnly: false })).toBe(
    "Back to all points",
  );

  // Saved alone is a filter too.
  expect(
    filmListSentence(
      { shared: EMPTY_MATCH_FILTERS, remainder: null, savedOnly: true },
      names,
    ),
  ).toBe("Saved");
  expect(
    filmStripAction({
      shared: EMPTY_MATCH_FILTERS,
      remainder: null,
      savedOnly: true,
    }),
  ).toBe("Clear filter");
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
  const none = { remainder: null, savedOnly: false };
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
      { shared: EMPTY_MATCH_FILTERS, remainder: null, savedOnly: true },
      names,
    ),
  ).toBe("Saved only");
  // A landed cut's remainder, or any group the menu cannot make, is
  // "Filtered".
  expect(
    filmListName(
      {
        shared: EMPTY_MATCH_FILTERS,
        remainder: { label: "Long rallies", extras: { rallyMin: 9 } },
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
