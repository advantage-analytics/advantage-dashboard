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
import { DERIVED_H2H_GROUPS } from "@/components/dashboard/matches/match-detail/head-to-head-card";
import { appliedPhrases } from "@/components/dashboard/matches/match-detail/match-filters/applied-words";
import { RALLY_BAND_CUTS } from "@/components/dashboard/matches/match-detail/rally-length-card";
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
  optionAvailability,
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
  pt({
    id: "b",
    isBreakPoint: false,
    wonByPlayer1: true,
    rallyLength: 11,
    resultType: "Backhand Unforced Error",
  }),
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
    ending: "unforced-error" as const,
  };
  expect(filmCutFilters(cut)).toEqual({
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
    server: "opponent",
  });
  // The extras never leak into the MatchFilters half.
  expect(Object.keys(filmCutFilters(cut))).not.toContain("ending");
  expect(hasFilmCut(cut)).toBe(true);
  expect(hasFilmCut({})).toBe(false);
  expect(hasFilmCut({ ending: null })).toBe(false);
  expect(hasFilmCut(null)).toBe(false);
  // The extras alone, a null ending dropped; none at all is null.
  expect(filmCutExtras(cut)).toEqual({ ending: "unforced-error" });
  expect(filmCutExtras({ ending: "winner" })).toEqual({ ending: "winner" });
  expect(filmCutExtras({ scoreType: ["breakpoint"], ending: null })).toBeNull();
  // The ending and the landed-serve bound.
  expect(FILM_CUT_EXTRA_KEYS).toEqual(["ending", "serveIn"]);
});

test("the Film list is applyMatchFilters(shared) AND the remainder's extras AND saved", () => {
  const shared: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
  };
  const sharedPoints = applyMatchFilters(points, shared, ctx());
  expect(ids(sharedPoints)).toEqual(["a", "c"]);

  // A landed Film-only ending: the extras AND the shared points, nothing
  // else.
  const band = landFilmCut(
    shared,
    intent({ ending: "unforced-error" }, "Unforced errors"),
  );
  // The landing resets the shared filters: Breakpoint is gone.
  expect(filtersEqual(band.shared, EMPTY_MATCH_FILTERS)).toBe(true);
  const local = { ...NO_FILM_LOCAL_FILTERS, remainder: band.remainder };
  expect(
    ids(
      filmListPoints(
        applyMatchFilters(points, EMPTY_MATCH_FILTERS, ctx()),
        local,
      ),
    ),
  ).toEqual(["b"]);
  // Breakpoint picked again afterwards ANDs with the extras, as any pick.
  expect(ids(filmListPoints(sharedPoints, local))).toEqual([]);

  // A landed pure cut is the shared filters alone — sides resolve through
  // the filter context, never in the cut (Won is read from the viewer's
  // side, so a won cell carries no Hit by).
  const won = landFilmCut(
    EMPTY_MATCH_FILTERS,
    intent({ scoreType: ["breakpoint"], resultOutcome: ["won"] }),
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
  const UE = "Forehand Unforced Error";
  const served = [
    pt({ id: "f5", firstShotType: "First Serve", resultType: UE }),
    pt({ id: "s6", firstShotType: "Second Serve", resultType: UE }),
    pt({ id: "f2", firstShotType: "First Serve" }),
    pt({ id: "s8", firstShotType: "Second Serve", resultType: UE }),
    pt({ id: "f11", firstShotType: "First Serve", resultType: "Ace" }),
  ];
  const landed = landFilmCut(
    EMPTY_MATCH_FILTERS,
    intent(
      { serveType: ["first"], ending: "unforced-error" },
      "Unforced errors",
    ),
  );
  // The serve type is a shared filter now; the ending is the remainder.
  expect(landed.shared.serveType).toEqual(["first"]);
  expect(landed.remainder).toEqual({
    label: "Unforced errors",
    extras: { ending: "unforced-error" },
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
  const rallies = [
    pt({ id: "four", rallyLength: 4 }),
    pt({ id: "eleven", rallyLength: 11 }),
    pt({ id: "none", rallyLength: 0 }),
  ];
  const band = (key: keyof typeof RALLY_BAND_CUTS) =>
    ids(applyFilmCut(rallies, rallies, RALLY_BAND_CUTS[key], ctx()));
  // 4 shots is short; 11 is long; 0 ("no shot count recorded") is in none.
  expect(band("short")).toEqual(["four"]);
  expect(band("medium")).toEqual([]);
  expect(band("long")).toEqual(["eleven"]);
  // The band is a shared filter, so the cut lands no Film-only remainder.
  for (const cut of Object.values(RALLY_BAND_CUTS)) {
    expect(filmCutExtras(cut)).toBeNull();
  }
});

test("landing a cut resets the shared filters to the cut's MatchFilters half", () => {
  const shared: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    sets: [1],
    server: "you",
    scoreType: ["pressure"],
  };
  const before = serializeMatchFilters(shared);
  const cut = intent(
    { scoreType: ["breakpoint"], server: "opponent", ending: "unforced-error" },
    "Break points saved · Reid",
  );
  const landed = landFilmCut(shared, cut);

  // The cut's keys over the EMPTY filters: nothing applied before survives —
  // not a key the cut also sets ("pressure" is gone), and not one it leaves
  // alone (Set 1 is gone too).
  expect(landed.shared).toEqual({
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
    server: "opponent",
  });
  for (const key of MATCH_FILTER_KEYS) {
    expect(landed.shared[key]).toEqual(
      cut.cut[key] !== undefined ? cut.cut[key] : EMPTY_MATCH_FILTERS[key],
    );
  }
  // The caller's object is never mutated.
  expect(serializeMatchFilters(shared)).toBe(before);

  // The remainder holds ONLY the extras and the label — no MatchFilters key.
  expect(landed.remainder).toEqual({
    label: "Break points saved · Reid",
    extras: { ending: "unforced-error" },
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
  expect(parsed.sets).toEqual([]);
  expect(query.get("tab")).toBe("film");

  // A cut with no extras (every key a pill) lands no remainder.
  expect(
    landFilmCut(shared, intent({ resultOutcome: ["won"] })).remainder,
  ).toBeNull();
  // An empty cut (a whole-match row) is the whole match: every filter off.
  const empty = landFilmCut(shared, intent({}));
  expect(filtersEqual(empty.shared, EMPTY_MATCH_FILTERS)).toBe(true);
  expect(empty.remainder).toBeNull();
  // Landing what is already applied hands the same object back.
  expect(landFilmCut(landed.shared, cut).shared).toBe(landed.shared);
});

test("a second statistic's cut replaces the first instead of stacking on it", () => {
  const firstServe = [
    pt({ id: "f-won", firstShotType: "First Serve" }),
    pt({ id: "f-lost", firstShotType: "First Serve", wonByPlayer1: false }),
    pt({ id: "s-long", firstShotType: "Second Serve", rallyLength: 11 }),
    pt({ id: "s-short", firstShotType: "Second Serve", rallyLength: 2 }),
  ];
  const listOf = (f: { shared: MatchFilters; remainder: unknown }) =>
    ids(
      filmListPoints(applyMatchFilters(firstServe, f.shared, ctx()), {
        remainder: f.remainder as LandedFilmCut | null,
        savedOnly: false,
      }),
    );

  // Head to head: "1st serve points won" for you.
  const first = held(
    EMPTY_MATCH_FILTERS,
    intent(sideCut({ serveType: ["first"] }, "you", "server", true), "1st"),
  );
  expect(listOf(first)).toEqual(["f-won"]);

  // Back to Statistics, then "Long rallies": the list is the card's own
  // count over the whole match, with none of the first click's groups left.
  const second = held(first.shared, intent(RALLY_BAND_CUTS.long, "Long"));
  expect(second.shared.serveType).toEqual([]);
  expect(second.shared.server).toBeNull();
  expect(second.shared.resultOutcome).toEqual([]);
  expect(listOf(second)).toEqual(
    ids(applyFilmCut(firstServe, firstServe, RALLY_BAND_CUTS.long, ctx())),
  );
  expect(listOf(second)).toEqual(["s-long"]);
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
  // presses the opponent as the returner. Won is read from the viewer's
  // side, so no Hit by pill is pressed.
  expect(all.filter((p) => p.pressed).map((p) => p.name)).toEqual([
    "serve › Player › Rudy Quan",
    "serve › Type › First serve",
    "return › Player › Federico Gomez",
    "result › Outcome › Won",
  ]);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);
});

test("a landed derived 'Aces' cell presses exactly its pills in the drawer", () => {
  // Advantage Intelligence: the derived Aces row is Serve › Result "Ace" by
  // the server — a pure cut, so it lands wholly as pills and leaves nothing
  // Film-only to name.
  const derivedAces = DERIVED_H2H_GROUPS.flatMap((g) => g.configs).find(
    (row) => row.label === "Aces",
  )!;
  const DERIVED_CTX: MatchFilterContext = { ...ctx(), isDerived: true };
  const landing = landFilmCut(
    EMPTY_MATCH_FILTERS,
    intent(sideCut(derivedAces.cut!, "you", "server"), "Aces · Alex"),
  );
  expect(landing.remainder).toBeNull();
  // One unreturned serve by player 1 ("you"): the derivation's label for it.
  const fixture = [
    pt({
      id: "sw",
      resultType: "Service Winner",
      eventType: "Service Winner",
      rallyLength: 1,
      serverIsPlayer1: true,
      wonByPlayer1: true,
    }),
  ];
  const html = renderToStaticMarkup(
    React.createElement(FiltersPanel, {
      filters: landing.shared,
      availability: optionAvailability(fixture, DERIVED_CTX),
      youName: "Alex Reid",
      oppName: "Sam Alvarez",
      onApply: () => {},
      onClose: () => {},
      countFor: () => 1,
      total: 1,
      filmCut: null,
    }),
  );
  // The landing sets exactly two shared filters: Serve › Player and Serve ›
  // Result "Ace".
  expect(
    MATCH_FILTER_KEYS.filter(
      (key) =>
        !filtersEqual(
          { ...EMPTY_MATCH_FILTERS, [key]: landing.shared[key] },
          EMPTY_MATCH_FILTERS,
        ),
    ),
  ).toEqual(["server", "serveResult"]);
  // Return › Player is the same `server` filter drawn inverted (see the
  // 1st-serve case above), so "you served" also presses the opponent as the
  // returner — it is not a third filter.
  expect(
    pills(html)
      .filter((p) => p.pressed)
      .map((p) => p.name),
  ).toEqual([
    "serve › Player › Alex Reid",
    "serve › Result › Ace",
    "return › Player › Sam Alvarez",
  ]);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(3);
  expect(html).not.toContain("data-film-cut");
  expect(
    filmListSentence(
      { shared: landing.shared, remainder: null, savedOnly: false },
      { you: "Alex", opponent: "Sam" },
    ),
  ).not.toContain("from Statistics");
});

test("the strip states the cut in words — the shared filters, then the statistic's extras, then saved", () => {
  const names = { you: "Reid", opponent: "Alvarez" };
  const before: MatchFilters = {
    ...EMPTY_MATCH_FILTERS,
    scoreType: ["breakpoint"],
  };
  const aces = held(
    before,
    intent({ server: "you", ending: "winner" }, "Winners · Reid"),
  );
  // The cut's shared half reads as shared phrases; the label names only the
  // extras still in force.
  expect(filmListSentence({ ...aces, savedOnly: false }, names)).toBe(
    "Reid serving · Winners · Reid, from Statistics",
  );
  expect(filmListSentence({ ...aces, savedOnly: true }, names)).toBe(
    "Reid serving · Winners · Reid, from Statistics · Saved",
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
    intent({ ending: "unforced-error" }, "Unforced errors · Reid"),
  );
  expect(filmListSentence({ ...band, savedOnly: false }, names)).toBe(
    "Unforced errors · Reid, from Statistics",
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
        remainder: {
          label: "Unforced errors",
          extras: { ending: "unforced-error" },
        },
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
