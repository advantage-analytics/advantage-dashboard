import { expect, test } from "@playwright/test";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The pure halves of the match drawer's shared body sections
 * (`drawer-sections.tsx`): the snapshot row mapping and the doubles-aware
 * side name. Loaded through `fixtures/vm-modules` so the `.tsx` module is
 * transpiled offline, with the browser client and link stubbed.
 */

type Snapshot = {
  firstServeIn: string | null;
  firstServeWon: string | null;
  breakPoints: string | null;
  doubleFaults: string | null;
};

const sections = createLoader({
  stubs: {
    "next/link": marker("Link"),
    "@/lib/supabase/client": { createClient: () => null },
    "@/components/dashboard/result-mark": { ResultMark: marker("ResultMark") },
    "@/components/dashboard/score-line": { ScoreLine: marker("ScoreLine") },
  },
}).load("src/components/dashboard/matches/drawer-sections.tsx") as {
  toSnapshot: (row: unknown) => Snapshot | null;
  drawerSideName: (name: string) => string;
};

test("toSnapshot rounds the percentages and joins break points", () => {
  expect(
    sections.toSnapshot({
      first_serve_pct: 61.4,
      first_serve_won_pct: 74.2,
      break_points_converted: 3,
      break_point_opportunities: 5,
      double_faults: 2,
    }),
  ).toEqual({
    firstServeIn: "61%",
    firstServeWon: "74%",
    breakPoints: "3/5",
    doubleFaults: "2",
  });
});

test("toSnapshot is null for an all-null row and for no row", () => {
  expect(
    sections.toSnapshot({
      first_serve_pct: null,
      first_serve_won_pct: null,
      break_points_converted: null,
      break_point_opportunities: null,
      double_faults: null,
    }),
  ).toBeNull();
  expect(sections.toSnapshot(null)).toBeNull();
});

test("drawerSideName keeps both doubles partners", () => {
  expect(sections.drawerSideName("Maya Reid / Jess Park")).toContain(" & ");
});
