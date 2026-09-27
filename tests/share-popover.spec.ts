import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Match } from "@/lib/data/types";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Share popover's two states (`share-match-button.tsx`), rendered
 * offline to static markup.
 *
 *  - Off: the switch reads unchecked, the panel says who can see the match
 *    today, and nothing on it hands out a URL — no pill, no `mailto:`,
 *    no `/m/` — because the only link it could offer is a `/dashboard` one
 *    that bounces everyone else to sign-in.
 *  - On: the switch reads checked, the pill shows the PUBLIC `/m/<token>`
 *    link, and "Email this match" carries that same link in its body.
 */

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
    "@/components/ui/popover": {
      Popover: passthrough("div"),
      PopoverContent: passthrough("div"),
      PopoverTrigger: passthrough("div"),
    },
    "@/app/dashboard/matches/(detail)/[matchId]/share-actions": {
      enableMatchShare: async () => ({ ok: true, url: null }),
      disableMatchShare: async () => ({ ok: true, url: null }),
    },
  },
});

const { SharePopoverPanel } = loader.load(
  "src/components/dashboard/matches/match-detail/share-match-button.tsx",
) as {
  SharePopoverPanel: React.ComponentType<{
    match: Match;
    shareLink: { url: string } | null;
    canShare: boolean;
    onClose: () => void;
  }>;
};

const MATCH: Match = {
  id: "11111111-2222-4333-8444-555555555555",
  tournamentName: "Spring Invitational",
  date: "March 4, 2026",
  matchType: "Singles",
  player1: { name: "Ava Watson", school: "" },
  player2: { name: "Mia Reid", school: "" },
  score: {
    sets: [{ player1: 6, player2: 4 }],
    winner: "player1",
    finalScore: "6-4",
  },
  won: true,
  isUserPlayer1: true,
};

const PUBLIC_URL = "https://app.example.com/m/abc123";

function render(shareLink: { url: string } | null, canShare = true) {
  return renderToStaticMarkup(
    React.createElement(SharePopoverPanel, {
      match: MATCH,
      shareLink,
      canShare,
      onClose: () => {},
    }),
  );
}

test("off: the switch is unchecked and no link of any kind is offered", () => {
  const html = render(null);
  expect(html).toContain('role="switch"');
  expect(html).toContain('aria-checked="false"');
  expect(html).toContain("Turn this on to get a link anyone can view.");
  expect(html).not.toContain("mailto:");
  expect(html).not.toContain("/m/");
  expect(html).not.toContain("Copy");
});

test("on: the switch is checked and the public link is what gets copied and mailed", () => {
  const html = render({ url: PUBLIC_URL });
  expect(html).toContain('aria-checked="true"');
  expect(html).toContain("app.example.com/m/abc123");
  expect(html).toContain("Statistics only. No video.");
  expect(html).toContain("Copy");
  const mailto = html.match(/href="mailto:[^"]*"/)?.[0] ?? "";
  expect(mailto).not.toBe("");
  expect(decodeURIComponent(mailto.replace(/&amp;/g, "&"))).toContain(
    PUBLIC_URL,
  );
  expect(html).toContain("Email this match");
});

test("a viewer who cannot share sees the switch disabled and who can", () => {
  const html = render(null, false);
  expect(html).toMatch(
    /role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/,
  );
  expect(html).toContain(
    "Only the player, whoever uploaded it, or a coach can share this match.",
  );
  expect(html).not.toContain("Turn this on");
  expect(html).not.toContain("mailto:");
});

test("the email subject never carries the Unknown Event placeholder", () => {
  const html = renderToStaticMarkup(
    React.createElement(SharePopoverPanel, {
      match: { ...MATCH, tournamentName: "Unknown Event" },
      shareLink: { url: PUBLIC_URL },
      canShare: true,
      onClose: () => {},
    }),
  );
  const mailto = decodeURIComponent(
    (html.match(/href="mailto:[^"]*"/)?.[0] ?? "").replace(/&amp;/g, "&"),
  );
  expect(mailto).toContain("subject=Match: Ava Watson vs Mia Reid");
  expect(mailto).not.toContain("Unknown Event");
});
