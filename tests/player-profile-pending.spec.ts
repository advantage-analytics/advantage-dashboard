import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PROFILE_VIEWS } from "@/components/dashboard/team/player-profile/profile-view";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The team player profile's skeleton (`roster/[playerId]/loading.tsx`, and
 * the page's Statistics Suspense fallback). Offline, as
 * `match-report-pending.spec.ts` does it: rendered to static markup and read
 * as text — the Carbon/DS contract, not pixels.
 *
 *   - one `role="status"` per region, labelled "Loading …"
 *   - every bar is `aria-hidden` and in the skeleton token, motion-safe
 *   - the chrome the page already knows is real text: the view names on the
 *     rail (drawn by `viewRowClass`), the pane's `<h1>`, the insight card's
 *     engine credit, the head-to-head group labels and the four chart
 *     eyebrows
 *   - nothing interactive (no `<button>`) and no hex colour
 */

type View = (typeof PROFILE_VIEWS)[number]["value"];

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
    "next/navigation": {
      useSearchParams: () => new URLSearchParams(),
      usePathname: () => "/dashboard/team/roster/p1",
    },
    "next/image": { __esModule: true, default: passthrough("img") },
    "next/link": { __esModule: true, default: passthrough("a") },
    "framer-motion": {
      useReducedMotion: () => true,
      motion: new Proxy({}, { get: (_, tag) => passthrough(String(tag)) }),
      AnimatePresence: passthrough("div"),
    },
  },
});

const PENDING = "src/components/dashboard/loading/player-profile-pending.tsx";
const { PlayerProfilePending, ProfileStatisticsPanePending } = loader.load(
  PENDING,
) as {
  PlayerProfilePending: React.ComponentType<{ view: View }>;
  ProfileStatisticsPanePending: React.ComponentType;
};
const { StatisticsPanePending, H2H_GROUP_SHAPE } = loader.load(
  "src/components/dashboard/loading/match-report-pending.tsx",
) as {
  StatisticsPanePending: React.ComponentType;
  H2H_GROUP_SHAPE: readonly { title: string; rows: number }[];
};
const { viewRowClass } = loader.load(
  "src/components/dashboard/matches/match-detail/report-view-switcher.tsx",
) as { viewRowClass: (active: boolean) => string };
// tailwind-merge drops viewRowClass's `cursor-pointer` for `cursor-default`.
const { cn } = loader.load("src/lib/utils.ts") as {
  cn: (...classes: string[]) => string;
};
const { H2H_GROUPS } = loader.load(
  "src/components/dashboard/matches/match-detail/head-to-head-rows.ts",
) as { H2H_GROUPS: { title: string; configs: unknown[] }[] };

function render(view: View) {
  return renderToStaticMarkup(
    React.createElement(PlayerProfilePending, { view }),
  );
}

const pane = () =>
  renderToStaticMarkup(React.createElement(ProfileStatisticsPanePending));

const CHART_EYEBROWS = [
  "Performance tracker",
  "How points ended",
  "Rally length",
  "Net game",
] as const;

/** Every "Loading …" status the markup announces, in order. */
function statuses(html: string): string[] {
  return [...html.matchAll(/role="status" aria-label="(Loading [^"]+)"/g)].map(
    (m) => m[1],
  );
}

for (const { value, label } of PROFILE_VIEWS) {
  test(`${value}: the rail regions and the title facts each announce one status`, () => {
    const found = statuses(render(value));
    for (const region of [
      "Loading player summary",
      "Loading player links",
      "Loading match count",
      "Loading analyzed count",
    ])
      expect(found.filter((s) => s === region)).toHaveLength(1);
    expect(found.includes("Loading statistics")).toBe(value === "statistics");
  });

  test(`${value}: the title is real text and the rail rows are viewRowClass rows`, () => {
    const html = render(value);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${label}</h1>`));
    for (const view of PROFILE_VIEWS) {
      const cls = cn(viewRowClass(view.value === value), "cursor-default");
      expect(html).toContain(`<div class="${cls}">`);
      expect(html).toContain(`>${view.label}</span>`);
    }
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
  });
}

test("rail: avatar, name and facts are bars, and a bar stands where New match lands", () => {
  const html = render("statistics");
  // The 40px avatar as a round bar, inside the player block's padding.
  expect(html).toContain("padding:18px 13px 20px");
  expect(html).toMatch(/class="block[^"]*size-10 shrink-0 rounded-full"/);
  // New match: advButton md's 36px, in the rail footer.
  expect(html).toMatch(
    /<div class="p-3"><span aria-hidden="true" class="block[^"]*h-9 /,
  );
  // No player name, count or pill is invented.
  expect(html).not.toMatch(/\d+ (matches|opponents|analyzed)/);
});

test("statistics pane: the insight card is INSIGHT_SURFACE with the engine credit and no toggle", () => {
  const html = pane();
  expect(statuses(html)).toEqual(["Loading statistics"]);
  expect(html).toContain('aria-label="Advantage Intelligence summary"');
  expect(html).toContain(">Advantage Intelligence</span>");
  // `ProfileInsightEmpty` has no fold toggle, so neither does its skeleton —
  // the report's (`StatisticsPanePending`) keeps its 24px square.
  expect(html).not.toContain("size-6 rounded-[var(--radius-element)]");
  const report = renderToStaticMarkup(
    React.createElement(StatisticsPanePending),
  );
  expect(report).toContain("size-6 rounded-[var(--radius-element)]");
});

test("statistics pane: head-to-head group labels and the four chart eyebrows are text, in order", () => {
  const html = pane();
  expect(html).toContain('<span class="eyebrow">Head to head</span>');
  for (const { title } of H2H_GROUP_SHAPE)
    expect(html).toContain(`>${title}</span>`);
  const at = CHART_EYEBROWS.map((e) =>
    html.indexOf(`<span class="eyebrow">${e}</span>`),
  );
  for (const i of at) expect(i).toBeGreaterThan(-1);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
});

test("statistics pane: T7's geometry — the 1:1 row, the chart column and no set labels", () => {
  const html = pane();
  expect(html).toContain("flex shrink-0 flex-col gap-4 @min-[720px]:flex-row");
  expect(html).toContain("flex min-w-0 flex-1 flex-col gap-4 *:shrink-0");
  expect(html).not.toContain("416px");
  // The season tracker has no set-label row; the report's does.
  const report = renderToStaticMarkup(
    React.createElement(StatisticsPanePending),
  );
  expect(report).toContain("Net game");
  expect(report).not.toContain("416px");
  expect(report.match(/justify-center"><span aria-hidden/g)?.length).toBe(1);
  expect(html.match(/justify-center"><span aria-hidden/g)).toBeNull();
});

test("statistics pane: the loaded view's row and column classes are the skeleton's", () => {
  const view = readFileSync(
    "src/components/dashboard/team/player-profile/profile-statistics-view.tsx",
    "utf8",
  );
  expect(view).toContain(
    '"flex shrink-0 flex-col gap-4 @min-[720px]:flex-row"',
  );
  expect(view).toContain('"flex min-w-0 flex-1 flex-col gap-4 *:shrink-0"');
});

test("head-to-head group shape matches the table's real groups", () => {
  expect(
    H2H_GROUPS.map((g) => ({ title: g.title, rows: g.configs.length })),
  ).toEqual(H2H_GROUP_SHAPE.map((g) => ({ ...g })));
});

test("the page and the route use the profile skeleton", () => {
  const page = readFileSync(
    "src/app/dashboard/team/roster/[playerId]/page.tsx",
    "utf8",
  );
  expect(page).toContain("<ProfileStatisticsPanePending />");
  expect(page).toContain("<AnalyzedCountPending />");
  expect(page).not.toContain("<StatisticsPanePending />");
  const loading = readFileSync(
    "src/app/dashboard/team/roster/[playerId]/loading.tsx",
    "utf8",
  );
  expect(loading).toContain("<PlayerProfileSkeleton />");
});
