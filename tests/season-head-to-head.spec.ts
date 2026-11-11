import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  NO_LOB_DATA_NOTE,
  NO_PASS_DATA_NOTE,
  h2hGroups,
  type H2HStats,
} from "@/components/dashboard/matches/match-detail/head-to-head-rows";
import {
  foldSeasonRows,
  type SeasonMatchStats,
} from "@/lib/data/player-season";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The team player profile's season Head to head card (design Q), rendered
 * offline from the real `season-head-to-head-card.tsx` and the real
 * `HeadToHeadTable` it shares with the match report, through
 * `createLoader()`. The rows come from the real season fold; only the Radix
 * tooltip is a stand-in, drawn inline so the dash's note can be read.
 *
 * What is pinned: the eyebrow and the "Per match · N analyzed" micro, the
 * column heads (surname under the blue mark, "Opponents" under the slate
 * one), the Errors-vs-Unforced/Forced choice, the leader's emphasis, and the
 * zero case — every row still there, a dash in both columns, no figure and
 * no action.
 */

const CARD =
  "src/components/dashboard/team/player-profile/season-head-to-head-card.tsx";
const TABLE =
  "src/components/dashboard/matches/match-detail/head-to-head-table.tsx";

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

function render(props: {
  playerName: string;
  analyzed: number;
  groups: ReturnType<typeof foldSeasonRows>;
}): string {
  const loader = createLoader({
    stubs: {
      "@/components/ui/tooltip": {
        Tooltip: passThrough,
        TooltipTrigger: passThrough,
        // Inline, so the dash's note is in the markup rather than a portal.
        TooltipContent: ({ children }: { children?: React.ReactNode }) =>
          React.createElement("span", { "data-tip": "" }, children),
      },
    },
  });
  const { SeasonHeadToHeadCard } = loader.load(CARD) as {
    SeasonHeadToHeadCard: React.ComponentType<typeof props>;
  };
  return renderToStaticMarkup(React.createElement(SeasonHeadToHeadCard, props));
}

/** A SwingVision match with published figures and judged errors. */
function match(
  you: Partial<H2HStats>,
  opp: Partial<H2HStats>,
  errorSplitJudged = true,
): SeasonMatchStats {
  return {
    points: [],
    isPlayer1: true,
    isDerived: false,
    errorSplitJudged,
    lobKeys: null,
    youStats: { fractions: {}, ...you },
    oppStats: { fractions: {}, ...opp },
  };
}

const YOU: Partial<H2HStats> = {
  aces: 4,
  doubleFaults: 1,
  winners: 8,
  unforcedErrors: 5,
  forcedErrors: 2,
  totalPointsWon: 60,
  totalPoints: 100,
  firstServeInPct: 60,
  fractions: { firstServeInPct: { made: 30, attempts: 50 } },
};
const OPP: Partial<H2HStats> = {
  aces: 2,
  doubleFaults: 3,
  winners: 10,
  unforcedErrors: 9,
  forcedErrors: 4,
  totalPointsWon: 40,
  totalPoints: 100,
  firstServeInPct: 50,
  fractions: { firstServeInPct: { made: 25, attempts: 50 } },
};

/** The figure cell as the table draws it: the leader at 500 ink-900. */
const leader = (figure: string) =>
  new RegExp(
    `<span class="[^"]*tabular[^"]*" style="font-weight:500;color:var\\(--ink-900\\);background-color:transparent">${figure.replace(".", "\\.")}</span>`,
  );
/** The other side at 400 ink-500. */
const other = (figure: string) =>
  new RegExp(
    `<span class="[^"]*tabular[^"]*" style="font-weight:400;color:var\\(--ink-500\\);background-color:transparent">${figure.replace(".", "\\.")}</span>`,
  );

test.describe("SeasonHeadToHeadCard", () => {
  test("eyebrow, caption and the two column heads under their marks", () => {
    const html = render({
      playerName: "Maya Chen",
      analyzed: 2,
      groups: foldSeasonRows([match(YOU, OPP), match(YOU, OPP)]),
    });
    expect(html).toContain(
      '<span id="season-head-to-head-heading" class="eyebrow">Head to head</span>',
    );
    expect(html).toContain('aria-labelledby="season-head-to-head-heading"');
    expect(html).toContain(">Per match · 2 analyzed<");
    // The surname under the blue mark, "Opponents" under the slate one.
    expect(html).toMatch(
      /style="background:var\(--viz-you\)"><\/span><span class="[^"]*text-\[var\(--ink-900\)\]">Chen<\/span>/,
    );
    expect(html).toMatch(
      /style="background:var\(--viz-opp\)"><\/span><span class="[^"]*text-\[var\(--ink-600\)\]">Opponents<\/span>/,
    );
    expect(html).not.toContain("Maya Chen");
    // The report card's own surface, padding and column-width rule.
    expect(html).toContain('class="surface-card flex flex-col"');
    expect(html).toMatch(/padding:18px 20px 14px;--h2h-col:\d+px/);
    for (const title of ["Serve", "Return", "Points"])
      expect(html).toContain(`>${title}</span>`);
  });

  test("judged season: Unforced + Forced errors; the leader is emphasised, counts to one decimal", () => {
    const html = render({
      playerName: "Maya Chen",
      analyzed: 2,
      groups: foldSeasonRows([match(YOU, OPP), match(YOU, OPP)]),
    });
    expect(html).toContain(">Unforced errors<");
    expect(html).toContain(">Forced errors<");
    expect(html).not.toContain(">Errors<");
    // Aces: 4.0 a match beats 2.0.
    expect(html).toMatch(leader("4.0"));
    expect(html).toMatch(other("2.0"));
    // Winners: the opponents' 10.0 beats 8.0.
    expect(html).toMatch(leader("10.0"));
    expect(html).toMatch(other("8.0"));
    // Double faults: the LOWER count leads.
    expect(html).toMatch(leader("1.0"));
    expect(html).toMatch(other("3.0"));
    // A pooled rate prints as a percentage.
    expect(html).toMatch(leader("60%"));
    expect(html).toMatch(other("40%"));
  });

  test("an unjudged match in the season: one Errors row", () => {
    const html = render({
      playerName: "Maya Chen",
      analyzed: 2,
      groups: foldSeasonRows([match(YOU, OPP), match(YOU, OPP, false)]),
    });
    expect(html).toContain(">Errors<");
    expect(html).not.toContain(">Unforced errors<");
    expect(html).not.toContain(">Forced errors<");
  });

  test("zero analyzed matches: every row with a dash in both columns, the caption at 0", () => {
    const html = render({
      playerName: "Maya Chen",
      analyzed: 0,
      groups: foldSeasonRows([]),
    });
    expect(html).toContain(">Per match · 0 analyzed<");
    // Unjudged until something is judged: "Errors", not the split.
    const labels = h2hGroups(false, false).flatMap((group) =>
      group.configs.map((config) => config.label),
    );
    expect(labels).toContain("Errors");
    for (const label of labels) expect(html).toContain(`>${label}</span>`);
    expect(html).not.toContain(">Unforced errors<");
    // One dash per side per row, never a zero or a percentage.
    expect(html.match(/>—</g)?.length).toBe(labels.length * 2);
    expect(html).not.toMatch(/>\d[\d.]*%?</);
    expect(html).toContain('aria-label="No data recorded for this stat"');
    // The dash says why: the lob rows carry the report's notes, the rest
    // "No data".
    expect(html).toContain(`<span data-tip="">${NO_LOB_DATA_NOTE}</span>`);
    expect(html).toContain(
      `<span data-tip="">${NO_PASS_DATA_NOTE.replace(/'/g, "&#x27;")}</span>`,
    );
    expect(html).toContain('<span data-tip="">No data</span>');
  });

  test("no cuts and no Watch readouts: nothing to click, no tour anchor", () => {
    for (const groups of [
      foldSeasonRows([]),
      foldSeasonRows([match(YOU, OPP), match(YOU, OPP)]),
    ]) {
      const html = render({ playerName: "Maya Chen", analyzed: 2, groups });
      expect(html).not.toContain("<button");
      expect(html).not.toContain("Watch");
      expect(html).not.toContain("in Video");
      expect(html).not.toContain("data-tour");
      expect(html).not.toContain('role="note"');
    }
    // By construction: the season card hands the table no `interaction`, and
    // reaches none of the report's film machinery.
    const source = readFileSync(CARD, "utf8");
    expect(source).not.toMatch(
      /interaction=|watchCut|film-cut|useMatchReport|head-to-head-card/,
    );
    // The table itself knows no cut: the "Watch" copy lives with the report.
    expect(readFileSync(TABLE, "utf8")).not.toMatch(/Watch|watchCut|FilmCut/);
  });
});
