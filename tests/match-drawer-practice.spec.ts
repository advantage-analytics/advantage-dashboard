import { readFileSync } from "node:fs";

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
 * T15 — the Matches peek drawer's practice treatment, on the drawer as
 * redesigned upstream: a title line ("A vs B") over one where-and-when line
 * (date · event · round), then the match report's own `RailScoreboard`. The
 * real `MatchDrawer` renders offline through `fixtures/vm-modules`; the
 * network, the ⋯ menu and the scrim are stubbed.
 *
 * Same wording as the list rows (`matches-practice-rows.spec.ts`): with no
 * event to name, a practice reads "Practice" in the line's ordinary ink
 * where any other match reads the muted "No event". A named event wins. The
 * board keeps its winner check, as the match report does for practice (T14).
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

/** The where-and-when line under the title: its inner HTML. */
function whereLine(html: string): string {
  const m = html.match(
    /<p class="tabular text-\[12px\] leading-\[18px\] text-\[var\(--ink-600\)\]">([\s\S]*?)<\/p>/,
  );
  if (!m) throw new Error("no where-and-when line");
  return m[1];
}

const MUTED_NO_EVENT = '<span style="color:var(--ink-400)">No event</span>';

test.describe("practice match", () => {
  test("no event and no schedule name: the line reads 'Practice' in its own ink", () => {
    const line = whereLine(drawer(match()));
    expect(line).toContain("Practice");
    expect(line).not.toContain("No event");
    expect(line).not.toContain("ink-400");
  });

  test("a named event keeps the event name", () => {
    const line = whereLine(drawer(match({ tournament_name: "Fall Ladder" })));
    expect(line).toContain("Fall Ladder");
    expect(line).not.toContain("Practice");
  });

  test("practice is recognised through isPracticeMatch, any case", () => {
    const line = whereLine(drawer(match({ match_type: " practice " })));
    expect(line).toContain("Practice");
    expect(line).not.toContain("No event");
  });
});

test.describe("tournament match", () => {
  test("no event: the line reads the muted 'No event'", () => {
    const line = whereLine(drawer(match({ match_type: "Tournament" })));
    expect(line).toContain(MUTED_NO_EVENT);
    expect(line).not.toContain("Practice");
  });

  test("a named event reads its name", () => {
    const line = whereLine(
      drawer(
        match({ match_type: "Tournament", tournament_name: "Fall Ladder" }),
      ),
    );
    expect(line).toContain("Fall Ladder");
    expect(line).not.toContain("No event");
  });

  test("a null match_type falls back to 'Match' — not practice", () => {
    const line = whereLine(drawer(match({ match_type: null })));
    expect(line).toContain(MUTED_NO_EVENT);
    expect(line).not.toContain("Practice");
  });
});

test("the drawer tests practice through isPracticeMatch, never a literal", () => {
  const src = readFileSync(
    "src/components/dashboard/matches/match-drawer.tsx",
    "utf8",
  );
  expect(src).toContain("isPracticeMatch(match.matchType)");
  expect(src).not.toMatch(/===\s*["']Practice["']/i);
});
