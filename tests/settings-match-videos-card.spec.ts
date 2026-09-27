import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  MatchVideoUsage,
  MatchVideoUsageRow,
} from "@/lib/data/match-video-usage-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Settings › Usage & quota's match-videos card (SwingVision Add video T7).
 *
 * Rendered offline through `fixtures/vm-modules`: only the crest and the
 * Radix confirm dialog are stubbed, so the copy, grouping, expiry pill and the
 * Remove rule come from the real component and the real `expiry.ts`.
 */

const VIEWER = "11111111-1111-4111-8111-111111111111";
const COACH = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-24T12:00:00.000Z";

type CardWorkspace = {
  id: string;
  kind: "personal" | "team";
  name: string;
  mark: string;
  iconUrl: string | null;
  team: "mens" | "womens" | null;
  role: "owner" | "coach" | "staff" | "player";
  timeZone: string;
};

type CardProps = {
  workspace: CardWorkspace;
  viewerId: string;
  initial: MatchVideoUsage;
  names: Record<string, string>;
  now: string;
};

function load() {
  const loader = createLoader({
    stubs: {
      "@/components/dashboard/workspace-mark": {
        WorkspaceMark: () =>
          React.createElement("span", { "data-workspace-mark": "" }),
      },
      "@/components/ui/confirm-dialog": {
        ConfirmDialog: () => null,
      },
    },
  });
  return loader.load(
    "src/components/dashboard/settings/match-videos-usage-card.tsx",
  ) as {
    MatchVideosUsageCard: React.ComponentType<CardProps>;
    MATCH_VIDEOS_FOOTNOTE: string;
  };
}

let seq = 0;
function row(
  uploadedBy: string | null,
  overrides: Partial<MatchVideoUsageRow> = {},
): MatchVideoUsageRow {
  seq += 1;
  return {
    attachmentId: `a-${seq}`,
    matchId: `m-${seq}`,
    uploadedBy,
    verifiedSizeBytes: 3_000_000_000,
    activatedAt: "2026-09-01T10:00:00.000Z",
    lastViewedAt: "2026-09-10T10:00:00.000Z",
    player1Name: "Sam Reid",
    player2Name: "Ola Okafor",
    matchDate: "2025-09-20T00:00:00.000Z",
    ...overrides,
  };
}

const TEAM: CardWorkspace = {
  id: "p-1",
  kind: "team",
  name: "Cardinal",
  mark: "C",
  iconUrl: null,
  team: "mens",
  role: "player",
  timeZone: "UTC",
};

const PERSONAL: CardWorkspace = {
  id: VIEWER,
  kind: "personal",
  name: "Personal",
  mark: "P",
  iconUrl: null,
  team: null,
  role: "owner",
  timeZone: "UTC",
};

const NAMES = {
  [VIEWER]: "Jamie Viewer",
  [COACH]: "Coach Hale",
  [OTHER]: "Alex Other",
};

/** Coach Hale 3 videos (one near expiry), viewer 1, other 2. */
function teamRows(): MatchVideoUsageRow[] {
  return [
    row(OTHER),
    row(COACH, {
      // Unwatched since Oct 23 2025 → expires Oct 23 2026, inside 30 days.
      activatedAt: "2025-10-23T12:00:00.000Z",
      lastViewedAt: null,
    }),
    row(VIEWER, { lastViewedAt: "2026-03-03T12:00:00.000Z" }),
    row(COACH),
    row(OTHER),
    row(COACH),
  ];
}

function render(
  workspace: CardWorkspace,
  rows: MatchVideoUsageRow[],
  cap: number,
): string {
  const { MatchVideosUsageCard } = load();
  return renderToStaticMarkup(
    React.createElement(MatchVideosUsageCard, {
      workspace,
      viewerId: VIEWER,
      initial: { used: rows.length, cap, rows },
      names: NAMES,
      now: NOW,
    }),
  );
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function removeButtons(html: string): number {
  return (html.match(/>Remove<\/button>/g) ?? []).length;
}

test("personal workspace: plain title and the 1 / 1 meter", () => {
  const html = render(PERSONAL, [row(VIEWER)], 1);
  const t = text(html);
  expect(t).toContain("Your match videos");
  expect(t).toContain("1 / 1");
  expect(html).not.toContain("data-workspace-mark");
  expect(t).toContain("Jamie Viewer You · 1 video · 3.0 GB");
  expect(t).toContain("Reid vs Okafor · Sep 20, 2025 · Watched Sep 10, 2026");
  expect(removeButtons(html)).toBe(1);
});

test("team workspace: crest title, used / cap, rows by count, footnote", () => {
  const { MATCH_VIDEOS_FOOTNOTE } = load();
  const html = render(TEAM, teamRows(), 25);
  const t = text(html);
  expect(html).toContain("data-workspace-mark");
  expect(t).toContain("Cardinal · Men's · match videos");
  expect(t).toContain("6 / 25");

  const hale = t.indexOf("Coach Hale · 3 videos · 9.0 GB");
  const other = t.indexOf("Alex Other · 2 videos · 6.0 GB");
  const viewer = t.indexOf("Jamie Viewer You · 1 video · 3.0 GB");
  expect(hale).toBeGreaterThanOrEqual(0);
  expect(other).toBeGreaterThan(hale);
  expect(viewer).toBeGreaterThan(other);

  expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(3);
  expect(t).toContain("Watched Mar 3, 2026");
  expect(t).toContain("Added Oct 23, 2025");

  expect(MATCH_VIDEOS_FOOTNOTE).toBe(
    "Film added to SwingVision matches, for playback only: it isn't analysed and uses no hours. A video nobody watches for a year is removed; the match and its statistics stay.",
  );
  expect(t).toContain(MATCH_VIDEOS_FOOTNOTE);
});

test("the expiry pill shows only on the person with videos in the window", () => {
  const html = render(TEAM, teamRows(), 25);
  const t = text(html);
  expect((t.match(/\d+ expires? /g) ?? []).length).toBe(1);
  expect(t).toContain("Coach Hale · 3 videos · 9.0 GB 1 expires Oct 23");
});

test("Remove: a player sees their own; a coach and an owner see every row", () => {
  expect(
    removeButtons(render({ ...TEAM, role: "player" }, teamRows(), 25)),
  ).toBe(1);
  expect(
    removeButtons(render({ ...TEAM, role: "staff" }, teamRows(), 25)),
  ).toBe(1);
  expect(
    removeButtons(render({ ...TEAM, role: "coach" }, teamRows(), 25)),
  ).toBe(6);
  expect(
    removeButtons(render({ ...TEAM, role: "owner" }, teamRows(), 25)),
  ).toBe(6);
});

test("no videos: card anatomy plus one honest line", () => {
  const html = render(TEAM, [], 25);
  const t = text(html);
  expect(t).toContain("0 / 25");
  expect(t).toContain(
    "No match videos yet. Film added to a SwingVision match shows here.",
  );
  expect(html).not.toContain("aria-expanded");
  expect(removeButtons(html)).toBe(0);
});
