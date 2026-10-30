import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { opponentFormBars } from "@/components/dashboard/opponents/opponent-form-links";
import type { OpponentFormBar } from "@/components/dashboard/opponents/opponent-form-links";
import type {
  PersonalOpponentForm,
  PersonalOpponentRecentMatch,
} from "@/lib/data/personal-opponents";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The links inside an Opponents row: the name to Matches searched for them, each
 * form bar and the Last match cell to that match's report. Rendered offline from
 * the real `opponent-cells.tsx`; only `next/link` and the Radix tooltip are
 * stubbed, so a closed readout's text can still be read back.
 */

const passThrough = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

function LinkStub({
  href,
  prefetch,
  children,
  ...rest
}: {
  href: string;
  prefetch?: boolean;
  children?: React.ReactNode;
  onClick?: unknown;
}) {
  delete (rest as { onClick?: unknown }).onClick;
  return React.createElement(
    "a",
    { href, "data-prefetch": String(prefetch), ...rest },
    children,
  );
}

const cells = createLoader({
  stubs: {
    "next/link": { __esModule: true, default: LinkStub },
    "@/components/ui/tooltip": {
      Tooltip: passThrough,
      TooltipContent: passThrough,
      TooltipProvider: passThrough,
      TooltipTrigger: passThrough,
    },
  },
}).load("src/components/dashboard/opponents/opponent-cells.tsx") as {
  OpponentNameCell: React.ComponentType<{ name: string }>;
  OpponentLastMatchCell: React.ComponentType<{
    lastMatch: Pick<
      PersonalOpponentRecentMatch,
      "id" | "date" | "won" | "sets"
    >;
  }>;
  OpponentRecordCell: React.ComponentType<{
    wins: number;
    losses: number;
    bars: readonly OpponentFormBar[];
  }>;
};

function recent(id: string, date: string): PersonalOpponentRecentMatch {
  return {
    id,
    date,
    won: true,
    sets: [{ player1: 6, player2: 4 }],
    event: `Event ${id}`,
    inSeason: true,
    values: {} as PersonalOpponentRecentMatch["values"],
  };
}

test.describe("opponentFormBars", () => {
  test("pairs each bar, oldest first, with its match from the newest-first list", () => {
    const form: PersonalOpponentForm[] = ["loss", "win", "pending"];
    const bars = opponentFormBars(form, [
      recent("newest", "2026-10-12"),
      recent("middle", "2026-09-01"),
      recent("oldest", "2026-08-01"),
    ]);
    expect(bars.map((bar) => [bar.result, bar.match?.id])).toEqual([
      ["loss", "oldest"],
      ["win", "middle"],
      ["pending", "newest"],
    ]);
  });

  test("ignores the sixth recent match, which the five bars do not draw", () => {
    const bars = opponentFormBars(
      ["win", "win", "win", "win", "win"],
      ["a", "b", "c", "d", "e", "f"].map((id) => recent(id, "2026-10-01")),
    );
    expect(bars.map((bar) => bar.match?.id)).toEqual(["e", "d", "c", "b", "a"]);
  });

  test("a bar with no match left to pair stays a plain bar", () => {
    const bars = opponentFormBars(
      ["win", "loss"],
      [recent("only", "2026-10-01")],
    );
    expect(bars[0].match).toBeNull();
    expect(bars[1].match?.id).toBe("only");
  });

  test("names the player only when the table can say who played", () => {
    const match = { ...recent("a", "2026-10-01"), rosterPlayerId: "p1" };
    expect(opponentFormBars(["win"], [match])[0].match?.player).toBeNull();
    expect(
      opponentFormBars(["win"], [match], (m) =>
        m.rosterPlayerId === "p1" ? "Daniel Reyes" : null,
      )[0].match?.player,
    ).toBe("Daniel Reyes");
  });
});

test.describe("the row's links", () => {
  test("the name opens Matches searched for this opponent", () => {
    const html = renderToStaticMarkup(
      React.createElement(cells.OpponentNameCell, { name: "Tomas Oliveira" }),
    );
    expect(html).toContain('href="/dashboard/matches?q=Tomas%20Oliveira"');
    expect(html).toContain('data-prefetch="false"');
  });

  test("a group nobody named has nothing to search for, so it is not a link", () => {
    const html = renderToStaticMarkup(
      React.createElement(cells.OpponentNameCell, { name: "Unknown opponent" }),
    );
    expect(html).not.toContain("<a");
    expect(html).toContain("Unknown opponent");
  });

  test("Last match is one link to the report, ending in the chevron", () => {
    const html = renderToStaticMarkup(
      React.createElement(cells.OpponentLastMatchCell, {
        lastMatch: {
          id: "m1",
          date: "2026-10-12",
          won: false,
          sets: [{ player1: 4, player2: 6 }],
        },
      }),
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/dashboard/matches/m1"');
    expect(html).toContain('data-prefetch="false"');
    expect(html).toContain("lucide-chevron-right");
    expect(html).toContain("Open last match:");
  });

  test("Last match with nothing known still draws the dashes and the link", () => {
    const html = renderToStaticMarkup(
      React.createElement(cells.OpponentLastMatchCell, {
        lastMatch: { id: "m2", date: null, won: null, sets: [] },
      }),
    );
    expect(html).toContain('href="/dashboard/matches/m2"');
    for (const label of ["No date", "No result yet", "No score"]) {
      expect(html).toContain(label);
    }
  });
});

test.describe("the form bars", () => {
  const record = (bars: readonly OpponentFormBar[]) =>
    renderToStaticMarkup(
      React.createElement(cells.OpponentRecordCell, {
        wins: 1,
        losses: 1,
        bars,
      }),
    );
  const barLinks = (html: string) =>
    html.match(/<a [^>]*href="\/dashboard\/matches\/[^"]*"[^>]*>/g) ?? [];

  test("each played bar links to its match, and is no tab stop", () => {
    const html = record(
      opponentFormBars(
        ["loss", "win"],
        [recent("new", "2026-10-12"), recent("old", "2026-09-01")],
      ),
    );
    const links = barLinks(html);
    expect(links).toHaveLength(2);
    expect(links[0]).toContain("/dashboard/matches/old");
    expect(links[1]).toContain("/dashboard/matches/new");
    for (const link of links) {
      expect(link).toContain('tabindex="-1"');
      expect(link).toContain('data-prefetch="false"');
      expect(link).toContain("data-own-hover");
      expect(link).toContain("touch:pointer-events-none");
    }
    expect(html).toContain('aria-label="Lost, Sep 1"');
  });

  test("the readout states the match; only the team's names a player", () => {
    const match = recent("a", "2026-10-12");
    const personal = record(opponentFormBars(["win"], [match]));
    expect(personal).toContain("Event a");
    expect(personal).toContain("Oct 12");
    expect(personal).not.toContain("Daniel Reyes");
    expect(
      record(opponentFormBars(["win"], [match], () => "Daniel Reyes")),
    ).toContain("Daniel Reyes");
  });

  test("the strip stays five wide, with no link on an unplayed bar", () => {
    const html = record(opponentFormBars(["win"], [recent("a", "2026-10-12")]));
    expect(barLinks(html)).toHaveLength(1);
    expect(html.match(/bg-\[var\(--ink-100\)\]/g)).toHaveLength(4);
    expect(html).toContain("Last 1: W");
  });

  test("no matches at all still says so, over five ghost bars", () => {
    const html = record([]);
    expect(barLinks(html)).toHaveLength(0);
    expect(html.match(/bg-\[var\(--ink-100\)\]/g)).toHaveLength(5);
    expect(html).toContain("No form yet");
  });
});

test.describe("the row stays the drawer's control", () => {
  for (const file of ["opponents-table.tsx", "team-opponents-table.tsx"]) {
    test(`${file}: Enter or Space on the row opens it, not on a link inside`, () => {
      const source = readFileSync(
        `src/components/dashboard/opponents/${file}`,
        "utf8",
      );
      expect(source).toContain("tabIndex={0}");
      expect(source).toContain(
        "if (event.target !== event.currentTarget) return;",
      );
      expect(source).toContain("onToggle(opponent.key, true)");
      expect(source).toContain("onToggle(opponent.key, false)");
      expect(source).not.toContain("<button");
    });
  }
});
