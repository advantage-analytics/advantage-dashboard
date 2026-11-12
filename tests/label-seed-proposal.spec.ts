import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import type {
  LabelPointSeed,
  LabelShotSeed,
  LabelSide,
} from "@/lib/services/labels/seed";
import {
  applyProposedCut,
  proposedTiebreakRallies,
  seededOnProposal,
} from "@/lib/services/labels/seed-proposal";
import type { SegmentationProposal } from "@/lib/services/splitstep/derivation";

// A new session's rows cut into games as the score-constrained segmenter
// proposes, in place of the vendor's cut.

const shot = (
  eventId: number,
  hitter: LabelSide,
  stroke: LabelShotSeed["stroke"],
): LabelShotSeed => {
  const values = {
    hitter,
    stroke,
    result: "in" as const,
    spin: null,
    contact_x: null,
    contact_y: null,
    landing_x: null,
    landing_y: null,
    video_time: eventId,
  };
  return {
    event_id: eventId,
    vendor: {} as LabelShotSeed["vendor"],
    status: "kept",
    ...values,
    unclear: [],
    site_removal: null,
    seed: { ...values },
  };
};

/** A vendor point: rally `n`, served and won by `server`, in vendor game `game`. */
function point(n: number, game: number, server: LabelSide): LabelPointSeed {
  const receiver: LabelSide = server === "p1" ? "p2" : "p1";
  const row = {
    set_number: 1,
    game_number: game,
    server,
    winner: server,
    ending: "winner" as const,
    ended_by: server,
  };
  return {
    point_index: n - 1,
    vendor_rally_ids: [n],
    ...row,
    game_type: "game",
    status: "unchanged",
    seed: { ...row, serve_side: null, game_type: "game" },
    shots: [
      shot(n * 10, server, "first_serve"),
      shot(n * 10 + 1, receiver, "forehand"),
    ],
  };
}

const proposal = (
  games: SegmentationProposal["games"],
  status: SegmentationProposal["status"] = "fit",
): SegmentationProposal =>
  ({
    status,
    version: 1,
    cost: 0,
    runnerUpCost: null,
    games,
    merges: [],
    closestScore: null,
    diff: { gamesMoved: 0, serversChanged: 0, rallies: [] },
    costBreakdown: {},
  }) as unknown as SegmentationProposal;

const transcript = (
  rallies: number[],
  segmentation: SegmentationProposal | null,
) => ({
  segmentation,
  points: rallies.map((rally_id) => ({ rally_id })),
});

// The vendor split one deuce game in two (rallies 1–2 and 3–4) and gave the
// second half to the other server. The proposal: one game, player 1 serving,
// then rallies 5–6 as player 2's game.
const vendor = [
  point(1, 1, "p1"),
  point(2, 1, "p1"),
  point(3, 2, "p2"),
  point(4, 2, "p2"),
  point(5, 3, "p1"),
  point(6, 3, "p1"),
];
const fit = proposal([
  {
    set: 1,
    game: 1,
    server: "player1",
    firstRallyId: 1,
    lastRallyId: 4,
    winner: "player1",
  },
  {
    set: 1,
    game: 2,
    server: "player2",
    firstRallyId: 5,
    lastRallyId: 6,
    winner: "player2",
  },
]);
const rallies = [1, 2, 3, 4, 5, 6];

test.describe("applyProposedCut", () => {
  test("each point takes the proposal's game and server, in its frozen seed too", () => {
    const cut = applyProposedCut(
      vendor,
      transcript(rallies, fit) as never,
      null,
    );
    expect(cut.applied).toBe(true);
    expect(
      cut.points.map((p) => [p.game_number, p.server, p.seed.game_number]),
    ).toEqual([
      [1, "p1", 1],
      [1, "p1", 1],
      [1, "p1", 1],
      [1, "p1", 1],
      [2, "p2", 2],
      [2, "p2", 2],
    ]);
    for (const p of cut.points) {
      expect(p.seed.server).toBe(p.server);
      expect(p.status).toBe("unchanged");
    }
  });

  test("a point whose server changes and whose serve was the old server's switches players whole", () => {
    const cut = applyProposedCut(
      vendor,
      transcript(rallies, fit) as never,
      null,
    );
    // Rally 3 was seeded as player 2 serving and winning: under player 1's
    // serve its hitters, winner and who ended it all flip.
    const third = cut.points[2];
    expect(third.shots.map((s) => [s.hitter, s.seed.hitter])).toEqual([
      ["p1", "p1"],
      ["p2", "p2"],
    ]);
    expect([third.winner, third.ended_by, third.seed.winner]).toEqual([
      "p1",
      "p1",
      "p1",
    ]);
    // A point whose server stands keeps its players.
    expect(cut.points[0].shots.map((s) => s.hitter)).toEqual(["p1", "p2"]);
    expect(cut.points[0].winner).toBe("p1");
    // A point re-served whose strokes already agree keeps them too.
    const agreeing = vendor.map((p) =>
      p.vendor_rally_ids[0] === 3
        ? {
            ...p,
            shots: [shot(30, "p1", "first_serve"), shot(31, "p2", "forehand")],
          }
        : p,
    );
    const kept = applyProposedCut(
      agreeing,
      transcript(rallies, fit) as never,
      null,
    );
    expect(kept.points[2].server).toBe("p1");
    expect(kept.points[2].winner).toBe("p2");
    expect(kept.points[2].shots.map((s) => s.hitter)).toEqual(["p1", "p2"]);
  });

  test("the vendor's cut stands with no proposal, on no_fit, under a match tiebreak, and where the proposal does not cover every rally", () => {
    const same = (result: ReturnType<typeof applyProposedCut>) => {
      expect(result.applied).toBe(false);
      expect(result.points).toEqual(vendor);
    };
    same(applyProposedCut(vendor, transcript(rallies, null) as never, null));
    same(
      applyProposedCut(
        vendor,
        transcript(rallies, proposal(fit.games, "no_fit")) as never,
        null,
      ),
    );
    same(applyProposedCut(vendor, transcript(rallies, fit) as never, 3));
    same(
      applyProposedCut(
        vendor,
        transcript(rallies, proposal(fit.games.slice(0, 1))) as never,
        null,
      ),
    );
    // An ambiguous fit is still used.
    expect(
      applyProposedCut(
        vendor,
        transcript(rallies, proposal(fit.games, "ambiguous")) as never,
        null,
      ).applied,
    ).toBe(true);
  });

  test("a proposed tiebreak takes the set and game only: its serve rotates", () => {
    const tiebreak = proposal([
      {
        set: 1,
        game: 13,
        server: "player1",
        firstRallyId: 1,
        lastRallyId: 6,
        winner: "player1",
      },
    ]);
    expect(proposedTiebreakRallies(tiebreak)(3)).toBe(true);
    const cut = applyProposedCut(
      vendor,
      transcript(rallies, tiebreak) as never,
      null,
    );
    expect(new Set(cut.points.map((p) => p.game_number))).toEqual(
      new Set([13]),
    );
    // Servers and players as the vendor had them.
    expect(cut.points.map((p) => p.server)).toEqual(
      vendor.map((p) => p.server),
    );
    expect(cut.points[2].shots).toEqual(vendor[2].shots);
  });
});

test("seededOnProposal: the same set, game and server — the server aside in a tiebreak", () => {
  const to = { set: 1, game: 2, server: "player2" as const };
  const seed = { set_number: 1, game_number: 2, server: "p2" as const };
  expect(seededOnProposal(seed, to, false)).toBe(true);
  expect(seededOnProposal({ ...seed, game_number: 3 }, to, false)).toBe(false);
  expect(seededOnProposal({ ...seed, server: "p1" }, to, false)).toBe(false);
  expect(seededOnProposal({ ...seed, server: "p1" }, to, true)).toBe(true);
  expect(seededOnProposal(null, to, false)).toBe(false);
});

test("only a new session is seeded on the proposal; the marks drop Game cut differs there", () => {
  const session = readFileSync(
    "src/lib/services/labels/seed-session.ts",
    "utf8",
  );
  expect(session).toContain("const seed = applyProposedCut(");
  // A practice copy and the seed backfill keep the vendor's cut.
  for (const file of [
    "src/lib/services/labels/practice-session.ts",
    "scripts/label-backfill-seed.ts",
  ]) {
    expect(readFileSync(file, "utf8")).not.toContain("applyProposedCut");
  }
  const marks = readFileSync("src/lib/services/labels/marks.ts", "utf8");
  // Asked of the session, so one seeded on the vendor's cut keeps the flag.
  expect(marks).toContain("sessionOnProposal &&");
  expect(marks).toContain("to.mergedWith === null;");
  expect(marks).toContain(
    "!onProposal || m.code !== POINT_FLAGS.SEGMENT_PROPOSAL_DIFFERS",
  );
});
