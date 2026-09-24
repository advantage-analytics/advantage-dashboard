import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchFilmEntry } from "@/lib/match-video/film-entry";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Film empty state against the workspace's match-video allowance (T6).
 *
 * Rendered offline through `fixtures/vm-modules` — only the match provider
 * and `next/link` are stubbed, so the copy, the hrefs and the count come from
 * the real component and the real `film-entry.ts` helpers. The anatomy (icon,
 * rule, heading) is the same in every state; only the body, the button and
 * the micro line move.
 */

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const HOLDER_ID = "22222222-2222-4222-8222-222222222222";

function render(quota: MatchFilmEntry["quota"]): string {
  const loader = createLoader({
    stubs: {
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({
          match: { id: MATCH_ID, sourceProvider: "swing-vision" },
        }),
      },
      "next/link": ({
        href,
        children,
        ...rest
      }: React.PropsWithChildren<{ href: string }>) =>
        React.createElement("a", { href, ...rest }, children),
    },
  });
  const { FilmEmptyState } = loader.load(
    "src/components/dashboard/matches/match-detail/film/film-empty-state.tsx",
  ) as { FilmEmptyState: React.ComponentType<{ entry: MatchFilmEntry }> };
  const entry: MatchFilmEntry = {
    attachment: "absent",
    actions: ["add"],
    problem: null,
    quota,
  };
  return renderToStaticMarkup(React.createElement(FilmEmptyState, { entry }));
}

/** Rendered text with tags stripped and entities decoded. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
}

function expectAnatomy(html: string) {
  expect(html).toContain("<svg");
  expect(html).toMatch(/<h2[^>]*>No video for this match<\/h2>/);
}

test("a null quota keeps today's copy", () => {
  const html = render(null);
  expectAnatomy(html);
  const t = text(html);
  expect(t).toContain(
    "The statistics came from a SwingVision export. Add the film and every point below becomes a clip you can jump to.",
  );
  expect(t).toContain("Add video");
  expect(t).toContain(
    "MP4 up to 8 GB · we index the points, you keep the file",
  );
  expect(t).not.toContain("match video used");
  expect(hrefs(html)).toEqual([
    `/dashboard/matches/new?videoFor=${MATCH_ID}&mode=add`,
  ]);
});

test("under the cap, only the micro line changes: it counts", () => {
  const html = render({ used: 0, cap: 1, holder: null });
  expectAnatomy(html);
  const t = text(html);
  expect(t).toContain(
    "The statistics came from a SwingVision export. Add the film and every point below becomes a clip you can jump to.",
  );
  expect(t).toContain("Add video");
  expect(t).toContain("MP4 up to 8 GB · 0 of 1 match video used");
  expect(t).not.toContain("we index the points");
  expect(hrefs(html)).toEqual([
    `/dashboard/matches/new?videoFor=${MATCH_ID}&mode=add`,
  ]);

  // Plural past a cap of one.
  expect(text(render({ used: 3, cap: 25, holder: null }))).toContain(
    "MP4 up to 8 GB · 3 of 25 match videos used",
  );
});

test("at the personal cap, the button opens the match holding the video", () => {
  const html = render({
    used: 1,
    cap: 1,
    holder: {
      matchId: HOLDER_ID,
      playerName: "Marcus Reid",
      opponentName: "Daniel Cho",
      date: "2026-08-30",
    },
  });
  expectAnatomy(html);
  const t = text(html);
  expect(t).toContain(
    "The statistics came from a SwingVision export. Your one match video is on Marcus Reid vs Daniel Cho (Aug 30). Remove it there to add the film here; the statistics on both matches stay.",
  );
  expect(t).toContain("Open Reid vs Cho");
  expect(t).not.toContain("Add video");
  expect(t).toContain("1 of 1 match video used");
  expect(t).not.toContain("MP4 up to");
  expect(hrefs(html)).toEqual([`/dashboard/matches/${HOLDER_ID}?tab=film`]);
});

test("at the team cap, the button manages the team's match videos", () => {
  const html = render({ used: 25, cap: 25, holder: null });
  expectAnatomy(html);
  const t = text(html);
  expect(t).toContain(
    "The statistics came from a SwingVision export. Your team has used all 25 match videos. Remove one, usually from a match nobody watches any more, to add the film here.",
  );
  expect(t).toContain("Manage match videos");
  expect(t).not.toContain("Add video");
  expect(t).toContain("25 of 25 match videos used");
  expect(t).not.toContain("MP4 up to");
  expect(hrefs(html)).toEqual(["/dashboard/settings/usage"]);
});
