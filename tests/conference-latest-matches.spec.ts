import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminConferenceLatestMatch } from "@/lib/data/admin-conferences-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `TeamLatestMatches` drawn both ways (T17): on the team page every row and
 * the "All N in Matches" link share the page's program; on the conference
 * page each row goes to its own match's program, names it, and the header
 * link is left off.
 *
 * Rendered offline through `fixtures/vm-modules`. `next/link` becomes a plain
 * anchor; the status mark and the upload time are stubbed to nothing, since
 * what is asserted is the hrefs and the words around them.
 */

function load() {
  const loader = createLoader({
    stubs: {
      "next/link": {
        __esModule: true,
        default: ({
          href,
          children,
          ...rest
        }: {
          href: string;
          children: React.ReactNode;
        }) => React.createElement("a", { href, ...rest }, children),
      },
      "@/components/admin/admin-people-card": { TEAM_LIST_GRID: "grid" },
      "@/components/admin/matches/matches-page-content": {
        MatchStatus: () => null,
        UploadedAt: () => null,
      },
    },
  });
  return loader.load("src/components/admin/team-latest-matches.tsx") as {
    TeamLatestMatches: React.ComponentType<Record<string, unknown>>;
  };
}

function html(props: Record<string, unknown>): string {
  const { TeamLatestMatches } = load();
  return renderToStaticMarkup(React.createElement(TeamLatestMatches, props));
}

function match(
  id: string,
  programId: string,
  programName: string,
): AdminConferenceLatestMatch {
  return {
    id,
    programId,
    programName,
    player: `Player ${id}`,
    opponent: `Opponent ${id}`,
    uploadedAt: "2026-11-10T12:00:00Z",
    analysis: {
      kind: "none",
    } as unknown as AdminConferenceLatestMatch["analysis"],
    bucket: "ready" as AdminConferenceLatestMatch["bucket"],
  };
}

const CONFERENCE_MATCHES = [
  match("m1", "stanford", "Stanford Women's Tennis"),
  match("m2", "cal", "Cal Men's Tennis"),
];

test.describe("TeamLatestMatches", () => {
  test("conference rows link into each match's own program and name it", () => {
    const markup = html({ scope: "conference", matches: CONFERENCE_MATCHES });
    expect(markup).toContain(
      'href="/admin/matches?program=stanford&amp;id=m1"',
    );
    expect(markup).toContain('href="/admin/matches?program=cal&amp;id=m2"');
    expect(markup).toContain("Stanford Women&#x27;s Tennis");
    expect(markup).toContain("Cal Men&#x27;s Tennis");
    // No "All N in Matches": Matches has no conference filter.
    expect(markup).not.toContain("in Matches");
    expect(markup).not.toMatch(/href="\/admin\/matches\?program=[^"&]*"/);
  });

  test("team rows and the header link keep the page's programId", () => {
    const markup = html({
      programId: "stanford",
      matches: [match("m1", "stanford", "Stanford Women's Tennis")],
      matchCount: 12,
    });
    expect(markup).toContain('href="/admin/matches?program=stanford"');
    expect(markup).toContain("All 12 in Matches");
    expect(markup).toContain(
      'href="/admin/matches?program=stanford&amp;id=m1"',
    );
    // The team page prints no program name: every row is its own program.
    expect(markup).not.toContain("Stanford Women");
  });

  test("the team variant says All in Matches when the count failed", () => {
    const markup = html({
      programId: "stanford",
      matches: [],
      matchCount: null,
    });
    expect(markup).toContain('href="/admin/matches?program=stanford"');
    expect(markup).toContain("All in Matches");
    expect(markup).toContain("No matches uploaded yet.");
  });
});
