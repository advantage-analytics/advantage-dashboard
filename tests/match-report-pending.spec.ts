import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { REPORT_VIEWS } from "@/components/dashboard/matches/match-detail/report-view";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The match report's skeleton (`(detail)/loading.tsx` and the two code-split
 * views' chunk fallbacks). Offline: rendered to static markup and read as
 * text — what is asserted is the Carbon/DS contract, not pixels.
 *
 *   - one `role="status"` per region, labelled "Loading …"
 *   - every bar is `aria-hidden` and in the skeleton token, motion-safe
 *   - the chrome the page already knows is real text: the view names on the
 *     rail, the pane's `<h1>`, the cards' eyebrows and group labels
 *   - nothing interactive (no `<button>`) and no hex colour
 */

type View = (typeof REPORT_VIEWS)[number]["value"];

const passthrough = (tag: string) =>
  function Stub(props: Record<string, unknown>) {
    const { children, ...rest } = props;
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest))
      if (typeof value !== "function" && typeof value !== "object")
        attrs[key] = value;
    return React.createElement(tag, attrs, children as React.ReactNode);
  };

const loader = createLoader({
  stubs: {
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "next/image": { __esModule: true, default: passthrough("img") },
    "next/link": { __esModule: true, default: passthrough("a") },
    "framer-motion": {
      useReducedMotion: () => true,
      motion: new Proxy({}, { get: (_, tag) => passthrough(String(tag)) }),
      AnimatePresence: passthrough("div"),
    },
  },
});
const { MatchReportPending } = loader.load(
  "src/components/dashboard/loading/match-report-pending.tsx",
) as {
  MatchReportPending: React.ComponentType<{ view: View; focused?: boolean }>;
};

function render(view: View, focused = false) {
  return renderToStaticMarkup(
    React.createElement(MatchReportPending, { view, focused }),
  );
}

const PANE_LABEL: Record<View, string> = {
  statistics: "Loading statistics",
  shots: "Loading visualizations",
  film: "Loading video",
};

for (const { value, label } of REPORT_VIEWS) {
  test(`${value}: the rail and the pane each announce one loading status`, () => {
    const html = render(value);
    expect(html).toContain('role="status" aria-label="Loading match summary"');
    expect(html).toContain(`role="status" aria-label="${PANE_LABEL[value]}"`);
    // The pane's status is the one for THIS view, not the other two.
    for (const other of Object.values(PANE_LABEL)) {
      if (other !== PANE_LABEL[value])
        expect(html).not.toContain(`aria-label="${other}"`);
    }
  });

  test(`${value}: the title and the switcher rows are real text`, () => {
    const html = render(value);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${label}</h1>`));
    for (const view of REPORT_VIEWS) expect(html).toContain(view.label);
  });

  test(`${value}: bars are hidden, tokened and motion-safe; nothing is clickable`, () => {
    const html = render(value);
    const bars =
      html.match(/<span aria-hidden="true" class="block[^"]*"/g) ?? [];
    expect(bars.length).toBeGreaterThan(5);
    for (const bar of bars) {
      expect(bar).toContain("bg-[var(--surface-skeleton)]");
      expect(bar).toContain("motion-safe:animate-pulse");
    }
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain("animate-pulse motion-reduce");
  });
}

test("statistics: the cards' eyebrows and the head-to-head groups are drawn", () => {
  const html = render("statistics");
  for (const text of [
    "Advantage Intelligence",
    "Head to head",
    "Serve",
    "Return",
    "Points",
    "Performance tracker",
    "Rally length",
    "How points ended",
  ])
    expect(html).toContain(text);
});

test("shots: the wall is six tiles; the focused view is a court beside a stats card", () => {
  const wall = render("shots");
  expect(wall.match(/aspect-ratio:334 \/ 216/g)?.length).toBe(6);
  const focused = render("shots", true);
  expect(focused.match(/aspect-ratio:334 \/ 216/g)?.length).toBe(1);
  expect(focused).toContain("w-[292px]");
});

test("film: a 16:9 frame in the skeleton token, never the player's dark ground", () => {
  const html = render("film");
  expect(html).toContain("aspect-video");
  expect(html).toContain("Current point");
  expect(html).not.toContain("1A1A1C");
});
