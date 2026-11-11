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
 * T12 — practice rows on the Matches list (canvas board 4). The real
 * `MatchCardList` and `MatchesTitleRow` render offline through
 * `fixtures/vm-modules`; everything that talks to the network is stubbed.
 *
 * A practice row's Event cell reads "Practice" where it would read "No event",
 * its Result cell is the em dash with no outcome glyph, a team row whose two
 * seats both resolve to roster profiles carries the outlined "Teammate" pill,
 * and the title line counts practice apart: "{n} matches · {k} practice".
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
    "@/components/dashboard/workspace-provider": {
      useWorkspace: () => ({
        viewer: { id: "viewer" },
        active: { myPlayerId: null },
      }),
    },
    "@/components/dashboard/team/roster-table": {
      profileHref: () => "/dashboard/team/roster",
    },
    "@/lib/ui/seen-reports": { useUnseenReportIds: () => new Set<string>() },
    // A plain join: `markUnknown` would otherwise stub clsx/tailwind-merge and
    // print every merged class list as "[object Object]".
    "@/lib/utils": {
      cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
    },
  },
});

const { MatchCardList } = loader.load(
  "src/components/dashboard/matches/match-card-list.tsx",
) as { MatchCardList: React.ComponentType<Record<string, unknown>> };
const { MatchesTitleRow } = loader.load(
  "src/components/dashboard/matches/matches-title-row.tsx",
) as { MatchesTitleRow: React.ComponentType<Record<string, unknown>> };

function match(overrides: Partial<DbMatch> = {}): DisplayMatch {
  const m = transformDbMatch({ ...ROW, ...overrides }, "viewer");
  if (!m) throw new Error("fixture did not transform");
  return m;
}

const row = (m: DisplayMatch, scope: "personal" | "team" = "personal") =>
  renderToStaticMarkup(React.createElement(MatchCardList, { match: m, scope }));

/** ResultMark's accessible word for a decided row. */
const OUTCOME_WORD = /aria-label="(Won|Lost|Level)"|>(Won|Lost|Level)</;

test.describe("Event cell", () => {
  test("a practice row with no event reads 'Practice' in the cell's ink", () => {
    const html = row(match());
    expect(html).toMatch(/<span class="min-w-0 truncate">Practice<\/span>/);
    expect(html).not.toContain("No event");
  });

  test("a practice row filed under a named event keeps the event name", () => {
    const html = row(match({ tournament_name: "Fall Ladder" }));
    expect(html).toContain("Fall Ladder");
    expect(html).not.toMatch(/>Practice</);
  });

  test("a non-practice row with no event still reads the muted 'No event'", () => {
    const html = row(match({ match_type: "Tournament" }));
    expect(html).toMatch(
      /<span[^>]*style="color:var\(--ink-400\)"[^>]*>No event<\/span>/,
    );
  });

  test("Practice is recognised through isPracticeMatch, any case", () => {
    expect(row(match({ match_type: " practice " }))).toMatch(
      /<span class="min-w-0 truncate">Practice<\/span>/,
    );
    // A null match_type falls back to "Match" — not practice.
    expect(row(match({ match_type: null }))).toContain("No event");
  });
});

test.describe("Result cell", () => {
  test("a practice row draws the em dash and no ResultMark", () => {
    const html = row(match());
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>—<\/span>/);
    expect(html).not.toMatch(OUTCOME_WORD);
  });

  test("a non-practice row keeps its ResultMark", () => {
    const html = row(match({ match_type: "Dual Match" }));
    expect(html).toMatch(OUTCOME_WORD);
    expect(html).not.toContain(">—<");
  });
});

test.describe("Teammate pill", () => {
  const both = (m: DisplayMatch, p1: string | null, p2: string | null) => ({
    ...m,
    player1: { ...m.player1, profileId: p1 },
    player2: { ...m.player2, profileId: p2 },
  });

  test("team scope, both seats on the roster: a grey Teammate pill after the opponent", () => {
    const html = row(both(match(), "prof-1", "prof-2"), "team");
    // StatePill's outlined variant — Draft's grammar: grey ink, hairline ring.
    expect(html).toMatch(
      /Sam Ortiz<\/span><span class="[^"]*text-\[var\(--ink-500\)\][^"]*" style="box-shadow:inset 0 0 0 1px var\(--ink-200\)">Teammate<\/span>/,
    );
  });

  test("team scope, opponent off the roster: no pill", () => {
    expect(row(both(match(), "prof-1", null), "team")).not.toContain(
      "Teammate",
    );
  });

  test("personal scope never draws it, even with both profiles", () => {
    expect(row(both(match(), "prof-1", "prof-2"), "personal")).not.toContain(
      "Teammate",
    );
  });
});

test.describe("Title row count", () => {
  const title = (
    scope: "personal" | "team",
    readyMatches: { id: string; status?: string; practice?: boolean }[],
  ) =>
    renderToStaticMarkup(
      React.createElement(MatchesTitleRow, { scope, readyMatches }),
    );

  const list = (matches: number, practice: number) => [
    ...Array.from({ length: matches }, (_, i) => ({
      id: `m${i}`,
      status: "completed",
      practice: false,
    })),
    ...Array.from({ length: practice }, (_, i) => ({
      id: `p${i}`,
      status: "completed",
      practice: true,
    })),
  ];

  test("with practice: '{n} matches · {k} practice' (team and personal)", () => {
    expect(title("team", list(8, 2))).toContain("8 matches · 2 practice");
    expect(title("personal", list(8, 2))).toContain("8 matches · 2 practice");
  });

  test("with no practice the line is unchanged", () => {
    expect(title("team", list(8, 0))).toContain("8 on the program");
    expect(title("personal", list(8, 0))).toContain("8 analyzed");
    expect(title("team", list(8, 0))).not.toContain("practice");
  });

  test("personal counts only analyzed rows on both sides of the middot", () => {
    const rows = [
      ...list(3, 1),
      { id: "busy", status: "processing", practice: true },
    ];
    expect(title("personal", rows)).toContain("3 matches · 1 practice");
  });
});
