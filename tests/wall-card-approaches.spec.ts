import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";
import { MATCH, withoutLanding } from "./fixtures/approach-points";
import { buildDefaultTiles } from "@/components/dashboard/matches/match-detail/shots/default-tiles";
import { vizStateQuery } from "@/components/dashboard/matches/match-detail/shots/viz-url";
import { HAND_ASSUMED_NOTE } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * The Approaches wall card's markup, rendered offline from the real
 * `wall-card.tsx` through `createLoader()`, on a match whose approaches
 * all lack a landing (real match 9e4d293e). A wing is only known from a
 * landing, so the card must say the count and why nothing is drawn — never
 * "To backhand 0 / Middle 0 / To forehand 0" over an empty grey bar, which
 * reads as "you hit none" (`docs/ui-revamp-guardrails.md`).
 *
 * The court (`CourtArt`) and the readout are markers: only the footer is
 * under test. `next/link` is a plain `<a>` carrying the card's aria-label.
 */

function LinkStub({
  href,
  children,
  ...rest
}: {
  href: string;
  children?: React.ReactNode;
}) {
  return React.createElement("a", { href, ...rest }, children);
}

const SIDES = {
  you: { name: "P1", isPlayer1: true },
  opp: { name: "P2", isPlayer1: false },
};
const href = (s: Parameters<typeof vizStateQuery>[1]) =>
  vizStateQuery(new URLSearchParams(), s);

function renderApproachesCard(
  points: MatchPoint[],
  matchCtx?: Parameters<typeof buildDefaultTiles>[3],
) {
  const tile = buildDefaultTiles(points, SIDES, href, matchCtx, {
    bands: DEFAULT_BANDS,
    unit: "ft",
  }).find((t) => t.key === "you:approaches")!;
  const loader = createLoader({
    stubs: {
      "next/link": { __esModule: true, default: LinkStub },
      "./court-art": { APRON_FILL: "#eee", CourtArt: marker("CourtArt") },
      "./court-geometry": { SERVE_COURT: { viewBox: { w: 334, h: 216 } } },
      "./use-viz-state": { useVizState: () => ({ setState: () => {} }) },
      "./viz-url": { viewIdentityKey: () => null },
      "./viz-court-transition": { courtTileDomId: (k: string) => k },
      "@/components/dashboard/matches/match-detail/chart-tooltip": {
        ChartTooltip: marker("ChartTooltip"),
      },
    },
  });
  const { WallCard } = loader.load(
    "src/components/dashboard/matches/match-detail/shots/wall-card.tsx",
  ) as { WallCard: React.ComponentType<Record<string, unknown>> };
  const html = renderToStaticMarkup(
    React.createElement(WallCard, {
      name: "Approaches",
      playerName: "P1",
      possessive: "your",
      cut: "approaches",
      dots: tile.dots,
      summary: tile.summary!,
      href: tile.href,
      navigateState: tile.state,
    }),
  );
  return { html, summary: tile.summary! };
}

function ariaLabel(html: string): string {
  const m = /<a [^>]*aria-label="([^"]*)"/.exec(html);
  expect(m).not.toBeNull();
  return m![1];
}

const WINGS = ["To backhand", "Middle", "To forehand"];

test("approaches with no landing: the card says the count and the note, and draws no wings or bar", () => {
  const { html, summary } = renderApproachesCard(MATCH.map(withoutLanding));
  const n = summary.total;
  expect(n).toBeGreaterThan(0);
  const countLabel = `${n} ${n === 1 ? "approach" : "approaches"}`;
  const note = `${n} not drawn: no landing recorded`;

  expect(html).toContain(countLabel);
  expect(html).toContain(note);
  expect(html).toContain(summary.keyLead);
  for (const wing of WINGS) expect(html).not.toContain(wing);
  expect(html).not.toContain("data-wall-split-bar");

  // The accessible name still carries the count and why nothing is drawn.
  const label = ariaLabel(html);
  expect(label).toContain(countLabel);
  expect(label).toContain(note);
});

test("approaches all drawn: the card keeps its split bar and all three wing keys", () => {
  const { html, summary } = renderApproachesCard(MATCH);
  expect(summary.notDrawn).toBe(0);
  expect(html).toContain("data-wall-split-bar");
  for (const wing of WINGS) expect(html).toContain(wing);
  expect(html).not.toContain("not drawn");
  expect(ariaLabel(html)).toContain(summary.countLabel);
});

/** The `data-wall-hand-note` element's text, or `null` when there is none. */
function handNoteText(html: string): string | null {
  const m = /<p [^>]*data-wall-hand-note=""[^>]*>([^<]*)<\/p>/.exec(html);
  return m ? m[1] : null;
}

test("unknown hands: the card says 'assumes right-handed' in its own element and its accessible label", () => {
  // No context: the match records neither hand, so the wings are assumed.
  const { html, summary } = renderApproachesCard(MATCH);
  expect(summary.segments.length).toBeGreaterThan(0);
  expect(HAND_ASSUMED_NOTE).toBe("assumes right-handed");
  expect(handNoteText(html)).toBe(HAND_ASSUMED_NOTE);
  expect(ariaLabel(html)).toContain(HAND_ASSUMED_NOTE);
});

test("known hands: no hand note on the card or in its accessible label", () => {
  const { html } = renderApproachesCard(MATCH, {
    youIsPlayer1: true,
    hands: { player1: "right", player2: "left" },
    errorSplitJudged: true,
  });
  expect(html).not.toContain("data-wall-hand-note");
  expect(html).not.toContain(HAND_ASSUMED_NOTE);
  expect(ariaLabel(html)).not.toContain(HAND_ASSUMED_NOTE);
});
