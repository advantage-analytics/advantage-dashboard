import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { drawerScoreboardProps } from "@/components/dashboard/matches/drawer-scoreboard";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The Matches drawer's two new readings, offline: the snapshot compared
 * across both seats (`toSnapshotPair` + `SnapshotComparison` in
 * `drawer-sections.tsx`) and the report's scoreboard fed from a list row
 * (`drawer-scoreboard.ts`). `drawer-sections.tsx` loads through
 * `fixtures/vm-modules`, with the network stubbed.
 */

const loader = createLoader({
  stubs: {
    "next/link": ({
      href,
      children,
    }: {
      href: string;
      children: React.ReactNode;
    }) => React.createElement("a", { href }, children),
    "next/navigation": {
      useRouter: () => ({ push() {}, refresh() {}, prefetch() {} }),
    },
    "next/image": marker("Image"),
    "@/lib/supabase/client": { createClient: () => null },
  },
});

type Row = {
  first_serve_pct: number | null;
  first_serve_won_pct: number | null;
  break_points_converted: number | null;
  break_point_opportunities: number | null;
  double_faults: number | null;
};

interface Figure {
  label: string;
  you: string | null;
  opp: string | null;
  leader: "you" | "opp" | null;
}

const sections = loader.load(
  "src/components/dashboard/matches/drawer-sections.tsx",
) as {
  toSnapshotPair: (
    you: Row | null,
    opp: Row | null,
  ) => { figures: Figure[]; opponent: boolean } | null;
  SnapshotComparison: React.ComponentType<Record<string, unknown>>;
};

const CHEN: Row = {
  first_serve_pct: 64,
  first_serve_won_pct: 71,
  break_points_converted: 3,
  break_point_opportunities: 7,
  double_faults: 2,
};
const DIAZ: Row = {
  first_serve_pct: 58,
  first_serve_won_pct: 66,
  break_points_converted: 2,
  break_point_opportunities: 9,
  double_faults: 5,
};

function figure(label: string, you: Row | null, opp: Row | null) {
  return sections
    .toSnapshotPair(you, opp)
    ?.figures.find((f) => f.label === label);
}

test.describe("toSnapshotPair", () => {
  test("higher leads, and the row's own side is the first column", () => {
    const first = figure("1st serve in", CHEN, DIAZ);
    expect(first).toMatchObject({ you: "64%", opp: "58%", leader: "you" });
    expect(figure("1st serve won", DIAZ, CHEN)?.leader).toBe("opp");
  });

  test("break points lead on conversion rate, not on the count", () => {
    // 3/7 (43%) beats 2/9 (22%); and 2/3 (67%) beats 3/7 though 3 > 2.
    expect(figure("Break points won", CHEN, DIAZ)).toMatchObject({
      you: "3/7",
      opp: "2/9",
      leader: "you",
    });
    expect(
      figure("Break points won", CHEN, {
        ...DIAZ,
        break_points_converted: 2,
        break_point_opportunities: 3,
      })?.leader,
    ).toBe("opp");
  });

  test("double faults: the lower count leads", () => {
    expect(figure("Double faults", CHEN, DIAZ)?.leader).toBe("you");
  });

  test("a tie or a missing side names nobody", () => {
    expect(figure("1st serve in", CHEN, CHEN)?.leader).toBeNull();
    expect(
      figure("1st serve in", CHEN, { ...DIAZ, first_serve_pct: null })?.leader,
    ).toBeNull();
  });

  test("no figures of the row's own: no section at all", () => {
    expect(sections.toSnapshotPair(null, DIAZ)).toBeNull();
  });

  test("an opponent with no figures says so, so the drawer draws one side", () => {
    expect(sections.toSnapshotPair(CHEN, null)?.opponent).toBe(false);
    expect(sections.toSnapshotPair(CHEN, DIAZ)?.opponent).toBe(true);
  });
});

test("the comparison heads its columns by surname, leader in ink-900", () => {
  const pair = sections.toSnapshotPair(CHEN, DIAZ);
  const html = renderToStaticMarkup(
    React.createElement(sections.SnapshotComparison, {
      pair,
      youName: "Avery Chen",
      oppName: "Marco Díaz",
    }),
  );
  expect(html).toContain(">Chen<");
  expect(html).toContain(">Díaz<");
  expect(html).toMatch(/font-weight:500;color:var\(--ink-900\)">64%</);
  expect(html).toMatch(/font-weight:400;color:var\(--ink-500\)">58%</);
});

/* ── The scoreboard ───────────────────────────────────────────────────── */

function match(over: Partial<DisplayMatch> = {}): DisplayMatch {
  return {
    id: "m-1",
    tournamentName: "Fall Invitational",
    date: "2026-11-08",
    matchType: "Singles",
    courtType: "hard",
    duration: "1:52:18",
    player1: { name: "Avery Chen" },
    player2: { name: "Marco Díaz" },
    score: {
      sets: [
        { player1: 6, player2: 4 },
        { player1: 3, player2: 6 },
        { player1: 7, player2: 6, player1Tiebreak: 7, player2Tiebreak: 5 },
      ],
      winner: "player1",
    },
    ...over,
  } as DisplayMatch;
}

test.describe("drawerScoreboardProps", () => {
  test("a final: seat one first, the winner checked, lost sets dimmed", () => {
    const props = drawerScoreboardProps(match());
    expect(props).toMatchObject({
      status: "final",
      label: "Final",
      duration: "1:52:18",
      caption: "Match complete · Singles · hard",
      bare: true,
    });
    const [you, opp] = props.players;
    expect(you).toMatchObject({ name: "Avery Chen", won: true });
    expect(you.sets).toEqual([6, 3, 7]);
    expect(you.lostSets).toEqual([false, true, false]);
    expect(opp.wonSets).toEqual([false, true, false]);
    // The tiebreak is the loser's points, drawn on the set they lost.
    expect(opp.tiebreaks?.[2]).toBe(5);
  });

  test("a trailing 0-0 set never reaches the board", () => {
    const props = drawerScoreboardProps(
      match({
        score: {
          sets: [
            { player1: 6, player2: 2 },
            { player1: 6, player2: 3 },
            { player1: 0, player2: 0 },
          ],
          winner: "player1",
        },
      }),
    );
    expect(props.players[0].sets).toEqual([6, 6]);
  });

  test("no score: the untagged board, never zeroes", () => {
    const props = drawerScoreboardProps(
      match({ score: { sets: [], winner: "player1" } }),
    );
    expect(props).toMatchObject({
      status: "untagged",
      label: "Not scored yet",
    });
    expect(props.players[0].won).toBe(false);
  });

  test("an unfinished match leaves its last set open", () => {
    const props = drawerScoreboardProps(
      match({
        matchContext: "unfinished",
        score: {
          sets: [
            { player1: 6, player2: 4 },
            { player1: 2, player2: 3 },
          ],
          winner: "player1",
        },
      }),
    );
    expect(props.label).toBe("Unfinished");
    expect(props.players[0].wonSets).toEqual([true, false]);
    expect(props.players[1].wonSets).toEqual([false, false]);
  });
});

test.describe("no invented winner", () => {
  test("a level final names nobody", () => {
    const props = drawerScoreboardProps(
      match({
        score: {
          sets: [
            { player1: 6, player2: 4 },
            { player1: 4, player2: 6 },
          ],
          winner: "player2",
        },
      }),
    );
    expect(props.players.map((p) => p.won)).toEqual([false, false]);
  });

  test("an unfinished match names nobody, whoever leads", () => {
    const props = drawerScoreboardProps(
      match({
        matchContext: "unfinished",
        score: {
          sets: [{ player1: 6, player2: 2 }],
          winner: "player1",
        },
      }),
    );
    expect(props.players.map((p) => p.won)).toEqual([false, false]);
  });

  test("a retirement keeps its stored winner though the sets are level", () => {
    const props = drawerScoreboardProps(
      match({
        matchContext: "retired",
        score: {
          sets: [
            { player1: 4, player2: 6 },
            { player1: 3, player2: 1 },
          ],
          winner: "player1",
        },
      }),
    );
    expect(props.players[0].won).toBe(true);
  });
});

test("the drawer's figures are cached per side, not per match alone", () => {
  // A team row's turn can change within a session; a pair split for one side
  // must never be served for the other.
  const source = readFileSync(
    "src/components/dashboard/matches/drawer-sections.tsx",
    "utf8",
  );
  expect(source).toContain("const key = pairKey(matchId, turned);");
  expect(source).toContain("pairCache.has(key)");
  expect(source).not.toContain("pairCache.has(matchId)");
});
