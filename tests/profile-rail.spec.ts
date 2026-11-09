import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";
import type { PlayerProfile } from "@/lib/data/player-profile-server";

/**
 * The player profile's rail (design Q), rendered offline from the real
 * `profile-rail.tsx` and `profile-frame.tsx` through `createLoader()`. The
 * report frame's parts are thin stand-ins that keep the rail's `label`, so
 * the landmark name is checked; `next/link` is a plain `<a>`, `FormStrip` a
 * marker, and `viewRowClass` a stub that names the active row.
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

function render(
  props: {
    profile?: Partial<PlayerProfile>;
    isSelf?: boolean;
    newMatchHref?: string | null;
    matchesCount?: number;
    opponentsCount?: number;
  } = {},
  query = "",
) {
  const loader = createLoader({
    stubs: {
      "next/link": { __esModule: true, default: LinkStub },
      "next/navigation": {
        usePathname: () => "/dashboard/team/roster/pp-1",
        useSearchParams: () => new URLSearchParams(query),
      },
      "@/components/dashboard/matches/match-detail/match-report": {
        MatchReportRail: ({
          label = "Match summary",
          children,
        }: {
          label?: string;
          children?: React.ReactNode;
        }) => React.createElement("aside", { "aria-label": label }, children),
        MatchReportSpacer: marker("MatchReportSpacer"),
        MatchReportRailFooter: ({ children }: { children?: React.ReactNode }) =>
          React.createElement("footer", null, children),
      },
      "@/components/dashboard/matches/match-detail/report-view-switcher": {
        viewRowClass: (active: boolean) => (active ? "row active" : "row"),
      },
      "@/components/dashboard/shared/form-strip": {
        FormStrip: marker("FormStrip"),
      },
    },
  });
  const { ProfileRail } = loader.load(
    "src/components/dashboard/team/player-profile/profile-rail.tsx",
  ) as { ProfileRail: React.FC<Record<string, unknown>> };

  const profile = {
    playerId: "pp-1",
    name: "Maya Chen",
    firstName: "Maya",
    classYear: "Junior",
    lineupSpot: 2,
    hand: "right",
    backhand: "two-handed",
    wins: 3,
    losses: 1,
    form: [{}, {}],
    managedBy: "player",
    ...props.profile,
  };

  return renderToStaticMarkup(
    React.createElement(ProfileRail, {
      profile,
      isSelf: props.isSelf ?? false,
      photoUrl: null,
      matchesCount: props.matchesCount ?? 12,
      opponentsCount: props.opponentsCount ?? 9,
      newMatchHref:
        props.newMatchHref === undefined
          ? "/dashboard/matches/new?player=pp-1"
          : props.newMatchHref,
    }),
  );
}

test("the rail is the Player summary landmark", () => {
  expect(render()).toContain('aria-label="Player summary"');
});

test("the player block: name, facts, record with form, and how they play", () => {
  const html = render();
  expect(html).toContain("Maya Chen");
  expect(html).toContain("Junior · Singles 2");
  expect(html).toContain("3–1");
  expect(html).toContain('data-component="FormStrip"');
  expect(html).toContain("<dt");
  expect(html).toContain(">Record<");
  expect(html).toContain(">Plays<");
  expect(html).toContain("Right · Two-handed");
  // No pill on a teammate's claimed page.
  expect(html).not.toContain(">You<");
  expect(html).not.toContain("Coach-managed");
});

test("an unrecorded fact is left out, not drawn as a dash", () => {
  const html = render({
    profile: { classYear: null, lineupSpot: null, hand: null, backhand: null },
  });
  expect(html).not.toContain("Singles");
  expect(html).not.toContain("·");
  expect(html).not.toContain("handed");
  expect(html).not.toContain(">Plays<");
});

test("You on the viewer's own page; Coach-managed on an unclaimed teammate's", () => {
  expect(render({ isSelf: true })).toContain(">You<");
  const managed = render({ profile: { managedBy: "coach" } });
  expect(managed).toContain("Coach-managed");
  expect(managed).not.toContain(">You<");
  // Their own page never says Coach-managed.
  expect(
    render({ isSelf: true, profile: { managedBy: "coach" } }),
  ).not.toContain("Coach-managed");
});

test("two tabs in report-switcher markup, Statistics by default", () => {
  const html = render();
  expect(html).toContain('role="tablist"');
  expect(html.match(/role="tab"/g)).toHaveLength(2);
  expect(html).toMatch(
    /aria-selected="true" class="row active"[^>]*>.*?Statistics/,
  );
  expect(html).toMatch(
    /aria-selected="false" class="row"[^>]*>.*?Visualizations/,
  );
});

test("?tab=visualizations selects the second row", () => {
  const html = render({}, "tab=visualizations");
  expect(html).toMatch(
    /aria-selected="true" class="row active"[^>]*>.*?Visualizations/,
  );
});

test("the links carry what each page filters by, and pluralise", () => {
  const html = render();
  // Matches by roster id in either seat (`?rosterPlayer=`), never the
  // `?player=` name facet, which reads seat one only.
  expect(html).toContain('href="/dashboard/matches?rosterPlayer=pp-1"');
  expect(html).not.toContain("matches?player=");
  expect(html).toContain("12 matches");
  expect(html).toContain('href="/dashboard/opponents?facedBy=pp-1"');
  expect(html).toContain("9 opponents");
  const one = render({ matchesCount: 1, opponentsCount: 1 });
  expect(one).toContain("1 match<");
  expect(one).toContain("1 opponent<");
});

test("a count of zero is plain text, not a link to an empty page", () => {
  const html = render({ matchesCount: 3, opponentsCount: 0 });
  expect(html).toContain('href="/dashboard/matches?rosterPlayer=pp-1"');
  expect(html).not.toContain("facedBy=");
  expect(html).toMatch(/<span[^>]*>0 opponents<\/span>/);

  const none = render({ matchesCount: 0, opponentsCount: 0 });
  expect(none).not.toContain("/dashboard/matches?");
  expect(none).toMatch(/<span[^>]*>0 matches<\/span>/);
});

test("New match fills the footer only when the viewer can upload", () => {
  const html = render();
  expect(html).toMatch(
    /<footer><a href="\/dashboard\/matches\/new\?player=pp-1" class="[^"]*w-full[^"]*">New match<\/a><\/footer>/,
  );
  const none = render({ newMatchHref: null });
  expect(none).not.toContain("New match");
  expect(none).not.toContain("<footer>");
});
