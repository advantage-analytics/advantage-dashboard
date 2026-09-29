import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { transformDbMatch, type DbMatch } from "@/lib/data/matches-list-types";
import { realTournamentName } from "@/lib/data/match-share-format";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * A match filed with no event (`tournament_name: null`, what the wizard saves
 * since T4) carries null end to end and reads "No event", muted in ink-400, on
 * the Matches list row and in its drawer — never "Unknown Event" or "Not
 * specified". The components load through `fixtures/vm-modules` so the real
 * `.tsx` renders offline; everything that talks to the network is stubbed.
 */

const ROW: DbMatch = {
  id: "m-no-event",
  player1_id: "viewer",
  player1_name: "Dana Brooks",
  player2_name: "Sam Ortiz",
  tournament_name: null,
  round: null,
  date: "2026-09-20",
  score: { player1: [6, 6], player2: [3, 4] },
  result: null,
  match_type: "Singles",
  court_type: "hard",
  verified: false,
  duration: null,
};

const loader = createLoader({
  markUnknown: true,
  stubs: {
    "next/link": ({
      href,
      children,
      className,
    }: {
      href: string;
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("a", { href, className }, children),
    "next/navigation": {
      useRouter: () => ({ push() {}, refresh() {}, prefetch() {} }),
    },
    "next/image": marker("Image"),
    "@/lib/supabase/client": { createClient: () => null },
    "@/components/dashboard/workspace-provider": {
      useWorkspace: () => ({
        viewer: { id: "viewer" },
        active: { myPlayerId: null },
      }),
    },
    "@/components/dashboard/team/roster-table": {
      profileHref: () => "/dashboard/team/roster",
    },
    "@/components/dashboard/matches/match-actions/match-actions-menu": {
      MatchActionsMenu: marker("MatchActionsMenu"),
    },
  },
});

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

test("the list transform keeps a missing event null, not a placeholder", () => {
  const match = transformDbMatch(ROW, "viewer");
  expect(match?.tournamentName).toBeNull();
});

test("a list row with no event reads a muted 'No event'", () => {
  const { MatchCardList } = loader.load(
    "src/components/dashboard/matches/match-card-list.tsx",
  ) as { MatchCardList: React.ComponentType<Record<string, unknown>> };
  const match = transformDbMatch(ROW, "viewer");
  const html = render(React.createElement(MatchCardList, { match }));

  expect(html).toMatch(
    /<span[^>]*style="color:var\(--ink-400\)"[^>]*>No event<\/span>/,
  );
  expect(html).not.toContain("Unknown Event");
  expect(html).not.toContain("null");
});

test("a list row with an event prints the name, not 'No event'", () => {
  const { MatchCardList } = loader.load(
    "src/components/dashboard/matches/match-card-list.tsx",
  ) as { MatchCardList: React.ComponentType<Record<string, unknown>> };
  const match = transformDbMatch(
    { ...ROW, tournament_name: "Spring Invitational" },
    "viewer",
  );
  const html = render(React.createElement(MatchCardList, { match }));

  expect(html).toContain("Spring Invitational");
  expect(html).not.toContain("No event");
});

test("the drawer's Event fact reads a muted 'No event'", () => {
  const { MatchDrawer } = loader.load(
    "src/components/dashboard/matches/match-drawer.tsx",
  ) as { MatchDrawer: React.ComponentType<Record<string, unknown>> };
  const match = transformDbMatch(ROW, "viewer");
  const noop = () => {};
  const html = render(
    React.createElement(MatchDrawer, {
      match,
      scope: "personal",
      index: 0,
      total: 1,
      canPrev: false,
      canNext: false,
      closing: false,
      autoFocus: false,
      onPrev: noop,
      onNext: noop,
      onClose: noop,
      onClosed: noop,
    }),
  );

  expect(html).toMatch(/<span style="color:var\(--ink-400\)">No event<\/span>/);
  expect(html).not.toContain("Unknown Event");
});

test("realTournamentName still reads the legacy placeholder as no event", () => {
  expect(realTournamentName("Unknown Event")).toBeNull();
  expect(realTournamentName(null)).toBeNull();
  expect(realTournamentName("Spring Invitational")).toBe("Spring Invitational");
});
