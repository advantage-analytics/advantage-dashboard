import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * Every admin route has a skeleton of its own. Under `src/app/admin/` only
 * Today's `loading.tsx` existed (and Ask's), so every other route inherited
 * Today's rows and then jumped to a different layout when its data landed.
 *
 * Offline: each route's `loading.tsx` is loaded from source and rendered to
 * static markup. What is asserted is the loading contract
 * (`.skills/advantage-analytics-design/reference/empty-and-loading.md`
 * § Loading Skeleton), not pixels:
 *
 *   - the route has its own `loading.tsx`
 *   - the chrome the page already knows renders as real text — titles,
 *     section headings, column labels, lane names, the "‹" way back
 *   - at least one `role="status"` region, each labelled "Loading …"
 *   - every bar is the shared `PendingBar` (`data-pending-bar`), and the
 *     skeleton never renders Today's title
 *
 * Nothing reaches a server: every server action, the router and `next/link`
 * are stubbed.
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

/** Any server action module: every export throws if a render calls it. */
const actions = new Proxy(
  {},
  {
    get: (_, name) =>
      name === "__esModule"
        ? false
        : async () => {
            throw new Error(`${String(name)} must not run while rendering`);
          },
  },
);

const loader = createLoader({
  stubs: {
    "next/link": { __esModule: true, default: passthrough("a") },
    "next/image": { __esModule: true, default: passthrough("img") },
    "next/navigation": {
      useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
      usePathname: () => "/admin",
      useSearchParams: () => new URLSearchParams(),
      useParams: () => ({ matchId: "match-1" }),
      notFound: () => {
        throw new Error("notFound must not run while rendering");
      },
      redirect: () => {
        throw new Error("redirect must not run while rendering");
      },
    },
    "framer-motion": {
      useReducedMotion: () => true,
      motion: new Proxy({}, { get: (_, tag) => passthrough(String(tag)) }),
      AnimatePresence: passthrough("div"),
    },
    "@/app/admin/seen-actions": actions,
    "@/app/admin/labels/actions": actions,
    "@/app/label/actions": actions,
    "@/app/admin/outreach/actions": actions,
    "@/app/admin/messages/actions": actions,
    "@/app/admin/uploads/new/attachment-actions": actions,
  },
});

interface Route {
  /** The route, as a reader types it. */
  path: string;
  /** Its folder under `src/app/`. */
  dir: string;
  /** Chrome text the skeleton must print as itself. */
  chrome: string[];
}

const ROUTES: Route[] = [
  {
    path: "/admin/labels",
    dir: "admin/labels/(board)",
    chrome: [
      "Labels",
      "Pay report",
      "To do",
      "In progress",
      "Published, to check",
    ],
  },
  {
    path: "/admin/labels/[sessionId]",
    dir: "admin/labels/[sessionId]",
    chrome: ["Labels", "Before you publish", "Entered at upload"],
  },
  {
    path: "/admin/labels/pay",
    dir: "admin/labels/pay",
    chrome: [
      "Pay report",
      "From",
      "To",
      "Show",
      "Labeller",
      "Published h",
      "Checked h",
      "Total h",
      "Sessions",
      "Practice sets",
    ],
  },
  {
    path: "/admin/matches",
    dir: "admin/matches/(list)",
    chrome: [
      "Matches",
      "Upload a match",
      "All",
      "Uploading",
      "Analyzing",
      "Failed",
      "Program",
      "Match",
      "Workspace",
      "Status",
      "Video",
      "Uploaded",
    ],
  },
  {
    path: "/admin/matches/[matchId]",
    dir: "admin/matches/[matchId]",
    chrome: [
      "Matches",
      "Statistics",
      "Share and Ask are hidden while viewing as admin.",
    ],
  },
  {
    path: "/admin/teams",
    dir: "admin/teams/(list)",
    chrome: [
      "Teams",
      "Create team",
      "Programs",
      "Pilot players",
      "Conferences",
      "Division",
      "Program",
      "Members",
      "Video hours this month",
      "Owner",
    ],
  },
  {
    path: "/admin/teams/[programId]",
    dir: "admin/teams/(team)",
    chrome: [
      "Teams",
      "Upload for this team",
      "Details",
      "Conference",
      "Time zone",
      "People",
      "Add player",
      "Latest matches",
    ],
  },
  {
    path: "/admin/conferences",
    dir: "admin/conferences/(list)",
    chrome: [
      "Conferences",
      "Add conference",
      "With teams on Advantage",
      "Missing details",
      "Division",
      "Conference",
      "Teams",
      "On Advantage",
      "Pilot",
    ],
  },
  {
    path: "/admin/conferences/[conferenceId]",
    dir: "admin/conferences/[conferenceId]",
    chrome: [
      "Conferences",
      "Details",
      "Edit",
      "Division",
      "Teams",
      "Add a team",
      "Program",
      "Latest matches",
    ],
  },
  {
    // Only a redirect to Matches, so it waits on Matches' frame.
    path: "/admin/uploads",
    dir: "admin/uploads/(redirect)",
    chrome: ["Matches", "Upload a match", "Program", "Status", "Uploaded"],
  },
  {
    path: "/admin/uploads/new",
    dir: "admin/uploads/new",
    chrome: [
      "Upload a match",
      "What are you adding?",
      "Match file",
      "Match video",
      "Dual result",
      "Tournament result",
    ],
  },
  {
    path: "/admin/requests",
    dir: "admin/requests",
    chrome: [
      "Requests",
      "Waiting on you",
      "Verifying",
      "Live",
      "Closed",
      "Request",
      "Email check",
      "Received",
    ],
  },
  {
    path: "/admin/messages",
    dir: "admin/messages",
    chrome: [
      "Messages",
      "One conversation per player, wherever it started.",
      "Waiting on you",
      "Waiting on them",
      "Started from",
      "Player",
      "Last",
    ],
  },
  {
    path: "/admin/outreach",
    dir: "admin/outreach",
    chrome: [
      "Outreach",
      "Import send list",
      "Cold outreach",
      "Recipients",
      "Edit email",
      "Division",
      "Conference",
      "Recipient",
      "Program",
      "Status",
    ],
  },
  {
    path: "/admin/pilots",
    dir: "admin/pilots",
    chrome: [
      "Pilots",
      "Set hours",
      "Add pilot",
      "Player",
      "This month",
      "Matches",
      "Added",
    ],
  },
];

/** The "‹" way back each detail route keeps, and where it goes. */
const BACK_LINKS: Record<string, { label: string; href: string }> = {
  "/admin/labels/[sessionId]": { label: "Labels", href: "/admin/labels" },
  "/admin/matches/[matchId]": {
    label: "Matches",
    href: "/admin/matches?id=match-1",
  },
  "/admin/teams/[programId]": { label: "Teams", href: "/admin/teams" },
  "/admin/conferences/[conferenceId]": {
    label: "Conferences",
    href: "/admin/conferences",
  },
};

function render(route: Route): string {
  const { default: Loading } = loader.load(
    `src/app/${route.dir}/loading.tsx`,
  ) as { default: React.ComponentType };
  return renderToStaticMarkup(React.createElement(Loading));
}

/** The markup's visible text, tags dropped and entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

for (const route of ROUTES) {
  test.describe(route.path, () => {
    test("has its own loading.tsx", () => {
      expect(existsSync(`src/app/${route.dir}/loading.tsx`)).toBe(true);
    });

    test("renders its chrome as real text, and not Today's", () => {
      const html = render(route);
      const text = textOf(html);
      for (const label of route.chrome)
        expect(text, `"${label}" on ${route.path}`).toContain(label);
      expect(html).not.toContain(">Today<");
    });

    test("announces each loading region once, and draws bars from PendingBar", () => {
      const html = render(route);
      const statuses = html.match(/role="status"/g) ?? [];
      expect(statuses.length).toBeGreaterThan(0);
      const labels = [...html.matchAll(/role="status" aria-label="([^"]*)"/g)];
      expect(labels.length).toBe(statuses.length);
      for (const [, label] of labels) expect(label).toMatch(/^Loading \S/);
      expect(html).toContain("data-pending-bar");
    });
  });
}

for (const [path, back] of Object.entries(BACK_LINKS)) {
  test(`${path} keeps its "‹ ${back.label}" way back`, () => {
    const route = ROUTES.find((r) => r.path === path)!;
    const html = render(route);
    const link = html.match(
      new RegExp(
        `<a[^>]*href="${back.href.replace(/[?]/g, "\\?")}"[^>]*>(.*?)</a>`,
      ),
    );
    expect(link, `a link to ${back.href}`).not.toBeNull();
    expect(textOf(link![1]).trim()).toBe(back.label);
  });
}

test("the team page's skeleton covers its layout, so it draws the one page column", () => {
  // `(team)/loading.tsx` sits above `[programId]/layout.tsx`, whose read of
  // the team blocks everything under it: the skeleton draws the column the
  // layout would, once.
  const html = render(ROUTES.find((r) => r.dir === "admin/teams/(team)")!);
  expect(html.match(/<main/g)?.length).toBe(1);
});

test("a list's skeleton never sits above its detail routes", () => {
  // Each list page keeps its skeleton in its own route group, so a detail
  // route (a match, a session, a team) never flashes the list's rows — nor
  // Today's, which lives in `(today)` rather than at the admin root.
  for (const dir of [
    "admin",
    "admin/labels",
    "admin/matches",
    "admin/teams",
    "admin/conferences",
    "admin/uploads",
  ]) {
    expect(existsSync(`src/app/${dir}/loading.tsx`), dir).toBe(false);
  }
  expect(existsSync("src/app/admin/(today)/loading.tsx")).toBe(true);
});

test("the label lanes are the board's, Submitted only with rows", () => {
  const html = render(ROUTES.find((r) => r.dir === "admin/labels/(board)")!);
  expect(textOf(html)).not.toContain("Submitted");
  expect(html.match(/data-label-lane=/g)?.length).toBe(3);
});
