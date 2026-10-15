import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";
import type {
  AskMomentumVisual,
  AskServeVisual,
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
