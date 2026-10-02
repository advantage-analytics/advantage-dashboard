import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Match } from "@/lib/data/types";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Share popover (`share-match-button.tsx`), rendered offline to static
 * markup. Its first block is a two-rung access ladder drawn as check-dot
 * radios; what sits under it follows the chosen rung.
 *
 *  - Personal, private: "Only you" is chosen and nothing on the panel hands
 *    out a URL — no pill, no `mailto:`, no `/m/` — because the only link it
 *    could offer is a `/dashboard` one that bounces everyone else to sign-in.
 *  - Public: "Anyone with the link" is chosen, the pill shows the PUBLIC
 *    `/m/<token>` link, and "Email this match" carries that same link.
 *  - Team, private: the program's rung is chosen and the pill holds the
 *    match's `/dashboard` URL, which only a signed-in member can open.
 *  - A teammate who cannot publish: the ladder is unavailable (aria-disabled,
 *    never removed from the tab order) and the note names who can.
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
    share: {
      link: { url: string } | null;
      canShare: boolean;
      publicLinkOn: boolean;
      audience: unknown;
    };
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
const TEAM_URL = "https://app.example.com/dashboard/matches/" + MATCH.id;
const TEAM = {
  kind: "team",
  programName: "Meridian State",
  teamUrl: TEAM_URL,
  memberCount: 14,
  faces: [
    { name: "Alina Fischer", initials: "AF", photoUrl: null },
    { name: "Marcus Reyes", initials: "MR", photoUrl: null },
    { name: "Ava Watson", initials: "AW", photoUrl: null },
  ],
};

function render(
  shareLink: { url: string } | null,
  {
    canShare = true,
    audience = { kind: "personal" },
    publicLinkOn = shareLink !== null,
  }: { canShare?: boolean; audience?: unknown; publicLinkOn?: boolean } = {},
) {
  return renderToStaticMarkup(
    React.createElement(SharePopoverPanel, {
      match: MATCH,
      share: { link: shareLink, canShare, audience, publicLinkOn },
      onClose: () => {},
    }),
  );
}

/** Each rung's opening tag, in order. */
function rungTags(html: string): string[] {
  return html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
}

/** The label text of each rung, in order, with whether it is checked. */
function rungs(html: string): { label: string; checked: boolean }[] {
  return [
    ...html.matchAll(/<button([^>]*role="radio"[^>]*)>(.*?)<\/button>/g),
  ].map((m) => ({
    label: m[2].match(/leading-\[18px\][^>]*>([^<]*)</)?.[1] ?? "",
    checked: m[1].includes('aria-checked="true"'),
  }));
}

test("personal, private: Only you is chosen and no link of any kind is offered", () => {
  const html = render(null);
  expect(html).toContain('role="radiogroup"');
  expect(rungs(html)).toEqual([
    { label: "Only you", checked: true },
    { label: "Anyone with the link", checked: false },
  ]);
  expect(html).toContain("Links show statistics only — never the video.");
  expect(html).not.toContain("mailto:");
  expect(html).not.toContain("/m/");
  expect(html).not.toContain("/dashboard/");
  expect(html).not.toContain("Copy");
});

test("public: Anyone is chosen and the public link is what gets copied and mailed", () => {
  const html = render({ url: PUBLIC_URL });
  expect(rungs(html).map((r) => r.checked)).toEqual([false, true]);
  expect(html).toContain("app.example.com/m/abc123");
  expect(html).toContain("Copy");
  const mailto = html.match(/href="mailto:[^"]*"/)?.[0] ?? "";
  expect(mailto).not.toBe("");
  expect(decodeURIComponent(mailto.replace(/&amp;/g, "&"))).toContain(
    PUBLIC_URL,
  );
  expect(html).toContain(">Email</a>");
});

test("team, private: the program's rung carries the faces and the team link", () => {
  const html = render(null, { audience: TEAM });
  expect(rungs(html)).toEqual([
    { label: "Meridian State", checked: true },
    { label: "Anyone with the link", checked: false },
  ]);
  expect(html).toContain("+11");
  expect(html).toContain("14 people");
  expect(html).toContain("app.example.com/dashboard/matches/");
  expect(html).not.toContain("/m/");
  expect(html).not.toContain("mailto:");
});

test("a teammate who cannot publish sees the ladder unavailable and who can", () => {
  const html = render(null, { canShare: false, audience: TEAM });
  const tags = rungTags(html);
  expect(tags).toHaveLength(2);
  for (const tag of tags) {
    expect(tag).toContain('aria-disabled="true"');
    expect(tag).not.toMatch(/\sdisabled=""/);
  }
  expect(html).toContain("Ava Watson or team staff can make a public link.");
  expect(html).toContain("app.example.com/dashboard/matches/");
  expect(html).not.toContain("mailto:");
});

test("arrow keys cannot choose: rungs are buttons with one roving tab stop", () => {
  // A native radio selects on arrow, and choosing "Anyone" publishes the
  // match — so the rungs must not be native radios, and only the chosen one
  // may take the tab stop.
  const html = render(null);
  expect(html).not.toMatch(/<input[^>]*type="radio"/);
  const tags = rungTags(html);
  expect(tags).toHaveLength(2);
  expect(tags[0]).toContain('tabindex="0"');
  expect(tags[1]).toContain('tabindex="-1"');
});

test("a non-member viewing a team match gets no team link, faces or count", () => {
  const html = render(null, {
    audience: {
      kind: "team",
      programName: null,
      teamUrl: null,
      memberCount: null,
      faces: [],
    },
  });
  expect(rungs(html)).toEqual([
    { label: "The team", checked: true },
    { label: "Anyone with the link", checked: false },
  ]);
  expect(html).not.toContain("/dashboard/");
  expect(html).not.toContain("Copy");
  expect(html).not.toContain("people");
  expect(html).not.toContain("Teammates sign in");
});

test("a teammate is told when a public link is already on", () => {
  const html = render(null, {
    canShare: false,
    audience: TEAM,
    publicLinkOn: true,
  });
  expect(rungs(html).map((r) => r.checked)).toEqual([false, true]);
  expect(html).toContain(
    "A public link is on. Ava Watson or team staff can copy it.",
  );
  expect(html).not.toContain("/m/");
});

test("the email subject never carries the Unknown Event placeholder", () => {
  const html = renderToStaticMarkup(
    React.createElement(SharePopoverPanel, {
      match: { ...MATCH, tournamentName: "Unknown Event" },
      share: {
        link: { url: PUBLIC_URL },
        canShare: true,
        publicLinkOn: true,
        audience: { kind: "personal" },
      },
      onClose: () => {},
    }),
  );
  const mailto = decodeURIComponent(
    (html.match(/href="mailto:[^"]*"/)?.[0] ?? "").replace(/&amp;/g, "&"),
  );
  expect(mailto).toContain("subject=Match: Ava Watson vs Mia Reid");
  expect(mailto).not.toContain("Unknown Event");
});
