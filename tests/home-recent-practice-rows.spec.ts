import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * T13 — practice rows in Home's recent matches. The real `RecentMatches`
 * renders offline through `fixtures/vm-modules`. Same grammar as the Matches
 * list (T12): a practice group with no event reads "Practice" where it would
 * read the muted "No event", and its rows draw the em dash, never a
 * `ResultMark`.
 */

const loader = createLoader({
  markUnknown: true,
  stubs: {
    "next/link": ({
      href,
      children,
      className,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("a", { href, className, ...rest }, children),
    "next/image": marker("Image"),
    "framer-motion": {
      useReducedMotion: () => true,
      motion: new Proxy(
        {},
        {
          get:
            () =>
            ({ children, className }: Record<string, unknown>) =>
              React.createElement(
                "div",
                { className: className as string },
                children as React.ReactNode,
              ),
        },
      ),
    },
    "@/lib/utils": {
      cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
    },
  },
});

const RecentMatches = (
  loader.load("src/components/dashboard/home/recent-matches.tsx") as {
    default: React.ComponentType<Record<string, unknown>>;
  }
).default;

const matchRow = (id: string) => ({
  id,
  opponentName: "Sam Ortiz",
  score: [{ player: 6, opponent: 3 }],
  won: true,
  firstServePct: 62,
  winners: 14,
  errors: 9,
  opponentMeta: null,
});

const group = (overrides: Record<string, unknown>) => ({
  id: "g1",
  tournamentName: null,
  date: "Today",
  matchType: null,
  courtType: "hard",
  verification: null,
  matches: [matchRow("m1")],
  ...overrides,
});

const render = (event: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(RecentMatches, { event }));

const OUTCOME_WORD = /aria-label="(Won|Lost|Level)"|>(Won|Lost|Level)</;

test.describe("Home recent matches: practice rows", () => {
  test("a practice row reads 'Practice' where it would read 'No event'", () => {
    const html = render(group({ matchType: "Practice" }));
    expect(html).toMatch(
      /<p class="[^"]*text-\[var\(--ink-900\)\][^"]*">Practice<\/p>/,
    );
    expect(html).not.toContain("No event");
  });

  test("a practice row renders no ResultMark and no def./l. prefix", () => {
    const html = render(group({ matchType: "Practice" }));
    expect(html).not.toMatch(OUTCOME_WORD);
    expect(html).not.toContain("def. ");
    expect(html).toContain("Practice, no result");
  });

  test("a tournament row with no event keeps the muted 'No event' and its ResultMark", () => {
    const html = render(group({ matchType: "Tournament" }));
    expect(html).toMatch(/color:var\(--ink-400\)[^>]*>\s*No event/);
    expect(html).not.toMatch(/>Practice</);
    expect(html).toMatch(OUTCOME_WORD);
    expect(html).toContain("def. ");
  });

  test("a practice group under a named event keeps the event name", () => {
    const html = render(
      group({ matchType: "Practice", tournamentName: "Fall Ladder" }),
    );
    expect(html).toContain("Fall Ladder");
    expect(html).not.toMatch(/<p class="text-\[12px\][^"]*">Practice<\/p>/);
  });
});
