import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  transformDbMatch,
  type DbMatch,
  type DisplayMatch,
} from "@/lib/data/matches-list-types";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * T15 — the Matches peek drawer's practice treatment. The real `MatchDrawer`
 * (and the shared `DrawerHeading` / `DrawerFact` it draws) renders offline
 * through `fixtures/vm-modules`; the network, the ⋯ menu and the scrim are
 * stubbed, and `ResultMark` / `ScoreLine` are markers so each is asserted by
 * presence.
 *
 * Same grammar as the list rows (`matches-practice-rows.spec.ts`): a practice
 * heading draws the em dash labelled "Practice, no result" where the outcome
 * glyph would be, with the score still beside it, and its Event fact reads
 * "Practice" in the fact's ordinary ink when no event names it.
 */

const ROW: DbMatch = {
  id: "m-practice",
  player1_id: "p1",
  player1_name: "Dana Brooks",
  player2_name: "Sam Ortiz",
  tournament_name: null,
  round: null,
  date: "2026-09-20",
  score: { player1: [6, 6], player2: [3, 4] },
  result: null,
  match_type: "Practice",
  court_type: "hard",
  verified: false,
  duration: null,
  player2_id: "p2",
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
    "@/components/dashboard/result-mark": { ResultMark: marker("ResultMark") },
    "@/components/dashboard/score-line": { ScoreLine: marker("ScoreLine") },
    "@/components/dashboard/matches/match-actions/match-actions-menu": {
      MatchActionsMenu: marker("MatchActionsMenu"),
    },
    "@/components/dashboard/shared/chrome-tooltip": {
      ChromeTooltip: ({ children }: { children: React.ReactNode }) => children,
    },
    "@/components/dashboard/shared/drawer-sheet": {
      DRAWER_RAIL: "",
      DrawerScrim: marker("DrawerScrim"),
    },
    "@/lib/utils": {
      cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
      capitalize: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
    },
  },
});

const { MatchDrawer } = loader.load(
  "src/components/dashboard/matches/match-drawer.tsx",
) as { MatchDrawer: React.ComponentType<Record<string, unknown>> };

function match(overrides: Partial<DbMatch> = {}): DisplayMatch {
  const m = transformDbMatch({ ...ROW, ...overrides }, "viewer");
  if (!m) throw new Error("fixture did not transform");
  return m;
}

const drawer = (m: DisplayMatch) =>
  renderToStaticMarkup(
    React.createElement(MatchDrawer, {
      match: m,
      scope: "personal",
      index: 0,
      total: 1,
      canPrev: false,
      canNext: false,
      closing: false,
      autoFocus: false,
      onPrev() {},
      onNext() {},
      onClose() {},
      onClosed() {},
    }),
  );

/** The Event fact's `<dd>`: its class (ink) and its text. */
function eventFact(html: string): { className: string; text: string } {
  const m = html.match(
    /<span class="sr-only">Event<\/span>[\s\S]*?<\/dt><dd class="([^"]*)">([\s\S]*?)<\/dd>/,
  );
  if (!m) throw new Error("no Event fact");
  return { className: m[1], text: m[2].replace(/<[^>]+>/g, "") };
}

test.describe("practice match", () => {
  test("the heading draws the labelled em dash, no ResultMark, and keeps the ScoreLine", () => {
    const html = drawer(match());
    expect(html).toMatch(
      /<span aria-hidden="true"[^>]*>—<\/span><span class="sr-only">Practice, no result<\/span><span data-component="ScoreLine">/,
    );
    expect(html).not.toContain('data-component="ResultMark"');
  });

  test("no event and no schedule name: the Event fact reads 'Practice', not muted", () => {
    const fact = eventFact(drawer(match()));
    expect(fact.text).toBe("Practice");
    expect(fact.className).toContain("text-[var(--ink-700)]");
    expect(fact.className).not.toContain("text-[var(--ink-600)]");
  });

  test("a named event keeps the event name", () => {
    const fact = eventFact(drawer(match({ tournament_name: "Fall Ladder" })));
    expect(fact.text).toBe("Fall Ladder");
  });

  test("practice is recognised through isPracticeMatch, any case", () => {
    expect(eventFact(drawer(match({ match_type: " practice " }))).text).toBe(
      "Practice",
    );
  });
});

test.describe("tournament match", () => {
  const tournament = (o: Partial<DbMatch> = {}) =>
    drawer(match({ match_type: "Tournament", ...o }));

  test("the heading keeps its ResultMark beside the ScoreLine, no em dash", () => {
    const html = tournament();
    expect(html).toContain(
      '<span data-component="ResultMark"></span><span data-component="ScoreLine">',
    );
    expect(html).not.toContain("Practice, no result");
  });

  test("no event: the Event fact reads the muted 'No event'", () => {
    const fact = eventFact(tournament());
    expect(fact.text).toBe("No event");
    expect(fact.className).toContain("text-[var(--ink-600)]");
  });

  test("a named event reads its name in the fact's ink", () => {
    const fact = eventFact(tournament({ tournament_name: "Fall Open" }));
    expect(fact.text).toBe("Fall Open");
    expect(fact.className).toContain("text-[var(--ink-700)]");
  });

  test("a null match_type falls back to 'Match' — not practice", () => {
    expect(eventFact(drawer(match({ match_type: null }))).text).toBe(
      "No event",
    );
  });
});
