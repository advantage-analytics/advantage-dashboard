import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";
import type {
  AskBarsVisual,
  AskFormVisual,
  AskMomentumVisual,
  AskServeVisual,
  AskSourceMatch,
  AskTableVisual,
  AskTreeVisual,
  AskTrendVisual,
} from "@/lib/services/ask/events";

/**
 * The serve and trend blocks, rendered offline from the real components
 * through `createLoader()`: which shape each draws for which data, and what
 * a reader without the drawing is given. The browser spec
 * (`ask-answer-view.spec.ts`) holds geometry and layout; this one holds the
 * branches.
 *
 * `next/link` is the one import with a runtime the vm cannot host; it is
 * the plain anchor it renders to.
 */

function LinkStub({
  href,
  children,
  ...rest
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return React.createElement("a", { href, ...rest }, children);
}

const loader = createLoader({
  stubs: { "next/link": { __esModule: true, default: LinkStub } },
  // The momentum marks build their links with `URLSearchParams`, which the
  // vm context does not have of its own.
  globals: { URLSearchParams },
});

const n = (value: number, text: string) => ({ value, text });

function renderServe(visual: AskServeVisual): string {
  const { ServeVisual } = loader.load(
    "src/components/dashboard/ask/visuals/serve-visual.tsx",
  ) as { ServeVisual: React.FC<{ visual: AskServeVisual }> };
  return renderToStaticMarkup(React.createElement(ServeVisual, { visual }));
}

function renderTrend(visual: AskTrendVisual): string {
  const { TrendVisual } = loader.load(
    "src/components/dashboard/ask/visuals/trend-visual.tsx",
  ) as { TrendVisual: React.FC<{ visual: AskTrendVisual }> };
  return renderToStaticMarkup(React.createElement(TrendVisual, { visual }));
}

const COURTS: AskServeVisual = {
  kind: "serve",
  caption: "By court.",
  courts: [
    {
      label: "Deuce",
      t: n(9, "9 srv"),
      body: n(3, "3 srv"),
      wide: n(6, "6 srv"),
    },
    { label: "Ad", t: n(4, "4 srv"), body: n(5, "5 srv"), wide: n(0, "0 srv") },
  ],
};

test.describe("ServeVisual", () => {
  test("two courts labelled Deuce and Ad draw the court; a zone with no serves has no column", () => {
    const markup = renderServe(COURTS);
    expect(markup).toContain('data-ask-serve-court=""');
    expect(markup.match(/data-ask-zone="/g)).toHaveLength(5);
    expect(markup).not.toContain('data-ask-grow=""');
    // The picture is decoration; the counts under it are the words, as sent.
    expect(markup).toMatch(
      /<svg[^>]*aria-hidden="true"[^>]*data-ask-serve-court/,
    );
    for (const text of ["9 srv", "3 srv", "6 srv", "4 srv", "5 srv", "0 srv"]) {
      expect(markup).toContain(text);
    }
    // The boxes are named in the model's own words, deuce then ad.
    expect(markup).toMatch(/<text[^>]*>Deuce<\/text>[^]*<text[^>]*>Ad<\/text>/);
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("the court's label is read however it is cased or ordered", () => {
    const markup = renderServe({
      ...COURTS,
      courts: [
        { ...COURTS.courts[1], label: "AD COURT" },
        { ...COURTS.courts[0], label: "deuce side" },
      ],
    });
    expect(markup).toContain('data-ask-serve-court=""');
    // The deuce box still draws the deuce court's three zones.
    expect(markup.match(/data-ask-side="deuce"/g)).toHaveLength(3);
    expect(markup.match(/data-ask-side="ad"/g)).toHaveLength(2);
  });

  test("any other labelling is one bar per court", () => {
    for (const labels of [
      ["First serves", "Second serves"],
      ["Deuce", "Deuce"],
      ["Deuce court serves", "Ad"],
    ]) {
      const markup = renderServe({
        ...COURTS,
        courts: COURTS.courts.map((court, index) => ({
          ...court,
          label: labels[index],
        })),
      });
      expect(markup, labels.join(" / ")).not.toContain("data-ask-serve-court");
      expect(markup, labels.join(" / ")).toContain('data-ask-grow=""');
    }
    const one = renderServe({ ...COURTS, courts: [COURTS.courts[0]] });
    expect(one).not.toContain("data-ask-serve-court");
  });
});

function renderMomentum(visual: AskMomentumVisual): string {
  const { MomentumVisual } = loader.load(
    "src/components/dashboard/ask/visuals/momentum-visual.tsx",
  ) as { MomentumVisual: React.FC<{ visual: AskMomentumVisual }> };
  return renderToStaticMarkup(React.createElement(MomentumVisual, { visual }));
}

test.describe("MomentumVisual", () => {
  const points: AskMomentumVisual["points"] = [
    { won: true, set: 1 },
    { won: false, set: 1, mark: "break" },
    { won: true, set: 2, mark: "match" },
  ];

  test("marks link to the match's film by pressure when the points are one match's", () => {
    const markup = renderMomentum({
      kind: "momentum",
      caption: "Point by point.",
      matchId: "m 1",
      points,
    });
    expect(markup.match(/data-ask-momentum-mark="/g)).toHaveLength(2);
    expect(markup).toMatch(
      /href="\/dashboard\/matches\/m%201\?tab=film&amp;f=[^"]+"/,
    );
    expect(markup).toContain("Break point, point 2 of 3, open the film");
    expect(markup).toContain("Match point, point 3 of 3, open the film");
    // The two pressures open different filters.
    const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs).size).toBe(2);
    expect(markup.match(/data-ask-mark="/g)).toHaveLength(2);
    expect(markup).toContain('fill="var(--viz-key)"');
    expect(markup).toContain(">Set 1<");
    expect(markup).toContain(">Set 2<");
    expect(markup).toContain(
      "3 points, 2 won and 1 lost; 1 match point, 1 break point.",
    );
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("without a match, the marks are drawn and nothing links", () => {
    const markup = renderMomentum({
      kind: "momentum",
      caption: "Point by point.",
      points,
    });
    expect(markup).not.toContain("href=");
    expect(markup.match(/data-ask-mark="/g)).toHaveLength(2);
  });

  test("no marks and no sets: the line, the level rule, and the count in words", () => {
    const markup = renderMomentum({
      kind: "momentum",
      caption: "Point by point.",
      points: [{ won: false }, { won: false }],
    });
    expect(markup).not.toContain("data-ask-mark=");
    expect(markup).not.toContain("Set ");
    expect(markup).toContain("2 points, 0 won and 2 lost.");
    expect(markup).not.toContain("Break point");
  });
});

const TREND: AskTrendVisual = {
  kind: "trend",
  caption: "Over time.",
  points: [
    { label: "Jun 4", value: n(61, "61,0 %") },
    { label: "Jul 9", value: n(63, "63,0 %") },
    { label: "Sep 28", value: n(37.5, "37,5 %") },
  ],
};

test.describe("TrendVisual", () => {
  test("one series with no matches: the mean rule, the key's name for it, and a list of the points", () => {
    const markup = renderTrend(TREND);
    expect(markup).toContain("Your average");
    expect(markup).toMatch(/<line[^>]*stroke-dasharray/);
    expect(markup).not.toContain("href=");
    expect(markup).toMatch(/<ol class="sr-only"><li>Jun 4: 61,0 %<\/li>/);
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("points that are matches are links to them, carrying the words; the rest are words alone", () => {
    const markup = renderTrend({
      ...TREND,
      points: [
        { ...TREND.points[0], matchId: "m-1" },
        TREND.points[1],
        { ...TREND.points[2], matchId: "m 3" },
      ],
    });
    expect(markup).toContain('href="/dashboard/matches/m-1"');
    expect(markup).toContain('href="/dashboard/matches/m%203"');
    expect(markup.match(/data-ask-trend-point=""/g)).toHaveLength(2);
    expect(markup).toContain("Jun 4: 61,0 %, open match");
    expect(markup).toContain('<span class="sr-only">Jul 9: 63,0 %</span>');
    expect(markup).not.toContain("<ol");
    // The drawing stays decoration and lets clicks through to the links.
    expect(markup).toMatch(
      /<svg[^>]*aria-hidden="true"[^>]*pointer-events-none/,
    );
  });

  test("a second series is the dashed line and the key's name, in place of the mean", () => {
    const markup = renderTrend({
      ...TREND,
      baseline: {
        label: "All matches",
        values: [n(58.2, "58,2 %"), n(58.2, "58,2 %"), n(58.2, "58,2 %")],
      },
    });
    expect(markup).toContain("All matches");
    expect(markup).not.toContain("Your average");
    expect(markup).not.toContain("<line");
    expect(markup.match(/<path[^>]*stroke-dasharray/g)).toHaveLength(1);
    // Each point's words name both series.
    expect(markup).toContain("<li>Sep 28: 37,5 %; All matches 58,2 %</li>");
    // The second series prints nothing on the plot: the one figure there is
    // still the last point's.
    expect(markup.match(/58,2 %/g)).toHaveLength(3);
  });
});

// ── The play tree, the labelled strip, and the rows that open the film ──────

const ONE_SOURCE: AskSourceMatch[] = [
  {
    matchId: "m 1",
    opponentName: "Theo Lindqvist",
    playedOn: "2026-09-28",
    iWon: true,
    scoreText: "6-4, 6-3",
    playerName: null,
  },
];
const TWO_SOURCES: AskSourceMatch[] = [
  ONE_SOURCE[0],
  { ...ONE_SOURCE[0], matchId: "m-2", opponentName: "Marcus Hale" },
];

function renderTree(
  visual: AskTreeVisual,
  sources?: readonly AskSourceMatch[],
): string {
  const { TreeVisual } = loader.load(
    "src/components/dashboard/ask/visuals/tree-visual.tsx",
  ) as {
    TreeVisual: React.FC<{
      visual: AskTreeVisual;
      sources?: readonly AskSourceMatch[];
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(TreeVisual, { visual, sources }),
  );
}

const TREE: AskTreeVisual = {
  kind: "tree",
  caption: "Patterns.",
  levels: ["Serve", "Plus one"],
  countLabel: "Points",
  partLabel: "Won",
  shareLabel: "Won %",
  branches: [
    {
      steps: ["T serve", "Forehand crosscourt"],
      count: n(29, "29"),
      part: n(14, "14"),
      share: n(48.3, "48,3 %"),
      watch: "sv.y_sz.t",
    },
    {
      steps: ["T serve", "Backhand crosscourt"],
      count: n(20, "20"),
      part: n(14, "14"),
      share: n(70, "70 %"),
    },
    {
      steps: ["Wide serve", "Forehand inside out"],
      count: n(8, "8"),
      part: n(3, "3"),
      share: n(37.5, "37,5 %"),
      watch: "sv.y_sz.w",
    },
  ],
};

test.describe("TreeVisual", () => {
  test("draws each first step once with its branches under it, a share bar and the counts as sent", () => {
    const markup = renderTree(TREE);
    expect(markup.match(/data-ask-tree-group=""/g)).toHaveLength(2);
    expect(markup.match(/data-ask-tree-branch=""/g)).toHaveLength(3);
    expect(markup.indexOf("T serve")).toBeLessThan(
      markup.indexOf("Wide serve"),
    );
    expect(markup.match(/>T serve</g)).toHaveLength(1);
    for (const text of ["29", "14", "48,3 %", "70 %", "37,5 %"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain("points");
    expect(markup).toContain("won");
    expect(markup).not.toContain(">48.3%<");
    expect(markup).toMatch(/width:48\.3%/);
    expect(markup).toMatch(/width:70%/);
    expect(markup).toContain("Won %, as a share");
    expect(markup).toContain(
      "Serve, then Plus one: 3 branches, most played first.",
    );
    // No source match: nothing links.
    expect(markup).not.toContain("href=");
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("over one source match, a branch with a filter links to that match's film on it", () => {
    const markup = renderTree(TREE, ONE_SOURCE);
    expect(markup.match(/data-ask-tree-watch=""/g)).toHaveLength(2);
    expect(markup).toContain(
      'href="/dashboard/matches/m%201?tab=film&amp;f=sv.y_sz.t"',
    );
    expect(markup).toContain(
      'href="/dashboard/matches/m%201?tab=film&amp;f=sv.y_sz.w"',
    );
    expect(markup).toContain("· Watch");
    // Over two, none.
    expect(renderTree(TREE, TWO_SOURCES)).not.toContain("href=");
  });

  test("no part: the count and the share alone; three levels nest", () => {
    const markup = renderTree({
      ...TREE,
      partLabel: undefined,
      levels: ["Side", "Serve", "Plus one"],
      branches: [
        {
          steps: ["Deuce", "T serve", "Forehand crosscourt"],
          count: n(9, "9"),
          share: n(50, "50 %"),
        },
        {
          steps: ["Ad", "Wide serve", "Backhand crosscourt"],
          count: n(4, "4"),
          share: n(25, "25 %"),
        },
      ],
    });
    expect(markup.match(/data-ask-tree-group=""/g)).toHaveLength(4);
    expect(markup.match(/data-ask-tree-branch=""/g)).toHaveLength(2);
    expect(markup).not.toContain(" won");
    expect(markup).toContain("Side, then Serve, then Plus one: 2 branches");
  });
});

function renderForm(visual: AskFormVisual): string {
  const { FormVisual } = loader.load(
    "src/components/dashboard/ask/visuals/form-visual.tsx",
  ) as { FormVisual: React.FC<{ visual: AskFormVisual }> };
  return renderToStaticMarkup(React.createElement(FormVisual, { visual }));
}

test.describe("FormVisual", () => {
  test("without ticks it is the shared strip; with them each tick carries its match in words", () => {
    const plain = renderForm({
      kind: "form",
      caption: "C",
      results: [true, false],
    });
    expect(plain).toContain("Last 2: W L");
    expect(plain).not.toContain("data-ask-form-tick");

    const labelled = renderForm({
      kind: "form",
      caption: "C",
      results: [true, false, true],
      ticks: [
        {
          opponent: "Theo Lindqvist",
          score: "6-4, 6-3",
          date: "Sep 28, 2026",
          matchId: "m 1",
        },
        { opponent: "Marcus Hale", player: "Ana Sokolov" },
        {},
      ],
    });
    expect(labelled.match(/data-ask-form-tick=""/g)).toHaveLength(3);
    expect(labelled).toContain('href="/dashboard/matches/m%201"');
    expect(labelled).toContain(
      "Won against Theo Lindqvist, 6-4, 6-3, Sep 28, 2026, open match",
    );
    expect(labelled).toContain("Lost, Ana Sokolov to Marcus Hale");
    expect(labelled.match(/href=/g)).toHaveLength(1);
    expect(labelled).toContain("--viz-good");
    expect(labelled).toContain("--viz-bad");
    // Ticks that do not match the results one for one are not drawn as such.
    const mismatched = renderForm({
      kind: "form",
      caption: "C",
      results: [true, false],
      ticks: [{ opponent: "A" }],
    });
    expect(mismatched).toContain("Last 2: W L");
  });
});

function renderTable(
  visual: AskTableVisual,
  sources?: readonly AskSourceMatch[],
): string {
  const { TableVisual } = loader.load(
    "src/components/dashboard/ask/visuals/table-visual.tsx",
  ) as {
    TableVisual: React.FC<{
      visual: AskTableVisual;
      sources?: readonly AskSourceMatch[];
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(TableVisual, { visual, sources }),
  );
}

test.describe("TableVisual", () => {
  const TABLE: AskTableVisual = {
    kind: "table",
    caption: "C",
    columns: ["Points"],
    rows: [
      { label: "Theo Lindqvist", cells: ["4"], matchId: "m 1" },
      { label: "First serves in", cells: ["58.2%"] },
      { label: "Winners", cells: ["8"] },
    ],
  };

  test("a match row opens its film; a measure row opens the one source's; the rest are words", () => {
    const one = renderTable(TABLE, ONE_SOURCE);
    expect(one.match(/data-ask-table-watch=""/g)).toHaveLength(2);
    expect(one).toContain('href="/dashboard/matches/m%201?tab=film"');
    expect(one).toMatch(
      /href="\/dashboard\/matches\/m%201\?tab=film&amp;f=[^"]*vt\.1/,
    );
    expect(one).toContain("First serves in<span");
    // Over two sources only the match row links.
    const two = renderTable(TABLE, TWO_SOURCES);
    expect(two.match(/data-ask-table-watch=""/g)).toHaveLength(1);
    // A source that carries the pattern's points is what the match row opens.
    const watched = renderTable(TABLE, [
      {
        ...ONE_SOURCE[0],
        watch: { href: "/dashboard/matches/m%201?tab=film&f=cp.y", points: 4 },
      },
    ]);
    expect(watched).toContain(
      'href="/dashboard/matches/m%201?tab=film&amp;f=cp.y"',
    );
    expect(renderTable(TABLE)).toContain(
      'href="/dashboard/matches/m%201?tab=film"',
    );
  });
});

function renderBars(
  visual: AskBarsVisual,
  sources?: readonly AskSourceMatch[],
): string {
  const { BarsVisual } = loader.load(
    "src/components/dashboard/ask/visuals/bars-visual.tsx",
  ) as {
    BarsVisual: React.FC<{
      visual: AskBarsVisual;
      sources?: readonly AskSourceMatch[];
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(BarsVisual, { visual, sources }),
  );
}

test.describe("BarsVisual", () => {
  const BARS: AskBarsVisual = {
    kind: "bars",
    caption: "C",
    subjectLabel: "You",
    baselineLabel: "All matches",
    rows: [
      { label: "Serves wide", subject: n(30, "30%"), baseline: n(25, "25%") },
      {
        label: "Total points won",
        subject: n(52, "52%"),
        baseline: n(50, "50%"),
      },
    ],
  };

  test("a readout per bar names the series and the figure; a measure row links over one source", () => {
    const markup = renderBars(BARS, ONE_SOURCE);
    expect(markup.match(/data-ask-readout=""/g)).toHaveLength(4);
    expect(markup).toContain("You: 30%");
    expect(markup).toContain("All matches: 25%");
    // Serves wide is a Video filter; the share of all points is not.
    expect(markup.match(/data-ask-bar-watch=""/g)).toHaveLength(1);
    expect(markup).toMatch(
      /href="\/dashboard\/matches\/m%201\?tab=film&amp;f=[^"]*vz\.w/,
    );
    expect(renderBars(BARS, TWO_SOURCES)).not.toContain("href=");
    expect(renderBars(BARS)).not.toContain("href=");
  });
});

function renderServeCourt(
  visual: AskServeVisual,
  sources?: readonly AskSourceMatch[],
): string {
  const { ServeVisual } = loader.load(
    "src/components/dashboard/ask/visuals/serve-visual.tsx",
  ) as {
    ServeVisual: React.FC<{
      visual: AskServeVisual;
      sources?: readonly AskSourceMatch[];
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(ServeVisual, { visual, sources }),
  );
}

test.describe("ServeVisual — the court's zones", () => {
  test("over one source, with the block saying whose serves, each zone with serves is a link; else a readout alone", () => {
    const mine = renderServeCourt({ ...COURTS, server: "you" }, ONE_SOURCE);
    // Five zones have serves (the ad court's wide has none).
    expect(mine.match(/data-ask-zone-watch="/g)).toHaveLength(5);
    expect(mine).toMatch(
      /href="\/dashboard\/matches\/m%201\?tab=film&amp;f=[^"]*sv\.y[^"]*ct\.d[^"]*vz\.t" data-ask-zone-watch="deuce-t"/,
    );

    expect(mine).toContain("Deuce, T: 9 srv, open the film");
    expect(mine.match(/data-ask-readout=""/g)).toHaveLength(5);

    const theirs = renderServeCourt(
      { ...COURTS, server: "opponent" },
      ONE_SOURCE,
    );
    expect(theirs).toMatch(/href="[^"]*sv\.o/);

    for (const markup of [
      renderServeCourt(COURTS, ONE_SOURCE),
      renderServeCourt({ ...COURTS, server: "you" }, TWO_SOURCES),
      renderServeCourt({ ...COURTS, server: "you" }),
    ]) {
      expect(markup).not.toContain("href=");
      expect(markup.match(/data-ask-zone-hover="/g)).toHaveLength(5);
    }
  });
});
