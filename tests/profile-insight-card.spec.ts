import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EvidencePart } from "@/lib/ui/insight-evidence";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The team player profile's season insight card (`profile-insight-card.tsx`)
 * and its empty state, rendered offline from the real modules through
 * `createLoader()`. The server render is the card's first paint: the claim
 * has not streamed, so the claim slot holds the skeleton and the evidence
 * line — composed on the server, handed in as props — is already there.
 *
 * What is pinned: the report's insight anatomy (`INSIGHT_SURFACE`, the
 * claim slot, the evidence line with its figures tabular in ink-900, the
 * engine credit with the mark), that the skeleton is one `role="status"`
 * region, that the card prints the evidence it was given and computes no
 * figure of its own, that the empty state's two reasons read differently,
 * and that the Statistics view draws the card for an analyzed season and
 * the empty state for none.
 */

const PROFILE = "src/components/dashboard/team/player-profile/";
const CARD = PROFILE + "profile-insight-card.tsx";
const EMPTY = PROFILE + "profile-insight-empty.tsx";
const VIEW = PROFILE + "profile-statistics-view.tsx";
const INSIGHT_CARD =
  "src/components/dashboard/matches/match-detail/report-insight-card.tsx";

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

/** The real class string, read from its source: the card module itself pulls in framer-motion, links and the report context. */
const INSIGHT_SURFACE = (() => {
  const match = /export const INSIGHT_SURFACE =\s*"([^"]+)"/.exec(
    readFileSync(INSIGHT_CARD, "utf8"),
  );
  if (!match) throw new Error("INSIGHT_SURFACE not found");
  return match[1];
})();

/** What `buildSeasonEvidence` composes for a two-match season. */
const EVIDENCE: EvidencePart[] = [
  { text: "2", tabular: true },
  { text: " analyzed" },
  { text: " · points won " },
  { text: "53%", tabular: true },
  { text: " · first serve " },
  { text: "59%", tabular: true },
];

function loader() {
  return createLoader({
    stubs: {
      "@/components/ui/tooltip": {
        Tooltip: passThrough,
        TooltipTrigger: passThrough,
        TooltipContent: ({ children }: { children?: React.ReactNode }) =>
          React.createElement("span", { "data-tip": "" }, children),
      },
      "@/components/dashboard/matches/match-detail/report-insight-card": {
        INSIGHT_SURFACE,
      },
      "next/image": (props: Record<string, unknown>) =>
        React.createElement("img", { ...props, "data-next-image": "" }),
      "framer-motion": {
        useReducedMotion: () => true,
        motion: new Proxy(
          {},
          {
            get:
              (_, tag) =>
              ({
                initial: _i,
                animate: _a,
                transition: _t,
                exit: _e,
                ...rest
              }: Record<string, unknown>) =>
                React.createElement(String(tag), rest),
          },
        ),
        AnimatePresence: passThrough,
      },
    },
  });
}

function renderCard(evidence: EvidencePart[] = EVIDENCE): string {
  const { ProfileInsightCard } = loader().load(CARD) as {
    ProfileInsightCard: React.ComponentType<{
      playerId: string;
      firstName: string;
      evidence: EvidencePart[];
      signature: string;
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(ProfileInsightCard, {
      playerId: "7c1f2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
      firstName: "Maya",
      evidence,
      signature: "2:m-a,m-b:2 analyzed · points won 53% · first serve 59%",
    }),
  );
}

function renderEmpty(reason?: "unwritten" | "unavailable"): string {
  const { ProfileInsightEmpty } = loader().load(EMPTY) as {
    ProfileInsightEmpty: React.ComponentType<{
      firstName: string;
      reason?: "unwritten" | "unavailable";
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(ProfileInsightEmpty, { firstName: "Maya", reason }),
  );
}

/** The markup's text, with the one entity React escapes in this copy undone. */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

test.describe("ProfileInsightCard — first paint", () => {
  test("the report's insight anatomy on INSIGHT_SURFACE: claim slot, evidence, credit", () => {
    const html = renderCard();
    // React hoists a `<link rel="preload">` for the mark's image ahead of
    // the tree; the card itself is one `<section>`.
    expect(html.replace(/<link [^>]*\/>/g, "").startsWith("<section")).toBe(
      true,
    );
    expect(html).toContain(`class="${INSIGHT_SURFACE}"`);
    expect(html).toContain('data-testid="insight-card"');
    expect(html).toContain('aria-label="Advantage Intelligence summary"');
    // The content's padding and the credit foot, as the report draws them.
    expect(html).toContain("p-[16px_20px_12px]");
    expect(html).toContain("border-t border-[var(--border-hairline)] pt-2.5");
    expect(html).toContain("data-next-image");
    expect(html).toContain("Advantage Intelligence");
    // No fold toggle and no link: nothing to collapse, nowhere to go.
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });

  test("the claim slot is one status region holding a bar until the sentence lands", () => {
    const html = renderCard();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading insight"');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain("data-pending-bar");
    expect(html).toContain("bg-[var(--surface-skeleton)]");
    // The bar sits in the claim's 20px line box, so nothing moves on arrival.
    expect(html).toContain("flex h-5 items-center");
  });

  test("the evidence line is the server's, figures tabular in ink-900", () => {
    const html = renderCard();
    expect(text(html)).toContain(
      "2 analyzed · points won 53% · first serve 59%",
    );
    const tabular = [
      ...html.matchAll(
        /<span class="tabular text-\[var\(--ink-900\)\]">([^<]+)<\/span>/g,
      ),
    ].map((m) => m[1]);
    expect(tabular).toEqual(["2", "53%", "59%"]);
    // The evidence paragraph is the report's evidence ink and size.
    expect(html).toContain(
      'class="text-[11px] leading-[1.6] [text-wrap:pretty] text-[var(--ink-700)]"',
    );
  });

  test("prints what it is given and computes no figure of its own", () => {
    // A different evidence line renders verbatim…
    expect(
      text(renderCard([{ text: "1", tabular: true }, { text: " analyzed" }])),
    ).toContain("1 analyzed");
    // …and the card's source never makes a number: the fold did.
    const source = readFileSync(CARD, "utf8");
    expect(source).not.toMatch(/Math\.round|toFixed\(|\.value\b/);
    expect(source).toContain('fetch("/api/player-insight"');
    expect(source).toContain("sessionStorage");
    // Every exit settles the skeleton: a 204, a refusal, an empty stream.
    expect(source).toContain("res.status === 204");
    expect(source).toContain('status: "unavailable"');
  });
});

test.describe("ProfileInsightEmpty — two reasons, two sentences", () => {
  test("unwritten (the default): nothing analysed yet", () => {
    const html = renderEmpty();
    expect(html).toContain('data-reason="unwritten"');
    expect(html).toContain('role="status"');
    expect(html).toContain('data-testid="insight-empty"');
    expect(text(html)).toContain(
      "No Advantage Intelligence summary for Maya's season yet.",
    );
    expect(text(html)).toContain(
      "One is written once a match of theirs is analysed.",
    );
  });

  test("unavailable: analysed, but no claim arrived", () => {
    const html = renderEmpty("unavailable");
    expect(html).toContain('data-reason="unavailable"');
    expect(text(html)).toContain(
      "No Advantage Intelligence summary for Maya's season right now.",
    );
    expect(text(html)).toContain("It couldn't be written just now.");
    expect(text(html)).toContain("reload to try again.");
    // Not the day-zero sentence: a match of theirs IS analysed.
    expect(text(html)).not.toContain("is analysed.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });
});

test.describe("ProfileStatisticsView — which fills the insight slot", () => {
  async function renderView(analyzed: number) {
    // The real fold, imported here so the view gets real rows and tallies.
    const { foldSeasonRows, foldSeasonTallies } =
      await import("@/lib/data/player-season");
    const { ProfileStatisticsView } = loader().load(VIEW) as {
      ProfileStatisticsView: React.ComponentType<Record<string, unknown>>;
    };
    return renderToStaticMarkup(
      React.createElement(ProfileStatisticsView, {
        playerId: "7c1f2e3d-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
        playerName: "Maya Chen",
        firstName: "Maya",
        analyzed,
        groups: foldSeasonRows([]),
        tallies: foldSeasonTallies([]),
        evidence: analyzed > 0 ? { parts: EVIDENCE, text: "2 analyzed" } : null,
        insightSignature: analyzed > 0 ? "2:m-a,m-b:2 analyzed" : "",
      }),
    );
  }

  test("an analyzed season draws the card first, not the empty state", async () => {
    const html = await renderView(2);
    expect(html).toContain('data-testid="insight-card"');
    expect(html).not.toContain('data-testid="insight-empty"');
    expect(html.indexOf('data-testid="insight-card"')).toBeLessThan(
      html.indexOf("season-head-to-head-heading"),
    );
  });

  test("nothing analyzed draws the empty state, unwritten", async () => {
    const html = await renderView(0);
    expect(html).toContain('data-testid="insight-empty"');
    expect(html).toContain('data-reason="unwritten"');
    expect(html).not.toContain('data-testid="insight-card"');
  });
});
