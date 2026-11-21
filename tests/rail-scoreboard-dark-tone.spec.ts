import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RailScoreboardProps } from "@/components/dashboard/matches/match-detail/rail-scoreboard";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The film room's scoreboard is the report rail's scorecard in its dark tone
 * (`film-scoreboard.tsx`). The light rail must not change, and the dark one
 * must not answer to the first-run tour or draw the rail's hairline. Offline.
 */
const loader = createLoader({ stubs: {} });

const rail = loader.load(
  "src/components/dashboard/matches/match-detail/rail-scoreboard.tsx",
) as { RailScoreboard: React.ComponentType<RailScoreboardProps> };

/** Lee serving at 30-15, 3-2 in the first set. */
const LIVE: RailScoreboardProps = {
  status: "live",
  label: "Paused",
  headTime: "12:45",
  caption: "Backhand Winner",
  players: [
    { id: "you", name: "Lee", sets: [3], points: "30", serving: true },
    { id: "opp", name: "Vargas", sets: [2], points: "15", serving: false },
  ],
};

const render = (props: RailScoreboardProps) =>
  renderToStaticMarkup(React.createElement(rail.RailScoreboard, props));

test.describe("RailScoreboard tones", () => {
  test("light (the default) is the rail as it was: tour anchor, hairline, blue clock", () => {
    const html = render(LIVE);
    expect(html).toContain('data-tour="scoreboard"');
    expect(html).toContain("border-b border-[var(--border-hairline)]");
    expect(html).toContain("color:var(--blue)");
    expect(html).toContain('fill="var(--ink-600)"');
  });

  test("dark has no tour anchor or hairline, and paints white on the film", () => {
    const html = render({ ...LIVE, tone: "dark" });
    expect(html).not.toContain("data-tour");
    expect(html).not.toContain("border-hairline");
    expect(html).not.toContain("var(--ink-");
    // The dark ramp's blue on the clock, white names and points.
    expect(html).toContain("color:#60A5FA");
    expect(html).toMatch(/color:#FFFFFF[^>]*>Lee</);
    expect(html).toMatch(/color:#FFFFFF[^>]*>30</);
    // The server's caret, and the caption, still render.
    expect(html).toContain('aria-label="Serving"');
    expect(html).toContain("Backhand Winner");
  });
});
