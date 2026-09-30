import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchAnalysis } from "@/lib/data/match-analysis";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `RowLifecycle`: the Matches list's Analysis cell. Every row leads with the
 * stepper's mark at its compact size, so each lifecycle word pins the mark it
 * wears — read back from the mark's own screen-reader word and its classes.
 * Offline: the real component rendered to static markup.
 */

const loader = createLoader();
const { RowLifecycle } = loader.load(
  "src/components/dashboard/matches/row-state.tsx",
) as {
  RowLifecycle: React.ComponentType<{
    analysis?: MatchAnalysis;
    label: string;
  }>;
};

const render = (analysis: MatchAnalysis) =>
  renderToStaticMarkup(
    React.createElement(RowLifecycle, { analysis, label: "Maya v Sofia" }),
  );

const CASES: {
  word: string;
  analysis: MatchAnalysis;
  sr: string;
  /** A class only this mark draws. */
  cls: string;
}[] = [
  {
    word: "Cancelled",
    analysis: { status: "cancelled", providerId: null },
    sr: "Cancelled:",
    cls: "bg-[var(--ink-100)]",
  },
  {
    word: "Not analyzed",
    analysis: { status: "manual", providerId: null },
    sr: "Not analyzed:",
    cls: "border-[var(--ink-200)]",
  },
  {
    word: "Stats unavailable",
    analysis: {
      status: "derivation_failed",
      providerId: null,
      recovery: "stats_unavailable",
    },
    sr: "Not analyzed:",
    cls: "border-[var(--ink-200)]",
  },
  {
    word: "Imported",
    analysis: { status: "imported", providerId: null },
    sr: "Done:",
    cls: "bg-[var(--ink-100)]",
  },
  {
    word: "Timeline ready",
    analysis: { status: "timeline", providerId: null },
    sr: "Done:",
    cls: "bg-[var(--ink-100)]",
  },
  {
    word: "Analyzed",
    analysis: { status: "completed", providerId: null },
    sr: "Done:",
    cls: "bg-[var(--ink-100)]",
  },
  {
    word: "Failed",
    analysis: { status: "failed", providerId: null, recovery: "retry" },
    sr: "Failed:",
    cls: "text-[var(--danger)]",
  },
];

test.describe("RowLifecycle leads every settled word with a mark", () => {
  for (const { word, analysis, sr, cls } of CASES) {
    test(`${word} → ${sr}`, () => {
      const html = render(analysis);
      expect(html).toContain(
        `<span class="sr-only">${sr}</span></span><span>${word}</span>`,
      );
      expect(html).toContain(cls);
      // No empty 14px slot stands in for a mark any more.
      expect(html).not.toContain('aria-hidden="true" class="size-[14px]');
    });
  }

  test("a cancelled row is the grey cross, not the red one", () => {
    const html = render({ status: "cancelled", providerId: null });
    expect(html).toContain("text-[var(--ink-600)]");
    expect(html).not.toContain("var(--danger)");
  });

  test("the never-analysed ring is solid, not dashed", () => {
    const html = render({ status: "manual", providerId: null });
    expect(html).not.toContain("border-dashed");
  });

  test("settled words stay ink-500; Failed keeps ink-900", () => {
    for (const { word, analysis } of CASES) {
      const ink = word === "Failed" ? "--ink-900" : "--ink-500";
      expect(render(analysis)).toContain(`color:var(${ink})`);
    }
  });
});
