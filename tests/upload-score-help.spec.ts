import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * T2 — the "How to enter a tiebreak" help beside the Score caption
 * (`ScoreBlock.tsx`, rendered by the upload wizard's Match step and by the
 * schedule's score page).
 *
 * `ScoreBlock` renders FOR REAL through `createLoader()`; only
 * `@/components/ui/popover` is stubbed, inline, as
 * `upload-player-details.spec.ts` does it — the popover is a portal at
 * runtime, so here its content renders in place and one static pass carries
 * the trigger AND the worked examples. No server, no database.
 */

const popover = {
  Popover: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
  PopoverContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("div", { "data-popover": "", className }, children),
};

const loader = createLoader({
  stubs: { "@/components/ui/popover": popover },
});
const { ScoreBlock } = loader.load(
  "src/components/dashboard/matches/new-match-wizard/ScoreBlock.tsx",
) as { ScoreBlock: React.ComponentType<Record<string, unknown>> };

function render(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(ScoreBlock, {
      formData: {
        bestOf: "3",
        adScoring: undefined,
        playerScores: [],
        opponentScores: [],
        playerTiebreaks: [],
        opponentTiebreaks: [],
        numberOfSets: undefined,
      },
      playerName: "Alex",
      opponentName: "Sam",
      fromLine: false,
      onScoreChange: () => {},
      onTiebreakChange: () => {},
      onSetsChange: () => {},
      ...extra,
    }),
  );
}

/** Text content: tags dropped, entities for the characters React escapes. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

const EXAMPLE_1 =
  "A set that ends 7–6. Type the games and a TB box opens beside the set. The tiebreak points go in it.";
const EXAMPLE_2 =
  "A match tiebreak for the third set. Enter that set as 1–0 to whoever won it, then the points in its TB box.";

test.describe("ScoreBlock tiebreak help", () => {
  test("button, popover title and both worked examples render verbatim", () => {
    const html = render();
    const body = text(html);

    expect(html).toMatch(
      /<button type="button"[^>]*>(?:<span[^>]*data-icon[^>]*><\/span>|<svg[\s\S]*?<\/svg>)How to enter a tiebreak<\/button>/,
    );
    expect(body).toContain("Entering a tiebreak");
    expect(body).toContain(EXAMPLE_1);
    expect(body).toContain(EXAMPLE_2);
  });

  test("mini score boxes are aria-hidden spans, never inputs", () => {
    const html = render();
    // From the popover to the caption row's spacer, which follows it.
    const popoverHtml = html.slice(
      html.indexOf("data-popover"),
      html.indexOf('class="flex-1"'),
    );
    expect(popoverHtml).toContain("Entering a tiebreak");
    expect(popoverHtml).not.toContain("<input");
    expect(popoverHtml).toContain('aria-hidden="true"');
  });

  test("hidden on an 8-game doubles pro-set", () => {
    const body = text(render({ gamesTo: 8 }));
    expect(body).not.toContain("How to enter a tiebreak");
    expect(body).not.toContain("Entering a tiebreak");
  });
});
